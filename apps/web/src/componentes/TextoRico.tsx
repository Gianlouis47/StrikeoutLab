// El texto de la IA, dibujado de verdad.
//
// La IA responde en markdown. Sin esto, una tabla de quince lanzadores llega
// como una pared de pipes y guiones, ilegible. Y como no se veía bien, en su
// momento el prompt terminó pidiendo "nada de tablas" — arreglando el síntoma
// al revés, porque para comparar quince lanzadores la tabla es exactamente lo
// que hace falta.
//
// Dibuja lo poco que la IA usa: tablas, negritas y saltos. No es un motor de
// markdown y no pretende serlo; meter una dependencia de 200 KB para tres
// marcas sería peor.

import type { ReactNode } from "react";

/** Una fila partida en celdas, sin los pipes de los bordes. */
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

/** Las palabras que deciden la apuesta se leen de un vistazo. */
function claseVeredicto(valor: string): string | undefined {
  if (/NO CONVIENE/.test(valor)) return "peligro";
  if (/CONVIENE/.test(valor)) return "exito";
  if (/REVISAR|SIN L[IÍ]NEA/i.test(valor)) return "advertencia";
  return undefined;
}

/** Negritas: se parte por `**` y se alternan los tramos. */
function conNegritas(texto: string): ReactNode[] {
  return texto.split(/\*\*/).map((t, i) => (i % 2 === 1 ? <strong key={i}>{t}</strong> : t));
}

function Tabla({ filas }: { filas: string[][] }) {
  const [encabezado = [], ...cuerpo] = filas;
  const columnas = Math.max(...filas.map((f) => f.length));

  return (
    // El scroll horizontal propio no es un adorno: con ocho columnas no entra
    // en un teléfono, y sin esto las últimas quedarían cortadas justo donde
    // está el veredicto.
    <div className="tabla-scroll">
      <table>
        <thead>
          <tr>
            {Array.from({ length: columnas }, (_, c) => (
              <th key={c}>{encabezado[c] ?? ""}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {cuerpo.map((fila, f) => (
            <tr key={f}>
              {Array.from({ length: columnas }, (_, c) => {
                const valor = fila[c] ?? "";
                const clase = claseVeredicto(valor);
                return (
                  <td key={c} className={clase} style={clase ? { fontWeight: 700 } : undefined}>
                    {conNegritas(valor)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function TextoRico({ texto }: { texto: string }) {
  const lineas = texto.split("\n");
  const bloques: ReactNode[] = [];
  let sueltas: string[] = [];

  function vaciarSueltas(clave: string) {
    const junto = sueltas.join("\n").trim();
    sueltas = [];
    if (junto) {
      bloques.push(
        <p key={clave} style={{ margin: 0, whiteSpace: "pre-wrap" }}>
          {conNegritas(junto)}
        </p>,
      );
    }
  }

  for (let i = 0; i < lineas.length; i++) {
    if (!esFila(lineas[i] ?? "")) {
      sueltas.push(lineas[i] ?? "");
      continue;
    }
    // Se junta el bloque de filas seguidas y se descarta el separador.
    const filas: string[][] = [];
    let j = i;
    while (j < lineas.length && esFila(lineas[j] ?? "")) {
      const l = lineas[j] ?? "";
      if (!esSeparador(l)) filas.push(celdas(l));
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

  return <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>{bloques}</div>;
}
