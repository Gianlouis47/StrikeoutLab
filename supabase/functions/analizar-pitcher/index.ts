// Edge Function: analizar-pitcher
//
// Recibe un lanzador + línea + pick, calcula la tasa real de superación de
// línea sobre su historial en game_logs (CALCULADA, determinista), y le
// pide a la IA una opinión (JUICIO) informada por el historial real de
// calibración de sus propios picks JUICIO anteriores. No escribe nada en
// la base de datos — solo analiza. Guardar el pick es una acción aparte y
// explícita desde la app.
//
// Nota: esta función es autocontenida (sin imports relativos a otros
// archivos) porque el bundler de despliegue remoto no resolvió una
// carpeta `_shared/` compartida entre funciones. La lógica de
// tasaSuperacionLinea/reporteCalibracion está duplicada aquí; mantenerla
// en sync con packages/core/src si cambian las reglas de negocio.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// ---------- calculations (ver packages/core/src/calculations.ts) ----------

type PickTipo = "OVER" | "UNDER";
type Resultado = "GANO" | "PERDIO" | "EMPATE";

interface Salida {
  k: number;
  ip?: number;
  pitcheos?: number | null;
}

interface TasaSuperacionLinea {
  ganadas: number;
  perdidas: number;
  empates: number;
  total: number;
  tasa: number;
  advertencia: string | null;
}

function validarPick(pick: PickTipo): void {
  if (pick !== "OVER" && pick !== "UNDER") {
    throw new Error(`pick debe ser OVER o UNDER, recibido: ${pick}`);
  }
}

function evaluar(k: number, linea: number, pick: PickTipo): Resultado {
  validarPick(pick);
  if (Number.isInteger(linea) && k === linea) return "EMPATE";
  if (pick === "OVER") return k > linea ? "GANO" : "PERDIO";
  return k < linea ? "GANO" : "PERDIO";
}

function tasaSuperacionLinea(salidas: Salida[], linea: number, pick: PickTipo): TasaSuperacionLinea {
  validarPick(pick);

  let ganadas = 0;
  let perdidas = 0;
  let empates = 0;

  for (const salida of salidas) {
    const resultado = evaluar(salida.k, linea, pick);
    if (resultado === "GANO") ganadas++;
    else if (resultado === "PERDIO") perdidas++;
    else empates++;
  }

  const total = salidas.length;
  const tasa = total > 0 ? ganadas / total : 0;
  const advertencia =
    total < 5
      ? `Muestra insuficiente: ${total} salida(s). Una tasa calculada sobre menos de 5 salidas tiene un margen de error demasiado grande para asignarle una confianza.`
      : null;

  return { ganadas, perdidas, empates, total, tasa, advertencia };
}

// ---------- calibration (ver packages/core/src/calibration.ts) ----------

type FuenteConfianza = "CALCULADA" | "JUICIO";

interface PickCalibracion {
  confianza: number;
  resultado: Resultado | null;
  fuenteConfianza: FuenteConfianza;
}

interface BandaCalibracion {
  banda: string;
  fuenteConfianza: "TODAS" | FuenteConfianza;
  cantidad: number;
  ganadas: number;
  perdidas: number;
  empates: number;
  confianzaPromedio: number;
  tasaReal: number | null;
  diferencia: number | null;
  muestraInsuficiente: boolean;
}

const BANDAS: Array<{ lo: number; hi: number; etiqueta: string }> = [
  { lo: 0.7, hi: 0.75, etiqueta: "70-74%" },
  { lo: 0.75, hi: 0.8, etiqueta: "75-79%" },
  { lo: 0.8, hi: 0.85, etiqueta: "80-84%" },
  { lo: 0.85, hi: 0.9, etiqueta: "85-89%" },
  { lo: 0.9, hi: 0.95, etiqueta: "90-94%" },
  { lo: 0.95, hi: 1.01, etiqueta: "95-99%" },
];

const MUESTRA_MINIMA = 20;
const RESULTADOS_RESUELTOS: Resultado[] = ["GANO", "PERDIO", "EMPATE"];

function bandaDe(confianza: number): string | null {
  const banda = BANDAS.find((b) => confianza >= b.lo && confianza < b.hi);
  return banda ? banda.etiqueta : null;
}

function resumirGrupo(
  grupo: PickCalibracion[],
  banda: string,
  fuenteConfianza: "TODAS" | FuenteConfianza,
): BandaCalibracion {
  const ganadas = grupo.filter((p) => p.resultado === "GANO").length;
  const perdidas = grupo.filter((p) => p.resultado === "PERDIO").length;
  const empates = grupo.filter((p) => p.resultado === "EMPATE").length;
  const decididas = ganadas + perdidas;
  const tasaReal = decididas > 0 ? ganadas / decididas : null;
  const confianzaPromedio = grupo.reduce((acc, p) => acc + p.confianza, 0) / grupo.length;
  const diferencia = tasaReal !== null ? confianzaPromedio - tasaReal : null;

  return {
    banda,
    fuenteConfianza,
    cantidad: grupo.length,
    ganadas,
    perdidas,
    empates,
    confianzaPromedio,
    tasaReal,
    diferencia,
    muestraInsuficiente: grupo.length < MUESTRA_MINIMA,
  };
}

function reporteCalibracion(picks: PickCalibracion[]): BandaCalibracion[] {
  const resueltos = picks
    .filter((p) => p.resultado !== null && RESULTADOS_RESUELTOS.includes(p.resultado))
    .map((p) => ({ ...p, banda: bandaDe(p.confianza) }))
    .filter((p): p is PickCalibracion & { banda: string } => p.banda !== null);

  const filas: BandaCalibracion[] = [];

  for (const { etiqueta } of BANDAS) {
    const bandaPicks = resueltos.filter((p) => p.banda === etiqueta);
    if (bandaPicks.length === 0) continue;

    filas.push(resumirGrupo(bandaPicks, etiqueta, "TODAS"));

    for (const fuente of ["CALCULADA", "JUICIO"] as const) {
      const subGrupo = bandaPicks.filter((p) => p.fuenteConfianza === fuente);
      if (subGrupo.length === 0) continue;
      filas.push(resumirGrupo(subGrupo, etiqueta, fuente));
    }
  }

  return filas;
}

// ---------- framework (ver docs/framework/) ----------

const FRAMEWORK_SISTEMA = `Eres un analista cuantitativo de MLB, con enfoque sharp/sindicato, especializado en props de ponches (strikeouts) de lanzadores para Star Sport (banca física dominicana). El objetivo es detectar valor matemático (+EV), no adivinar ganadores.

Reglas no negociables:
- Nunca uses el promedio general del pitcher como único criterio. Combina K%, K/9, Whiff%, CSW%, SwStr%, splits RHB/LHB, SO%/K% del rival, lineup confirmado, K% individual de los bateadores, umpire, parque, clima, innings y pitch count esperado.
- Un SO rank del rival 15-30 favorece Over K; 1-14 favorece Under K — pero esto nunca sustituye el lineup real confirmado del día.
- Si falta un dato crítico (lineup no confirmado, línea o cuota no verificada, estadísticas desactualizadas), tu veredicto debe ser "NO_BET" o debes pedir el dato faltante. Nunca inventas ni asumes.
- Un empate en línea entera (K == línea) no es un veredicto de "ganó" ni "perdió" — es un estado aparte; no lo colapses en tu razonamiento.
- Todo lo que tú generas es fuente_confianza=JUICIO, nunca CALCULADA — esa etiqueta solo aplica a lo que sale de contar salidas reales.
- Clasificación de nivel de pureza: DIAMANTE 90-99%, ORO_ALTO/ORO 80-89%, IMPUREZA 79% o menos. Si tu confianza real cae en IMPUREZA, el veredicto correcto casi siempre es NO_BET — nunca fuerces un Over/Under solo para completar un ticket.
- Responde SIEMPRE con JSON válido, sin texto fuera del JSON, con esta forma exacta:
  {"confianza": <number 0-1>, "nivel": "DIAMANTE"|"ORO_ALTO"|"ORO"|"IMPUREZA", "veredicto": "OVER"|"UNDER"|"NO_BET", "motivo": "<string breve>", "factores_clave": ["..."]}`;

function contextoCalibracion(bandas: BandaCalibracion[]): string {
  const juicio = bandas.filter((b) => b.fuenteConfianza === "JUICIO");

  if (juicio.length === 0) {
    return "Aún no hay historial de calibración de picks JUICIO resueltos. No autoinfles tu confianza sin evidencia — empieza conservador y dejá que el historial futuro te corrija.";
  }

  const lineas = juicio.map((b) => {
    const advertencia = b.muestraInsuficiente ? " (muestra insuficiente, no concluyente todavía)" : "";
    const tasa = b.tasaReal !== null ? `${(b.tasaReal * 100).toFixed(1)}%` : "sin datos";
    return `- Banda ${b.banda}: ${b.cantidad} picks tuyos, confianza promedio que declaraste ${(b.confianzaPromedio * 100).toFixed(1)}%, tasa real de acierto ${tasa}${advertencia}.`;
  });

  return (
    "Este es TU historial real de calibración (confianza que declaraste vs. resultado real) en tus picks JUICIO anteriores. " +
    "Ajusta tu confianza para este nuevo análisis de acuerdo a esto — si una banda muestra que estuviste sobreconfiado, no repitas el mismo error:\n" +
    lineas.join("\n")
  );
}

// ---------- NVIDIA NIM (API OpenAI-compatible) ----------

const NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1";
const MODELO_TEXTO = Deno.env.get("NVIDIA_MODEL_TEXTO") ?? "meta/llama-3.3-70b-instruct";

async function llamarNvidiaChat(messages: Array<{ role: string; content: string }>): Promise<string> {
  const apiKey = Deno.env.get("NVIDIA_API_KEY");
  if (!apiKey) {
    throw new Error(
      "Falta NVIDIA_API_KEY. Configúrala como secret de Supabase (dashboard → Edge Functions → Secrets).",
    );
  }

  const respuesta = await fetch(`${NVIDIA_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODELO_TEXTO,
      messages,
      temperature: 0.2,
      max_tokens: 1024,
      response_format: { type: "json_object" },
    }),
  });

  if (!respuesta.ok) {
    throw new Error(`NVIDIA API respondió ${respuesta.status}: ${await respuesta.text()}`);
  }

  const datos = await respuesta.json();
  const contenido = datos?.choices?.[0]?.message?.content;
  if (typeof contenido !== "string") throw new Error("Respuesta de NVIDIA sin contenido de texto esperado.");
  return contenido;
}

function parsearJsonModelo<T>(contenido: string): T {
  const limpio = contenido.trim().replace(/^```json\s*/i, "").replace(/```$/, "");
  try {
    return JSON.parse(limpio) as T;
  } catch (error) {
    throw new Error(
      `La IA no devolvió JSON válido: ${(error as Error).message}. Contenido recibido: ${contenido.slice(0, 500)}`,
    );
  }
}

// ---------- handler ----------

interface SolicitudAnalisis {
  pitcher: string;
  equipo: string;
  rival: string;
  linea: number;
  pick: PickTipo;
  notas?: string;
  ultimasNSalidas?: number;
}

interface JuicioIA {
  confianza: number;
  nivel: "DIAMANTE" | "ORO_ALTO" | "ORO" | "IMPUREZA";
  veredicto: "OVER" | "UNDER" | "NO_BET";
  motivo: string;
  factores_clave: string[];
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Usa POST" }), { status: 405 });
  }

  let solicitud: SolicitudAnalisis;
  try {
    solicitud = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "JSON inválido en el body" }), { status: 400 });
  }

  if (!solicitud.pitcher || !solicitud.linea || !solicitud.pick) {
    return new Response(
      JSON.stringify({ error: "Faltan campos requeridos: pitcher, linea, pick" }),
      { status: 400 },
    );
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: salidasDb, error: errorSalidas } = await supabase
    .from("game_logs")
    .select("k, ip, pitcheos")
    .eq("pitcher", solicitud.pitcher)
    .order("fecha", { ascending: false })
    .limit(solicitud.ultimasNSalidas ?? 15);

  if (errorSalidas) {
    return new Response(JSON.stringify({ error: errorSalidas.message }), { status: 500 });
  }

  const salidas: Salida[] = (salidasDb ?? []).map((s: any) => ({
    k: s.k,
    ip: s.ip ?? undefined,
    pitcheos: s.pitcheos ?? null,
  }));

  const calculada = salidas.length > 0 ? tasaSuperacionLinea(salidas, solicitud.linea, solicitud.pick) : null;

  const { data: picksDb, error: errorPicks } = await supabase
    .from("picks")
    .select("confianza, resultado, fuente_confianza")
    .not("resultado", "is", null);

  if (errorPicks) {
    return new Response(JSON.stringify({ error: errorPicks.message }), { status: 500 });
  }

  const picksCalibracion: PickCalibracion[] = (picksDb ?? []).map((p: any) => ({
    confianza: p.confianza,
    resultado: p.resultado,
    fuenteConfianza: p.fuente_confianza,
  }));
  const bandas = reporteCalibracion(picksCalibracion);

  const mensajeUsuario = [
    `Pitcher: ${solicitud.pitcher} (${solicitud.equipo ?? "equipo desconocido"})`,
    `Rival: ${solicitud.rival ?? "desconocido"}`,
    `Línea: ${solicitud.linea} — Pick a evaluar: ${solicitud.pick}`,
    calculada
      ? `Tasa CALCULADA real sobre las últimas ${calculada.total} salidas registradas: ${calculada.ganadas} ganadas, ${calculada.perdidas} perdidas, ${calculada.empates} empates (tasa ${(calculada.tasa * 100).toFixed(1)}%).${calculada.advertencia ? " ADVERTENCIA: " + calculada.advertencia : ""}`
      : "No hay salidas registradas en game_logs para este pitcher todavía — tu análisis debe apoyarse solo en los datos que te doy abajo, o responder NO_BET si no es suficiente.",
    solicitud.notas ? `Notas / datos adicionales del usuario:\n${solicitud.notas}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  let juicioIA: JuicioIA;
  try {
    const contenidoIA = await llamarNvidiaChat([
      { role: "system", content: `${FRAMEWORK_SISTEMA}\n\n${contextoCalibracion(bandas)}` },
      { role: "user", content: mensajeUsuario },
    ]);
    juicioIA = parsearJsonModelo<JuicioIA>(contenidoIA);
  } catch (error) {
    return new Response(JSON.stringify({ error: (error as Error).message }), { status: 502 });
  }

  return new Response(
    JSON.stringify({ calculada, juicioIA, contextoCalibracionUsado: bandas }),
    { headers: { "Content-Type": "application/json" } },
  );
});
