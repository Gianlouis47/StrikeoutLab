// Elegir una foto, achicarla y dejarla guardada donde no se borre.
//
// Dos problemas que tenía la versión anterior, los dos visibles en el
// teléfono:
//
// 1. LA FOTO SALÍA ENTERA. ImagePicker con `quality: 0.6` y sin más nada
//    devuelve la foto a resolución completa: en un celular de hoy son 12 MP,
//    o sea 2-4 MB de JPEG, que en base64 son 3-5 MB viajando por datos
//    móviles en cada mensaje. Medido contra el modelo de visión, una imagen
//    inflada a 935 KB llegó a tardar 103 segundos en transcribirse — más que
//    el tiempo que tiene la Edge Function para responder entera. Achicada a
//    1280 px de lado largo, el mismo ticket se lee igual de bien y pesa
//    entre 30 y 80 KB.
//
// 2. LA FOTO DESAPARECÍA. ImagePicker deja el archivo en la carpeta de
//    caché, que Android borra cuando quiere. La burbuja del chat guardaba
//    esa URI, así que la imagen se veía hasta que el sistema limpiaba y
//    después quedaba el hueco. Ahora se copia a la carpeta de documentos de
//    la app, que no se borra sola.
//
// El texto que se le manda a la IA sale de la imagen ACHICADA, no del
// archivo original: son el mismo contenido y una pesa cuarenta veces menos.

import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { Directory, File, Paths } from "expo-file-system";

/**
 * Lado largo al que se achica antes de mandarla. 1280 px alcanza de sobra
 * para leer un ticket o un boxscore, y es lo que separa una respuesta de
 * pocos segundos de una que no llega.
 */
export const LADO_LARGO_MAXIMO = 1280;

/** Carpeta propia adentro de documentos, para poder limpiarla de una. */
const CARPETA = "imagenes-chat";

export interface ImagenLista {
  /** base64 de la versión achicada: es lo que viaja a la Edge Function. */
  base64: string;
  mimeType: string;
  /** Ruta permanente, la que se guarda en la conversación. */
  uri: string;
  anchoOriginal: number;
  altoOriginal: number;
  pesoKb: number;
}

function carpeta(): Directory {
  const dir = new Directory(Paths.document, CARPETA);
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  return dir;
}

/**
 * Copia el archivo a documentos con un nombre único. Si la copia falla
 * —permisos, disco lleno— se devuelve la URI original en vez de romper: la
 * imagen se va a ver ahora aunque quizá no sobreviva, que es mejor que
 * perder el mensaje entero.
 */
function guardarPermanente(uriTemporal: string): string {
  try {
    const nombre = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
    const destino = new File(carpeta(), nombre);
    new File(uriTemporal).copySync(destino);
    return destino.uri;
  } catch {
    return uriTemporal;
  }
}

/**
 * Pide permiso, abre cámara o galería, achica y guarda. Devuelve null si el
 * usuario canceló.
 *
 * @throws Error con un mensaje para mostrar tal cual si falta el permiso o
 * la imagen no se puede leer.
 */
export async function elegirImagen(desdeCamara: boolean): Promise<ImagenLista | null> {
  const permiso = desdeCamara
    ? await ImagePicker.requestCameraPermissionsAsync()
    : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permiso.granted) {
    throw new Error(
      desdeCamara
        ? "Necesito permiso de cámara para tomar la foto."
        : "Necesito permiso de galería para elegir la imagen.",
    );
  }

  // Sin base64 acá a propósito: el de la foto entera no se usa nunca y
  // cargarlo en memoria es lo que tumba la app con fotos grandes.
  const opciones: ImagePicker.ImagePickerOptions = { quality: 1 };
  const elegida = desdeCamara
    ? await ImagePicker.launchCameraAsync(opciones)
    : await ImagePicker.launchImageLibraryAsync(opciones);
  if (elegida.canceled) return null;

  const asset = elegida.assets[0];
  const lado = Math.max(asset.width ?? 0, asset.height ?? 0);
  const esAncha = (asset.width ?? 0) >= (asset.height ?? 0);
  const acciones: ImageManipulator.Action[] =
    lado > LADO_LARGO_MAXIMO
      ? [{ resize: esAncha ? { width: LADO_LARGO_MAXIMO } : { height: LADO_LARGO_MAXIMO } }]
      : [];

  const achicada = await ImageManipulator.manipulateAsync(asset.uri, acciones, {
    compress: 0.7,
    format: ImageManipulator.SaveFormat.JPEG,
    base64: true,
  });

  if (!achicada.base64) throw new Error("No pude leer esa imagen, probá con otra.");

  return {
    base64: achicada.base64,
    mimeType: "image/jpeg",
    uri: guardarPermanente(achicada.uri),
    anchoOriginal: asset.width ?? 0,
    altoOriginal: asset.height ?? 0,
    pesoKb: Math.round(achicada.base64.length / 1024),
  };
}

/** Borra las imágenes guardadas. Va con "borrar la conversación". */
export function borrarImagenesGuardadas(): void {
  try {
    const dir = new Directory(Paths.document, CARPETA);
    if (dir.exists) dir.delete();
  } catch {
    // Que no se pueda limpiar no es motivo para romperle la pantalla.
  }
}
