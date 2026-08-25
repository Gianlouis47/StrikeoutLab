import React, { useCallback, useState } from "react";
import { FlatList, RefreshControl, Text, View } from "react-native";
import { Boton, Campo, EstadoVacio, Mensaje, Subtitulo, Tarjeta, Titulo, colores, estilos } from "../components/ui";
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

const colorResultado: Record<string, string> = {
  GANO: colores.exito,
  PERDIO: colores.peligro,
  EMPATE: colores.advertencia,
};

export default function HistorialScreen() {
  const [picks, setPicks] = useState<FilaPick[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editando, setEditando] = useState<string | null>(null);
  const [kIngresado, setKIngresado] = useState("");

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const filas = await repositorio.listar<FilaPick>("picks", {
        seleccionar: "id, fecha, pitcher, equipo, rival, linea, pick, confianza, nivel, fuente_confianza, resultado_k, resultado",
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

  async function guardarResultado(id: string) {
    const validacion = resultadoPickSchema.safeParse({ resultadoK: parseInt(kIngresado, 10) });
    if (!validacion.success) {
      setError(validacion.error.issues[0]?.message ?? "Ponches inválidos.");
      return;
    }
    try {
      await repositorio.actualizar("picks", id, { resultado_k: validacion.data.resultadoK });
    } catch (e) {
      setError((e as Error).message);
      return;
    }
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
          <View style={{ gap: 8 }}>
            <Titulo>Historial</Titulo>
            <Subtitulo>Toca un pick pendiente para registrar el resultado real</Subtitulo>
            {error && <Mensaje tipo="error" texto={error} />}
          </View>
        }
        ListEmptyComponent={
          !cargando ? (
            <EstadoVacio
              titulo="Todavía no registraste ningún pick"
              descripcion="Andá a Nuevo Pick para agregar el primero."
            />
          ) : null
        }
        data={picks}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <Tarjeta>
            <View style={estilos.filaEntreEspacio}>
              <Text style={{ color: colores.texto, fontWeight: "700" }}>
                {item.pitcher} — {item.pick} {item.linea}
              </Text>
              {item.resultado && (
                <Text style={{ color: colorResultado[item.resultado], fontWeight: "700" }}>
                  {item.resultado}
                </Text>
              )}
            </View>
            <Text style={{ color: colores.textoSuave }}>
              {item.fecha} · {item.equipo} vs {item.rival} · {item.nivel} · {item.fuente_confianza} ·{" "}
              {(item.confianza * 100).toFixed(0)}%
            </Text>

            {item.resultado_k === null &&
              (editando === item.id ? (
                <View style={{ gap: 8 }}>
                  <Campo
                    etiqueta="Ponches reales (K)"
                    value={kIngresado}
                    onChangeText={setKIngresado}
                    keyboardType="number-pad"
                  />
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    <View style={{ flex: 1 }}>
                      <Boton titulo="Guardar" onPress={() => guardarResultado(item.id)} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Boton titulo="Cancelar" variante="secundario" onPress={() => setEditando(null)} />
                    </View>
                  </View>
                </View>
              ) : (
                <Boton
                  titulo="Registrar resultado"
                  variante="secundario"
                  onPress={() => {
                    setEditando(item.id);
                    setKIngresado("");
                  }}
                />
              ))}
          </Tarjeta>
        )}
      />
    </View>
  );
}
