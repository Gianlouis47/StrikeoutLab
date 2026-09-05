// Historial: los picks que se jugaron y cómo salieron.
//
// La parte que importa no es la lista sino el campo de "anotar resultado": un
// pick sin resultado no calibra nada. Toda la pantalla de Calibración, el
// factor que comprime las confianzas y el veredicto del parlay salen de estos
// números. Si acá no se carga el resultado, el sistema sigue creyéndose sus
// propias confianzas para siempre.

import { useCallback, useEffect, useMemo, useState } from "react";
import { repositorio } from "../lib/repositorio";
import { resultadoPickSchema } from "../lib/validators";
import { Boton, Campo, Encabezado, Insignia, Mensaje, Metrica, Seccion, Vacio, fechaCorta, pct } from "../componentes/ui";

interface FilaPick {
  id: string;
  fecha: string;
  pitcher: string;
  equipo: string;
  rival: string;
  linea: number;
  pick: "OVER" | "UNDER";
  confianza: number;
  nivel: string;
  fuente_confianza: "CALCULADA" | "JUICIO";
  resultado_k: number | null;
  resultado: "GANO" | "PERDIO" | "EMPATE" | null;
}

const ICONO: Record<string, string> = { GANO: "✓", PERDIO: "✕", EMPATE: "=" };
const TONO: Record<string, "exito" | "peligro" | "advertencia"> = {
  GANO: "exito",
  PERDIO: "peligro",
  EMPATE: "advertencia",
};

export function Historial() {
  const [picks, setPicks] = useState<FilaPick[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editando, setEditando] = useState<string | null>(null);
  const [kIngresado, setKIngresado] = useState("");
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      setPicks(
        await repositorio.listar<FilaPick>("picks", {
          seleccionar:
            "id, fecha, pitcher, equipo, rival, linea, pick, confianza, nivel, fuente_confianza, resultado_k, resultado",
          ordenarPor: "fecha",
          ascendente: false,
          limite: 100,
        }),
      );
    } catch (e) {
      setError((e as Error).message);
    }
    setCargando(false);
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const resumen = useMemo(() => {
    const resueltos = picks.filter((p) => p.resultado !== null);
    const ganadas = resueltos.filter((p) => p.resultado === "GANO").length;
    const perdidas = resueltos.filter((p) => p.resultado === "PERDIO").length;
    const decididas = ganadas + perdidas;
    return {
      ganadas,
      perdidas,
      pendientes: picks.length - resueltos.length,
      tasa: decididas > 0 ? ganadas / decididas : null,
    };
  }, [picks]);

  async function guardarResultado(id: string) {
    const validacion = resultadoPickSchema.safeParse({ resultadoK: parseInt(kIngresado, 10) });
    if (!validacion.success) {
      setError(validacion.error.issues[0]?.message ?? "Ponches inválidos.");
      return;
    }
    setGuardando(true);
    try {
      // Solo se manda `resultado_k`. Si GANO o PERDIO lo decidiera el
      // navegador, un pick UNDER 6.5 con 6 K podría quedar guardado como
      // perdido por un `>=` mal escrito acá. Lo resuelve la base, que es donde
      // vive la regla, y de paso el empate en línea entera sale bien solo.
      await repositorio.actualizar("picks", id, { resultado_k: validacion.data.resultadoK });
    } catch (e) {
      setError((e as Error).message);
      setGuardando(false);
      return;
    }
    setGuardando(false);
    setEditando(null);
    setKIngresado("");
    void cargar();
  }

  return (
    <div className="contenido">
      <Encabezado titulo="Historial" bajada="Tus picks. Tocá uno pendiente para anotar cuántos ponches sacó." />

      {error && <Mensaje tono="peligro">{error}</Mensaje>}

      {picks.length > 0 && (
        <div className="metricas">
          {/* Verde o rojo contra 56.52%, no contra 50%: al -130 ese es el
              punto donde se empieza a ganar plata, y pintar de blanco un 52%
              lo haría parecer neutral cuando es perder. */}
          <Metrica
            valor={pct(resumen.tasa, 0)}
            etiqueta="acierto"
            tono={resumen.tasa === null ? "neutral" : resumen.tasa >= 0.5652 ? "exito" : "peligro"}
          />
          <Metrica valor={`${resumen.ganadas}-${resumen.perdidas}`} etiqueta="ganadas-perdidas" />
          <Metrica
            valor={String(resumen.pendientes)}
            etiqueta="sin resultado"
            tono={resumen.pendientes > 0 ? "acento" : "neutral"}
          />
        </div>
      )}

      {cargando && picks.length === 0 && (
        <div style={{ padding: 24, textAlign: "center" }}>
          <span className="cargando" />
        </div>
      )}

      {!cargando && picks.length === 0 && !error && (
        <Vacio
          titulo="Todavía no hay picks"
          descripcion="Andá a Análisis, mandá la foto de un ticket y pedile que lo guarde. O cargá uno a mano en Pick manual."
        />
      )}

      {picks.length > 0 && <Seccion>Todos los picks</Seccion>}

      <div className="grilla">
      {picks.map((p) => {
        const abierto = editando === p.id;
        return (
          <div key={p.id} className={`tarjeta ${abierto ? "elevada" : ""}`}>
            <div className="fila">
              <span style={{ flex: 1, minWidth: 0 }}>
                <strong style={{ fontSize: 16 }}>{p.pitcher}</strong>
                <br />
                <span className="suave">
                  {fechaCorta(p.fecha)} · {p.equipo} vs {p.rival}
                </span>
              </span>

              {p.resultado ? (
                <span style={{ textAlign: "right" }}>
                  <strong className={TONO[p.resultado]} style={{ fontSize: 13 }}>
                    <span aria-hidden="true">{ICONO[p.resultado]}</span> {p.resultado}
                  </strong>
                  <br />
                  <span className="suave" style={{ fontSize: 11 }}>
                    {p.resultado_k} K reales
                  </span>
                </span>
              ) : (
                <Insignia tono="acento">pendiente</Insignia>
              )}
            </div>

            {/* La apuesta en sí, destacada sobre el fondo: es lo que se busca
                al recorrer la lista. */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                background: "var(--fondo)",
                borderRadius: 10,
                padding: "8px 12px",
              }}
            >
              <strong className={p.pick === "OVER" ? "exito" : "advertencia"} style={{ fontSize: 14 }}>
                {p.pick}
              </strong>
              <strong style={{ fontSize: 15 }}>{p.linea}</strong>
              <span style={{ flex: 1 }} />
              <span className="suave">{pct(p.confianza, 0)} conf.</span>
            </div>

            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <Insignia tono="acento">{p.nivel.replace("_", " ")}</Insignia>
              <Insignia>{p.fuente_confianza}</Insignia>
            </div>

            {p.resultado_k === null &&
              (abierto ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <Campo
                    id={`k-${p.id}`}
                    etiqueta="¿Cuántos ponches sacó?"
                    valor={kIngresado}
                    alCambiar={setKIngresado}
                    inputMode="numeric"
                    placeholder="0"
                    autoFocus
                  />
                  <div style={{ display: "flex", gap: 8 }}>
                    <Boton alTocar={() => void guardarResultado(p.id)} cargando={guardando}>
                      Guardar
                    </Boton>
                    <Boton
                      secundario
                      alTocar={() => {
                        setEditando(null);
                        setKIngresado("");
                      }}
                    >
                      Cancelar
                    </Boton>
                  </div>
                </div>
              ) : (
                <button
                  className="enlace"
                  onClick={() => {
                    setEditando(p.id);
                    setKIngresado("");
                  }}
                >
                  + Anotar resultado
                </button>
              ))}
          </div>
        );
      })}
      </div>

      {picks.length > 0 && (
        <button className="enlace apagado" onClick={() => void cargar()}>
          Actualizar
        </button>
      )}
    </div>
  );
}
