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

// Visión: modelos de transcripción, en orden de preferencia.
//
// El orden cambió después de medirlo de verdad. Antes iba primero el 90b y
// era la causa de que mandar una foto "diera error": no fallaba, TARDABA.
// Corridas con el mismo ticket, misma imagen:
//
//   llama-3.2-11b-vision   0.7s   1.5s   4.1s    <- estable
//   nemotron-3-nano-omni   4.1s   5.3s           <- estable, y leyó bien
//   llama-3.2-90b-vision   34s    4.6s   103s    <- impredecible
//
// Con el 90b primero, una transcripción se comía sola más tiempo del que
// tiene la Edge Function para responder entera, y el usuario veía un error
// sin saber por qué. El tamaño NO era el problema: la misma imagen inflada
// a 935 KB devolvió 200 igual. Era la latencia.
//
// El omni va primero porque fue el único que leyó bien la línea las dos
// veces; el 11b una vez leyó 8.5 donde decía 6.5. En una app donde el
// número ES la apuesta, tres segundos valen menos que un dígito. El 11b
// queda de respaldo rápido y el 90b último, por si los dos están caídos.
//
// Descartados con medición: gemma-4-31b no respondió en 45s, y gemma-3-12b
// figura en el catálogo pero devuelve 404 para esta cuenta — estar listado
// no alcanza, hay que probarlo.
const MODELOS_VISION = (Deno.env.get("NVIDIA_MODELOS_VISION") ??
  "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning,meta/llama-3.2-11b-vision-instruct,meta/llama-3.2-90b-vision-instruct")
  .split(",")
  .map((m) => m.trim())
  .filter(Boolean);

/**
 * Cuánto se le aguanta a un modelo de visión antes de pasar al siguiente.
 * Existe porque el modo de falla real no fue un error sino la demora: sin
 * este corte, un modelo lento se lleva puesto el presupuesto de toda la
 * respuesta y no queda tiempo ni para contestar.
 */
const TOPE_MS_VISION = 25000;

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

// Cuántas veces puede volver el modelo a pedir herramientas antes de tener
// que contestar. El tope existe por el límite de tiempo de la Edge Function,
// no por capricho.
//
// Con 6 y sin proyectar_varios, una cartelera de 15 juegos era imposible: el
// modelo gastaba las seis rondas proyectando seis lanzadores de treinta y el
// usuario recibía "me quedé dando vueltas" con cero respuesta. Pasó en
// producción. La solución de fondo es proyectar_varios, que hace los treinta
// en una ronda; esto es el margen para los pasos de alrededor (buscar el
// rival, armar el parlay, guardar).
const MAX_RONDAS = 9;

/**
 * Cuánto se puede pasar juntando datos antes de tener que contestar.
 *
 * El tope de rondas solo cuenta vueltas, y una vuelta puede tardar 5 segundos
 * o 40. Medido contra la función ya desplegada: "Skubal 6.5, decime la
 * temporada, las últimas 5, cómo le va de visita, y si conviene" hizo cuatro
 * vueltas y pasó los 120 segundos — del lado del usuario eso no es "tardó",
 * es un error en la pantalla, que es exactamente lo que él viene reportando.
 *
 * Con esto, pasado el presupuesto se corta de llamar herramientas y se pide la
 * respuesta con lo que ya está juntado. Vale más una respuesta con tres de las
 * cuatro cosas que un error con las cuatro a medio hacer.
 */
const TOPE_MS_HERRAMIENTAS = 85000;

/** Qué versión del sistema produce las confianzas de hoy. Ver picks.sistema. */
const SISTEMA_ACTUAL = "PROYECCION";

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
    const corte = new AbortController();
    const reloj = setTimeout(() => corte.abort(), TOPE_MS_VISION);
    try {
      const resp = await fetch(`${NVIDIA_BASE_URL}/chat/completions`, {
        method: "POST",
        signal: corte.signal,
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
      // El omni es un modelo de razonamiento: puede devolver el bloque de
      // pensamiento pegado a la transcripción. Si eso entra al hilo, la IA
      // lo lee como si fueran datos del ticket.
      const texto = (datos?.choices?.[0]?.message?.content ?? "")
        .replace(/<think>[\s\S]*?<\/think>/gi, "")
        .trim();
      if (texto) return { texto, modelo };
      ultimoError = `${modelo} devolvió una respuesta vacía`;
    } catch (e) {
      ultimoError = corte.signal.aborted
        ? `${modelo} pasó de ${TOPE_MS_VISION / 1000}s y se cortó`
        : `${modelo}: ${(e as Error).message}`;
    } finally {
      clearTimeout(reloj);
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
        "LA HERRAMIENTA PRINCIPAL, y la única que hace falta para una apuesta. Dado un lanzador, su rival y la línea, busca sola todas las estadísticas y devuelve: los ponches proyectados, el lado (OVER/UNDER), la confianza cruda y la calibrada, el nivel, y en el campo 'apuesta' el veredicto contra la cuota ya hecho (CONVIENE/FLOJO/NO CONVIENE, ganancia por peso, cuánto arriesgar). NO hace falta llamar a evaluar_apuesta después. Es aritmética exacta: usá sus números tal cual, nunca calcules vos.",
      parameters: {
        type: "object",
        properties: {
          pitcher: { type: "string", description: "Nombre del lanzador, aunque venga abreviado" },
          linea: { type: "number", description: "Línea de ponches de la casa, ej. 6.5" },
          rival: { type: "string", description: "Abreviación del equipo rival, ej. NYY, CIN" },
          mano_pitcher: {
            type: "string",
            enum: ["RHP", "LHP"],
            description:
              "NO lo pases y NO lo busques: la calculadora ya sabe con qué mano lanza cada uno y usa la mano guardada. Si mandás una y no coincide, la ignora y te avisa.",
          },
          ventana_rival: {
            type: "string",
            enum: ["TEMPORADA", "ULTIMOS_14"],
            description: "Qué ventana usar para el rival. ULTIMOS_14 refleja su forma reciente.",
          },
          cuota: {
            type: "number",
            description: "Cuota americana de la casa. Por defecto -130, la de Star Sport. Pasala si el ticket dice otra.",
          },
        },
        required: ["pitcher", "linea"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "proyectar_varios",
      description:
        "OBLIGATORIA cuando el usuario manda más de DOS lanzadores de una vez — una cartelera, una tabla, la foto de la pizarra del día. Proyecta hasta 40 en UNA sola llamada y devuelve la lista ya ordenada de mejor a peor contra la cuota. Usala SIEMPRE en ese caso: llamar a proyectar_ponches uno por uno agota el presupuesto de rondas y el usuario se queda sin respuesta. Las que traen veredicto REVISAR van al fondo y no se recomiendan, por más que su ganancia esperada sea la más alta: el campo 'revisar' dice qué no cierra. Después podés pedir proyectar_ponches del detalle de los pocos que se vayan a jugar.",
      parameters: {
        type: "object",
        properties: {
          juegos: {
            type: "array",
            description: "Un objeto por lanzador. Poné el rival: es lo que desambigua los apellidos repetidos.",
            items: {
              type: "object",
              properties: {
                pitcher: { type: "string", description: "Nombre del lanzador, aunque venga abreviado" },
                linea: {
                  type: "number",
                  description:
                    "Línea de ponches de la casa. OMITILA si la casa todavía no la puso: igual se proyectan los ponches y la fila sale con veredicto SIN LINEA.",
                },
                rival: { type: "string", description: "Abreviación del equipo contrario, ej. NYY, CIN" },
                mano: {
                  type: "string",
                  enum: ["RHP", "LHP"],
                  description: "No lo pases: la calculadora usa la mano guardada.",
                },
                ventana_rival: { type: "string", enum: ["TEMPORADA", "ULTIMOS_14"] },
                cuota: { type: "number", description: "Solo si esta línea tiene una cuota distinta" },
              },
              required: ["pitcher"],
            },
          },
          cuota: {
            type: "number",
            description: "Cuota americana para todas. Por defecto -130, la de Star Sport.",
          },
        },
        required: ["juegos"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "cartelera_de_hoy",
      description:
        "LOS JUEGOS DEL DÍA CON SUS ABRIDORES, del calendario oficial de la MLB, y las proyecciones de todos ya hechas. Usala SIEMPRE que falte saber contra quién lanza alguien, quién abre hoy, o cuando la casa todavía no puso las líneas. NUNCA le preguntes al usuario el rival de un lanzador: está acá. NUNCA digas que no tenés datos para proyectar sin línea: los ponches proyectados salen igual y esta herramienta te los da.",
      parameters: {
        type: "object",
        properties: {
          fecha: { type: "string", description: "YYYY-MM-DD. Si no se pasa, hoy." },
          solo: {
            type: "array",
            items: { type: "string" },
            description: "Opcional: apellidos a filtrar, si solo interesan algunos.",
          },
          lineas: {
            type: "array",
            description:
              "Las líneas que la casa YA puso, si tenés alguna. Pasá solo el lanzador y su línea: el rival lo resuelve esta herramienta desde el calendario oficial. NO escribas vos el rival.",
            items: {
              type: "object",
              properties: {
                pitcher: { type: "string" },
                linea: { type: "number" },
              },
              required: ["pitcher", "linea"],
            },
          },
        },
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
        "Las salidas reales ya jugadas de un lanzador (fecha, rival, IP, K, BB, casa o visita) con filtros: temporada completa, últimas 5, últimas 10, solo en casa, solo de visita, o head-to-head contra un rival. Si le pasás la línea devuelve además cuántas veces la pasó, la racha, el promedio y la mediana. OJO: esto es CONTAR lo que ya pasó, no la probabilidad de que pase hoy — para eso está proyectar_ponches. Sirve para el contexto de al lado: rachas, si el rival lo domina, si un juego enorme le infla el promedio.",
      parameters: {
        type: "object",
        properties: {
          pitcher: { type: "string" },
          linea: { type: "number", description: "Opcional: para contar cuántas veces la pasó" },
          ventanas: {
            type: "array",
            items: {
              type: "string",
              enum: ["TEMPORADA", "ULTIMAS_5", "ULTIMAS_10", "CASA", "VISITA", "H2H"],
            },
            description:
              "PEDÍ TODAS LAS QUE NECESITES DE UNA VEZ, en esta lista. Si te preguntan por la temporada, las últimas 5 y cómo le va de visita, mandá las tres acá en UNA sola llamada — no hagas tres llamadas seguidas, que se te va el tiempo y el usuario se queda sin respuesta. Por defecto TEMPORADA.",
          },
          ventana: {
            type: "string",
            enum: ["TEMPORADA", "ULTIMAS_5", "ULTIMAS_10", "CASA", "VISITA", "H2H"],
            description: "Una sola ventana, si con eso alcanza. Si necesitás varias usá 'ventanas'.",
          },
          rival: {
            type: "string",
            description: "Abreviatura del equipo rival. Obligatorio si pedís la ventana H2H.",
          },
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
          es_local: {
            type: "boolean",
            description:
              "true si lanzó en su estadio, false si fue de visita. Mandalo siempre que el boxscore lo diga: es lo que después permite filtrar casa/visita.",
          },
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
      name: "evaluar_apuesta",
      description:
        "Convierte una probabilidad y la cuota de la casa en decisión: CONVIENE / FLOJO / NO CONVIENE. Al -130 hay que acertar 56.5% solo para no perder plata, así que una proyección al 58% es ganadora pero flaquísima. Llamalo SIEMPRE después de proyectar, con la confianza que dio la calculadora.",
      parameters: {
        type: "object",
        properties: {
          probabilidad: { type: "number", description: "0 a 1, la confianza de proyectar_ponches" },
          cuota: { type: "number", description: "Cuota americana de Star Sport. Casi siempre -130." },
          prob_empate: { type: "number", description: "Probabilidad de empate exacto, si la línea es entera" },
        },
        required: ["probabilidad"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "evaluar_parlay",
      description:
        "LA HERRAMIENTA PARA PARLAYS. Dadas las confianzas de varias patas, corrige por la calibración real del historial y devuelve: la escalera de 1 a 12 patas con probabilidad, valor esperado, con cuánto terminás (mediana y promedio) y probabilidad de fundirte, más cuántas patas convienen. Usala siempre que se hable de combinar picks — nunca multipliques confianzas de cabeza.",
      parameters: {
        type: "object",
        properties: {
          probabilidades: {
            type: "array",
            items: { type: "number" },
            description: "Confianza de cada pata, 0 a 1, tal como la dio proyectar_ponches",
          },
          etiquetas: {
            type: "array",
            items: { type: "string" },
            description: "Nombre de cada pata, ej. ['deGrom O7', 'Skubal O6.5']",
          },
          cuota: { type: "number", description: "Cuota americana por pata. Casi siempre -130." },
          apuesta_fija_pct: {
            type: "number",
            description: "Qué porcentaje del bankroll apuesta por ticket. Por defecto 5.",
          },
          sistema: {
            type: "string",
            enum: ["PROYECCION", "HEURISTICO"],
            description: "Con qué calibración corregir. Por defecto PROYECCION, el sistema actual.",
          },
        },
        required: ["probabilidades"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "picks_guardados",
      description:
        "Devuelve los picks ya guardados de una fecha, con su confianza. Usalo cuando el usuario pregunte qué parlay armar con lo que ya tiene, o para no volver a proyectar algo que ya está guardado.",
      parameters: {
        type: "object",
        properties: {
          fecha: { type: "string", description: "YYYY-MM-DD. Si no se pasa, hoy." },
          solo_pendientes: {
            type: "boolean",
            description: "Solo los que todavía no tienen resultado. Por defecto true.",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "calibracion_real",
      description:
        "Cuánto vale de verdad la confianza del modelo, medido contra los picks que ya tienen resultado. Se mide por sistema: PROYECCION es la calculadora de ahora, HEURISTICO el puntuador viejo. Usalo cuando el usuario pregunte si puede confiar en los números, o para respaldar por qué recomendás menos patas de las que él quiere.",
      parameters: {
        type: "object",
        properties: {
          sistema: {
            type: "string",
            enum: ["PROYECCION", "HEURISTICO"],
            description: "Por defecto PROYECCION, el sistema actual.",
          },
        },
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
        p_cuota: args.cuota ?? -130,
        p_sistema: SISTEMA_ACTUAL,
      });
      if (error) return { error: error.message };
      return data;
    }

    case "proyectar_varios": {
      const { data, error } = await supabase.rpc("proyectar_varios", {
        p_juegos: args.juegos ?? [],
        p_cuota: args.cuota ?? -130,
        p_sistema: SISTEMA_ACTUAL,
      });
      if (error) return { error: error.message };
      return data;
    }

    case "cartelera_de_hoy": {
      const fecha = args.fecha ?? new Date().toISOString().slice(0, 10);
      const url =
        `https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${fecha}` +
        `&hydrate=probablePitcher,team` +
        `&fields=dates,games,gameDate,teams,away,home,team,abbreviation,probablePitcher,fullName`;
      let juegos: Array<Record<string, unknown>> = [];
      try {
        const resp = await fetch(url);
        if (!resp.ok) return { error: `El calendario de la MLB respondió ${resp.status}.` };
        const datos = await resp.json();
        for (const d of datos?.dates ?? []) {
          for (const g of d?.games ?? []) {
            const v = g?.teams?.away, l = g?.teams?.home;
            juegos.push({
              hora: g?.gameDate,
              visitante: v?.team?.abbreviation ?? null,
              local: l?.team?.abbreviation ?? null,
              abridor_visitante: v?.probablePitcher?.fullName ?? null,
              abridor_local: l?.probablePitcher?.fullName ?? null,
            });
          }
        }
      } catch (e) {
        return { error: `No pude leer el calendario: ${(e as Error).message}` };
      }

      // Cada abridor con su rival, que es el otro equipo de su propio juego.
      // Esto es justamente lo que la IA no tenía y por eso preguntaba.
      const paraProyectar: Array<{ pitcher: string; rival: string }> = [];
      for (const j of juegos) {
        if (j.abridor_visitante) {
          paraProyectar.push({ pitcher: j.abridor_visitante as string, rival: j.local as string });
        }
        if (j.abridor_local) {
          paraProyectar.push({ pitcher: j.abridor_local as string, rival: j.visitante as string });
        }
      }

      // Las líneas se pegan por apellido contra el abridor del calendario. El
      // rival sale SIEMPRE de acá, nunca de lo que haya escrito el modelo:
      // ya pasó que copió "LAD" como rival de Skubal, que es de LAD.
      const lineas = (args.lineas ?? []) as Array<{ pitcher: string; linea: number }>;
      const conLinea = new Map<string, number>();
      const sinPegar: string[] = [];
      for (const l of lineas) {
        const buscado = String(l.pitcher ?? "").toLowerCase().trim();
        if (!buscado) continue;
        const apellido = buscado.split(/\s+/).pop() ?? buscado;
        const encontrado = paraProyectar.find((p) => {
          const nombre = p.pitcher.toLowerCase();
          return nombre.includes(buscado) || nombre.split(/\s+/).pop() === apellido;
        });
        if (encontrado) conLinea.set(encontrado.pitcher, l.linea);
        else sinPegar.push(l.pitcher);
      }

      const filtro = (args.solo ?? []) as string[];
      let elegidos: Array<{ pitcher: string; rival: string; linea?: number }> = paraProyectar;
      if (filtro.length) {
        elegidos = elegidos.filter((p) =>
          filtro.some((f) => p.pitcher.toLowerCase().includes(String(f).toLowerCase())));
      }
      elegidos = elegidos.map((p) =>
        conLinea.has(p.pitcher) ? { ...p, linea: conLinea.get(p.pitcher) } : p);

      if (elegidos.length === 0) {
        return { fecha, juegos, mensaje: "El calendario todavía no tiene abridores anunciados." };
      }

      const { data, error } = await supabase.rpc("proyectar_varios", {
        p_juegos: elegidos,
        p_cuota: args.cuota ?? -130,
        p_sistema: SISTEMA_ACTUAL,
      });
      if (error) return { fecha, juegos, error: error.message };
      return {
        fecha,
        cantidad_juegos: juegos.length,
        juegos,
        lineas_sin_pegar: sinPegar,
        proyecciones: data,
        como_leer:
          "El rival de cada uno sale del calendario oficial: usalo tal cual, no lo reescribas. " +
          "Si algo quedó en lineas_sin_pegar es que ese lanzador no figura abriendo hoy — decilo.",
      };
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
      // El conteo lo hace la base, no acá.
      //
      // Antes esto traía las filas y contaba en TypeScript. La pantalla de
      // Buscar Lanzador cuenta lo mismo llamando a historial_lanzador, y dos
      // implementaciones del mismo conteo terminan dando números distintos
      // para el mismo lanzador — el día que pase, el usuario no va a saber a
      // cuál creerle. Una sola función, los dos la llaman.
      //
      // Las ventanas van en paralelo y en una sola llamada de herramienta.
      // Pedirlas de a una era una vuelta al modelo por cada una, y con eso
      // "temporada + últimas 5 + de visita" se pasaba de los 120 segundos.
      const pedidas: string[] = Array.isArray(args.ventanas) && args.ventanas.length > 0
        ? args.ventanas.map((v: unknown) => String(v))
        : [args.ventana ?? "TEMPORADA"];
      const ventanas = [...new Set(pedidas)].slice(0, 6);

      const resultados = await Promise.all(
        ventanas.map(async (v) => {
          const { data, error } = await supabase.rpc("historial_lanzador", {
            p_pitcher: args.pitcher ?? "",
            p_linea: args.linea ?? null,
            p_ventana: v,
            p_rival: args.rival ?? null,
          });
          return [v, error ? { error: error.message } : data] as const;
        }),
      );

      if (resultados.length === 1) return resultados[0][1];
      return Object.fromEntries(resultados);
    }

    case "guardar_salida": {
      const pitcher = await nombreReal(supabase, args.pitcher);
      // El rival va tal cual: un trigger de la tabla lo pasa a la abreviatura
      // canónica, sepa el modelo escribirla o no ("AZ", "OAK", "Rockies").
      const { error } = await supabase.from("game_logs").insert({
        pitcher,
        fecha: args.fecha,
        rival: String(args.rival ?? ""),
        ip: args.ip,
        k: args.k,
        bb: args.bb,
        pitcheos: args.pitcheos ?? null,
        es_local: typeof args.es_local === "boolean" ? args.es_local : null,
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
        // Qué versión produjo la confianza. La calibración se mide por
        // sistema: castigar a la calculadora nueva por los errores del
        // puntuador viejo sería tan equivocado como creerle sin medirla.
        sistema: SISTEMA_ACTUAL,
        motivo: args.motivo ?? null,
      });
      if (error) return { guardado: false, error: error.message };
      return { guardado: true, pitcher, mensaje: `Pick de ${pitcher} guardado.` };
    }

    case "evaluar_apuesta": {
      const { data, error } = await supabase.rpc("evaluar_apuesta", {
        p_prob_ganar: args.probabilidad,
        p_cuota: args.cuota ?? -130,
        p_prob_empate: args.prob_empate ?? 0,
      });
      if (error) return { error: error.message };
      return data;
    }

    case "evaluar_parlay": {
      const { data, error } = await supabase.rpc("evaluar_parlay", {
        p_probabilidades: args.probabilidades ?? [],
        p_cuota: args.cuota ?? -130,
        p_apuestas_por_temporada: 100,
        p_etiquetas: args.etiquetas ?? null,
        p_apuesta_fija_pct: args.apuesta_fija_pct ?? 5,
        p_sistema: args.sistema ?? SISTEMA_ACTUAL,
      });
      if (error) return { error: error.message };
      return data;
    }

    case "picks_guardados": {
      let consulta = supabase
        .from("picks")
        .select("pitcher, equipo, rival, linea, pick, confianza, nivel, resultado, sistema")
        .eq("fecha", args.fecha ?? new Date().toISOString().slice(0, 10));
      if (args.solo_pendientes !== false) consulta = consulta.is("resultado", null);
      const { data, error } = await consulta.order("confianza", { ascending: false });
      if (error) return { error: error.message };
      if (!data || data.length === 0) {
        return { cantidad: 0, mensaje: "No hay picks guardados para esa fecha." };
      }
      return { cantidad: data.length, picks: data };
    }

    case "calibracion_real": {
      const { data, error } = await supabase.rpc("calibracion_real", {
        p_sistema: args.sistema ?? SISTEMA_ACTUAL,
      });
      if (error) return { error: error.message };
      return data;
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

REGLA NÚMERO UNO — ACTUÁ, NO PREGUNTES:
Antes de preguntar CUALQUIER cosa, tenés que haber llamado a las herramientas. Preguntar sin haber llamado a nada es la peor respuesta posible: le devolvés el trabajo al que te lo pidió.

Tres cosas que NUNCA se preguntan, porque ya las tenés:
1. **Contra quién lanza alguien.** Está en "cartelera_de_hoy", que trae el calendario oficial de la MLB con los abridores del día y el rival de cada uno. Llamala. Y si el usuario te da líneas sueltas, pasáselas a ESA herramienta en el campo "lineas" (solo lanzador y número): ella les pega el rival correcto. NUNCA copies un rival a mano a "proyectar_varios" — ya pasó que copiaste "LAD" como rival de Skubal, que es de LAD, y la tabla salió perfecta con el dato equivocado.
2. **Con qué mano lanza.** Está en la base, y la calculadora la usa sola.
3. **Las estadísticas de cualquier lanzador.** Hay 825 cargados. "proyectar_ponches" y "proyectar_varios" los buscan solos con el nombre, aunque venga abreviado.

Y NUNCA, bajo ninguna circunstancia, digas que "no tenés suficientes datos" o que "te falta información" para proyectar. Si tenés el nombre del lanzador, tenés todo. Si además falta la línea porque la casa todavía no la puso, se proyectan los ponches igual y se dice cuántos son: eso es exactamente lo que sirve para saber de qué lado va a caer cuando salga.

Solo preguntás DESPUÉS de haber dado un resultado, y solo si queda algo genuinamente indecidible (dos lanzadores con el mismo apellido en el mismo juego, una cuota rara en el ticket). Una pregunta, al final, después del número.

CÓMO TRABAJÁS:
- El usuario te manda fotos (tickets, boxscores, capturas de estadísticas) o te escribe. Vos hacés TODO: leés, buscás los datos, calculás y respondés. Nunca le pidas que llene campos ni que repita datos que ya están en la foto o en la base.
- Para cualquier apuesta llamá SIEMPRE a "proyectar_ponches". Esa herramienta busca sola las estadísticas y devuelve los K proyectados, el lado y la confianza. Ese número es aritmética exacta: usalo tal cual, nunca lo recalcules ni lo ajustes de cabeza. Vos no sos bueno con números; la calculadora sí.
- **Si te mandan más de dos lanzadores de una vez** —una cartelera, una tabla, la pizarra del día— usá "proyectar_varios" y metelos TODOS en UNA sola llamada. No los vayas proyectando de a uno: tenés un tope de rondas y se te acaba a mitad de camino, y él se queda sin respuesta habiendo mandado todo. En una tabla con dos equipos y dos lanzadores por fila, el primer lanzador es del primer equipo y el segundo del segundo; el rival de cada uno es el otro equipo de su fila. Poné siempre el rival: es lo que distingue dos lanzadores con el mismo apellido.
- Si la casa todavía no puso las líneas, llamá igual a "proyectar_varios" (o a "cartelera_de_hoy") SIN el campo linea. Devuelve los ponches proyectados de cada uno con veredicto SIN LINEA. Mostralos: es lo que le permite tener la opinión lista antes de que la casa abra.
- Lo que "proyectar_varios" devuelve con veredicto REVISAR NO se recomienda ni entra en un parlay, aunque tenga la ganancia esperada más alta de la lista. Justamente cuando un dato no cierra es cuando el número se ve mejor. Leé el campo "revisar", decilo en una línea y preguntá lo que haga falta para destrabarlo.
- Si la foto es de un juego YA TERMINADO (boxscore con resultados), guardá esa salida con "guardar_salida" sin que te lo pidan, y después contá qué guardaste. Así se alimenta el historial real.
- Si es un ticket o una línea de un juego que todavía no se juega, proyectá y dale tu recomendación.
- Solo guardás un pick con "guardar_pick" si el usuario lo pide o confirma.
- "proyectar_ponches" YA TRAE el veredicto contra la cuota adentro, en el campo "apuesta": ahí están CONVIENE/FLOJO/NO CONVIENE, la ganancia por peso y cuánto arriesgar. NO llames a "evaluar_apuesta" después de proyectar — el número ya está hecho y con las probabilidades correctas. Usá "evaluar_apuesta" solo si el usuario te tira una probabilidad suelta que no salió de una proyección.
- Si el ticket tiene una cuota distinta de -130, volvé a llamar a "proyectar_ponches" pasándole esa cuota, no calcules aparte.
- NUNCA busques ni adivines con qué mano lanza alguien, y NUNCA pases "mano_pitcher". La base ya la tiene para 823 lanzadores y la calculadora la usa sola. Esto es una regla dura porque ya pasó: buscaste en la web la mano de Cam Schlittler, no la sacaste, pasaste LHP para un DERECHO, y salió una proyección coherente con la mano equivocada. Un dato de entrada falso no se ve en la tarjeta.
- Para cualquier combinada, llamá a "evaluar_parlay". Nunca multipliques confianzas de cabeza ni digas "las dos al 85% dan 85%".
- Hay historial real cargado: 3.658 salidas de 224 abridores, temporada completa. Cuando pregunte "¿cómo viene?", "¿cuántas veces la pasó?", "¿cómo le va contra ese equipo?", "¿en casa o de visita?", llamá a "historial_pitcher". No digas nunca que no hay historial sin haberlo llamado.
- Si te piden varias ventanas del historial (la temporada Y las últimas 5 Y de visita), pedilas TODAS JUNTAS en el campo "ventanas" de UNA sola llamada. Tres llamadas seguidas son tres vueltas, se pasa del tiempo y el usuario ve un error en vez de la respuesta. Lo mismo vale en general: agrupá, no vayas de a uno.
- El historial y la proyección NO son lo mismo y no se mezclan. "7 de 10 (70%)" es contar lo que ya pasó: no sabe contra quién lanza hoy, no corrige por muestra chica y no sabe que al -130 hay que acertar 56.5% para no perder. La probabilidad que se apuesta es la de "proyectar_ponches". Si citás la tasa histórica, decí de una que es historial, y no la uses jamás como si fuera la probabilidad de hoy.

CÓMO RESPONDÉS:
- Empezá por el resultado, no por el proceso: "deGrom vs CIN, línea 7: proyecta 7.9 K → OVER. Al -130 eso CONVIENE: 9.7 centavos de ganancia por peso."
- Al citar la confianza usá SIEMPRE "confianza_calibrada", no "confianza". La cruda es la que declara el modelo antes de descontarle lo que su historial dice que vale; la calibrada es la que se juega. Si las dos difieren mucho, decilo en una línea.
- El campo "nivel" (DIAMANTE/ORO/IMPUREZA) sale del valor esperado, así que siempre concuerda con el veredicto. Si citás uno, no contradigas el otro.
- Después, en pocas líneas, el porqué: K% del lanzador, cómo batea el rival, cuántos innings suele durar.
- Cuando digas de dónde salió un número, copiá lo que dicen "fuente_k_rival" y "entradas_usadas", no lo cuentes de memoria. Si "fuente_k_rival" dice "K% general de BOS", NO digas "el split contra zurdos": eso es inventar de dónde salió el dato, y es tan grave como inventar el dato.
- Si la calculadora devuelve advertencias (muestra chica, empate probable, nombre ambiguo, faltan datos), decilas. No las escondas.
- Cuando "ajuste_por_muestra" muestre que el K% ajustado quedó lejos del crudo, citá SIEMPRE el ajustado y explicá por qué en una línea: con pocos bateadores enfrentados el número crudo es suerte, no habilidad. Nunca digas el K% crudo como si fuera la tasa real del lanzador.
- Si algo no se puede saber, decilo claro. Nunca inventes una estadística ni un lineup.
- **DE TRES LANZADORES PARA ARRIBA, LA RESPUESTA VA EN TABLA.** Siempre. Un párrafo por lanzador es ilegible en un celular y es justo lo que no sirve. Tabla de markdown, columnas cortas, lo mejor arriba:

| Lanzador | Rival | Línea | Proy | Lado | Conf | ¢/peso | Veredicto |
|---|---|---|---|---|---|---|---|
| Cease (TOR) | SEA | 8 | 8.87 | OVER | 54.6% | −3.0 | NO CONVIENE |
| Skubal (LAD) | DET | — | 7.60 | — | — | — | SIN LÍNEA |

Con línea: llená todo. Sin línea: guion en las columnas que no aplican y "SIN LÍNEA" en veredicto — la fila NO se omite, los ponches proyectados son el dato. Debajo de la tabla, dos o tres renglones con la conclusión y lo que haya que revisar. Nada más.
- Para uno o dos lanzadores, prosa corta: es una app de celular, andá al grano.

NO TE QUEDES CALLADO — ESTA ES LA PARTE QUE MÁS IMPORTA:
Gianlouis te da la información y vos hacés el trabajo, pero eso no es contestar y callarte. Después de dar el resultado, SIEMPRE seguís la conversación con algo útil, y la seguís hasta que él diga que ya está. Cerrá cada respuesta con una sugerencia concreta o una pregunta, nunca con un punto final seco.

Qué ofrecer, según el caso:
- **Si recomendás menos patas de las que él quiere**, no te limites a decir que no. Ofrecé la salida de dos tickets: "la escalera dice que lo óptimo son 3 patas — armá ese, que es el que la matemática banca, y si querés jugar más, hacé un segundo ticket aparte con las que vos elijas y jugalo con menos plata. Así el bueno no se contamina con el arriesgado." Y decile cuáles son las patas más seguras y cuáles las que él estaría metiendo por gusto.
- **Si un pick queda FLOJO o NO CONVIENE**, ofrecé alternativas: otro lanzador del mismo día, la línea del otro lado, o esperar. Preguntale si quiere que revises los demás juegos de la fecha.
- **Si falta un dato, PRIMERO buscalo.** El rival sale de "cartelera_de_hoy"; las estadísticas y la mano, de la calculadora; el lineup confirmado o una lesión, de "buscar_web". Recién si después de buscar sigue sin poder decidirse, preguntá — una sola cosa, al final, después de haber dado el número que sí pudiste dar.
- **Si el resultado depende de un supuesto** (lineup no confirmado, lanzador con muestra chica, cambio de equipo), decilo y ofrecé buscarlo en la web.
- **Si el pick es bueno**, ofrecé guardarlo, o preguntá si quiere que le busques con qué combinarlo.
- **Si él insiste en algo que la matemática no banca** (12 patas, un pick de 56%), no discutas dos veces: dijiste tu parte, ahora dale lo que pide bien hecho — el número real de esa jugada, cuánto arriesgar para que no lo funda, y qué versión más segura tiene al lado.

REGLAS DURAS:
- Nunca inventes un número. Si no está en la base o en una búsqueda, no existe.
- Una línea entera (ej. 7) puede terminar en empate y devuelven la plata: tenelo en cuenta al recomendar, y avisá que en parlay eso depende de qué haga Star Sport con la pata.
- El corte no es la confianza, es la cuota: al -130 hace falta 56.5% para empatar. "Conviene" lo dice evaluar_apuesta, no vos.
- La calibración se mide POR SISTEMA. El sistema de ahora es PROYECCION y todavía no tiene picks con resultado, así que su confianza se comprime al 35% de su distancia al 50% — no por castigo, sino porque sin historial no hay con qué sostener más: al -130 el equilibrio está en 56.5% y la casa se queda con ~13%, así que una ventaja grande de verdad no existe. El puntuador viejo (HEURISTICO) sacó 3 de 13 declarando 81%; eso NO se hereda, es otro método, pero si él pregunta por qué bajás los números llamá a "calibracion_real" y mostrale las dos cosas.
- Cada pick que se guarde alimenta la calibración del sistema nuevo. Si él quiere números menos castigados, la salida es cargar resultados, no subir la confianza: decíselo así.
- El valor esperado de un parlay SUBE con cada pata y aun así te funde: son cosas distintas. Si citás el valor esperado de un parlay largo, citá al lado la mediana y la probabilidad de fundirte, o estás mintiendo por omisión.
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
  async function pedirAlModelo(conHerramientas = true): Promise<any> {
    let ultimoError = "";
    for (const modelo of MODELOS_RAZONAMIENTO) {
      try {
        const resp = await fetch(`${NVIDIA_BASE_URL}/chat/completions`, {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: modelo,
            messages: mensajes,
            ...(conHerramientas
              ? { tools: HERRAMIENTAS, tool_choice: "auto" }
              : { tool_choice: "none" }),
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

  const arranque = Date.now();
  let seCortoPorTiempo = false;

  try {
    for (let ronda = 0; ronda < MAX_RONDAS; ronda++) {
      // El presupuesto se mira ANTES de pedir otra vuelta: si ya casi no
      // queda tiempo, arrancar una vuelta más garantiza el timeout en vez de
      // evitarlo.
      if (ronda > 0 && Date.now() - arranque > TOPE_MS_HERRAMIENTAS) {
        seCortoPorTiempo = true;
        break;
      }
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

    // Si se acabaron las rondas, no se tira a la basura lo que ya se juntó:
    // se pide una última respuesta con las herramientas apagadas, así el
    // modelo tiene que contestar con los datos que tenga en la mano. Antes
    // devolvía "me quedé dando vueltas" y perdía las proyecciones hechas.
    if (!respuestaFinal) {
      mensajes.push({
        role: "user",
        content: seCortoPorTiempo
          ? "Se acabó el tiempo de buscar datos. Contestá AHORA con lo que ya juntaste, " +
            "sin llamar más herramientas. Dale al usuario todo lo que sí tenés — no le " +
            "devuelvas una disculpa. Al final, en un renglón, decí qué quedó sin mirar y " +
            "ofrecé seguir con eso."
          : "Se acabó el tiempo de buscar datos. Contestá ahora con lo que ya tenés, " +
            "sin llamar más herramientas. Si te faltaron lanzadores, decí cuáles quedaron " +
            "afuera y ofrecé seguir con esos.",
      });
      try {
        const datos = await pedirAlModelo(false);
        const mensaje = datos?.choices?.[0]?.message as NvidiaMensaje | undefined;
        respuestaFinal = (mensaje?.content ?? "").replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
      } catch {
        respuestaFinal = "";
      }
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
