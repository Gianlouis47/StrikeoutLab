// Edge Function: chat
//
// Una sola puerta de entrada para todo el análisis. El usuario manda texto
// y/o fotos; acá adentro:
//
//   1. Un modelo de visión transcribe cada imagen (rápido, sin razonar).
//   2. Un modelo de razonamiento decide qué hacer, usando herramientas.
//   3. La CALCULADORA proyecta los ponches — y vive en Postgres
//      (función proyectar_ponches), no acá, así hay un solo lugar donde
//      está la matemática y se puede probar con SQL directo.
//
// La regla de oro: la IA junta y verifica datos; los números los pone la
// calculadora. La IA nunca inventa una proyección ni una confianza.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1";

// Visión: modelos rápidos de transcripción, en orden de preferencia. Se pasa
// al siguiente si uno está saturado (503) — pasó en producción con el modelo
// omni, que además tardaba 16s contra 4s del 90b.
const MODELOS_VISION = (Deno.env.get("NVIDIA_MODELOS_VISION") ??
  "meta/llama-3.2-90b-vision-instruct,meta/llama-3.2-11b-vision-instruct")
  .split(",")
  .map((m) => m.trim())
  .filter(Boolean);

// Razonamiento con tool-calling, en orden de preferencia. Medido contra el
// catálogo real de la cuenta:
//   nemotron-3-super-120b : 1.6s, llama herramientas bien  <- elegido
//   minimax-m3            : 0.8s, respaldo
//   deepseek-v4-pro       : 0.9s, segundo respaldo
// Descartados: nemotron-3-ultra-550b devuelve 500 al pasarle herramientas
// (era la causa del 502 en producción) y gpt-oss-120b tarda ~66s.
const MODELOS_RAZONAMIENTO = (Deno.env.get("NVIDIA_MODELOS_TEXTO") ??
  "nvidia/nemotron-3-super-120b-a12b,minimaxai/minimax-m3,deepseek-ai/deepseek-v4-pro-0813")
  .split(",")
  .map((m) => m.trim())
  .filter(Boolean);

const MAX_RONDAS = 6;

// ---------------------------------------------------------------------
// Visión
// ---------------------------------------------------------------------

const INSTRUCCION_VISION =
  `Transcribí TODO el texto y los números que veas en esta imagen, de forma ordenada y literal.
No interpretes ni analices, solo transcribí lo que está escrito.
Si es un ticket de apuesta: incluí lanzador, línea, si dice Over/Under, cuota, código.
Si es un boxscore: incluí el nombre de cada lanzador con sus IP, H, R, ER, BB, K y cantidad de lanzamientos.
Si es una tabla de estadísticas: incluí los encabezados y las filas tal cual.
Si algo está borroso o no se lee, decí explícitamente "ilegible" en vez de adivinar.`;

async function transcribirImagen(
  apiKey: string,
  imagenBase64: string,
  mimeType: string,
): Promise<{ texto: string; modelo: string }> {
  let ultimoError = "";
  for (const modelo of MODELOS_VISION) {
    try {
      const resp = await fetch(`${NVIDIA_BASE_URL}/chat/completions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: modelo,
          temperature: 0.1,
          max_tokens: 1500,
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: INSTRUCCION_VISION },
                { type: "image_url", image_url: { url: `data:${mimeType};base64,${imagenBase64}` } },
              ],
            },
          ],
        }),
      });

      if (resp.status === 503 || resp.status === 429) {
        ultimoError = `${modelo} saturado (${resp.status})`;
        continue;
      }
      if (!resp.ok) {
        ultimoError = `${modelo} respondió ${resp.status}: ${(await resp.text()).slice(0, 200)}`;
        continue;
      }

      const datos = await resp.json();
      const texto = datos?.choices?.[0]?.message?.content;
      if (typeof texto === "string" && texto.trim()) return { texto: texto.trim(), modelo };
      ultimoError = `${modelo} devolvió una respuesta vacía`;
    } catch (e) {
      ultimoError = `${modelo}: ${(e as Error).message}`;
    }
  }
  throw new Error(
    `Ningún modelo de visión pudo leer la imagen (${ultimoError}). Escribime los datos a mano y sigo igual.`,
  );
}

// ---------------------------------------------------------------------
// Herramientas
// ---------------------------------------------------------------------

const HERRAMIENTAS = [
  {
    type: "function",
    function: {
      name: "proyectar_ponches",
      description:
        "LA HERRAMIENTA PRINCIPAL. Dado un lanzador, su rival y la línea de la casa, busca sola todas las estadísticas y devuelve los ponches proyectados, el lado que conviene (OVER/UNDER) y la confianza. Es aritmética exacta: usá SIEMPRE su número tal cual, nunca calcules vos.",
      parameters: {
        type: "object",
        properties: {
          pitcher: { type: "string", description: "Nombre del lanzador, aunque venga abreviado" },
          linea: { type: "number", description: "Línea de ponches de la casa, ej. 6.5" },
          rival: { type: "string", description: "Abreviación del equipo rival, ej. NYY, CIN" },
          mano_pitcher: { type: "string", enum: ["RHP", "LHP"], description: "Mano del lanzador si se sabe" },
          ventana_rival: {
            type: "string",
            enum: ["TEMPORADA", "ULTIMOS_14"],
            description: "Qué ventana usar para el rival. ULTIMOS_14 refleja su forma reciente.",
          },
        },
        required: ["pitcher", "linea"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "buscar_pitcher",
      description:
        "Busca un lanzador por nombre (tolera abreviaciones tipo 'T Rogers' y acentos) y devuelve sus estadísticas. Útil para ver qué datos hay, o para desambiguar cuando varios comparten apellido.",
      parameters: {
        type: "object",
        properties: { nombre: { type: "string" } },
        required: ["nombre"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "historial_pitcher",
      description:
        "Devuelve las salidas reales ya registradas de un lanzador (fecha, rival, IP, K, BB) y, si le pasás una línea, cuántas veces la superó. Esto es historial contado, no proyección.",
      parameters: {
        type: "object",
        properties: {
          pitcher: { type: "string" },
          linea: { type: "number", description: "Opcional: para contar cuántas veces la superó" },
        },
        required: ["pitcher"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "guardar_salida",
      description:
        "Guarda el resultado real de una salida ya terminada (lo que sale de un boxscore) en el historial. Usalo cuando el usuario mande la foto de un juego que ya terminó.",
      parameters: {
        type: "object",
        properties: {
          pitcher: { type: "string" },
          fecha: { type: "string", description: "YYYY-MM-DD" },
          rival: { type: "string" },
          ip: { type: "number", description: "Innings en notación de béisbol (6.2 = 6 y 2/3)" },
          k: { type: "number" },
          bb: { type: "number" },
          pitcheos: { type: "number" },
        },
        required: ["pitcher", "fecha", "rival", "ip", "k", "bb"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "guardar_pick",
      description:
        "Registra una apuesta que el usuario va a jugar. Solo llamalo cuando el usuario lo pida o confirme.",
      parameters: {
        type: "object",
        properties: {
          pitcher: { type: "string" },
          equipo: { type: "string" },
          rival: { type: "string" },
          linea: { type: "number" },
          pick: { type: "string", enum: ["OVER", "UNDER"] },
          confianza: { type: "number", description: "0 a 1, la que dio proyectar_ponches" },
          nivel: { type: "string", enum: ["DIAMANTE_ALTO", "DIAMANTE", "ORO_ALTO", "ORO", "IMPUREZA"] },
          motivo: { type: "string" },
          fecha: { type: "string", description: "YYYY-MM-DD, hoy si no se dice otra cosa" },
          codigo: { type: "string", description: "Código del ticket de Star Sport, si lo hay" },
        },
        required: ["pitcher", "equipo", "rival", "linea", "pick", "confianza", "nivel"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "buscar_web",
      description:
        "Busca en internet datos actuales que no estén en la base: lineup confirmado de hoy, clima, lesiones, noticias. No lo uses para estadísticas de temporada, esas ya están guardadas.",
      parameters: {
        type: "object",
        properties: { query: { type: "string" } },
        required: ["query"],
      },
    },
  },
];

// deno-lint-ignore no-explicit-any
type Supa = any;

async function nombreReal(supabase: Supa, texto: string): Promise<string> {
  const { data } = await supabase.rpc("buscar_pitcher", { texto_busqueda: texto });
  return data?.[0]?.pitcher ?? texto;
}

async function ejecutarHerramienta(supabase: Supa, nombre: string, args: any): Promise<unknown> {
  switch (nombre) {
    case "proyectar_ponches": {
      const { data, error } = await supabase.rpc("proyectar_ponches", {
        p_pitcher: args.pitcher,
        p_linea: args.linea,
        p_rival: args.rival ?? null,
        p_mano: args.mano_pitcher ?? null,
        p_ventana_rival: args.ventana_rival ?? "TEMPORADA",
      });
      if (error) return { error: error.message };
      return data;
    }

    case "buscar_pitcher": {
      const { data, error } = await supabase.rpc("buscar_pitcher", {
        texto_busqueda: args.nombre ?? "",
      });
      if (error) return { error: error.message };
      if (!data || data.length === 0) {
        return { encontrado: false, mensaje: `No hay ningún lanzador parecido a "${args.nombre}".` };
      }
      return { encontrado: true, candidatos: data };
    }

    case "historial_pitcher": {
      const pitcher = await nombreReal(supabase, args.pitcher);
      const { data, error } = await supabase
        .from("game_logs")
        .select("fecha, rival, ip, k, bb, pitcheos")
        .eq("pitcher", pitcher)
        .order("fecha", { ascending: false })
        .limit(20);
      if (error) return { error: error.message };

      const salidas = data ?? [];
      if (salidas.length === 0) {
        return {
          pitcher,
          salidas_registradas: 0,
          mensaje: "No hay salidas registradas todavía. Se agregan con guardar_salida.",
        };
      }
      let conteo = null;
      if (args.linea !== undefined && args.linea !== null) {
        const linea = Number(args.linea);
        const arriba = salidas.filter((s: any) => Number(s.k) > linea).length;
        const empates = Number.isInteger(linea)
          ? salidas.filter((s: any) => Number(s.k) === linea).length
          : 0;
        conteo = {
          linea,
          veces_por_encima: arriba,
          veces_por_debajo: salidas.length - arriba - empates,
          empates,
          total: salidas.length,
          advertencia: salidas.length < 5 ? "Menos de 5 salidas: no es confiable todavía." : null,
        };
      }
      return { pitcher, salidas_registradas: salidas.length, salidas, conteo_contra_linea: conteo };
    }

    case "guardar_salida": {
      const pitcher = await nombreReal(supabase, args.pitcher);
      const { error } = await supabase.from("game_logs").insert({
        pitcher,
        fecha: args.fecha,
        rival: String(args.rival).toUpperCase(),
        ip: args.ip,
        k: args.k,
        bb: args.bb,
        pitcheos: args.pitcheos ?? null,
      });
      if (error) return { guardado: false, error: error.message };
      return { guardado: true, pitcher, mensaje: `Salida de ${pitcher} del ${args.fecha} guardada.` };
    }

    case "guardar_pick": {
      const pitcher = await nombreReal(supabase, args.pitcher);
      const { error } = await supabase.from("picks").insert({
        fecha: args.fecha ?? new Date().toISOString().slice(0, 10),
        codigo: args.codigo ?? null,
        pitcher,
        equipo: String(args.equipo).toUpperCase(),
        rival: String(args.rival).toUpperCase(),
        linea: args.linea,
        pick: args.pick,
        confianza: args.confianza,
        nivel: args.nivel,
        // Sale de la calculadora sobre stats de temporada, no de contar
        // salidas reales: por definición del esquema eso es JUICIO.
        fuente_confianza: "JUICIO",
        motivo: args.motivo ?? null,
      });
      if (error) return { guardado: false, error: error.message };
      return { guardado: true, pitcher, mensaje: `Pick de ${pitcher} guardado.` };
    }

    case "buscar_web": {
      const tavilyKey = Deno.env.get("TAVILY_API_KEY");
      if (!tavilyKey) return "Búsqueda web no configurada. Respondé con lo que ya tenés.";
      try {
        const resp = await fetch("https://api.tavily.com/search", {
          method: "POST",
          headers: { Authorization: `Bearer ${tavilyKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ query: args.query ?? "", max_results: 4, include_answer: true }),
        });
        if (!resp.ok) return `La búsqueda falló (${resp.status}).`;
        const datos = await resp.json();
        const resumen = datos.answer ? `${datos.answer}\n\n` : "";
        const filas = ((datos.results ?? []) as any[])
          .slice(0, 4)
          .map((r) => `- ${r.title}: ${(r.content ?? "").slice(0, 250)} (${r.url})`)
          .join("\n");
        return filas ? `${resumen}${filas}` : "Sin resultados.";
      } catch (e) {
        return `La búsqueda falló: ${(e as Error).message}`;
      }
    }

    default:
      return { error: `Herramienta desconocida: ${nombre}` };
  }
}

// ---------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------

const SISTEMA = `Sos el analista de StrikeoutLab, la app personal de Gianlouis para apostar props de ponches de lanzadores de MLB en Star Sport (banca física dominicana). Hablás español dominicano, directo y sin vueltas.

CÓMO TRABAJÁS:
- El usuario te manda fotos (tickets, boxscores, capturas de estadísticas) o te escribe. Vos hacés TODO: leés, buscás los datos, calculás y respondés. Nunca le pidas que llene campos ni que repita datos que ya están en la foto o en la base.
- Para cualquier apuesta llamá SIEMPRE a "proyectar_ponches". Esa herramienta busca sola las estadísticas y devuelve los K proyectados, el lado y la confianza. Ese número es aritmética exacta: usalo tal cual, nunca lo recalcules ni lo ajustes de cabeza. Vos no sos bueno con números; la calculadora sí.
- Si la foto es de un juego YA TERMINADO (boxscore con resultados), guardá esa salida con "guardar_salida" sin que te lo pidan, y después contá qué guardaste. Así se alimenta el historial real.
- Si es un ticket o una línea de un juego que todavía no se juega, proyectá y dale tu recomendación.
- Solo guardás un pick con "guardar_pick" si el usuario lo pide o confirma.

CÓMO RESPONDÉS:
- Empezá por el resultado, no por el proceso: "deGrom vs CIN, línea 7: proyecta 7.9 K → OVER, 62% de confianza."
- Después, en pocas líneas, el porqué: K% del lanzador, cómo batea el rival, cuántos innings suele durar.
- Si la calculadora devuelve advertencias (muestra chica, empate probable, nombre ambiguo, faltan datos), decilas. No las escondas.
- Si algo no se puede saber, decilo claro. Nunca inventes una estadística ni un lineup.
- Nada de tablas gigantes ni respuestas de tres pantallas: es una app de celular, andá al grano.

REGLAS DURAS:
- Nunca inventes un número. Si no está en la base o en una búsqueda, no existe.
- Una línea entera (ej. 7) puede terminar en empate y devuelven la plata: tenelo en cuenta al recomendar.
- De 85% de confianza para arriba es donde conviene jugar. Abajo de 80%, decí que no vale la pena.
- Si el nombre del lanzador es ambiguo (la calculadora te avisa), preguntá cuál es antes de dar la recomendación por buena.`;

// ---------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------

interface MensajeEntrada {
  rol: "usuario" | "asistente";
  texto?: string;
  imagenBase64?: string;
  mimeType?: string;
}

interface NvidiaMensaje {
  role: string;
  content: string | null;
  reasoning_content?: string | null;
  tool_call_id?: string;
  tool_calls?: Array<{ id: string; type?: string; function: { name: string; arguments: string } }>;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Usa POST" }), { status: 405 });
  }

  const apiKey = Deno.env.get("NVIDIA_API_KEY");
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "Falta NVIDIA_API_KEY en los secrets de Supabase." }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  let cuerpo: { mensajes: MensajeEntrada[] };
  try {
    cuerpo = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "JSON inválido" }), { status: 400 });
  }
  if (!Array.isArray(cuerpo.mensajes) || cuerpo.mensajes.length === 0) {
    return new Response(JSON.stringify({ error: "Falta 'mensajes'" }), { status: 400 });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const transcripciones: Array<{ modelo: string; texto: string }> = [];
  const hoy = new Date().toISOString().slice(0, 10);

  const mensajes: NvidiaMensaje[] = [
    { role: "system", content: `${SISTEMA}\n\nLa fecha de hoy es ${hoy}.` },
  ];

  for (const m of cuerpo.mensajes) {
    if (m.rol === "asistente") {
      mensajes.push({ role: "assistant", content: m.texto ?? "" });
      continue;
    }
    let contenido = m.texto ?? "";
    if (m.imagenBase64 && m.mimeType) {
      try {
        const t = await transcribirImagen(apiKey, m.imagenBase64, m.mimeType);
        transcripciones.push(t);
        contenido = `${contenido}\n\n[Texto transcrito de la imagen]\n${t.texto}`.trim();
      } catch (e) {
        contenido = `${contenido}\n\n[No se pudo leer la imagen: ${(e as Error).message}]`.trim();
      }
    }
    mensajes.push({ role: "user", content: contenido || "(sin texto)" });
  }

  const herramientasUsadas: Array<{ nombre: string; argumentos: unknown; resultado: unknown }> = [];
  let respuestaFinal = "";
  let razonamiento: string | null = null;
  let modeloEnUso = MODELOS_RAZONAMIENTO[0];

  // Si un modelo falla o está saturado se pasa al siguiente, en vez de
  // dejar al usuario sin respuesta.
  async function pedirAlModelo(): Promise<any> {
    let ultimoError = "";
    for (const modelo of MODELOS_RAZONAMIENTO) {
      try {
        const resp = await fetch(`${NVIDIA_BASE_URL}/chat/completions`, {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: modelo,
            messages: mensajes,
            tools: HERRAMIENTAS,
            tool_choice: "auto",
            temperature: 0.3,
            max_tokens: 4000,
          }),
        });
        if (!resp.ok) {
          ultimoError = `${modelo} respondió ${resp.status}: ${(await resp.text()).slice(0, 200)}`;
          continue;
        }
        modeloEnUso = modelo;
        return await resp.json();
      } catch (e) {
        ultimoError = `${modelo}: ${(e as Error).message}`;
      }
    }
    throw new Error(`Ningún modelo pudo responder. Último problema: ${ultimoError}`);
  }

  try {
    for (let ronda = 0; ronda < MAX_RONDAS; ronda++) {
      const datos = await pedirAlModelo();
      const mensaje = datos?.choices?.[0]?.message as NvidiaMensaje | undefined;
      if (!mensaje) throw new Error("El modelo devolvió una respuesta sin mensaje.");
      if (mensaje.reasoning_content) razonamiento = mensaje.reasoning_content;

      if (mensaje.tool_calls && mensaje.tool_calls.length > 0) {
        mensajes.push(mensaje);
        for (const llamada of mensaje.tool_calls) {
          let args: any = {};
          try {
            args = JSON.parse(llamada.function.arguments || "{}");
          } catch {
            args = {};
          }
          const resultado = await ejecutarHerramienta(supabase, llamada.function.name, args);
          herramientasUsadas.push({ nombre: llamada.function.name, argumentos: args, resultado });
          mensajes.push({
            role: "tool",
            tool_call_id: llamada.id,
            content: typeof resultado === "string" ? resultado : JSON.stringify(resultado),
          });
        }
        continue;
      }

      respuestaFinal = (mensaje.content ?? "").replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
      break;
    }

    if (!respuestaFinal) {
      respuestaFinal =
        "Me quedé dando vueltas sin llegar a una respuesta. Probá de nuevo o preguntámelo de otra forma.";
    }
  } catch (e) {
    return new Response(
      JSON.stringify({ error: (e as Error).message, transcripciones, herramientasUsadas }),
      { status: 502, headers: { "Content-Type": "application/json" } },
    );
  }

  return new Response(
    JSON.stringify({
      respuesta: respuestaFinal,
      transcripciones,
      herramientasUsadas,
      razonamiento,
      modeloUsado: modeloEnUso,
    }),
    { headers: { "Content-Type": "application/json" } },
  );
});
