// El gráfico de barras del historial: una barra por salida.
//
// Es la pantalla que hacen todas las apps de props — Linemate, Props.Cash,
// Outlier — y hacen bien en hacerla: ver quince barras de un vistazo dice
// cosas que una tabla de quince filas no dice. Se ve al toque si viene en
// racha, si el rival lo domina, o si un solo juego enorme le está inflando
// el promedio.
//
// Dos decisiones que lo diferencian de los de ellos:
//
// 1. EL EMPATE TIENE SU PROPIO COLOR. Con línea entera (6 exacto sobre 6)
//    Star Sport devuelve la plata: no se gana ni se pierde. Pintarlo verde
//    o rojo sería mentir sobre lo que pasó. Va en ámbar.
//
// 2. LA LÍNEA SE DIBUJA. Sin la raya horizontal en el valor de la línea, el
//    gráfico es decorativo: se ven barras altas y bajas pero no contra qué.
//    Es lo único que convierte el dibujo en información.

const ALTO = 132;

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

function color(resultado: SalidaHistorica["resultado"]): string {
  if (resultado === "OVER") return "var(--exito)";
  if (resultado === "UNDER") return "var(--peligro)";
  if (resultado === "EMPATE") return "var(--advertencia)";
  return "var(--acento)";
}

/** "2026-08-25" -> "25/8". El año no aporta y ocupa lugar. */
function diaMes(fecha: string): string {
  const [, m = "", d = ""] = fecha.split("-");
  return `${Number(d)}/${Number(m)}`;
}

export function GraficoSalidas({ salidas, linea }: { salidas: SalidaHistorica[]; linea: number | null }) {
  if (salidas.length === 0) return null;

  // Vienen de la más nueva a la más vieja; el gráfico se lee de izquierda a
  // derecha en el tiempo, así que se invierte.
  const enOrden = [...salidas].slice().reverse();

  // La escala llega hasta el máximo real o hasta la línea, lo que sea mayor:
  // si la línea quedara arriba del tope, la raya se dibujaría fuera del
  // gráfico y no se vería contra qué se compara.
  const techo = Math.max(...enOrden.map((s) => s.k), linea ?? 0, 1);
  const alturaDe = (k: number) => Math.max(3, (k / techo) * ALTO);

  return (
    <div>
      <div className="grafico">
        <div>
          <div className="barras">
            {linea !== null && (
              <div className="linea-marca" style={{ top: ALTO - (linea / techo) * ALTO }} aria-hidden />
            )}
            {enOrden.map((s, i) => (
              <div className="columna" key={`${s.fecha}-${i}`}>
                <span className="k">{s.k}</span>
                <div
                  className="barra-dato"
                  style={{ height: alturaDe(s.k), background: color(s.resultado) }}
                  title={`${s.fecha} ${s.es_local === false ? "@" : "vs"} ${s.rival}: ${s.k} K en ${s.ip} IP`}
                />
              </div>
            ))}
          </div>

          <div className="pies">
            {enOrden.map((s, i) => (
              <div className="pie" key={`pie-${s.fecha}-${i}`}>
                {s.es_local === false ? "@" : ""}
                {s.rival}
                <div className="fecha">{diaMes(s.fecha)}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="leyenda">
        <span>
          <span className="punto" style={{ background: "var(--exito)" }} />
          Pasó la línea
        </span>
        <span>
          <span className="punto" style={{ background: "var(--peligro)" }} />
          No la pasó
        </span>
        <span>
          <span className="punto" style={{ background: "var(--advertencia)" }} />
          Empate (devuelven)
        </span>
        {linea !== null && <span>--- línea {linea}</span>}
      </div>
    </div>
  );
}
