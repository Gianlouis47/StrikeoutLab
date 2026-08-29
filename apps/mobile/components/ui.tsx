import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
} from "react-native";

// Paleta con escala de superficie (fondo -> tarjeta -> tarjetaElevada) en vez
// de blanco/negro invertido — la profundidad se comunica con superficies más
// claras, no con sombras pesadas (estándar 2026 de dashboards oscuros).
export const colores = {
  fondo: "#0b0e13",
  tarjeta: "#12151c",
  tarjetaElevada: "#181d27",
  borde: "#242a38",
  texto: "#eef1f6",
  textoSuave: "#8b93a7",
  acento: "#4f8cff",
  acentoSecundario: "#8b5cf6",
  exito: "#34d399",
  peligro: "#f87171",
  advertencia: "#fbbf24",
};

export const degradadoAcento = [colores.acento, colores.acentoSecundario] as const;

export function Titulo({ children }: { children: React.ReactNode }) {
  return (
    <View style={estilos.tituloFila}>
      <LinearGradient colors={degradadoAcento} style={estilos.tituloBarra} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} />
      <Text style={estilos.titulo}>{children}</Text>
    </View>
  );
}

export function Subtitulo({ children }: { children: React.ReactNode }) {
  return <Text style={estilos.subtitulo}>{children}</Text>;
}

export function Tarjeta({
  children,
  style,
  elevada = false,
}: {
  children: React.ReactNode;
  style?: object;
  /** Superficie más clara, para destacar la tarjeta más importante de la pantalla. */
  elevada?: boolean;
}) {
  return <View style={[estilos.tarjeta, elevada && estilos.tarjetaElevada, style]}>{children}</View>;
}

export function Campo(props: TextInputProps & { etiqueta: string }) {
  const { etiqueta, style, ...resto } = props;
  return (
    <View style={estilos.campoContenedor}>
      <Text style={estilos.etiqueta}>{etiqueta}</Text>
      <TextInput
        placeholderTextColor={colores.textoSuave}
        style={[estilos.input, style]}
        {...resto}
      />
    </View>
  );
}

export function Boton({
  titulo,
  onPress,
  variante = "primario",
  cargando = false,
  deshabilitado = false,
  etiquetaAccesible,
}: {
  titulo: string;
  onPress: () => void;
  variante?: "primario" | "secundario" | "peligro";
  cargando?: boolean;
  deshabilitado?: boolean;
  /** Etiqueta accesible cuando `titulo` no basta por sí solo. Por defecto usa `titulo`. */
  etiquetaAccesible?: string;
}) {
  const deshabilitadoEfectivo = cargando || deshabilitado;
  const contenido = cargando ? (
    <ActivityIndicator color={colores.texto} />
  ) : (
    <Text style={estilos.botonTexto}>{titulo}</Text>
  );

  if (variante === "primario") {
    return (
      <Pressable
        onPress={onPress}
        disabled={deshabilitadoEfectivo}
        accessibilityRole="button"
        accessibilityLabel={etiquetaAccesible ?? titulo}
        accessibilityState={{ disabled: deshabilitadoEfectivo, busy: cargando }}
        style={({ pressed }) => [deshabilitadoEfectivo && estilos.botonDeshabilitado, pressed && estilos.botonPresionado]}
      >
        <LinearGradient colors={degradadoAcento} style={estilos.boton} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
          {contenido}
        </LinearGradient>
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      disabled={deshabilitadoEfectivo}
      accessibilityRole="button"
      accessibilityLabel={etiquetaAccesible ?? titulo}
      accessibilityState={{ disabled: deshabilitadoEfectivo, busy: cargando }}
      style={({ pressed }) => [
        estilos.boton,
        variante === "peligro" ? estilos.botonPeligro : estilos.botonSecundario,
        deshabilitadoEfectivo && estilos.botonDeshabilitado,
        pressed && !deshabilitadoEfectivo && estilos.botonPresionado,
      ]}
    >
      {contenido}
    </Pressable>
  );
}

/** Estado vacío reutilizable: listas sin datos, primer uso. Nunca una
 * pantalla en blanco — siempre se indica el siguiente paso. Patrón de
 * app-movil-base/_core/components/EstadoVacio.tsx. */
export function EstadoVacio({
  titulo,
  descripcion,
  tituloAccion,
  onAccion,
}: {
  titulo: string;
  descripcion?: string;
  tituloAccion?: string;
  onAccion?: () => void;
}) {
  return (
    <View style={estilos.estadoVacioContenedor}>
      <Text style={estilos.estadoVacioTitulo}>{titulo}</Text>
      {!!descripcion && <Text style={estilos.estadoVacioDescripcion}>{descripcion}</Text>}
      {!!tituloAccion && !!onAccion && (
        <View style={{ marginTop: 16, minWidth: 180 }}>
          <Boton titulo={tituloAccion} onPress={onAccion} />
        </View>
      )}
    </View>
  );
}

export function SelectorPick({
  valor,
  onCambiar,
}: {
  valor: "OVER" | "UNDER";
  onCambiar: (v: "OVER" | "UNDER") => void;
}) {
  return (
    <View style={estilos.filaSelector}>
      {(["OVER", "UNDER"] as const).map((opcion) => (
        <Pressable
          key={opcion}
          onPress={() => onCambiar(opcion)}
          style={[estilos.chip, valor === opcion && estilos.chipActivo]}
        >
          <Text style={[estilos.chipTexto, valor === opcion && estilos.chipTextoActivo]}>{opcion}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const ICONO_MENSAJE = {
  error: "close-circle" as const,
  exito: "checkmark-circle" as const,
  info: "information-circle" as const,
};

export function Mensaje({ tipo, texto }: { tipo: "error" | "info" | "exito"; texto: string }) {
  const color = tipo === "error" ? colores.peligro : tipo === "exito" ? colores.exito : colores.advertencia;
  return (
    <View style={[estilos.mensaje, { backgroundColor: color + "1a", borderColor: color + "40" }]}>
      <Ionicons name={ICONO_MENSAJE[tipo]} size={18} color={color} />
      <Text style={[estilos.mensajeTexto, { color }]}>{texto}</Text>
    </View>
  );
}

/** Insignia/pill para etiquetas cortas: nivel de pureza, fuente_confianza,
 * advertencias de calibración inline (ej. "sobreconfiado 12 pts"). */
export function Insignia({
  texto,
  tono = "neutral",
}: {
  texto: string;
  tono?: "neutral" | "exito" | "peligro" | "advertencia" | "acento";
}) {
  const color =
    tono === "exito"
      ? colores.exito
      : tono === "peligro"
        ? colores.peligro
        : tono === "advertencia"
          ? colores.advertencia
          : tono === "acento"
            ? colores.acento
            : colores.textoSuave;
  return (
    <View style={[estilos.insignia, { backgroundColor: color + "1f", borderColor: color + "45" }]}>
      <Text style={[estilos.insigniaTexto, { color }]}>{texto}</Text>
    </View>
  );
}

/**
 * Número grande con su etiqueta. Para el dato que importa de una pantalla:
 * se lee de un vistazo sin tener que buscarlo entre párrafos.
 */
export function Metrica({
  valor,
  etiqueta,
  tono = "neutral",
  ancho,
}: {
  valor: string;
  etiqueta: string;
  tono?: "neutral" | "exito" | "peligro" | "acento";
  /** Por defecto ocupa el espacio disponible en su fila. */
  ancho?: number;
}) {
  const color =
    tono === "exito"
      ? colores.exito
      : tono === "peligro"
        ? colores.peligro
        : tono === "acento"
          ? colores.acento
          : colores.texto;
  return (
    <View style={[estilos.metrica, ancho ? { width: ancho } : { flex: 1 }]}>
      <Text style={[estilos.metricaValor, { color }]} numberOfLines={1} adjustsFontSizeToFit>
        {valor}
      </Text>
      <Text style={estilos.metricaEtiqueta}>{etiqueta}</Text>
    </View>
  );
}

/**
 * Barra horizontal para comparar valores de un vistazo. Una lista de
 * números en texto plano obliga a leerlos todos; con barra se ve enseguida
 * quién está arriba y quién abajo.
 */
export function Barra({
  proporcion,
  tono = "acento",
  alto = 6,
}: {
  /** 0 a 1. Se recorta si viene fuera de rango. */
  proporcion: number;
  tono?: "acento" | "exito" | "peligro" | "advertencia";
  alto?: number;
}) {
  const color =
    tono === "exito"
      ? colores.exito
      : tono === "peligro"
        ? colores.peligro
        : tono === "advertencia"
          ? colores.advertencia
          : colores.acento;
  const ancho = `${Math.max(0, Math.min(1, proporcion)) * 100}%` as const;
  return (
    <View style={[estilos.barraFondo, { height: alto, borderRadius: alto / 2 }]}>
      <View style={{ width: ancho, height: "100%", backgroundColor: color, borderRadius: alto / 2 }} />
    </View>
  );
}

/** Etiqueta a la izquierda, valor a la derecha. Para listas de datos. */
export function FilaDato({
  etiqueta,
  valor,
  tono = "neutral",
}: {
  etiqueta: string;
  valor: string;
  tono?: "neutral" | "exito" | "peligro";
}) {
  const color =
    tono === "exito" ? colores.exito : tono === "peligro" ? colores.peligro : colores.texto;
  return (
    <View style={estilos.filaEntreEspacio}>
      <Text style={estilos.filaDatoEtiqueta}>{etiqueta}</Text>
      <Text style={[estilos.filaDatoValor, { color }]}>{valor}</Text>
    </View>
  );
}

/** Separador con título, para agrupar secciones dentro de una lista larga. */
export function Seccion({ titulo }: { titulo: string }) {
  return <Text style={estilos.seccion}>{titulo}</Text>;
}

export const estilos = StyleSheet.create({
  pantalla: {
    flex: 1,
    backgroundColor: colores.fondo,
  },
  contenido: {
    padding: 16,
    gap: 16,
  },
  tituloFila: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  tituloBarra: {
    width: 4,
    height: 22,
    borderRadius: 2,
  },
  titulo: {
    color: colores.texto,
    fontSize: 23,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  subtitulo: {
    color: colores.textoSuave,
    fontSize: 14,
  },
  tarjeta: {
    backgroundColor: colores.tarjeta,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colores.borde,
    padding: 16,
    gap: 8,
  },
  tarjetaElevada: {
    backgroundColor: colores.tarjetaElevada,
    borderColor: colores.acento + "55",
  },
  campoContenedor: {
    gap: 4,
  },
  etiqueta: {
    color: colores.textoSuave,
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: "#0f131c",
    borderWidth: 1,
    borderColor: colores.borde,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    color: colores.texto,
    fontSize: 15,
  },
  boton: {
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 46, // área táctil mínima recomendada
  },
  botonSecundario: { backgroundColor: colores.tarjetaElevada, borderWidth: 1, borderColor: colores.borde },
  botonPeligro: { backgroundColor: colores.peligro },
  botonDeshabilitado: { opacity: 0.5 },
  botonPresionado: { opacity: 0.85 },
  botonTexto: { color: "#fff", fontWeight: "700", fontSize: 15 },
  filaSelector: { flexDirection: "row", gap: 8 },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colores.borde,
    backgroundColor: colores.tarjeta,
  },
  chipActivo: { backgroundColor: colores.acento, borderColor: colores.acento },
  chipTexto: { color: colores.textoSuave, fontWeight: "600" },
  chipTextoActivo: { color: "#fff" },
  mensaje: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
  },
  mensajeTexto: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },
  insignia: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderRadius: 999,
    paddingVertical: 3,
    paddingHorizontal: 10,
  },
  insigniaTexto: {
    fontSize: 11,
    fontWeight: "700",
  },
  filaEntreEspacio: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  estadoVacioContenedor: {
    alignItems: "center",
    paddingVertical: 40,
    paddingHorizontal: 24,
  },
  estadoVacioTitulo: {
    fontSize: 15,
    fontWeight: "700",
    color: colores.texto,
    textAlign: "center",
  },
  estadoVacioDescripcion: {
    fontSize: 13,
    color: colores.textoSuave,
    textAlign: "center",
    marginTop: 6,
  },
  metrica: {
    backgroundColor: colores.tarjeta,
    borderWidth: 1,
    borderColor: colores.borde,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 12,
    alignItems: "center",
    gap: 2,
  },
  metricaValor: {
    fontSize: 24,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  metricaEtiqueta: {
    color: colores.textoSuave,
    fontSize: 11,
    textAlign: "center",
  },
  barraFondo: {
    width: "100%",
    backgroundColor: colores.borde,
    overflow: "hidden",
  },
  filaDatoEtiqueta: {
    color: colores.textoSuave,
    fontSize: 13,
  },
  filaDatoValor: {
    fontSize: 14,
    fontWeight: "600",
  },
  seccion: {
    color: colores.textoSuave,
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginTop: 4,
  },
});
