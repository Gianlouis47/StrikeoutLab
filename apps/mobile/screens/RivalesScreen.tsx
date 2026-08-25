import { compararRivales } from "@strikeoutlab/core";
import React, { useCallback, useState } from "react";
import { FlatList, RefreshControl, Text, View } from "react-native";
import { Boton, Campo, EstadoVacio, Mensaje, Subtitulo, Tarjeta, Titulo, colores, estilos } from "../components/ui";
import { repositorio } from "../lib/supabase-repository";
import { equipoTeamKSchema } from "../lib/validators";

type Ventana = "TEMPORADA" | "ULTIMOS_14";

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
    cargar(ventana);
  }

  return (
    <View style={estilos.pantalla}>
      <FlatList
        contentContainerStyle={estilos.contenido}
        refreshControl={<RefreshControl refreshing={cargando} onRefresh={() => cargar(ventana)} tintColor={colores.texto} />}
        ListHeaderComponent={
          <View style={{ gap: 12 }}>
            <View>
              <Titulo>Rivales</Titulo>
              <Subtitulo>Ordenado por tasa de ponches (k_rate), nunca por K total</Subtitulo>
            </View>
            <View style={estilos.filaSelector}>
              {(["TEMPORADA", "ULTIMOS_14"] as const).map((v) => (
                <Boton key={v} titulo={v} variante={ventana === v ? "primario" : "secundario"} onPress={() => setVentana(v)} />
              ))}
            </View>
            <Tarjeta>
              <Text style={{ color: colores.texto, fontWeight: "700" }}>Agregar / actualizar equipo</Text>
              <Campo etiqueta="Equipo" value={equipo} onChangeText={setEquipo} autoCapitalize="characters" placeholder="NYY" />
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
            {error && <Mensaje tipo="error" texto={error} />}
          </View>
        }
        ListEmptyComponent={
          !cargando ? (
            <EstadoVacio
              titulo="Sin equipos en esta ventana"
              descripcion="Agregá uno arriba (equipo, K total y PA) para empezar el ranking."
            />
          ) : null
        }
        data={ranking}
        keyExtractor={(item, i) => `${item.equipo}-${i}`}
        renderItem={({ item, index }) => (
          <Tarjeta>
            <View style={estilos.filaEntreEspacio}>
              <Text style={{ color: colores.texto, fontWeight: "700" }}>
                #{index + 1} {item.equipo}
              </Text>
              <Text style={{ color: colores.texto }}>{(item.kRate * 100).toFixed(2)}%</Text>
            </View>
            <Text style={{ color: colores.textoSuave }}>
              {item.k} K / {item.pa} PA
            </Text>
          </Tarjeta>
        )}
      />
    </View>
  );
}
