import { reporteCalibracion, resumenEconomico, type PickCalibracion, type PickEconomico } from "@strikeoutlab/core";
import React, { useCallback, useState } from "react";
import { FlatList, RefreshControl, Text, View } from "react-native";
import { EstadoVacio, Mensaje, Subtitulo, Tarjeta, Titulo, colores, estilos } from "../components/ui";
import { repositorio } from "../lib/supabase-repository";

interface FilaPickDb {
  id: string;
  confianza: number;
  resultado: "GANO" | "PERDIO" | "EMPATE" | null;
  fuente_confianza: "CALCULADA" | "JUICIO";
  nivel: "DIAMANTE" | "ORO_ALTO" | "ORO" | "IMPUREZA";
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
          <Tarjeta>
            <View style={estilos.filaEntreEspacio}>
              <Text style={{ color: colores.texto, fontWeight: "700" }}>{item.banda}</Text>
              {item.muestraInsuficiente && (
                <Text style={{ color: colores.advertencia, fontSize: 12 }}>muestra insuficiente</Text>
              )}
            </View>
            <Text style={{ color: colores.textoSuave }}>
              {item.cantidad} picks · confianza promedio {(item.confianzaPromedio * 100).toFixed(1)}%
            </Text>
            <Text style={{ color: colores.texto }}>
              Tasa real:{" "}
              {item.tasaReal !== null ? `${(item.tasaReal * 100).toFixed(1)}%` : "sin decisiones"}
              {item.diferencia !== null && (
                <Text style={{ color: item.diferencia > 0.05 ? colores.peligro : colores.exito }}>
                  {"  "}({item.diferencia > 0 ? "sobreconfiado" : "subconfiado"}{" "}
                  {(Math.abs(item.diferencia) * 100).toFixed(1)} pts)
                </Text>
              )}
            </Text>
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
              {Object.entries(economico.porNivel).map(([nivel, datos]) => (
                <Text key={nivel} style={{ color: colores.textoSuave }}>
                  {nivel}: {datos.cantidad} ({datos.ganadas}G / {datos.perdidas}P / {datos.empates}E)
                </Text>
              ))}
            </Tarjeta>
          )
        }
      />
    </View>
  );
}
