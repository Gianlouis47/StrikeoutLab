// Calibración: qué tan bien predicen tus confianzas lo que después pasa.
//
// Es la pantalla incómoda, y por eso está. Decir "85%" y acertar el 60% no es
// mala suerte: es que el número está inflado. Acá se ve la distancia entre lo
// que el sistema declaró y lo que la realidad devolvió, banda por banda.
//
// El cálculo es de `@strikeoutlab/core` — el mismo paquete que corre en los
// tests — y no de la base, porque son cuentas sobre filas que ya se trajeron:
// bucketear, contar y dividir. No hay modelo acá, y por eso se puede probar
// sin base de datos.

import { useCallback, useEffect, useState } from "react";
import { reporteCalibracion, resumenEconomico, type PickCalibracion, type PickEconomico } from "@strikeoutlab/core";
import { repositorio } from "../lib/repositorio";
import { Barra, Encabezado, Insignia, Mensaje, Metrica, Seccion, Vacio, num, pct } from "../componentes/ui";

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

export function Calibracion() {
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

    const paraCalibracion: PickCalibracion[] = filas.map((f) => ({
      confianza: f.confianza,
      resultado: f.resultado,
      fuenteConfianza: f.fuente_confianza,
    }));
    const paraEconomico: PickEconomico[] = filas.map((f) => ({
      resultado: f.resultado,
      nivel: f.nivel,
      ticketId: f.ticket_id,
      stake: f.stake,
      payout: f.payout,
    }));

    setBandas(reporteCalibracion(paraCalibracion).filter((b) => b.fuenteConfianza === "TODAS"));
    setEconomico(resumenEconomico(paraEconomico));
    setCargando(false);
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

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
    <div className="contenido">
      <Encabezado titulo="Calibración" bajada="Qué tan bien predicen tus confianzas lo que después pasa." />

      {error && <Mensaje tono="peligro">{error}</Mensaje>}

      {cargando && bandas.length === 0 && (
        <div style={{ padding: 24, textAlign: "center" }}>
          <span className="cargando" />
        </div>
      )}

      {decididas > 0 && (
        <div className="metricas">
          {/* 56.52% y no 50%: al -130 esa es la línea entre ganar y perder
              plata, así que es contra eso que se pinta verde o no. */}
          <Metrica
            valor={pct(aciertoGlobal, 0)}
            etiqueta="acierto real"
            tono={aciertoGlobal !== null && aciertoGlobal >= 0.5652 ? "exito" : "peligro"}
          />
          <Metrica valor={`${totales.ganadas}-${totales.perdidas}`} etiqueta="ganadas-perdidas" />
          {economico?.neto != null && (
            <Metrica
              valor={economico.neto >= 0 ? `+${num(economico.neto, 0)}` : num(economico.neto, 0)}
              etiqueta="neto"
              tono={economico.neto >= 0 ? "exito" : "peligro"}
            />
          )}
        </div>
      )}

      {!error && !cargando && bandas.length === 0 && (
        <Vacio
          titulo="Todavía no hay nada que calibrar"
          descripcion="Cuando tengas picks con resultado cargado, acá vas a ver si tus confianzas se sostienen o si te estás pasando de optimista. Los resultados se anotan en Historial."
        />
      )}

      {bandas.length > 0 && <Seccion>Por banda de confianza</Seccion>}

      {bandas.map((b) => {
        const sobreconfiado = b.diferencia !== null && b.diferencia > 0.05;
        const bien = b.diferencia !== null && Math.abs(b.diferencia) <= 0.05;
        return (
          <div key={b.banda} className={`tarjeta ${bien && !b.muestraInsuficiente ? "elevada" : ""}`}>
            <div className="fila">
              <strong style={{ fontSize: 17 }}>{b.banda}</strong>
              {b.muestraInsuficiente ? (
                <Insignia tono="advertencia">
                  solo {b.cantidad} {b.cantidad === 1 ? "pick" : "picks"}
                </Insignia>
              ) : b.diferencia !== null ? (
                <Insignia tono={bien ? "exito" : sobreconfiado ? "peligro" : "acento"}>
                  {bien
                    ? "bien calibrado"
                    : `${b.diferencia > 0 ? "sobreconfiado" : "subconfiado"} ${(Math.abs(b.diferencia) * 100).toFixed(0)} pts`}
                </Insignia>
              ) : null}
            </div>

            {/* Las dos barras una arriba de la otra: el desfase se ve sin
                restar dos porcentajes de cabeza. */}
            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              <div className="fila">
                <span className="suave">Dijiste que ganarías</span>
                <span className="suave" style={{ fontWeight: 600 }}>
                  {pct(b.confianzaPromedio, 0)}
                </span>
              </div>
              <Barra proporcion={b.confianzaPromedio} tono="acento" />
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              <div className="fila">
                <span style={{ fontSize: 12 }}>Ganaste de verdad</span>
                <strong style={{ fontSize: 12 }}>{b.tasaReal !== null ? pct(b.tasaReal, 0) : "sin decidir"}</strong>
              </div>
              <Barra
                proporcion={b.tasaReal ?? 0}
                tono={bien ? "exito" : sobreconfiado ? "peligro" : "advertencia"}
              />
            </div>

            <span className="suave">
              {b.cantidad} {b.cantidad === 1 ? "pick" : "picks"} · {b.ganadas}G / {b.perdidas}P
              {b.empates > 0 ? ` / ${b.empates}E` : ""}
            </span>
          </div>
        );
      })}

      {economico && economico.totalPicksResueltos > 0 && (
        <>
          <Seccion>Dinero</Seccion>
          <div className="tarjeta">
            {economico.totalApostado !== null ? (
              <>
                <div className="fila">
                  <span className="suave">Apostado</span>
                  <span>{num(economico.totalApostado)}</span>
                </div>
                <div className="fila">
                  <span className="suave">Cobrado</span>
                  <span>{num(economico.totalCobrado)}</span>
                </div>
                <div style={{ height: 1, background: "var(--borde)" }} />
                <div className="fila">
                  <span className="suave">Neto</span>
                  <strong className={economico.neto! >= 0 ? "exito" : "peligro"}>
                    {economico.neto! >= 0 ? `+${num(economico.neto)}` : num(economico.neto)}
                  </strong>
                </div>
              </>
            ) : (
              <Mensaje tono="acento">{economico.advertencia ?? "Sin datos de stake ni payout."}</Mensaje>
            )}
          </div>

          <Seccion>Por nivel de pureza</Seccion>
          <div className="tarjeta">
            {Object.entries(economico.porNivel).map(([nivel, datos]) => {
              const decid = datos.ganadas + datos.perdidas;
              const tasa = decid > 0 ? datos.ganadas / decid : null;
              return (
                <div key={nivel} style={{ display: "flex", flexDirection: "column", gap: 5, paddingBottom: 6 }}>
                  <div className="fila">
                    <Insignia tono="acento">{nivel.replace("_", " ")}</Insignia>
                    <strong style={{ fontSize: 13 }}>{pct(tasa, 0)}</strong>
                  </div>
                  {tasa !== null && <Barra proporcion={tasa} tono={tasa >= 0.5652 ? "exito" : "peligro"} />}
                  <span className="suave" style={{ fontSize: 11 }}>
                    {datos.cantidad} {datos.cantidad === 1 ? "pick" : "picks"} · {datos.ganadas}G /{" "}
                    {datos.perdidas}P{datos.empates > 0 ? ` / ${datos.empates}E` : ""}
                  </span>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
