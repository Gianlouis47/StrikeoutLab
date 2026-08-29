import { compararRivales } from "@strikeoutlab/core";
import React, { useCallback, useMemo, useState } from "react";
import { FlatList, Pressable, Text, RefreshControl, View } from "react-native";
import {
  Barra,
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
import { equipoTeamKSchema } from "../lib/validators";

type Ventana = "TEMPORADA" | "ULTIMOS_14";

const ETIQUETA_VENTANA: Record<Ventana, string> = {
  TEMPORADA: "Temporada",
  ULTIMOS_14: "Últimos 14",
};

interface FilaTeamK {
  id: string;
  equipo: string;
  k: number;
  pa: number;
}

export default function RivalesScreen() {
  const [ventana, setVentana] = useState<Ventana>("TEMPORADA");
  const [ranking, setRanking] = useState<ReturnType<typeof compararRivales>>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [formAbierto, setFormAbierto] = useState(false);
  const [equipo, setEquipo] = useState("");
  const [k, setK] = useState("");
  const [pa, setPa] = useState("");
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async (v: Ventana) => {
    setCargando(true);
    setError(null);
    try {
      const filas = await repositorio.listar<FilaTeamK>("team_k", {
        seleccionar: "id, equipo, k, pa",
        filtro: { ventana: v },
      });
      setRanking(compararRivales(filas));
    } catch (e) {
      setError((e as Error).message);
    }
    setCargando(false);
  }, []);

  React.useEffect(() => {
    cargar(ventana);
  }, [ventana, cargar]);

  // El promedio da la referencia: sin él, un 24% no dice si es mucho o poco.
  const { promedio, maximo, minimo } = useMemo(() => {
    if (ranking.length === 0) return { promedio: 0, maximo: 0, minimo: 0 };
    const tasas = ranking.map((r) => r.kRate);
    const totalK = ranking.reduce((a, r) => a + r.k, 0);
    const totalPa = ranking.reduce((a, r) => a + r.pa, 0);
    return {
      promedio: totalPa > 0 ? totalK / totalPa : 0,
      maximo: Math.max(...tasas),
      minimo: Math.min(...tasas),
    };
  }, [ranking]);

  async function agregarEquipo() {
    const validacion = equipoTeamKSchema.safeParse({
      equipo: equipo.toUpperCase(),
      ventana,
      k: parseInt(k, 10),
      pa: parseInt(pa, 10),
      fechaCorte: new Date().toISOString().slice(0, 10),
    });
    if (!validacion.success) {
      setError(validacion.error.issues[0]?.message ?? "Datos inválidos.");
      return;
    }

    setGuardando(true);
    try {
      const datos = validacion.data;
      await repositorio.upsert(
        "team_k",
        { equipo: datos.equipo, ventana: datos.ventana, k: datos.k, pa: datos.pa, fecha_corte: datos.fechaCorte },
        "equipo,ventana,fecha_corte",
      );
    } catch (e) {
      setError((e as Error).message);
      setGuardando(false);
      return;
    }
    setGuardando(false);
    setEquipo("");
    setK("");
    setPa("");
    setFormAbierto(false);
    cargar(ventana);
  }

  return (
    <View style={estilos.pantalla}>
      <FlatList
        contentContainerStyle={estilos.contenido}
        refreshControl={
          <RefreshControl refreshing={cargando} onRefresh={() => cargar(ventana)} tintColor={colores.texto} />
        }
        ListHeaderComponent={
          <View style={{ gap: 14 }}>
            <View>
              <Titulo>Rivales</Titulo>
              <Subtitulo>Qué tanto se poncha cada equipo bateando. Arriba = mejor para jugar Over.</Subtitulo>
            </View>

            <View style={estilos.filaSelector}>
              {(["TEMPORADA", "ULTIMOS_14"] as const).map((v) => (
                <Pressable
                  key={v}
                  onPress={() => setVentana(v)}
                  style={[estilos.chip, ventana === v && estilos.chipActivo]}
                >
                  <Text style={[estilos.chipTexto, ventana === v && estilos.chipTextoActivo]}>
                    {ETIQUETA_VENTANA[v]}
                  </Text>
                </Pressable>
              ))}
            </View>

            {error && <Mensaje tipo="error" texto={error} />}

            {ranking.length > 0 && (
              <View style={{ flexDirection: "row", gap: 10 }}>
                <Metrica valor={`${(maximo * 100).toFixed(1)}%`} etiqueta="el que más se poncha" tono="exito" />
                <Metrica valor={`${(promedio * 100).toFixed(1)}%`} etiqueta="promedio de liga" />
                <Metrica valor={`${(minimo * 100).toFixed(1)}%`} etiqueta="el que menos" tono="peligro" />
              </View>
            )}

            {ranking.length > 0 && <Seccion titulo={`${ranking.length} equipos · ${ETIQUETA_VENTANA[ventana]}`} />}
          </View>
        }
        ListEmptyComponent={
          !cargando ? (
            <EstadoVacio
              titulo={`Sin datos de ${ETIQUETA_VENTANA[ventana]}`}
              descripcion="Los equipos se cargan solos desde MLB. Si esto sigue vacío, agregá uno a mano con el botón de abajo."
              tituloAccion="Agregar a mano"
              onAccion={() => setFormAbierto(true)}
            />
          ) : null
        }
        data={ranking}
        keyExtractor={(item, i) => `${item.equipo}-${i}`}
        renderItem={({ item, index }) => {
          const sobrePromedio = item.kRate > promedio;
          // La barra se escala contra el rango real de la liga, no contra 0-100%:
          // así se nota la diferencia entre equipos, que es de pocos puntos.
          const rango = maximo - minimo;
          const proporcion = rango > 0 ? (item.kRate - minimo) / rango : 0.5;
          return (
            <Tarjeta elevada={index < 3}>
              <View style={estilos.filaEntreEspacio}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <Text
                    style={{
                      color: index < 3 ? colores.acento : colores.textoSuave,
                      fontWeight: "700",
                      fontSize: 13,
                      width: 24,
                    }}
                  >
                    {index + 1}
                  </Text>
                  <Text style={{ color: colores.texto, fontWeight: "700", fontSize: 17 }}>{item.equipo}</Text>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={{ color: colores.texto, fontWeight: "700", fontSize: 17 }}>
                    {(item.kRate * 100).toFixed(1)}%
                  </Text>
                  <Text style={{ color: colores.textoSuave, fontSize: 11 }}>
                    {item.k} K / {item.pa} PA
                  </Text>
                </View>
              </View>

              <Barra proporcion={proporcion} tono={sobrePromedio ? "exito" : "peligro"} />

              <View style={estilos.filaEntreEspacio}>
                <Insignia
                  texto={sobrePromedio ? "favorece Over" : "favorece Under"}
                  tono={sobrePromedio ? "exito" : "peligro"}
                />
                <Text style={{ color: colores.textoSuave, fontSize: 11 }}>
                  {sobrePromedio ? "+" : ""}
                  {((item.kRate - promedio) * 100).toFixed(1)} pts vs promedio
                </Text>
              </View>
            </Tarjeta>
          );
        }}
        ListFooterComponent={
          <View style={{ marginTop: 8, gap: 10 }}>
            {!formAbierto ? (
              <Boton titulo="Corregir un equipo a mano" variante="secundario" onPress={() => setFormAbierto(true)} />
            ) : (
              <Tarjeta>
                <View style={estilos.filaEntreEspacio}>
                  <Text style={{ color: colores.texto, fontWeight: "700" }}>Corregir a mano</Text>
                  <Pressable onPress={() => setFormAbierto(false)} hitSlop={10}>
                    <Text style={{ color: colores.textoSuave, fontSize: 13 }}>Cerrar</Text>
                  </Pressable>
                </View>
                <Text style={{ color: colores.textoSuave, fontSize: 12 }}>
                  Solo hace falta si un dato quedó mal. Se guarda en la ventana {ETIQUETA_VENTANA[ventana]}.
                </Text>
                <Campo
                  etiqueta="Equipo"
                  value={equipo}
                  onChangeText={setEquipo}
                  autoCapitalize="characters"
                  placeholder="NYY"
                />
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <View style={{ flex: 1 }}>
                    <Campo etiqueta="K total" value={k} onChangeText={setK} keyboardType="number-pad" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Campo etiqueta="PA" value={pa} onChangeText={setPa} keyboardType="number-pad" />
                  </View>
                </View>
                <Boton titulo="Guardar" onPress={agregarEquipo} cargando={guardando} />
              </Tarjeta>
            )}
          </View>
        }
      />
    </View>
  );
}
