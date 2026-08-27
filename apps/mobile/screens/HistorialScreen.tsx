import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useMemo, useState } from "react";
import { FlatList, Pressable, RefreshControl, Text, View } from "react-native";
import {
  Boton,
  Campo,
  EstadoVacio,
  Insignia,
  Mensaje,
  Metrica,
  Seccion,
  Subtitulo,
  Tarjeta,
  Titulo,
  colores,
  estilos,
} from "../components/ui";
import { repositorio } from "../lib/supabase-repository";
import { resultadoPickSchema } from "../lib/validators";

interface FilaPick {
  id: string;
  fecha: string;
  pitcher: string;
  equipo: string;
  rival: string;
  linea: number;
  pick: "OVER" | "UNDER";
  confianza: number;
  nivel: string;
  fuente_confianza: "CALCULADA" | "JUICIO";
  resultado_k: number | null;
  resultado: "GANO" | "PERDIO" | "EMPATE" | null;
}

const TONO_RESULTADO: Record<string, "exito" | "peligro" | "advertencia"> = {
  GANO: "exito",
  PERDIO: "peligro",
  EMPATE: "advertencia",
};

const ICONO_RESULTADO: Record<string, keyof typeof Ionicons.glyphMap> = {
  GANO: "checkmark-circle",
  PERDIO: "close-circle",
  EMPATE: "remove-circle",
};

/** "2026-08-27" -> "27 ago" — la fecha completa no aporta en una lista. */
function fechaCorta(iso: string): string {
  const meses = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  const [, mes, dia] = iso.split("-");
  const m = meses[parseInt(mes, 10) - 1];
  return m ? `${parseInt(dia, 10)} ${m}` : iso;
}

export default function HistorialScreen() {
  const [picks, setPicks] = useState<FilaPick[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editando, setEditando] = useState<string | null>(null);
  const [kIngresado, setKIngresado] = useState("");
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const filas = await repositorio.listar<FilaPick>("picks", {
        seleccionar:
          "id, fecha, pitcher, equipo, rival, linea, pick, confianza, nivel, fuente_confianza, resultado_k, resultado",
        ordenarPor: "fecha",
        ascendente: false,
        limite: 100,
      });
      setPicks(filas);
    } catch (e) {
      setError((e as Error).message);
    }
    setCargando(false);
  }, []);

  React.useEffect(() => {
    cargar();
  }, [cargar]);

  const resumen = useMemo(() => {
    const resueltos = picks.filter((p) => p.resultado !== null);
    const ganadas = resueltos.filter((p) => p.resultado === "GANO").length;
    const perdidas = resueltos.filter((p) => p.resultado === "PERDIO").length;
    const pendientes = picks.length - resueltos.length;
    const decididas = ganadas + perdidas;
    return { ganadas, perdidas, pendientes, tasa: decididas > 0 ? ganadas / decididas : null };
  }, [picks]);

  async function guardarResultado(id: string) {
    const validacion = resultadoPickSchema.safeParse({ resultadoK: parseInt(kIngresado, 10) });
    if (!validacion.success) {
      setError(validacion.error.issues[0]?.message ?? "Ponches inválidos.");
      return;
    }
    setGuardando(true);
    try {
      await repositorio.actualizar("picks", id, { resultado_k: validacion.data.resultadoK });
    } catch (e) {
      setError((e as Error).message);
      setGuardando(false);
      return;
    }
    setGuardando(false);
    setEditando(null);
    setKIngresado("");
    cargar();
  }

  return (
    <View style={estilos.pantalla}>
      <FlatList
        contentContainerStyle={estilos.contenido}
        refreshControl={<RefreshControl refreshing={cargando} onRefresh={cargar} tintColor={colores.texto} />}
        ListHeaderComponent={
          <View style={{ gap: 14 }}>
            <View>
              <Titulo>Historial</Titulo>
              <Subtitulo>Tus picks. Tocá uno pendiente para anotar cuántos ponches sacó.</Subtitulo>
            </View>

            {error && <Mensaje tipo="error" texto={error} />}

            {picks.length > 0 && (
              <View style={{ flexDirection: "row", gap: 10 }}>
                <Metrica
                  valor={resumen.tasa !== null ? `${(resumen.tasa * 100).toFixed(0)}%` : "—"}
                  etiqueta="acierto"
                  tono={resumen.tasa !== null && resumen.tasa >= 0.55 ? "exito" : "neutral"}
                />
                <Metrica valor={`${resumen.ganadas}-${resumen.perdidas}`} etiqueta="ganadas-perdidas" />
                <Metrica
                  valor={String(resumen.pendientes)}
                  etiqueta="sin resultado"
                  tono={resumen.pendientes > 0 ? "acento" : "neutral"}
                />
              </View>
            )}

            {picks.length > 0 && <Seccion titulo="Todos los picks" />}
          </View>
        }
        ListEmptyComponent={
          !cargando ? (
            <EstadoVacio
              titulo="Todavía no hay picks"
              descripcion="Andá a Análisis, mandá la foto de un ticket y pedile que lo guarde."
            />
          ) : null
        }
        data={picks}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => {
          const pendiente = item.resultado_k === null;
          const abierto = editando === item.id;
          return (
            <Tarjeta elevada={abierto}>
              {/* Línea 1: lo que identifica el pick, y cómo salió. */}
              <View style={estilos.filaEntreEspacio}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={{ color: colores.texto, fontWeight: "700", fontSize: 16 }} numberOfLines={1}>
                    {item.pitcher}
                  </Text>
                  <Text style={{ color: colores.textoSuave, fontSize: 12 }}>
                    {fechaCorta(item.fecha)} · {item.equipo} vs {item.rival}
                  </Text>
                </View>

                {item.resultado ? (
                  <View style={{ alignItems: "flex-end", gap: 3 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                      <Ionicons
                        name={ICONO_RESULTADO[item.resultado]}
                        size={17}
                        color={
                          item.resultado === "GANO"
                            ? colores.exito
                            : item.resultado === "PERDIO"
                              ? colores.peligro
                              : colores.advertencia
                        }
                      />
                      <Text
                        style={{
                          color:
                            item.resultado === "GANO"
                              ? colores.exito
                              : item.resultado === "PERDIO"
                                ? colores.peligro
                                : colores.advertencia,
                          fontWeight: "700",
                          fontSize: 13,
                        }}
                      >
                        {item.resultado}
                      </Text>
                    </View>
                    <Text style={{ color: colores.textoSuave, fontSize: 11 }}>{item.resultado_k} K reales</Text>
                  </View>
                ) : (
                  <Insignia texto="pendiente" tono="acento" />
                )}
              </View>

              {/* Línea 2: la apuesta en sí, destacada. */}
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8,
                  backgroundColor: colores.fondo,
                  borderRadius: 10,
                  paddingVertical: 8,
                  paddingHorizontal: 12,
                  marginTop: 2,
                }}
              >
                <Text
                  style={{
                    color: item.pick === "OVER" ? colores.exito : colores.advertencia,
                    fontWeight: "800",
                    fontSize: 14,
                  }}
                >
                  {item.pick}
                </Text>
                <Text style={{ color: colores.texto, fontWeight: "700", fontSize: 15 }}>{item.linea}</Text>
                <View style={{ flex: 1 }} />
                <Text style={{ color: colores.textoSuave, fontSize: 12 }}>
                  {(item.confianza * 100).toFixed(0)}% conf.
                </Text>
              </View>

              <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap", marginTop: 2 }}>
                <Insignia texto={item.nivel.replace("_", " ")} tono="acento" />
                <Insignia texto={item.fuente_confianza} tono="neutral" />
              </View>

              {pendiente &&
                (abierto ? (
                  <View style={{ gap: 8, marginTop: 6 }}>
                    <Campo
                      etiqueta="¿Cuántos ponches sacó?"
                      value={kIngresado}
                      onChangeText={setKIngresado}
                      keyboardType="number-pad"
                      autoFocus
                      placeholder="0"
                    />
                    <View style={{ flexDirection: "row", gap: 8 }}>
                      <View style={{ flex: 1 }}>
                        <Boton titulo="Guardar" onPress={() => guardarResultado(item.id)} cargando={guardando} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Boton
                          titulo="Cancelar"
                          variante="secundario"
                          onPress={() => {
                            setEditando(null);
                            setKIngresado("");
                          }}
                        />
                      </View>
                    </View>
                  </View>
                ) : (
                  // Acción liviana: un botón sólido por tarjeta hacía que la
                  // lista pareciera un formulario en vez de un historial.
                  <Pressable
                    onPress={() => {
                      setEditando(item.id);
                      setKIngresado("");
                    }}
                    style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 }}
                    hitSlop={8}
                  >
                    <Ionicons name="add-circle-outline" size={17} color={colores.acento} />
                    <Text style={{ color: colores.acento, fontSize: 13, fontWeight: "600" }}>
                      Anotar resultado
                    </Text>
                  </Pressable>
                ))}
            </Tarjeta>
          );
        }}
      />
    </View>
  );
}
