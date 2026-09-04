// Buscar Lanzador: la pantalla que hacen Linemate, Props.Cash y Outlier —
// con la parte que a todas les falta.
//
// Ellas muestran barritas verdes y rojas y arriba un porcentaje grande: "13
// de 21 (62%)". Ese número es CONTAR lo que ya pasó. No sabe contra quién
// lanza hoy, no corrige por muestra chica, y sobre todo no sabe que la casa
// cobra: al -130 hay que acertar 56.5% solo para no perder plata, así que un
// 62% histórico puede ser una apuesta perdedora.
//
// Acá van las dos cosas, separadas y etiquetadas por lo que son:
//
//   ARRIBA   la probabilidad de verdad — Poisson sobre los bateadores que va
//            a enfrentar, con el K% del rival, regresión a la media y la
//            calibración del sistema. Con su veredicto contra la cuota real.
//
//   ABAJO    el historial con sus filtros y sus barras. Contexto: rachas, si
//            el rival lo domina, si un juego enorme le infla el promedio.
//            No es una probabilidad y se dice así.
//
// Los dos números salen de Postgres, no del navegador: es el mismo código
// que usa la IA en el chat, así que la pantalla y el chat no se contradicen.

import { useEffect, useMemo, useState } from "react";
import { repositorio } from "../lib/repositorio";
import { GraficoSalidas, type SalidaHistorica } from "../componentes/GraficoSalidas";

const CUOTA_STAR_SPORT = -130;
const LINEAS_COMUNES = [4.5, 5.5, 6.5, 7.5];

type Ventana = "TEMPORADA" | "ULTIMAS_10" | "ULTIMAS_5" | "CASA" | "VISITA" | "H2H";

const VENTANAS: ReadonlyArray<{ id: Ventana; titulo: string }> = [
  { id: "TEMPORADA", titulo: "Temporada" },
  { id: "ULTIMAS_10", titulo: "Últimas 10" },
  { id: "ULTIMAS_5", titulo: "Últimas 5" },
  { id: "CASA", titulo: "En casa" },
  { id: "VISITA", titulo: "De visita" },
  { id: "H2H", titulo: "Vs. rival" },
];

interface Candidato {
  pitcher: string;
  equipo: string | null;
  mano: string | null;
  k_pct: number | null;
  salidas: number | null;
  es_abridor: boolean | null;
}

interface Destacado extends Candidato {
  k_por_salida: number | null;
}

interface Historial {
  encontrado: boolean;
  pitcher?: string;
  equipo?: string | null;
  linea?: number | null;
  cantidad?: number;
  salidas?: SalidaHistorica[];
  k_promedio?: number | null;
  k_mediana?: number | null;
  ip_promedio?: number | null;
  veces_over?: number;
  veces_under?: number;
  empates?: number;
  racha?: string | null;
  tasa_historica?: number | null;
  aviso?: string | null;
  mensaje?: string;
}

interface Proyeccion {
  encontrado: boolean;
  pitcher?: string;
  equipo?: string | null;
  linea?: number | null;
  mano_pitcher?: string | null;
  k_proyectados?: number | null;
  bateadores_esperados?: number | null;
  prob_over?: number | null;
  prob_under?: number | null;
  prob_empate?: number | null;
  veredicto?: string | null;
  nivel?: string | null;
  fuente_k_rival?: string | null;
  supuestos?: string[];
  advertencias?: string[];
  mensaje?: string;
  apuesta?: {
    veredicto?: string;
    explicacion?: string;
    prob_de_equilibrio?: number;
  };
}

/** 0.6190 -> "61.9%". Null se muestra como raya, no como "0%". */
function pct(v: number | null | undefined, decimales = 1): string {
  if (v === null || v === undefined) return "—";
  return `${(Number(v) * 100).toFixed(decimales)}%`;
}

function num(v: number | null | undefined, decimales = 2): string {
  if (v === null || v === undefined) return "—";
  return Number(v).toFixed(decimales);
}

export function BuscarLanzador() {
  const [texto, setTexto] = useState("");
  const [candidatos, setCandidatos] = useState<Candidato[]>([]);
  const [destacados, setDestacados] = useState<Destacado[]>([]);
  const [equipos, setEquipos] = useState<string[]>([]);

  const [elegido, setElegido] = useState<Candidato | null>(null);
  const [linea, setLinea] = useState("6.5");
  const [rival, setRival] = useState<string | null>(null);
  const [ventana, setVentana] = useState<Ventana>("TEMPORADA");

  const [historial, setHistorial] = useState<Historial | null>(null);
  const [proyeccion, setProyeccion] = useState<Proyeccion | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Mientras se borra el campo queda vacío o a medio escribir ("6."). Se
  // trata como "todavía no hay línea" en vez de mandar un NaN a la base.
  const lineaNumero = useMemo(() => {
    const v = Number(linea.replace(",", "."));
    return Number.isFinite(v) && v > 0 ? v : null;
  }, [linea]);

  // La línea que se consulta va un paso atrás de la que se escribe: sin esto
  // tipear "6.5" dispara tres pares de consultas y la tarjeta puede terminar
  // mostrando el resultado de "6" arriba del de "6.5".
  const [lineaConsultada, setLineaConsultada] = useState<number | null>(6.5);
  useEffect(() => {
    const reloj = setTimeout(() => setLineaConsultada(lineaNumero), 350);
    return () => clearTimeout(reloj);
  }, [lineaNumero]);

  // Con qué llenar la pantalla antes de escribir nada: una búsqueda en blanco
  // obliga a saber a quién buscar.
  useEffect(() => {
    repositorio
      .llamar<Destacado[]>("abridores_destacados", { p_limite: 12 })
      .then(setDestacados)
      .catch(() => setDestacados([]));
    repositorio
      .llamar<Array<{ abreviatura: string }>>("equipos_lista")
      .then((filas) => setEquipos(filas.map((f) => f.abreviatura)))
      .catch(() => setEquipos([]));
  }, []);

  // Búsqueda con freno: sin esto sale una consulta por tecla y las respuestas
  // llegan desordenadas — se ve el resultado de "sku" después del de "skubal".
  useEffect(() => {
    const consulta = texto.trim();
    if (consulta.length < 2) {
      setCandidatos([]);
      return;
    }
    const reloj = setTimeout(() => {
      repositorio
        .llamar<Candidato[]>("buscar_pitcher", { texto_busqueda: consulta })
        .then(setCandidatos)
        .catch((e: Error) => setError(e.message));
    }, 250);
    return () => clearTimeout(reloj);
  }, [texto]);

  useEffect(() => {
    if (!elegido) return;
    let cancelado = false;

    (async () => {
      setCargando(true);
      setError(null);
      try {
        // Las dos van juntas: son independientes y esperarlas en fila
        // duplicaría el tiempo en blanco de la pantalla.
        const [h, p] = await Promise.all([
          repositorio.llamar<Historial>("historial_lanzador", {
            p_pitcher: elegido.pitcher,
            p_linea: lineaConsultada,
            p_ventana: ventana,
            p_rival: rival,
          }),
          lineaConsultada === null
            ? Promise.resolve(null)
            : repositorio.llamar<Proyeccion>("proyectar_ponches", {
                p_pitcher: elegido.pitcher,
                p_linea: lineaConsultada,
                p_rival: rival,
                p_mano: null,
                p_ventana_rival: "TEMPORADA",
                p_cuota: CUOTA_STAR_SPORT,
                p_sistema: "PROYECCION",
              }),
        ]);
        if (cancelado) return;
        setHistorial(h);
        setProyeccion(p);
      } catch (e) {
        if (!cancelado) setError((e as Error).message);
      }
      if (!cancelado) setCargando(false);
    })();

    return () => {
      cancelado = true;
    };
  }, [elegido, lineaConsultada, ventana, rival]);

  function elegir(c: Candidato) {
    setElegido(c);
    setTexto("");
    setCandidatos([]);
  }

  const salidas = historial?.salidas ?? [];
  const decididas = (historial?.veces_over ?? 0) + (historial?.veces_under ?? 0);
  // El veredicto de la apuesta manda sobre el del modelo: uno dice hacia
  // dónde se inclina, el otro si eso alcanza para ganarle a la cuota. Solo el
  // segundo se juega con plata.
  const conviene = proyeccion?.apuesta?.veredicto === "CONVIENE";
  const equipoPropio = proyeccion?.equipo ?? elegido?.equipo ?? null;

  return (
    <div className="contenido">
      <div>
        <h1 className="titulo">Buscar lanzador</h1>
        <p className="subtitulo">La probabilidad real arriba, el historial con filtros abajo.</p>
      </div>

      <div className="campo">
        <label htmlFor="buscar">Lanzador</label>
        <input
          id="buscar"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Skubal, T Skubal, Tarik Skubal…"
          autoComplete="off"
        />
      </div>

      {candidatos.length > 0 && (
        <div className="tarjeta">
          {candidatos.map((c) => (
            <button
              key={c.pitcher}
              onClick={() => elegir(c)}
              className="fila"
              style={{
                background: "none",
                border: "none",
                padding: "9px 0",
                color: "inherit",
                font: "inherit",
                cursor: "pointer",
                textAlign: "left",
              }}
            >
              <span>
                <strong style={{ fontSize: 15 }}>{c.pitcher}</strong>
                <br />
                <span className="suave">
                  {[c.equipo, c.mano, c.salidas ? `${c.salidas} salidas` : null].filter(Boolean).join(" · ")}
                </span>
              </span>
              {c.k_pct !== null && <span className="acento" style={{ fontWeight: 700 }}>{num(c.k_pct, 1)}% K</span>}
            </button>
          ))}
        </div>
      )}

      {!elegido && candidatos.length === 0 && destacados.length > 0 && (
        <>
          <h2 className="seccion">Los que más ponchan</h2>
          <p className="suave" style={{ marginTop: -8 }}>
            Abridores con 10 salidas o más, ordenados por K%. Es por donde se empieza a buscar un Over.
          </p>
          {destacados.map((d, i) => (
            <button
              key={d.pitcher}
              onClick={() => elegir(d)}
              className={`tarjeta ${i < 3 ? "elevada" : ""}`}
              style={{ cursor: "pointer", textAlign: "left", font: "inherit", color: "inherit" }}
            >
              <div className="fila">
                <span style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <span className={i < 3 ? "acento" : "suave"} style={{ fontWeight: 700, width: 20 }}>
                    {i + 1}
                  </span>
                  <span>
                    <strong style={{ fontSize: 15 }}>{d.pitcher}</strong>
                    <br />
                    <span className="suave">{[d.equipo, d.mano].filter(Boolean).join(" · ")}</span>
                  </span>
                </span>
                <span style={{ textAlign: "right" }}>
                  <strong style={{ fontSize: 15 }}>{num(d.k_pct, 1)}% K</strong>
                  <br />
                  <span className="suave">{num(d.k_por_salida, 2)} K por salida</span>
                </span>
              </div>
            </button>
          ))}
        </>
      )}

      {error && (
        <div className="mensaje peligro" style={{ borderColor: "var(--peligro)" }}>
          {error}
        </div>
      )}

      {elegido && (
        <>
          <div className="tarjeta elevada">
            <div className="fila">
              <span>
                <strong style={{ fontSize: 20 }}>{historial?.pitcher ?? elegido.pitcher}</strong>
                <br />
                <span className="suave">
                  {[
                    equipoPropio,
                    proyeccion?.mano_pitcher ?? elegido.mano,
                    elegido.es_abridor === false ? "relevista" : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </span>
              <button
                className="chip"
                onClick={() => {
                  setElegido(null);
                  setHistorial(null);
                  setProyeccion(null);
                  setRival(null);
                  setVentana("TEMPORADA");
                }}
              >
                Cambiar
              </button>
            </div>
          </div>

          <h2 className="seccion">Línea de la casa</h2>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {LINEAS_COMUNES.map((l) => (
              <button
                key={l}
                className="chip"
                aria-pressed={lineaNumero === l}
                onClick={() => setLinea(String(l))}
              >
                {l}
              </button>
            ))}
            <input
              value={linea}
              onChange={(e) => setLinea(e.target.value)}
              inputMode="decimal"
              style={{ textAlign: "center", padding: "8px 10px" }}
              aria-label="Línea"
            />
          </div>

          <h2 className="seccion">Rival</h2>
          <p className="suave" style={{ marginTop: -8 }}>
            Sin rival la proyección trata al equipo de enfrente como promedio de liga. Es el dato que más mueve el
            número después del lanzador.
          </p>
          <div className="chips">
            <button className="chip" aria-pressed={rival === null} onClick={() => setRival(null)}>
              Sin rival
            </button>
            {equipos
              .filter((e) => e !== equipoPropio)
              .map((e) => (
                <button key={e} className="chip" aria-pressed={rival === e} onClick={() => setRival(e)}>
                  {e}
                </button>
              ))}
          </div>

          {cargando && (
            <div style={{ padding: 24, textAlign: "center" }}>
              <span className="cargando" />
            </div>
          )}

          {proyeccion?.encontrado && (
            <>
              <h2 className="seccion">Probabilidad calculada</h2>
              <div className="tarjeta elevada">
                <div className="metricas">
                  <div className="metrica">
                    <div className={`valor ${proyeccion.veredicto === "OVER" ? "exito" : ""}`}>
                      {pct(proyeccion.prob_over)}
                    </div>
                    <div className="etiqueta">Over {num(proyeccion.linea ?? lineaConsultada, 1)}</div>
                  </div>
                  <div className="metrica">
                    <div className={`valor ${proyeccion.veredicto === "UNDER" ? "exito" : ""}`}>
                      {pct(proyeccion.prob_under)}
                    </div>
                    <div className="etiqueta">Under {num(proyeccion.linea ?? lineaConsultada, 1)}</div>
                  </div>
                  {(proyeccion.prob_empate ?? 0) > 0 && (
                    <div className="metrica">
                      <div className="valor advertencia">{pct(proyeccion.prob_empate)}</div>
                      <div className="etiqueta">Empate (devuelven)</div>
                    </div>
                  )}
                </div>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <span
                    className="insignia acento"
                    style={{ borderColor: "color-mix(in srgb, var(--acento) 40%, transparent)" }}
                  >
                    {num(proyeccion.k_proyectados)} K proyectados
                  </span>
                  <span className="insignia suave" style={{ borderColor: "var(--borde)" }}>
                    {num(proyeccion.bateadores_esperados, 1)} bateadores
                  </span>
                  {proyeccion.nivel && (
                    <span className="insignia suave" style={{ borderColor: "var(--borde)" }}>
                      {proyeccion.nivel}
                    </span>
                  )}
                </div>

                {/* Lo único que decide si se apuesta. */}
                <div
                  style={{
                    padding: 12,
                    borderRadius: 12,
                    border: `1px solid color-mix(in srgb, ${conviene ? "var(--exito)" : "var(--peligro)"} 45%, transparent)`,
                    background: `color-mix(in srgb, ${conviene ? "var(--exito)" : "var(--peligro)"} 8%, transparent)`,
                  }}
                >
                  <div className="fila">
                    <strong className={conviene ? "exito" : "peligro"} style={{ fontSize: 15 }}>
                      {proyeccion.apuesta?.veredicto ?? "—"}
                    </strong>
                    <span className="suave">
                      al {CUOTA_STAR_SPORT} · equilibrio {pct(proyeccion.apuesta?.prob_de_equilibrio)}
                    </span>
                  </div>
                  {proyeccion.apuesta?.explicacion && (
                    <p style={{ margin: "4px 0 0", fontSize: 13 }}>{proyeccion.apuesta.explicacion}</p>
                  )}
                </div>

                {proyeccion.fuente_k_rival && (
                  <p className="suave" style={{ margin: 0, fontSize: 11 }}>
                    K% del rival: {proyeccion.fuente_k_rival}
                  </p>
                )}
              </div>

              {(proyeccion.advertencias ?? []).map((a, i) => (
                <div
                  key={i}
                  className="mensaje advertencia"
                  style={{ borderColor: "color-mix(in srgb, var(--advertencia) 40%, transparent)" }}
                >
                  {a}
                </div>
              ))}
              {(proyeccion.supuestos ?? []).length > 0 && (
                <p className="suave">Supuestos: {(proyeccion.supuestos ?? []).join(" · ")}</p>
              )}
            </>
          )}

          <h2 className="seccion">Historial</h2>
          <div className="chips">
            {VENTANAS.map((v) => (
              <button
                key={v.id}
                className="chip"
                aria-pressed={ventana === v.id}
                onClick={() => setVentana(v.id)}
              >
                {v.id === "H2H" && rival ? `Vs. ${rival}` : v.titulo}
              </button>
            ))}
          </div>

          {ventana === "H2H" && rival === null && (
            <div className="mensaje advertencia" style={{ borderColor: "var(--advertencia)" }}>
              Elegí un rival arriba para ver el head-to-head.
            </div>
          )}

          {historial?.encontrado && salidas.length > 0 && (
            <div className="tarjeta">
              <div className="fila">
                <strong style={{ fontSize: 15 }}>
                  {historial.veces_over} de {decididas}
                  {(historial.empates ?? 0) > 0 ? ` (+${historial.empates} empate)` : ""}
                </strong>
                <strong
                  className={(historial.tasa_historica ?? 0) >= 0.5652 ? "exito" : "peligro"}
                  style={{ fontSize: 17 }}
                >
                  {pct(historial.tasa_historica)}
                </strong>
              </div>

              <GraficoSalidas salidas={salidas} linea={historial.linea ?? lineaConsultada} />

              <div className="metricas" style={{ marginTop: 10 }}>
                <div className="metrica">
                  <div className="valor">{num(historial.k_promedio)}</div>
                  <div className="etiqueta">K promedio</div>
                </div>
                <div className="metrica">
                  <div className="valor">{num(historial.k_mediana, 1)}</div>
                  <div className="etiqueta">K mediana</div>
                </div>
                <div className="metrica">
                  <div className="valor">{num(historial.ip_promedio, 1)}</div>
                  <div className="etiqueta">IP promedio</div>
                </div>
              </div>

              {historial.racha && (
                <span
                  className={`insignia ${
                    historial.racha.includes("OVER")
                      ? "exito"
                      : historial.racha.includes("UNDER")
                        ? "peligro"
                        : "advertencia"
                  }`}
                  style={{ borderColor: "currentColor", alignSelf: "flex-start" }}
                >
                  {historial.racha}
                </span>
              )}

              {historial.aviso && <p className="advertencia" style={{ fontSize: 12 }}>{historial.aviso}</p>}

              {/* Esto no se saca nunca. Es la diferencia entre esta pantalla y
                  las que cobran por lo mismo. */}
              <p className="suave" style={{ margin: 0 }}>
                Ese {pct(historial.tasa_historica)} es contar cuántas veces pasó la línea antes, no la probabilidad
                de que la pase hoy: no sabe contra quién lanza ni cuánto cobra la casa. La probabilidad está arriba.
              </p>
            </div>
          )}

          {historial?.encontrado && salidas.length === 0 && !cargando && (
            <div className="mensaje advertencia" style={{ borderColor: "var(--advertencia)" }}>
              {historial.mensaje ?? "No hay salidas en esta ventana."}
            </div>
          )}

          {salidas.length > 0 && (
            <div className="tarjeta">
              <p className="suave" style={{ margin: 0 }}>
                {salidas.length} salida{salidas.length === 1 ? "" : "s"}, de la más nueva a la más vieja
              </p>
              {salidas.map((s, i) => (
                <div
                  key={`${s.fecha}-${i}`}
                  className="fila"
                  style={{
                    padding: "7px 0",
                    borderTop: i === 0 ? "none" : "1px solid var(--borde)",
                  }}
                >
                  <span style={{ flex: 1 }}>
                    <strong style={{ fontSize: 13 }}>
                      {s.es_local === false ? "@" : "vs "}
                      {s.rival}
                    </strong>
                    <br />
                    <span className="suave" style={{ fontSize: 11 }}>
                      {s.fecha}
                    </span>
                  </span>
                  <span className="suave" style={{ fontSize: 12 }}>
                    {s.ip} IP · {s.bb} BB{s.pitcheos ? ` · ${s.pitcheos} p` : ""}
                  </span>
                  <strong
                    className={
                      s.resultado === "OVER"
                        ? "exito"
                        : s.resultado === "UNDER"
                          ? "peligro"
                          : s.resultado === "EMPATE"
                            ? "advertencia"
                            : ""
                    }
                    style={{ width: 32, textAlign: "right", fontSize: 15 }}
                  >
                    {s.k}
                  </strong>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
