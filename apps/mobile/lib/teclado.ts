// Cuánto hay que levantar la pantalla para que el teclado no tape lo de abajo.
//
// En Android hay dos comportamientos posibles y no se sabe cuál toca hasta que
// la app corre en el teléfono:
//
//   1. La ventana se achica sola (adjustResize de toda la vida). El contenido
//      ya queda arriba del teclado y no hay nada que hacer.
//   2. La ventana no se achica y la app dibuja por debajo del teclado. Es lo
//      que pasa con edge-to-edge, que viene prendido por defecto, y ahí la
//      barra de escribir queda atrás del teclado.
//
// KeyboardAvoidingView no cubre el caso 2: con `behavior` sin definir —lo
// único que acepta Android— renderiza un View pelado y no mueve nada.
//
// En vez de adivinar en cuál de los dos está el teléfono, se mide. El alto
// libre del contenedor es el más grande que se le vio (la app está fijada en
// vertical, así que no cambia por rotación); si con el teclado abierto mide
// menos, esa diferencia es lo que ya resolvió el sistema:
//
//   se achicó      → libre − actual ≈ alto del teclado → falta 0
//   no se achicó   → libre − actual = 0                → falta todo
//
// Las dos medidas se guardan en estado y la resta se hace al renderizar, así
// que da igual si el evento del teclado llega antes o después del layout.
//
// La cuenta depende de que Android esté en modo `resize` y no en `pan`: con
// `pan` la ventana se corre entera en vez de achicarse, el contenedor mediría
// igual y se levantaría de más. Por eso app.json fija
// android.softwareKeyboardLayoutMode en "resize" en vez de dejarlo implícito.
//
// iOS queda afuera a propósito: ahí la ventana nunca se achica, SafeAreaView
// ya reserva el borde de abajo y KeyboardAvoidingView funciona bien. Meter
// dos correcciones encima de la misma pantalla la levantaría de más.

import { useCallback, useEffect, useMemo, useState } from "react";
import { Keyboard, type LayoutChangeEvent, Platform } from "react-native";

/**
 * La cuenta de los dos casos, aparte para poder leerla sin el ruido de React.
 *
 *   teclado 300, libre 800, actual 500  → el sistema ya lo resolvió → 0
 *   teclado 300, libre 800, actual 800  → no se movió nada          → 300
 */
export function espacioQueFalta(altoTeclado: number, altoLibre: number, altoActual: number): number {
  const yaResuelto = Math.max(0, altoLibre - altoActual);
  return Math.max(0, altoTeclado - yaResuelto);
}

export interface EspacioTeclado {
  /** Padding de abajo que le falta al contenedor. 0 si el sistema ya lo hizo. */
  espacio: number;
  /** Va en el contenedor que se quiere medir, el que ocupa toda la pantalla. */
  onLayout: (evento: LayoutChangeEvent) => void;
  /** Si el teclado está abierto, para poder mandar el chat al final. */
  abierto: boolean;
}

export function useEspacioTeclado(): EspacioTeclado {
  const [altoTeclado, setAltoTeclado] = useState(0);
  const [altoLibre, setAltoLibre] = useState(0);
  const [altoActual, setAltoActual] = useState(0);

  useEffect(() => {
    if (Platform.OS !== "android") return;
    // Android solo emite los `did`: los `will` no existen ahí.
    const alAbrir = Keyboard.addListener("keyboardDidShow", (evento) => {
      // Se re-emite cuando cambia el alto con el teclado ya abierto, por
      // ejemplo al abrir los emojis, así que esto también lo sigue.
      setAltoTeclado(evento.endCoordinates.height);
    });
    const alCerrar = Keyboard.addListener("keyboardDidHide", () => setAltoTeclado(0));
    return () => {
      alAbrir.remove();
      alCerrar.remove();
    };
  }, []);

  const onLayout = useCallback((evento: LayoutChangeEvent) => {
    const alto = evento.nativeEvent.layout.height;
    setAltoActual(alto);
    setAltoLibre((previo) => (alto > previo ? alto : previo));
  }, []);

  return useMemo(
    () => ({
      espacio: espacioQueFalta(altoTeclado, altoLibre, altoActual),
      onLayout,
      abierto: altoTeclado > 0,
    }),
    [altoTeclado, altoLibre, altoActual, onLayout],
  );
}
