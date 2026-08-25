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

export const colores = {
  fondo: "#0b1220",
  tarjeta: "#141b2d",
  borde: "#25304a",
  texto: "#e8ecf4",
  textoSuave: "#93a1c1",
  acento: "#4f8cff",
  exito: "#3ecf8e",
  peligro: "#ff6b6b",
  advertencia: "#f5b342",
};

export function Titulo({ children }: { children: React.ReactNode }) {
  return <Text style={estilos.titulo}>{children}</Text>;
}

export function Subtitulo({ children }: { children: React.ReactNode }) {
  return <Text style={estilos.subtitulo}>{children}</Text>;
}

export function Tarjeta({ children, style }: { children: React.ReactNode; style?: object }) {
  return <View style={[estilos.tarjeta, style]}>{children}</View>;
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
  const estiloVariante =
    variante === "primario"
      ? estilos.botonPrimario
      : variante === "peligro"
        ? estilos.botonPeligro
        : estilos.botonSecundario;
  const deshabilitadoEfectivo = cargando || deshabilitado;

  return (
    <Pressable
      onPress={onPress}
      disabled={deshabilitadoEfectivo}
      accessibilityRole="button"
      accessibilityLabel={etiquetaAccesible ?? titulo}
      accessibilityState={{ disabled: deshabilitadoEfectivo, busy: cargando }}
      style={({ pressed }) => [
        estilos.boton,
        estiloVariante,
        deshabilitadoEfectivo && estilos.botonDeshabilitado,
        pressed && !deshabilitadoEfectivo && estilos.botonPresionado,
      ]}
    >
      {cargando ? (
        <ActivityIndicator color={colores.texto} />
      ) : (
        <Text style={estilos.botonTexto}>{titulo}</Text>
      )}
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

export function Mensaje({ tipo, texto }: { tipo: "error" | "info" | "exito"; texto: string }) {
  const color = tipo === "error" ? colores.peligro : tipo === "exito" ? colores.exito : colores.advertencia;
  return (
    <View style={[estilos.mensaje, { borderColor: color }]}>
      <Text style={{ color }}>{texto}</Text>
    </View>
  );
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
  titulo: {
    color: colores.texto,
    fontSize: 22,
    fontWeight: "700",
  },
  subtitulo: {
    color: colores.textoSuave,
    fontSize: 14,
    marginTop: -8,
  },
  tarjeta: {
    backgroundColor: colores.tarjeta,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colores.borde,
    padding: 14,
    gap: 8,
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
    backgroundColor: "#0f1626",
    borderWidth: 1,
    borderColor: colores.borde,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colores.texto,
    fontSize: 15,
  },
  boton: {
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44, // área táctil mínima recomendada
  },
  botonPrimario: { backgroundColor: colores.acento },
  botonSecundario: { backgroundColor: "#232d47" },
  botonPeligro: { backgroundColor: colores.peligro },
  botonDeshabilitado: { opacity: 0.5 },
  botonPresionado: { opacity: 0.85 },
  botonTexto: { color: "#fff", fontWeight: "600", fontSize: 15 },
  filaSelector: { flexDirection: "row", gap: 8 },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colores.borde,
  },
  chipActivo: { backgroundColor: colores.acento, borderColor: colores.acento },
  chipTexto: { color: colores.textoSuave, fontWeight: "600" },
  chipTextoActivo: { color: "#fff" },
  mensaje: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
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
});
