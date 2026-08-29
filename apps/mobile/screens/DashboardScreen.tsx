import { reporteCalibracion, resumenEconomico, type PickCalibracion, type PickEconomico } from "@strikeoutlab/core";
import React, { useCallback, useState } from "react";
import { FlatList, RefreshControl, Text, View } from "react-native";
import {
  Barra,
  EstadoVacio,
  FilaDato,
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

  // Números de cabecera: lo primero que se quiere saber al abrir la pantalla.
  const totales = bandas.reduce(
    (acc, b) => ({
      ganadas: acc.ganadas + b.ganadas,
      perdidas: acc.perdidas + b.perdidas,
      empates: acc.empates + b.empates,
    }),
    { ganadas: 0, perdidas: 0, empates: 0 },
  );
  const decididas = totales.ganadas + totales.perdidas;
  const aciertoGlobal = decididas > 0 ? totales.ganadas / decididas : null;

  return (
    <View style={estilos.pantalla}>
      <FlatList
        contentContainerStyle={estilos.contenido}
        refreshControl={<RefreshControl refreshing={cargando} onRefresh={cargar} tintColor={colores.texto} />}
        ListHeaderComponent={
          <View style={{ gap: 16 }}>
            <View>
              <Titulo>Calibración</Titulo>
              <Subtitulo>Qué tan bien predicen tus confianzas lo que después pasa</Subtitulo>
            </View>

            {error && <Mensaje tipo="error" texto={error} />}

            {decididas > 0 && (
              <View style={{ flexDirection: "row", gap: 10 }}>
                <Metrica
                  valor={aciertoGlobal !== null ? `${(aciertoGlobal * 100).toFixed(0)}%` : "—"}
                  etiqueta="acierto real"
                  tono={aciertoGlobal !== null && aciertoGlobal >= 0.55 ? "exito" : "neutral"}
                />
                <Metrica valor={`${totales.ganadas}-${totales.perdidas}`} etiqueta="ganadas-perdidas" />
                {economico?.neto != null && (
                  <Metrica
                    valor={economico.neto >= 0 ? `+${economico.neto.toFixed(0)}` : economico.neto.toFixed(0)}
                    etiqueta="neto"
                    tono={economico.neto >= 0 ? "exito" : "peligro"}
                  />
                )}
              </View>
            )}

            {bandas.length > 0 && <Seccion titulo="Por banda de confianza" />}

            {!error && bandas.length === 0 && !cargando && (
              <EstadoVacio
                titulo="Todavía no hay nada que calibrar"
                descripcion="Cuando tengas picks con resultado cargado, acá vas a ver si tus confianzas se sostienen o si te estás pasando de optimista."
              />
            )}
          </View>
        }
        data={bandas}
        keyExtractor={(item) => item.banda}
        renderItem={({ item }) => {
          const sobreconfiado = item.diferencia !== null && item.diferencia > 0.05;
          const bienCalibrado = item.diferencia !== null && Math.abs(item.diferencia) <= 0.05;
          return (
            <Tarjeta elevada={bienCalibrado && !item.muestraInsuficiente}>
              <View style={estilos.filaEntreEspacio}>
                <Text style={{ color: colores.texto, fontWeight: "700", fontSize: 17 }}>{item.banda}</Text>
                {item.muestraInsuficiente ? (
                  <Insignia texto={`solo ${item.cantidad} picks`} tono="advertencia" />
                ) : item.diferencia !== null ? (
                  <Insignia
                    texto={
                      bienCalibrado
                        ? "bien calibrado"
                        : `${item.diferencia > 0 ? "sobreconfiado" : "subconfiado"} ${(Math.abs(item.diferencia) * 100).toFixed(0)} pts`
                    }
                    tono={bienCalibrado ? "exito" : sobreconfiado ? "peligro" : "acento"}
                  />
                ) : null}
              </View>

              {/* Las dos barras juntas hacen visible el desfase sin leer números. */}
              <View style={{ gap: 7, marginTop: 4 }}>
                <View style={{ gap: 3 }}>
                  <View style={estilos.filaEntreEspacio}>
                    <Text style={{ color: colores.textoSuave, fontSize: 12 }}>Dijiste que ganarías</Text>
                    <Text style={{ color: colores.textoSuave, fontSize: 12, fontWeight: "600" }}>
                      {(item.confianzaPromedio * 100).toFixed(0)}%
                    </Text>
                  </View>
                  <Barra proporcion={item.confianzaPromedio} tono="acento" />
                </View>

                <View style={{ gap: 3 }}>
                  <View style={estilos.filaEntreEspacio}>
                    <Text style={{ color: colores.texto, fontSize: 12 }}>Ganaste de verdad</Text>
                    <Text style={{ color: colores.texto, fontSize: 12, fontWeight: "700" }}>
                      {item.tasaReal !== null ? `${(item.tasaReal * 100).toFixed(0)}%` : "sin decidir"}
                    </Text>
                  </View>
                  <Barra
                    proporcion={item.tasaReal ?? 0}
                    tono={bienCalibrado ? "exito" : sobreconfiado ? "peligro" : "advertencia"}
                  />
                </View>
              </View>

              <Text style={{ color: colores.textoSuave, fontSize: 12, marginTop: 2 }}>
                {item.cantidad} picks · {item.ganadas}G / {item.perdidas}P
                {item.empates > 0 ? ` / ${item.empates}E` : ""}
              </Text>
            </Tarjeta>
          );
        }}
        ListFooterComponent={
          economico && economico.totalPicksResueltos > 0 ? (
            <View style={{ gap: 12, marginTop: 8 }}>
              <Seccion titulo="Dinero" />
              <Tarjeta>
                {economico.totalApostado !== null ? (
                  <>
                    <FilaDato etiqueta="Apostado" valor={economico.totalApostado.toFixed(2)} />
                    <FilaDato etiqueta="Cobrado" valor={economico.totalCobrado!.toFixed(2)} />
                    <View style={{ height: 1, backgroundColor: colores.borde, marginVertical: 4 }} />
                    <FilaDato
                      etiqueta="Neto"
                      valor={economico.neto! >= 0 ? `+${economico.neto!.toFixed(2)}` : economico.neto!.toFixed(2)}
                      tono={economico.neto! >= 0 ? "exito" : "peligro"}
                    />
                  </>
                ) : (
                  <Mensaje tipo="info" texto={economico.advertencia ?? "Sin datos de stake/payout"} />
                )}
              </Tarjeta>

              <Seccion titulo="Por nivel de pureza" />
              <Tarjeta>
                {Object.entries(economico.porNivel).map(([nivel, datos], i, arr) => {
                  const decid = datos.ganadas + datos.perdidas;
                  const tasa = decid > 0 ? datos.ganadas / decid : null;
                  return (
                    <View key={nivel} style={{ gap: 5, paddingBottom: i < arr.length - 1 ? 10 : 0 }}>
                      <View style={estilos.filaEntreEspacio}>
                        <Insignia texto={nivel.replace("_", " ")} tono="acento" />
                        <Text style={{ color: colores.texto, fontSize: 13, fontWeight: "600" }}>
                          {tasa !== null ? `${(tasa * 100).toFixed(0)}%` : "—"}
                        </Text>
                      </View>
                      {tasa !== null && <Barra proporcion={tasa} tono={tasa >= 0.55 ? "exito" : "peligro"} alto={5} />}
                      <Text style={{ color: colores.textoSuave, fontSize: 11 }}>
                        {datos.cantidad} picks · {datos.ganadas}G / {datos.perdidas}P
                        {datos.empates > 0 ? ` / ${datos.empates}E` : ""}
                      </Text>
                    </View>
                  );
                })}
              </Tarjeta>
            </View>
          ) : null
        }
      />
    </View>
  );
}
