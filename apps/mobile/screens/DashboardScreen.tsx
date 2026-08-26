import { reporteCalibracion, resumenEconomico, type PickCalibracion, type PickEconomico } from "@strikeoutlab/core";
import React, { useCallback, useState } from "react";
import { FlatList, RefreshControl, Text, View } from "react-native";
import { EstadoVacio, Insignia, Mensaje, Subtitulo, Tarjeta, Titulo, colores, estilos } from "../components/ui";
import { repositorio } from "../lib/supabase-repository";

interface FilaPickDb {
  id: string;
  confianza: number;
  resultado: "GANO" | "PERDIO" | "EMPATE" | null;
  fuente_confianza: "CALCULADA" | "JUICIO";
  nivel: "DIAMANTE_ALTO" | "DIAMANTE" | "ORO_ALTO" | "ORO" | "IMPUREZA";
  ticket_id: string | null;
  stake: number | null;
  payout: number | null;
}

export default function DashboardScreen() {
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [bandas, setBandas] = useState<ReturnType<typeof reporteCalibracion>>([]);
  const [economico, setEconomico] = useState<ReturnType<typeof resumenEconomico> | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);

    let filas: FilaPickDb[];
    try {
      filas = await repositorio.listar<FilaPickDb>("picks", {
        seleccionar: "id, confianza, resultado, fuente_confianza, nivel, ticket_id, stake, payout",
      });
    } catch (e) {
      setError((e as Error).message);
      setCargando(false);
      return;
    }

    const picksCalibracion: PickCalibracion[] = filas.map((f) => ({
      confianza: f.confianza,
      resultado: f.resultado,
      fuenteConfianza: f.fuente_confianza,
    }));
    const picksEconomico: PickEconomico[] = filas.map((f) => ({
      resultado: f.resultado,
      nivel: f.nivel,
      ticketId: f.ticket_id,
      stake: f.stake,
      payout: f.payout,
    }));

    setBandas(reporteCalibracion(picksCalibracion).filter((b) => b.fuenteConfianza === "TODAS"));
    setEconomico(resumenEconomico(picksEconomico));
    setCargando(false);
  }, []);

  React.useEffect(() => {
    cargar();
  }, [cargar]);

  return (
    <View style={estilos.pantalla}>
      <FlatList
        contentContainerStyle={estilos.contenido}
        refreshControl={<RefreshControl refreshing={cargando} onRefresh={cargar} tintColor={colores.texto} />}
        ListHeaderComponent={
          <View style={{ gap: 16 }}>
            <View>
              <Titulo>Calibración</Titulo>
              <Subtitulo>Confianza declarada vs. tasa real de acierto, por banda</Subtitulo>
            </View>
            {error && <Mensaje tipo="error" texto={error} />}
            {!error && bandas.length === 0 && !cargando && (
              <EstadoVacio
                titulo="Todavía no hay nada que calibrar"
                descripcion="Registrá picks en Nuevo Pick y anotá sus resultados en Historial — apenas haya suficientes, este panel te muestra si tus confianzas se sostienen."
              />
            )}
          </View>
        }
        data={bandas}
        keyExtractor={(item) => item.banda}
        renderItem={({ item }) => (
          <Tarjeta elevada={!item.muestraInsuficiente && item.diferencia !== null}>
            <View style={estilos.filaEntreEspacio}>
              <Text style={{ color: colores.texto, fontWeight: "700", fontSize: 16 }}>{item.banda}</Text>
              {item.muestraInsuficiente && <Insignia texto="muestra insuficiente" tono="advertencia" />}
            </View>
            <Text style={{ color: colores.textoSuave }}>
              {item.cantidad} picks · confianza promedio {(item.confianzaPromedio * 100).toFixed(1)}%
            </Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <Text style={{ color: colores.texto }}>
                Tasa real: {item.tasaReal !== null ? `${(item.tasaReal * 100).toFixed(1)}%` : "sin decisiones"}
              </Text>
              {item.diferencia !== null && (
                <Insignia
                  texto={`${item.diferencia > 0 ? "sobreconfiado" : "subconfiado"} ${(Math.abs(item.diferencia) * 100).toFixed(1)} pts`}
                  tono={item.diferencia > 0.05 ? "peligro" : "exito"}
                />
              )}
            </View>
          </Tarjeta>
        )}
        ListFooterComponent={
          economico && (
            <Tarjeta style={{ marginTop: 16 }}>
              <Text style={{ color: colores.texto, fontWeight: "700" }}>Resumen económico</Text>
              <Text style={{ color: colores.textoSuave }}>
                {economico.totalPicksResueltos} picks resueltos
              </Text>
              {economico.totalApostado !== null ? (
                <>
                  <Text style={{ color: colores.texto }}>Apostado: {economico.totalApostado.toFixed(2)}</Text>
                  <Text style={{ color: colores.texto }}>Cobrado: {economico.totalCobrado!.toFixed(2)}</Text>
                  <Text style={{ color: economico.neto! >= 0 ? colores.exito : colores.peligro }}>
                    Neto: {economico.neto!.toFixed(2)}
                  </Text>
                </>
              ) : (
                <Mensaje tipo="info" texto={economico.advertencia ?? "Sin datos de stake/payout"} />
              )}
              <View style={{ gap: 6, marginTop: 4 }}>
                {Object.entries(economico.porNivel).map(([nivel, datos]) => (
                  <View key={nivel} style={estilos.filaEntreEspacio}>
                    <Insignia texto={nivel} tono="acento" />
                    <Text style={{ color: colores.textoSuave, fontSize: 12 }}>
                      {datos.cantidad} · {datos.ganadas}G / {datos.perdidas}P / {datos.empates}E
                    </Text>
                  </View>
                ))}
              </View>
            </Tarjeta>
          )
        }
      />
    </View>
  );
}
