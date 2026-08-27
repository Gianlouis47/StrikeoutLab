// Edge Function: analizar-foto
//
// Recibe una foto (ticket de Star Sport, captura de MLB.com/Baseball
// Savant, boxscore) en base64 y le pide a un modelo de visión de NVIDIA
// que extraiga los datos estructurados. No escribe nada en la base de
// datos — devuelve el JSON extraído para que el usuario lo revise en la
// app antes de guardarlo.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

interface SolicitudFoto {
  imagenBase64: string; // sin el prefijo "data:...;base64,"
  mimeType: string; // ej. "image/jpeg"
}

interface DatosExtraidos {
  tipo_detectado: "ticket_star_sport" | "captura_stats" | "boxscore" | "desconocido";
  pitcher: string | null;
  equipo: string | null;
  rival: string | null;
  linea: number | null;
  pick: "OVER" | "UNDER" | null;
  cuota: number | null;
  codigo: string | null;
  otros_datos: Record<string, unknown>;
}

const NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1";
// Nemotron 3 Nano Omni: modelo multimodal de NVIDIA (2026), pensado como
// "sub-agente de percepción" — lee imagen/texto y transcribe. Es un modelo
// con razonamiento interno propio, pero su API separa ese pensamiento del
// content final (no hace falta limpiarlo acá). Override sin tocar código
// con el secret NVIDIA_MODEL_VISION.
const MODELO_VISION = Deno.env.get("NVIDIA_MODEL_VISION") ?? "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning";

const INSTRUCCIONES = `Analiza esta imagen. Puede ser: un ticket/boleta de la banca Star Sport, una captura de estadísticas (MLB.com, Baseball Savant, FanGraphs), o un boxscore de un juego.

Extrae exactamente lo que puedas LEER en la imagen — nunca inventes un dato que no esté visible. Si un campo no aparece o no es legible, usa null.

Responde SOLO con JSON válido, sin texto adicional, con esta forma exacta:
{"tipo_detectado":"ticket_star_sport"|"captura_stats"|"boxscore"|"desconocido","pitcher":string|null,"equipo":string|null,"rival":string|null,"linea":number|null,"pick":"OVER"|"UNDER"|null,"cuota":number|null,"codigo":string|null,"otros_datos":{}}

"otros_datos" es para cualquier estadística visible que no encaje en los campos anteriores (K%, Whiff%, ERA, innings, fecha, etc.) — inclúyela ahí como pares clave-valor.`;

async function llamarNvidiaVision(imagenBase64: string, mimeType: string): Promise<string> {
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
      model: MODELO_VISION,
      temperature: 0.1,
      max_tokens: 2048,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: INSTRUCCIONES },
            { type: "image_url", image_url: { url: `data:${mimeType};base64,${imagenBase64}` } },
          ],
        },
      ],
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

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Usa POST" }), { status: 405 });
  }

  let solicitud: SolicitudFoto;
  try {
    solicitud = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "JSON inválido en el body" }), { status: 400 });
  }

  if (!solicitud.imagenBase64 || !solicitud.mimeType) {
    return new Response(
      JSON.stringify({ error: "Faltan campos requeridos: imagenBase64, mimeType" }),
      { status: 400 },
    );
  }

  let datosExtraidos: DatosExtraidos;
  try {
    const contenidoIA = await llamarNvidiaVision(solicitud.imagenBase64, solicitud.mimeType);
    datosExtraidos = parsearJsonModelo<DatosExtraidos>(contenidoIA);
  } catch (error) {
    return new Response(JSON.stringify({ error: (error as Error).message }), { status: 502 });
  }

  return new Response(JSON.stringify({ datosExtraidos, modeloUsado: MODELO_VISION }), {
    headers: { "Content-Type": "application/json" },
  });
});
