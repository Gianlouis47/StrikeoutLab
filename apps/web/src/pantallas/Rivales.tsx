// Rivales: qué tanto se poncha cada equipo bateando.
//
// Después del lanzador, este es el dato que más mueve una proyección. Un
// equipo que se poncha 26% del tiempo y uno que se poncha 19% cambian el lado
// de la apuesta con el mismo abridor y la misma línea.
//
// La barra se escala contra el rango real de la liga, no contra 0-100%. Con
// escala absoluta todos los equipos darían barras casi idénticas — la
// diferencia entre el primero y el último es de unos siete puntos — y la
// pantalla no diría nada.

import { useCallback, useEffect, useMemo, useState } from "react";
import { compararRivales } from "@strikeoutlab/core";
import { repositorio } from "../lib/repositorio";
import { equipoTeamKSchema } from "../lib/validators";
import { Barra, Boton, Campo, Encabezado, Insignia, Mensaje, Metrica, Seccion, Vacio, pct } from "../componentes/ui";

type Ventana = "TEMPORADA" | "ULTIMOS_14";

const ETIQUETA: Record<Ventana, string> = {
  TEMPORADA: "Temporada",
  ULTIMOS_14: "Últimos 14",
};

interface FilaTeamK {
  id: string;
  equipo: string;
  k: number;
  pa: number;
}

export function Rivales() {
  const [ventana, setVentana] = useState<Ventana>("TEMPORADA");
  const [ranking, setRanking] = useState<ReturnType<typeof compararRivales>>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [formAbierto, setFormAbierto] = useState(false);
  const [equipo, setEquipo] = useState("");
  const [k, setK] = useState("");
  const [pa, setPa] = useState("");
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async (v: Ventana) => {
    setCargando(true);
    setError(null);
    try {
      const filas = await repositorio.listar<FilaTeamK>("team_k", {
        seleccionar: "id, equipo, k, pa",
        filtro: { ventana: v },
      });
      setRanking(compararRivales(filas));
    } catch (e) {
      setError((e as Error).message);
    }
    setCargando(false);
  }, []);

  useEffect(() => {
    void cargar(ventana);
  }, [ventana, cargar]);

  // El promedio da la referencia: sin él, un 24% no dice si es mucho o poco.
  const { promedio, maximo, minimo } = useMemo(() => {
    if (ranking.length === 0) return { promedio: 0, maximo: 0, minimo: 0 };
    const tasas = ranking.map((r) => r.kRate);
    const totalK = ranking.reduce((a, r) => a + r.k, 0);
    const totalPa = ranking.reduce((a, r) => a + r.pa, 0);
    return {
      promedio: totalPa > 0 ? totalK / totalPa : 0,
      maximo: Math.max(...tasas),
      minimo: Math.min(...tasas),
    };
  }, [ranking]);

  async function guardarEquipo() {
    const validacion = equipoTeamKSchema.safeParse({
      equipo: equipo.trim().toUpperCase(),
      ventana,
      k: parseInt(k, 10),
      pa: parseInt(pa, 10),
      fechaCorte: new Date().toISOString().slice(0, 10),
    });
    if (!validacion.success) {
      setError(validacion.error.issues[0]?.message ?? "Datos inválidos.");
      return;
    }

    setGuardando(true);
    try {
      const d = validacion.data;
      await repositorio.upsert(
        "team_k",
        { equipo: d.equipo, ventana: d.ventana, k: d.k, pa: d.pa, fecha_corte: d.fechaCorte },
        "equipo,ventana,fecha_corte",
      );
    } catch (e) {
      setError((e as Error).message);
      setGuardando(false);
      return;
    }
    setGuardando(false);
    setEquipo("");
    setK("");
    setPa("");
    setFormAbierto(false);
    void cargar(ventana);
  }

  return (
    <div className="contenido">
      <Encabezado
        titulo="Rivales"
        bajada="Qué tanto se poncha cada equipo bateando. Arriba = mejor para jugar Over."
      />

      <div className="chips">
        {(Object.keys(ETIQUETA) as Ventana[]).map((v) => (
          <button key={v} className="chip" aria-pressed={ventana === v} onClick={() => setVentana(v)}>
            {ETIQUETA[v]}
          </button>
        ))}
      </div>

      {error && <Mensaje tono="peligro">{error}</Mensaje>}

      {cargando && ranking.length === 0 && (
        <div style={{ padding: 24, textAlign: "center" }}>
          <span className="cargando" />
        </div>
      )}

      {ranking.length > 0 && (
        <div className="metricas">
          <Metrica valor={pct(maximo)} etiqueta="el que más se poncha" tono="exito" />
          <Metrica valor={pct(promedio)} etiqueta="promedio de liga" />
          <Metrica valor={pct(minimo)} etiqueta="el que menos" tono="peligro" />
        </div>
      )}

      {!cargando && ranking.length === 0 && !error && (
        <Vacio
          titulo={`Sin datos de ${ETIQUETA[ventana]}`}
          descripcion="Los equipos se cargan solos desde MLB. Si esto sigue vacío, agregá uno a mano."
          accion={{ texto: "Agregar a mano", alTocar: () => setFormAbierto(true) }}
        />
      )}

      {ranking.length > 0 && (
        <Seccion>
          {ranking.length} equipos · {ETIQUETA[ventana]}
        </Seccion>
      )}

      <div className="grilla">
      {ranking.map((r, i) => {
        const sobrePromedio = r.kRate > promedio;
        const rango = maximo - minimo;
        const proporcion = rango > 0 ? (r.kRate - minimo) / rango : 0.5;
        return (
          <div key={`${r.equipo}-${i}`} className={`tarjeta ${i < 3 ? "elevada" : ""}`}>
            <div className="fila">
              <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span className={i < 3 ? "acento" : "suave"} style={{ fontWeight: 700, width: 22 }}>
                  {i + 1}
                </span>
                <strong style={{ fontSize: 17 }}>{r.equipo}</strong>
              </span>
              <span style={{ textAlign: "right" }}>
                <strong style={{ fontSize: 17 }}>{pct(r.kRate)}</strong>
                <br />
                <span className="suave" style={{ fontSize: 11 }}>
                  {r.k} K / {r.pa} PA
                </span>
              </span>
            </div>

            <Barra proporcion={proporcion} tono={sobrePromedio ? "exito" : "peligro"} />

            <div className="fila">
              <Insignia tono={sobrePromedio ? "exito" : "peligro"}>
                {sobrePromedio ? "favorece Over" : "favorece Under"}
              </Insignia>
              <span className="suave" style={{ fontSize: 11 }}>
                {sobrePromedio ? "+" : ""}
                {((r.kRate - promedio) * 100).toFixed(1)} pts vs promedio
              </span>
            </div>
          </div>
        );
      })}
      </div>

      {!formAbierto ? (
        <Boton secundario alTocar={() => setFormAbierto(true)}>
          Corregir un equipo a mano
        </Boton>
      ) : (
        <div className="tarjeta">
          <div className="fila">
            <strong>Corregir a mano</strong>
            <button className="enlace apagado" onClick={() => setFormAbierto(false)}>
              Cerrar
            </button>
          </div>
          <p className="suave" style={{ margin: 0 }}>
            Solo hace falta si un dato quedó mal. Se guarda en la ventana {ETIQUETA[ventana]} y pisa la fila de hoy,
            no agrega una segunda.
          </p>
          <Campo
            id="rival-equipo"
            etiqueta="Equipo"
            valor={equipo}
            alCambiar={setEquipo}
            placeholder="NYY"
            autoCapitalize="characters"
          />
          <div style={{ display: "flex", gap: 8 }}>
            <Campo id="rival-k" etiqueta="K total" valor={k} alCambiar={setK} inputMode="numeric" />
            <Campo id="rival-pa" etiqueta="PA" valor={pa} alCambiar={setPa} inputMode="numeric" />
          </div>
          <Boton alTocar={() => void guardarEquipo()} cargando={guardando}>
            Guardar
          </Boton>
        </div>
      )}
    </div>
  );
}
