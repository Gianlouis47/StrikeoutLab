// El gráfico de barras del historial: una barra por salida.
//
// Es la pantalla que hacen todas las apps de props — Linemate, Props.Cash,
// Outlier — y hacen bien en hacerla: ver quince barras de un vistazo dice
// cosas que una tabla de quince filas no dice. Se ve al toque si viene en
// racha, si el rival lo domina, o si un solo juego enorme le está inflando
// el promedio.
//
// Dos decisiones que las diferencian de las de ellos:
//
// 1. EL EMPATE TIENE SU PROPIO COLOR. Con línea entera (6 exacto sobre 6)
//    Star Sport devuelve la plata: no se gana ni se pierde. Pintarlo verde
//    o rojo sería mentir sobre lo que pasó. Va en ámbar.
//
// 2. LA LÍNEA SE DIBUJA. Sin la raya horizontal en el valor de la línea, el
//    gráfico es decorativo: se ven barras altas y bajas pero no contra qué.
//    Es lo único que convierte el dibujo en información.

import React from "react";
import { ScrollView, Text, View } from "react-native";
import { colores } from "./ui";

export interface SalidaHistorica {
  fecha: string;
  rival: string;
  ip: number;
  k: number;
  bb: number;
  pitcheos: number | null;
  es_local: boolean | null;
  resultado: "OVER" | "UNDER" | "EMPATE" | null;
}

const ALTO = 132;
const ANCHO_BARRA = 26;
const SEPARACION = 8;

function colorDe(resultado: SalidaHistorica["resultado"]): string {
  if (resultado === "OVER") return colores.exito;
  if (resultado === "UNDER") return colores.peligro;
  if (resultado === "EMPATE") return colores.advertencia;
  return colores.acento;
}

/** "2026-08-25" -> "25/8". El año no aporta y ocupa lugar. */
function diaMes(fecha: string): string {
  const [, m, d] = fecha.split("-");
  return `${Number(d)}/${Number(m)}`;
}

export function GraficoSalidas({
  salidas,
  linea,
}: {
  salidas: SalidaHistorica[];
  linea: number | null;
}) {
  if (salidas.length === 0) return null;

  // Las salidas vienen de la más nueva a la más vieja; el gráfico se lee de
  // izquierda a derecha en el tiempo, así que se invierte.
  const enOrden = [...salidas].reverse();

  // La escala llega hasta el máximo real o hasta la línea, lo que sea mayor:
  // si la línea quedara arriba del tope, la raya se dibujaría fuera del
  // gráfico y no se vería contra qué se compara.
  const techo = Math.max(...enOrden.map((s) => s.k), linea ?? 0, 1);
  const alturaDe = (k: number) => Math.max(3, (k / techo) * ALTO);
  const yLinea = linea === null ? null : ALTO - (linea / techo) * ALTO;

  return (
    <View style={{ marginTop: 6 }}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingRight: 10, paddingLeft: 2 }}
      >
        <View>
          <View style={{ height: ALTO, flexDirection: "row", alignItems: "flex-end", gap: SEPARACION }}>
            {/* La raya de la línea, por detrás de las barras. */}
            {yLinea !== null && (
              <View
                pointerEvents="none"
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  top: yLinea,
                  height: 0,
                  borderBottomWidth: 1,
                  borderBottomColor: colores.textoSuave,
                  borderStyle: "dashed",
                  zIndex: 1,
                }}
              />
            )}

            {enOrden.map((s, i) => (
              <View key={`${s.fecha}-${i}`} style={{ alignItems: "center", width: ANCHO_BARRA }}>
                <Text
                  style={{
                    color: colores.texto,
                    fontSize: 10,
                    fontWeight: "700",
                    marginBottom: 2,
                  }}
                >
                  {s.k}
                </Text>
                <View
                  style={{
                    width: ANCHO_BARRA,
                    height: alturaDe(s.k),
                    borderRadius: 5,
                    backgroundColor: colorDe(s.resultado),
                    opacity: s.resultado === null ? 0.55 : 1,
                    zIndex: 2,
                  }}
                />
              </View>
            ))}
          </View>

          {/* Pie: rival y fecha de cada barra, alineados con su columna. */}
          <View style={{ flexDirection: "row", gap: SEPARACION, marginTop: 5 }}>
            {enOrden.map((s, i) => (
              <View key={`pie-${s.fecha}-${i}`} style={{ width: ANCHO_BARRA, alignItems: "center" }}>
                <Text style={{ color: colores.textoSuave, fontSize: 9 }} numberOfLines={1}>
                  {s.es_local === false ? "@" : ""}
                  {s.rival}
                </Text>
                <Text style={{ color: colores.borde, fontSize: 8 }} numberOfLines={1}>
                  {diaMes(s.fecha)}
                </Text>
              </View>
            ))}
          </View>
        </View>
      </ScrollView>

      <View style={{ flexDirection: "row", gap: 14, marginTop: 10, flexWrap: "wrap" }}>
        <Leyenda color={colores.exito} texto="Pasó la línea" />
        <Leyenda color={colores.peligro} texto="No la pasó" />
        <Leyenda color={colores.advertencia} texto="Empate (devuelven)" />
        {linea !== null && (
          <Text style={{ color: colores.textoSuave, fontSize: 11 }}>--- línea {linea}</Text>
        )}
      </View>
    </View>
  );
}

function Leyenda({ color, texto }: { color: string; texto: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
      <View style={{ width: 9, height: 9, borderRadius: 2, backgroundColor: color }} />
      <Text style={{ color: colores.textoSuave, fontSize: 11 }}>{texto}</Text>
    </View>
  );
}
