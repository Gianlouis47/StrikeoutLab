import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import {
  Barra,
  Boton,
  Campo,
  Mensaje,
  Seccion,
  Subtitulo,
  Tarjeta,
  Titulo,
  colores,
  estilos,
} from "../components/ui";
import { CUOTA_POR_DEFECTO, evaluarParlay, type EvaluacionParlay } from "../lib/calculadora";

/**
 * Esta pantalla ya no multiplica confianzas: eso era mentirse dos veces.
 *
 * Primero porque la confianza del modelo está inflada — el historial real lo
 * prueba — y segundo porque el número que importa no es la probabilidad sino
 * con cuánta plata terminás. La cuenta la hace `evaluar_parlay` en Postgres,
 * que corrige por la calibración real y devuelve la escalera de 1 a 12 patas.
 */
export default function ParlayScreen() {
  const [confianzas, setConfianzas] = useState<string[]>(["", ""]);
  const [resultado, setResultado] = useState<EvaluacionParlay | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verEscalera, setVerEscalera] = useState(false);

  function actualizar(i: number, valor: string) {
    setConfianzas((prev) => prev.map((c, idx) => (idx === i ? valor : c)));
    setResultado(null);
  }

  async function calcular() {
    setError(null);
    setResultado(null);
    const probabilidades = confianzas.map((c) => parseFloat(c) / 100);
    if (probabilidades.some((p) => Number.isNaN(p) || p <= 0 || p >= 1)) {
      setError("Cada pata necesita una confianza entre 1 y 99.");
      return;
    }
    setCargando(true);
    try {
      setResultado(
        await evaluarParlay({
          probabilidades,
          etiquetas: probabilidades.map((_, i) => `Pata ${i + 1}`),
        }),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCargando(false);
    }
  }

  const tuyo = resultado?.tu_parlay;
  const optimas = resultado?.recomendacion.patas_optimas ?? null;
  const escalonOptimo = resultado?.escalera.find((e) => e.patas === optimas);
  const escalonTuyo = resultado?.escalera.find((e) => e.patas === tuyo?.patas);
  const sobranPatas = optimas !== null && tuyo !== undefined && tuyo.patas > optimas;

  const tono = (v: string) =>
    v === "CONVIENE" ? colores.exito : v === "FLOJO" ? colores.advertencia : colores.peligro;

  return (
    <ScrollView style={estilos.pantalla} contentContainerStyle={estilos.contenido} keyboardShouldPersistTaps="handled">
      <View>
        <Titulo>Parlay</Titulo>
        <Subtitulo>Cuánto queda de verdad al combinar, y dónde conviene cortar</Subtitulo>
      </View>

      {resultado && tuyo && (
        <>
          <Tarjeta elevada>
            <View style={{ alignItems: "center", gap: 2, paddingVertical: 4 }}>
              <Text style={{ color: colores.texto, fontSize: 40, fontWeight: "800", letterSpacing: -1 }}>
                {(tuyo.probabilidad * 100).toFixed(1)}%
              </Text>
              <Text style={{ color: colores.textoSuave, fontSize: 13 }}>
                que salgan las {tuyo.patas} patas
              </Text>
            </View>

            <Barra
              proporcion={tuyo.probabilidad}
              tono={tuyo.probabilidad >= 0.5 ? "exito" : tuyo.probabilidad >= 0.3 ? "advertencia" : "peligro"}
              alto={8}
            />

            <View style={[estilos.filaEntreEspacio, { marginTop: 10 }]}>
              <Text style={{ color: tono(tuyo.veredicto), fontSize: 17, fontWeight: "800" }}>
                {tuyo.veredicto}
              </Text>
              <Text style={{ color: colores.textoSuave, fontSize: 12 }}>
                paga {tuyo.pago_por_peso.toFixed(2)} por peso
              </Text>
            </View>

            {escalonTuyo && (
              <Text style={{ color: colores.textoSuave, fontSize: 12, lineHeight: 18, marginTop: 6 }}>
                Apostando el {resultado.apuesta_fija_pct}% del bankroll {resultado.apuestas_simuladas} veces,
                la mitad de las veces terminás con{" "}
                <Text style={{ color: escalonTuyo.terminas_con_mediana >= 1 ? colores.exito : colores.peligro, fontWeight: "700" }}>
                  {escalonTuyo.terminas_con_mediana.toFixed(2)}×
                </Text>{" "}
                lo que empezaste, y tenés {(escalonTuyo.prob_fundirte * 100).toFixed(0)}% de fundirte.
              </Text>
            )}
          </Tarjeta>

          {/* Lo que el usuario pidió: el ticket que la matemática banca, y el
              suyo aparte. No se le dice que no y punto. */}
          {sobranPatas && escalonOptimo && (
            <Tarjeta>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 7, marginBottom: 6 }}>
                <Ionicons name="bulb-outline" size={17} color={colores.acento} />
                <Text style={{ color: colores.texto, fontWeight: "700", fontSize: 15 }}>
                  Jugá dos tickets, no uno
                </Text>
              </View>
              <Text style={{ color: colores.textoSuave, fontSize: 13, lineHeight: 19 }}>
                Con estas patas lo óptimo son <Text style={{ color: colores.texto, fontWeight: "700" }}>{optimas}</Text>:
                terminás con {escalonOptimo.terminas_con_mediana.toFixed(2)}× en vez de{" "}
                {escalonTuyo?.terminas_con_mediana.toFixed(2)}×, y te fundís{" "}
                {(escalonOptimo.prob_fundirte * 100).toFixed(0)}% de las veces en vez de{" "}
                {((escalonTuyo?.prob_fundirte ?? 0) * 100).toFixed(0)}%.
              </Text>
              <Text style={{ color: colores.textoSuave, fontSize: 13, lineHeight: 19, marginTop: 8 }}>
                Armá ese con tus {optimas} patas más fuertes y jugalo con la plata en serio. Si igual querés
                las {tuyo.patas}, hacelo en un ticket aparte y con menos: así el bueno no se contamina con
                el arriesgado.
              </Text>
            </Tarjeta>
          )}

          <Tarjeta>
            <Pressable onPress={() => setVerEscalera((v) => !v)} style={estilos.filaEntreEspacio} hitSlop={8}>
              <Text style={{ color: colores.texto, fontWeight: "700", fontSize: 14 }}>
                Qué pasa con cada cantidad de patas
              </Text>
              <Ionicons
                name={verEscalera ? "chevron-up" : "chevron-down"}
                size={17}
                color={colores.textoSuave}
              />
            </Pressable>

            {verEscalera && (
              <View style={{ marginTop: 10, gap: 7 }}>
                <View style={estilos.filaEntreEspacio}>
                  <Text style={{ color: colores.textoSuave, fontSize: 11, width: 46 }}>Patas</Text>
                  <Text style={{ color: colores.textoSuave, fontSize: 11, flex: 1, textAlign: "right" }}>Sale</Text>
                  <Text style={{ color: colores.textoSuave, fontSize: 11, flex: 1, textAlign: "right" }}>Terminás</Text>
                  <Text style={{ color: colores.textoSuave, fontSize: 11, flex: 1, textAlign: "right" }}>Te fundís</Text>
                </View>
                {resultado.escalera.map((e) => {
                  const esOptima = e.patas === optimas;
                  return (
                    <View
                      key={e.patas}
                      style={[
                        estilos.filaEntreEspacio,
                        esOptima && {
                          backgroundColor: colores.acento + "1A",
                          borderRadius: 7,
                          paddingHorizontal: 6,
                          paddingVertical: 3,
                          marginHorizontal: -6,
                        },
                      ]}
                    >
                      <Text style={{ color: esOptima ? colores.acento : colores.texto, fontSize: 12, fontWeight: esOptima ? "800" : "500", width: 46 }}>
                        {e.patas}{esOptima ? " ←" : ""}
                      </Text>
                      <Text style={{ color: colores.textoSuave, fontSize: 12, flex: 1, textAlign: "right" }}>
                        {(e.probabilidad * 100).toFixed(1)}%
                      </Text>
                      <Text
                        style={{
                          color: e.terminas_con_mediana >= 1 ? colores.exito : colores.peligro,
                          fontSize: 12, flex: 1, textAlign: "right", fontWeight: "600",
                        }}
                      >
                        {e.terminas_con_mediana.toFixed(2)}×
                      </Text>
                      <Text
                        style={{
                          color: e.prob_fundirte > 0.25 ? colores.peligro : colores.textoSuave,
                          fontSize: 12, flex: 1, textAlign: "right",
                        }}
                      >
                        {(e.prob_fundirte * 100).toFixed(0)}%
                      </Text>
                    </View>
                  );
                })}
                <Text style={{ color: colores.textoSuave, fontSize: 11, lineHeight: 16, marginTop: 4 }}>
                  {resultado.como_leer_la_escalera}
                </Text>
                {/* El dato que desarma la trampa: más patas suben el valor
                    esperado y aun así te funden. */}
                <Text style={{ color: colores.advertencia, fontSize: 11, lineHeight: 16 }}>
                  Ojo: el valor esperado sube con cada pata que agregás, y aun así la columna «Terminás» baja.
                  No es contradicción — el promedio lo inflan unos pocos aciertos enormes que a vos no te van a
                  tocar. Mirá «Terminás», no el valor esperado.
                </Text>
              </View>
            )}
          </Tarjeta>

          <Tarjeta>
            <Text style={{ color: colores.texto, fontWeight: "700", fontSize: 14, marginBottom: 6 }}>
              Por qué tus números bajaron
            </Text>
            <Text style={{ color: colores.textoSuave, fontSize: 12, lineHeight: 18 }}>
              {resultado.calibracion.explicacion}
            </Text>
            <View style={{ flexDirection: "row", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
              {resultado.patas.map((p, i) => (
                <View
                  key={i}
                  style={{
                    backgroundColor: colores.fondo,
                    borderRadius: 7,
                    paddingHorizontal: 8,
                    paddingVertical: 5,
                  }}
                >
                  <Text style={{ color: colores.textoSuave, fontSize: 11 }}>
                    {(p.confianza_declarada * 100).toFixed(0)}% →{" "}
                    <Text style={{ color: colores.texto, fontWeight: "700" }}>
                      {(p.confianza_honesta * 100).toFixed(0)}%
                    </Text>
                  </Text>
                </View>
              ))}
            </View>
          </Tarjeta>

          <Mensaje tipo="info" texto={resultado.nota_empate} />
        </>
      )}

      <Seccion titulo={`${confianzas.length} patas`} />

      {confianzas.map((c, i) => (
        <Tarjeta key={i}>
          <View style={estilos.filaEntreEspacio}>
            <Text style={{ color: colores.texto, fontWeight: "700", fontSize: 15 }}>Pata {i + 1}</Text>
            {confianzas.length > 2 && (
              <Pressable
                onPress={() => {
                  setConfianzas((prev) => prev.filter((_, idx) => idx !== i));
                  setResultado(null);
                }}
                hitSlop={10}
              >
                <Ionicons name="trash-outline" size={18} color={colores.peligro} />
              </Pressable>
            )}
          </View>
          <Campo
            etiqueta="Confianza que dio la calculadora (%)"
            value={c}
            onChangeText={(v) => actualizar(i, v)}
            keyboardType="decimal-pad"
            placeholder="85"
          />
        </Tarjeta>
      ))}

      {error && <Mensaje tipo="error" texto={error} />}

      <Boton
        titulo="Agregar otra pata"
        variante="secundario"
        onPress={() => {
          setConfianzas((prev) => [...prev, ""]);
          setResultado(null);
        }}
      />
      {cargando ? (
        <ActivityIndicator color={colores.acento} style={{ marginTop: 8 }} />
      ) : (
        <Boton titulo="Calcular" onPress={calcular} />
      )}

      <Text style={{ color: colores.textoSuave, fontSize: 11, lineHeight: 16, textAlign: "center" }}>
        Cuota {CUOTA_POR_DEFECTO} por pata, la de Star Sport.
      </Text>
    </ScrollView>
  );
}
