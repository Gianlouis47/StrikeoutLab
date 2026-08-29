// La conversación del chat, guardada en el teléfono.
//
// Antes vivía sólo en `useState`, y eso significaba dos pérdidas distintas
// que desde afuera se ven igual —"se borra todo"— pero tienen causas
// separadas:
//
//   1. Cambiar de pestaña. App.tsx dibujaba la pantalla con
//      `{pestana === "chat" && <ChatScreen />}`: al salir, React desmonta el
//      componente y con él se va todo el useState. Eso se arregla allá,
//      dejando las pantallas montadas.
//   2. Cerrar la app. Aunque la pantalla quede montada, al matar el proceso
//      no queda nada. Eso se arregla acá.
//
// Se guarda también lo que estaba escrito sin enviar: perder un mensaje a
// medio escribir por tocar otra pestaña es de las cosas que más molestan.
//
// El pick completo se guarda con la burbuja para que el botón de "guardar
// este pick" siga funcionando después de reabrir la app. Son unos pocos KB
// por pick y es lo que evita tener que volver a preguntarle a la IA.

import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Proyeccion } from "./calculadora";

const CLAVE = "strikeoutlab.conversacion.v1";

/**
 * Cuántas burbujas se guardan. El chat de arriba sigue en pantalla mientras
 * la app viva; el tope es para que el archivo no crezca sin fin. 80 son
 * varios días de uso normal.
 */
export const TOPE_BURBUJAS = 80;

export interface BurbujaGuardada {
  id: string;
  rol: "usuario" | "asistente";
  texto: string;
  uriImagen?: string;
  detalle?: string[];
  pick?: Proyeccion;
  pickGuardadoId?: string;
}

interface Guardado {
  version: 1;
  burbujas: BurbujaGuardada[];
  borrador: string;
}

export async function cargarConversacion(): Promise<{ burbujas: BurbujaGuardada[]; borrador: string }> {
  try {
    const crudo = await AsyncStorage.getItem(CLAVE);
    if (!crudo) return { burbujas: [], borrador: "" };
    const datos = JSON.parse(crudo) as Guardado;
    if (datos?.version !== 1 || !Array.isArray(datos.burbujas)) return { burbujas: [], borrador: "" };
    return { burbujas: datos.burbujas, borrador: typeof datos.borrador === "string" ? datos.borrador : "" };
  } catch {
    // Un guardado corrupto no puede dejar la pantalla en blanco para siempre.
    return { burbujas: [], borrador: "" };
  }
}

export async function guardarConversacion(
  burbujas: BurbujaGuardada[],
  borrador: string,
): Promise<void> {
  try {
    const datos: Guardado = {
      version: 1,
      burbujas: burbujas.slice(-TOPE_BURBUJAS),
      borrador,
    };
    await AsyncStorage.setItem(CLAVE, JSON.stringify(datos));
  } catch {
    // Si no se pudo guardar, la conversación sigue viva en memoria. Molestar
    // con un error acá sería peor que perderla en el próximo arranque.
  }
}

export async function borrarConversacion(): Promise<void> {
  try {
    await AsyncStorage.removeItem(CLAVE);
  } catch {
    // Igual que arriba.
  }
}
