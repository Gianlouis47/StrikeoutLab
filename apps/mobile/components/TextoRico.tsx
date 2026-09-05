// El texto de la IA, dibujado de verdad.
//
// La IA responde en markdown, pero el chat lo mostraba con un <Text> pelado:
// una tabla llegaba como una pared de pipes y guiones, ilegible en un
// celular. Y como no se veía bien, el prompt terminó pidiendo "nada de
// tablas" — arreglando el síntoma al revés, porque para comparar quince
// lanzadores la tabla es exactamente lo que hace falta.
//
// Esto dibuja lo poco que la IA usa de verdad: tablas, negritas y viñetas.
// No es un motor de markdown y no pretende serlo; meter una dependencia de
// 200 KB para tres marcas sería peor.

import React from "react";
import { ScrollView, Text, View } from "react-native";
import { colores } from "./ui";

/** Una fila de tabla partida en celdas, sin los pipes de los bordes. */
function celdas(linea: string): string[] {
  return linea
    .replace(/^\s*\|/, "")
    .replace(/\|\s*$/, "")
    .split("|")
    .map((c) => c.trim());
}

/** La línea `|---|---|` que separa el encabezado del cuerpo. */
function esSeparador(linea: string): boolean {
  return /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(linea) && linea.includes("-");
}

function esFila(linea: string): boolean {
  return linea.trim().startsWith("|") && linea.includes("|", 1);
}

/**
 * Negritas. Se parte por `**...**` y se alternan los tramos: los impares
 * son los que iban entre asteriscos.
 */
function Enfasis({ texto, color, tamano }: { texto: string; color: string; tamano: number }) {
  const tramos = texto.split(/\*\*/);
  return (
    <Text style={{ color, fontSize: tamano, lineHeight: tamano * 1.4 }}>
      {tramos.map((t, i) =>
        i % 2 === 1 ? (
          <Text key={i} style={{ fontWeight: "700" }}>
            {t}
          </Text>
        ) : (
          t
        ),
      )}
    </Text>
  );
}

/**
 * Tabla con scroll horizontal propio.
 *
 * El scroll es obligatorio, no un adorno: con ocho columnas no entra en un
 * teléfono, y sin esto las últimas quedarían cortadas justo donde está el
 * veredicto.
 */
function Tabla({ filas }: { filas: string[][] }) {
  const [encabezado, ...cuerpo] = filas;
  const columnas = Math.max(...filas.map((f) => f.length));

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator
      style={{ marginVertical: 8 }}
      contentContainerStyle={{ paddingRight: 8 }}
    >
      <View
        style={{
          borderWidth: 1,
          borderColor: colores.borde,
          borderRadius: 10,
          overflow: "hidden",
        }}
      >
        <View style={{ flexDirection: "row", backgroundColor: colores.tarjetaElevada }}>
          {Array.from({ length: columnas }).map((_, c) => (
            <Text
              key={c}
              style={{
                color: colores.textoSuave,
                fontSize: 11,
                fontWeight: "700",
                paddingVertical: 7,
                paddingHorizontal: 9,
                minWidth: c === 0 ? 118 : 56,
              }}
            >
              {encabezado[c] ?? ""}
            </Text>
          ))}
        </View>

        {cuerpo.map((fila, f) => (
          <View
            key={f}
            style={{
              flexDirection: "row",
              borderTopWidth: 1,
              borderTopColor: colores.borde,
              backgroundColor: f % 2 === 1 ? colores.tarjetaElevada + "55" : "transparent",
            }}
          >
            {Array.from({ length: columnas }).map((_, c) => {
              const valor = fila[c] ?? "";
              // Las palabras que deciden la apuesta se leen de un vistazo.
              const tono =
                /CONVIENE$/.test(valor) && !/NO CONVIENE/.test(valor)
                  ? colores.exito
                  : /NO CONVIENE/.test(valor)
                    ? colores.peligro
                    : /REVISAR/.test(valor)
                      ? colores.advertencia
                      : colores.texto;
              return (
                <Text
                  key={c}
                  style={{
                    color: tono,
                    fontSize: 12,
                    fontWeight: tono === colores.texto ? "400" : "700",
                    paddingVertical: 7,
                    paddingHorizontal: 9,
                    minWidth: c === 0 ? 118 : 56,
                  }}
                >
                  {valor}
                </Text>
              );
            })}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

export function TextoRico({
  texto,
  color = colores.texto,
  tamano = 15,
}: {
  texto: string;
  color?: string;
  tamano?: number;
}) {
  const lineas = texto.split("\n");
  const bloques: React.ReactNode[] = [];
  let sueltas: string[] = [];

  function vaciarSueltas(clave: string) {
    const junto = sueltas.join("\n").trim();
    sueltas = [];
    if (junto) bloques.push(<Enfasis key={clave} texto={junto} color={color} tamano={tamano} />);
  }

  for (let i = 0; i < lineas.length; i++) {
    if (!esFila(lineas[i])) {
      sueltas.push(lineas[i]);
      continue;
    }
    // Se junta el bloque de filas seguidas y se descarta el separador.
    const filas: string[][] = [];
    let j = i;
    while (j < lineas.length && esFila(lineas[j])) {
      if (!esSeparador(lineas[j])) filas.push(celdas(lineas[j]));
      j++;
    }
    // Una fila sola con pipes casi nunca es una tabla; se deja como texto.
    if (filas.length < 2) {
      sueltas.push(...lineas.slice(i, j));
    } else {
      vaciarSueltas(`t${i}`);
      bloques.push(<Tabla key={`tabla${i}`} filas={filas} />);
    }
    i = j - 1;
  }
  vaciarSueltas("final");

  return <View>{bloques}</View>;
}
