// La puerta de entrada al análisis: la Edge Function `chat`.
//
// Esta función NO cambió al pasar a web. Es exactamente la misma que ya
// estaba desplegada y probada: lee fotos, busca los datos, llama a la
// calculadora de Postgres y responde. La app nueva le habla igual que la
// vieja.

import { supabase } from "./supabase";

export interface MensajeChat {
  rol: "usuario" | "asistente";
  texto?: string;
  imagenBase64?: string;
  mimeType?: string;
}

export interface RespuestaChat {
  respuesta: string;
  transcripciones: Array<{ modelo: string; texto: string }>;
  herramientasUsadas: Array<{ nombre: string; argumentos: unknown; resultado: unknown }>;
  razonamiento: string | null;
  modeloUsado: string;
}

export async function chat(mensajes: MensajeChat[]): Promise<RespuestaChat> {
  const { data, error } = await supabase.functions.invoke<RespuestaChat>("chat", {
    body: { mensajes },
  });

  if (error) {
    // El cuerpo del error trae el motivo real. Sin esto el usuario solo vería
    // "Edge Function returned a non-2xx status code", que no dice nada —
    // mientras que el mensaje de adentro sí explica qué hacer.
    const detalle = await (error as { context?: { json?: () => Promise<{ error?: string }> } })
      .context?.json?.()
      .then((j) => j?.error)
      .catch(() => undefined);
    throw new Error(detalle ?? error.message);
  }
  if (!data) throw new Error("El chat no devolvió respuesta.");
  return data;
}

/**
 * Una foto del celular, lista para mandar.
 *
 * Se achica antes de subirla. No es cosmético: la Edge Function transcribe la
 * imagen con un modelo de visión y las fotos de un celular moderno pesan
 * varios megas — subirla entera agrega segundos por nada, porque para leer
 * una línea de un ticket con 1280 px de lado largo sobra.
 *
 * En la app nativa esto necesitaba expo-image-picker + expo-image-manipulator
 * + expo-file-system, tres dependencias con código nativo. Acá es un <canvas>
 * y un <input type="file">, que ya vienen en el navegador.
 */
export function comprimirImagen(archivo: File, ladoMaximo = 1280): Promise<{ base64: string; mimeType: string }> {
  return new Promise((resolver, rechazar) => {
    const lector = new FileReader();
    lector.onerror = () => rechazar(new Error("No se pudo leer el archivo."));
    lector.onload = () => {
      const img = new Image();
      img.onerror = () => rechazar(new Error("Ese archivo no es una imagen que el navegador pueda abrir."));
      img.onload = () => {
        const escala = Math.min(1, ladoMaximo / Math.max(img.width, img.height));
        const lienzo = document.createElement("canvas");
        lienzo.width = Math.round(img.width * escala);
        lienzo.height = Math.round(img.height * escala);

        const ctx = lienzo.getContext("2d");
        if (!ctx) return rechazar(new Error("El navegador no dio contexto de canvas."));
        ctx.drawImage(img, 0, 0, lienzo.width, lienzo.height);

        // JPEG al 70%: para leer texto de un ticket alcanza y de sobra, y
        // pesa una fracción del PNG.
        const datos = lienzo.toDataURL("image/jpeg", 0.7);
        resolver({ base64: datos.split(",")[1] ?? "", mimeType: "image/jpeg" });
      };
      img.src = String(lector.result);
    };
    lector.readAsDataURL(archivo);
  });
}
