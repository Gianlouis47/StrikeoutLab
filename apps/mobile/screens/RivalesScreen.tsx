import { compararRivales } from "@strikeoutlab/core";
import React, { useCallback, useState } from "react";
import { FlatList, RefreshControl, Text, View } from "react-native";
import { Boton, Campo, Mensaje, Subtitulo, Tarjeta, Titulo, colores, estilos } from "../components/ui";
import { supabase } from "../lib/supabase";

type Ventana = "TEMPORADA" | "ULTIMOS_14";

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
    const { data, error } = await supabase.from("team_k").select("equipo, k, pa").eq("ventana", v);
    if (error) {
      setError(error.message);
      setCargando(false);
      return;
    }
    setRanking(compararRivales(data ?? []));
    setCargando(false);
  }, []);

  React.useEffect(() => {
    cargar(ventana);
  }, [ventana, cargar]);

  async function agregarEquipo() {
    const kNum = parseInt(k, 10);
    const paNum = parseInt(pa, 10);
    if (!equipo || Number.isNaN(kNum) || Number.isNaN(paNum) || paNum <= 0) {
      setError("Completa equipo, K y PA (PA > 0).");
      return;
    }
    setGuardando(true);
    const { error } = await supabase.from("team_k").upsert(
      {
        equipo: equipo.toUpperCase(),
        ventana,
        k: kNum,
        pa: paNum,
        fecha_corte: new Date().toISOString().slice(0, 10),
      },
      { onConflict: "equipo,ventana,fecha_corte" },
    );
    setGuardando(false);
    if (error) {
      setError(error.message);
      return;
    }
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
