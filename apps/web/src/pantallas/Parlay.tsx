// Parlay: cuánto queda de verdad al combinar, y dónde conviene cortar.
//
// Esta pantalla ya no multiplica confianzas, que era mentirse dos veces.
// Primero porque la confianza del modelo está inflada — el historial real lo
// prueba — y segundo porque el número que importa no es la probabilidad sino
// con cuánta plata terminás. La cuenta la hace `evaluar_parlay` en Postgres,
// que corrige por la calibración medida y devuelve la escalera de 1 a 12
// patas.

import { useState } from "react";
import { CUOTA_POR_DEFECTO, evaluarParlay, type EvaluacionParlay } from "../lib/calculadora";
import { Barra, Boton, Campo, Encabezado, Insignia, Mensaje, Seccion, num, pct } from "../componentes/ui";

export function Parlay() {
  const [confianzas, setConfianzas] = useState<string[]>(["", ""]);
  const [resultado, setResultado] = useState<EvaluacionParlay | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verEscalera, setVerEscalera] = useState(false);

  function actualizar(i: number, valor: string) {
    setConfianzas((prev) => prev.map((c, idx) => (idx === i ? valor : c)));
    // El resultado viejo deja de valer apenas se toca una pata: dejarlo en
    // pantalla haría creer que corresponde a los números de abajo.
    setResultado(null);
  }

  async function calcular() {
    setError(null);
    setResultado(null);
    const probabilidades = confianzas.map((c) => parseFloat(c.replace(",", ".")) / 100);
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

  const claseVeredicto = (v: string) => (v === "CONVIENE" ? "exito" : v === "FLOJO" ? "advertencia" : "peligro");

  return (
    <div className="contenido">
      <Encabezado titulo="Parlay" bajada="Cuánto queda de verdad al combinar, y dónde conviene cortar." />

      {resultado && tuyo && (
        <>
          <div className="tarjeta elevada">
            <div style={{ textAlign: "center", padding: "4px 0" }}>
              <div style={{ fontSize: 40, fontWeight: 800, letterSpacing: -1 }}>{pct(tuyo.probabilidad)}</div>
              <div className="suave">que salgan las {tuyo.patas} patas</div>
            </div>

            <Barra
              proporcion={tuyo.probabilidad}
              tono={tuyo.probabilidad >= 0.5 ? "exito" : tuyo.probabilidad >= 0.3 ? "advertencia" : "peligro"}
            />

            <div className="fila">
              <strong className={claseVeredicto(tuyo.veredicto)} style={{ fontSize: 17 }}>
                {tuyo.veredicto}
              </strong>
              <span className="suave">paga {num(tuyo.pago_por_peso)} por peso</span>
            </div>

            {escalonTuyo && (
              <p className="suave" style={{ margin: 0 }}>
                Apostando el {resultado.apuesta_fija_pct}% del bankroll {resultado.apuestas_simuladas} veces, la mitad
                de las veces terminás con{" "}
                <strong className={escalonTuyo.terminas_con_mediana >= 1 ? "exito" : "peligro"}>
                  {num(escalonTuyo.terminas_con_mediana)}×
                </strong>{" "}
                lo que empezaste, y tenés {pct(escalonTuyo.prob_fundirte, 0)} de fundirte.
              </p>
            )}
          </div>

          {/* El ticket que la matemática banca, y el que quiere el usuario,
              aparte. No se le dice que no y punto. */}
          {sobranPatas && escalonOptimo && (
            <div className="tarjeta">
              <strong style={{ fontSize: 15 }}>💡 Jugá dos tickets, no uno</strong>
              <p className="suave" style={{ margin: 0 }}>
                Con estas patas lo óptimo {optimas === 1 ? "es" : "son"}{" "}
                <strong style={{ color: "var(--texto)" }}>
                  {optimas} {optimas === 1 ? "pata" : "patas"}
                </strong>
                : terminás con {num(escalonOptimo.terminas_con_mediana)}× en vez de{" "}
                {num(escalonTuyo?.terminas_con_mediana)}×, y te fundís {pct(escalonOptimo.prob_fundirte, 0)} de las
                veces en vez de {pct(escalonTuyo?.prob_fundirte, 0)}.
              </p>
              <p className="suave" style={{ margin: 0 }}>
                Armá ese con {optimas === 1 ? "tu pata más fuerte" : `tus ${optimas} patas más fuertes`} y jugalo con
                la plata en serio. Si igual querés las {tuyo.patas}, hacelo en un ticket aparte y con menos: así el
                bueno no se contamina con el arriesgado.
              </p>
            </div>
          )}

          <div className="tarjeta">
            <button
              className="fila"
              onClick={() => setVerEscalera((v) => !v)}
              style={{ background: "none", border: "none", padding: 0, color: "inherit", font: "inherit", cursor: "pointer" }}
              aria-expanded={verEscalera}
            >
              <strong style={{ fontSize: 14 }}>Qué pasa con cada cantidad de patas</strong>
              <span className="suave">{verEscalera ? "▲" : "▼"}</span>
            </button>

            {verEscalera && (
              <>
                <div className="tabla-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Patas</th>
                        <th style={{ textAlign: "right" }}>Sale</th>
                        <th style={{ textAlign: "right" }}>Terminás</th>
                        <th style={{ textAlign: "right" }}>Te fundís</th>
                      </tr>
                    </thead>
                    <tbody>
                      {resultado.escalera.map((e) => {
                        const esOptima = e.patas === optimas;
                        return (
                          <tr
                            key={e.patas}
                            style={
                              esOptima
                                ? { background: "color-mix(in srgb, var(--acento) 12%, transparent)" }
                                : undefined
                            }
                          >
                            <td className={esOptima ? "acento" : ""} style={{ fontWeight: esOptima ? 800 : 500 }}>
                              {e.patas}
                              {esOptima ? " ←" : ""}
                            </td>
                            <td className="suave" style={{ textAlign: "right" }}>
                              {pct(e.probabilidad)}
                            </td>
                            <td
                              className={e.terminas_con_mediana >= 1 ? "exito" : "peligro"}
                              style={{ textAlign: "right", fontWeight: 600 }}
                            >
                              {num(e.terminas_con_mediana)}×
                            </td>
                            <td
                              className={e.prob_fundirte > 0.25 ? "peligro" : "suave"}
                              style={{ textAlign: "right" }}
                            >
                              {pct(e.prob_fundirte, 0)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <p className="suave" style={{ margin: 0 }}>
                  «Te fundís» es terminar con menos del 20% de lo que empezaste, no exactamente en cero: apostando una
                  fracción fija nunca se llega a cero, pero abajo del 20% ya no hay con qué seguir. Supone apostar el{" "}
                  {resultado.apuesta_fija_pct}% del bankroll {resultado.apuestas_simuladas} veces.
                </p>

                {/* El dato que desarma la trampa: más patas suben el valor
                    esperado y aun así te funden. */}
                <p className="advertencia" style={{ fontSize: 11, lineHeight: 1.5, margin: 0 }}>
                  Ojo: el valor esperado sube con cada pata que agregás, y aun así la columna «Terminás» baja. No es
                  contradicción — el promedio lo inflan unos pocos aciertos enormes que a vos no te van a tocar. Mirá
                  «Terminás», no el valor esperado.
                </p>
              </>
            )}
          </div>

          <div className="tarjeta">
            <div className="fila">
              <strong style={{ fontSize: 14 }}>Por qué tus números bajaron</strong>
              <Insignia
                tono={
                  resultado.calibracion.confiabilidad === "BUENA"
                    ? "exito"
                    : resultado.calibracion.confiabilidad === "RAZONABLE"
                      ? "acento"
                      : "advertencia"
                }
              >
                {resultado.calibracion.confiabilidad}
              </Insignia>
            </div>
            <p className="suave" style={{ margin: 0 }}>
              {resultado.calibracion.explicacion}
            </p>

            {resultado.calibracion.aviso && (
              <p className="advertencia" style={{ fontSize: 12, lineHeight: 1.5, margin: 0 }}>
                {resultado.calibracion.aviso}
              </p>
            )}

            {/* El historial de los otros sistemas no maneja el número, pero se
                muestra: esconderlo sería tan deshonesto como heredarlo. */}
            {resultado.calibracion.otros_sistemas.map((o) => (
              <p key={o.sistema} className="suave" style={{ fontSize: 11, margin: 0 }}>
                Sistema {o.sistema}: {o.aciertos} de {o.decididos} declarando {pct(o.confianza_declarada_media, 0)}.
              </p>
            ))}

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {resultado.patas.map((p, i) => (
                <span key={i} className="suave" style={{ background: "var(--fondo)", borderRadius: 7, padding: "5px 8px" }}>
                  {pct(p.confianza_declarada, 0)} → <strong style={{ color: "var(--texto)" }}>{pct(p.confianza_honesta, 0)}</strong>
                </span>
              ))}
            </div>
          </div>

          <Mensaje tono="acento">{resultado.nota_empate}</Mensaje>
        </>
      )}

      <Seccion>{confianzas.length} patas</Seccion>

      {confianzas.map((c, i) => (
        <div key={i} className="tarjeta">
          <div className="fila">
            <strong style={{ fontSize: 15 }}>Pata {i + 1}</strong>
            {confianzas.length > 2 && (
              <button
                className="enlace"
                style={{ color: "var(--peligro)" }}
                onClick={() => {
                  setConfianzas((prev) => prev.filter((_, idx) => idx !== i));
                  setResultado(null);
                }}
                aria-label={`Quitar pata ${i + 1}`}
              >
                Quitar
              </button>
            )}
          </div>
          <Campo
            id={`pata-${i}`}
            etiqueta="Confianza que dio la calculadora (%)"
            valor={c}
            alCambiar={(v) => actualizar(i, v)}
            inputMode="decimal"
            placeholder="85"
          />
        </div>
      ))}

      {error && <Mensaje tono="peligro">{error}</Mensaje>}

      <Boton
        secundario
        alTocar={() => {
          setConfianzas((prev) => [...prev, ""]);
          setResultado(null);
        }}
      >
        Agregar otra pata
      </Boton>

      <Boton alTocar={() => void calcular()} cargando={cargando}>
        Calcular
      </Boton>

      <p className="suave" style={{ textAlign: "center", margin: 0 }}>
        Cuota {CUOTA_POR_DEFECTO} por pata, la de Star Sport.
      </p>
    </div>
  );
}
