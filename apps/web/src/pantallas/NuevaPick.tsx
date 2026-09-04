// Pick manual: cargar una apuesta a mano y guardarla.
//
// Lo normal es mandar la foto del ticket en Análisis y que la IA lo guarde.
// Esta pantalla existe para cuando eso falla o para corregir, y para poder
// ver la proyección al lado del pick antes de confirmar: si elegiste OVER y
// la calculadora dice UNDER, mejor enterarse antes de apostar que después.

import { useState } from "react";
import { proyectarPonches, SISTEMA_ACTUAL, type Nivel, type Proyeccion } from "../lib/calculadora";
import { repositorio } from "../lib/repositorio";
import { pickNuevoSchema } from "../lib/validators";
import { Barra, Boton, Campo, Encabezado, Insignia, Mensaje, Seccion, pct } from "../componentes/ui";

const NIVELES: readonly Nivel[] = ["DIAMANTE_ALTO", "DIAMANTE", "ORO_ALTO", "ORO", "IMPUREZA"];

const ETIQUETA_NIVEL: Record<Nivel, string> = {
  DIAMANTE_ALTO: "Diamante Alto",
  DIAMANTE: "Diamante",
  ORO_ALTO: "Oro Alto",
  ORO: "Oro",
  IMPUREZA: "Impureza",
};

// El nivel ya no son bandas de confianza sino de ganancia esperada por peso
// apostado. Antes decía "95-100%", y esas bandas venían del puntuador viejo,
// que declaraba 76-90%: con la calculadora nueva (50-79%) casi todo caía en
// IMPUREZA aunque fuera buen pick.
const RANGO_NIVEL: Record<Nivel, string> = {
  DIAMANTE_ALTO: "más de 30¢ por peso",
  DIAMANTE: "15-30¢ por peso",
  ORO_ALTO: "5-15¢ por peso",
  ORO: "hasta 5¢ por peso",
  IMPUREZA: "no le gana a la cuota",
};

export function NuevaPick() {
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [codigo, setCodigo] = useState("");
  const [pitcher, setPitcher] = useState("");
  const [equipo, setEquipo] = useState("");
  const [rival, setRival] = useState("");
  const [linea, setLinea] = useState("5.5");
  const [pick, setPick] = useState<"OVER" | "UNDER">("OVER");
  const [mano, setMano] = useState<"RHP" | "LHP">("RHP");
  const [confianza, setConfianza] = useState("");
  const [nivel, setNivel] = useState<Nivel>("ORO");

  const [opcionesAbiertas, setOpcionesAbiertas] = useState(false);
  const [calculando, setCalculando] = useState(false);
  const [proyeccion, setProyeccion] = useState<Proyeccion | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  async function calcular() {
    setError(null);
    setOk(null);
    if (!pitcher.trim() || !linea) {
      setError("Necesito al menos el lanzador y la línea.");
      return;
    }
    setCalculando(true);
    try {
      const r = await proyectarPonches({
        pitcher: pitcher.trim(),
        linea: parseFloat(linea.replace(",", ".")),
        rival: rival.trim() || undefined,
        manoPitcher: mano,
      });
      if (!r.encontrado) {
        setProyeccion(null);
        setError(r.mensaje);
        return;
      }
      setProyeccion(r);
      // La calculadora manda: se prellenan confianza, nivel y hasta el lado.
      // La que se guarda es la calibrada — la cruda solo sirve para auditar
      // cuánto la movió el historial del sistema.
      setConfianza((r.confianza_calibrada * 100).toFixed(0));
      setNivel(r.nivel);
      if (r.veredicto) setPick(r.veredicto);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCalculando(false);
    }
  }

  async function guardar() {
    setError(null);
    setOk(null);

    const validacion = pickNuevoSchema.safeParse({
      fecha,
      codigo: codigo || null,
      pitcher: proyeccion?.pitcher ?? pitcher,
      equipo,
      rival,
      linea: parseFloat(linea.replace(",", ".")),
      pick,
      confianza: parseFloat(confianza.replace(",", ".")) / 100,
      nivel,
      // Sale de estadísticas de temporada, no de contar salidas reales: por
      // definición del esquema eso es JUICIO, no CALCULADA.
      fuenteConfianza: "JUICIO",
      motivo: proyeccion
        ? `Proyección: ${proyeccion.k_proyectados} K esperados vs línea ${proyeccion.linea}. ${proyeccion.entradas_usadas.join(", ")}.`
        : null,
    });
    if (!validacion.success) {
      setError(validacion.error.issues[0]?.message ?? "Datos inválidos.");
      return;
    }

    setGuardando(true);
    try {
      const d = validacion.data;
      await repositorio.crear("picks", {
        fecha: d.fecha,
        codigo: d.codigo,
        pitcher: d.pitcher,
        equipo: d.equipo,
        rival: d.rival,
        linea: d.linea,
        pick: d.pick,
        confianza: d.confianza,
        nivel: d.nivel,
        fuente_confianza: d.fuenteConfianza,
        sistema: SISTEMA_ACTUAL,
        motivo: d.motivo,
      });
      setOk(`Pick de ${d.pitcher} guardado.`);
      setPitcher("");
      setEquipo("");
      setRival("");
      setCodigo("");
      setConfianza("");
      setProyeccion(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setGuardando(false);
    }
  }

  const ajuste = proyeccion?.ajuste_por_muestra;
  // Solo vale la pena mostrar el crudo si el ajuste lo movió de verdad.
  const ajusteMovioElKPct = ajuste?.k_pct_crudo != null && Math.abs(ajuste.k_pct_ajustado - ajuste.k_pct_crudo) >= 1;

  return (
    <div className="contenido">
      <Encabezado
        titulo="Pick manual"
        bajada="Para cuando querés cargarlo a mano. Lo normal es mandar la foto en Análisis."
      />

      <Seccion>El partido</Seccion>
      <div className="tarjeta">
        <Campo
          id="np-pitcher"
          etiqueta="Lanzador"
          valor={pitcher}
          alCambiar={setPitcher}
          placeholder="deGrom, T Rogers, Skenes…"
          autoComplete="off"
        />
        <div style={{ display: "flex", gap: 8 }}>
          <Campo
            id="np-equipo"
            etiqueta="Su equipo"
            valor={equipo}
            alCambiar={setEquipo}
            placeholder="TEX"
            autoCapitalize="characters"
          />
          <Campo
            id="np-rival"
            etiqueta="Rival"
            valor={rival}
            alCambiar={setRival}
            placeholder="CIN"
            autoCapitalize="characters"
          />
        </div>
        <div className="campo">
          <label id="np-mano-etiqueta">Mano del lanzador</label>
          <div className="opciones" role="group" aria-labelledby="np-mano-etiqueta">
            <button className="opcion acento" aria-pressed={mano === "RHP"} onClick={() => setMano("RHP")}>
              Derecho
            </button>
            <button className="opcion acento" aria-pressed={mano === "LHP"} onClick={() => setMano("LHP")}>
              Zurdo
            </button>
          </div>
        </div>
      </div>

      <Seccion>La apuesta</Seccion>
      <div className="tarjeta">
        <Campo
          id="np-linea"
          etiqueta="Línea de ponches"
          valor={linea}
          alCambiar={setLinea}
          inputMode="decimal"
          placeholder="6.5"
        />
        <div className="campo">
          <label id="np-lado-etiqueta">Lado</label>
          <div className="opciones" role="group" aria-labelledby="np-lado-etiqueta">
            <button className="opcion exito" aria-pressed={pick === "OVER"} onClick={() => setPick("OVER")}>
              OVER
            </button>
            <button
              className="opcion advertencia"
              aria-pressed={pick === "UNDER"}
              onClick={() => setPick("UNDER")}
            >
              UNDER
            </button>
          </div>
        </div>
      </div>

      <Boton secundario={!!proyeccion} alTocar={() => void calcular()} cargando={calculando}>
        {proyeccion ? "Recalcular" : "Calcular proyección"}
      </Boton>

      {error && <Mensaje tono="peligro">{error}</Mensaje>}

      {proyeccion && ajuste && (
        <div className="tarjeta elevada">
          <div style={{ textAlign: "center", padding: "6px 0" }}>
            <div style={{ fontSize: 40, fontWeight: 800, letterSpacing: -1 }}>{proyeccion.k_proyectados}</div>
            <div className="suave">ponches proyectados</div>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 10,
              padding: 10,
              background: "var(--fondo)",
              borderRadius: 12,
            }}
          >
            <strong className={proyeccion.veredicto === "OVER" ? "exito" : "advertencia"} style={{ fontSize: 20 }}>
              {proyeccion.veredicto ?? "SIN VENTAJA"}
            </strong>
            <span className="suave" style={{ fontSize: 15 }}>
              {pct(proyeccion.confianza, 0)}
            </span>
            <Insignia tono="acento">{ETIQUETA_NIVEL[proyeccion.nivel]}</Insignia>
          </div>

          {/* Las tres probabilidades: el empate importa en línea entera. */}
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <div className="fila">
              <span className="suave">Over</span>
              <span className="suave">{pct(proyeccion.prob_over, 0)}</span>
            </div>
            <Barra proporcion={proyeccion.prob_over} tono="exito" />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <div className="fila">
              <span className="suave">Under</span>
              <span className="suave">{pct(proyeccion.prob_under, 0)}</span>
            </div>
            <Barra proporcion={proyeccion.prob_under} tono="advertencia" />
          </div>
          {proyeccion.prob_empate > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              <div className="fila">
                <span className="suave">Empate (devuelven)</span>
                <span className="suave">{pct(proyeccion.prob_empate, 0)}</span>
              </div>
              <Barra proporcion={proyeccion.prob_empate} tono="acento" />
            </div>
          )}

          {/* Antes de las estadísticas: si contra la cuota conviene o no. Esa
              es la pregunta, no cuál es la probabilidad. */}
          {proyeccion.apuesta && (
            <div style={{ borderTop: "1px solid var(--borde)", paddingTop: 10, display: "flex", flexDirection: "column", gap: 4 }}>
              <div className="fila">
                <strong
                  className={
                    proyeccion.apuesta.veredicto === "CONVIENE"
                      ? "exito"
                      : proyeccion.apuesta.veredicto === "FLOJO"
                        ? "advertencia"
                        : "peligro"
                  }
                  style={{ fontSize: 17 }}
                >
                  {proyeccion.apuesta.veredicto}
                </strong>
                <span className="suave">
                  al {proyeccion.apuesta.cuota_americana} · pide {pct(proyeccion.apuesta.prob_de_equilibrio)}
                </span>
              </div>
              <p className="suave" style={{ margin: 0 }}>
                {proyeccion.apuesta.explicacion}
              </p>
            </div>
          )}

          {/* Se muestran los valores que la calculadora usó de verdad — los
              ajustados por muestra — porque enseñar el K% crudo al lado de una
              proyección hecha con otro número se lee como una contradicción. */}
          <p className="suave" style={{ margin: 0, whiteSpace: "pre-line" }}>
            {proyeccion.pitcher}
            {` · K% ${ajuste.k_pct_ajustado}`}
            {ajusteMovioElKPct ? ` (crudo ${ajuste.k_pct_crudo})` : ""}
            {` · WHIP ${ajuste.whip_ajustado}`}
            {` · ${ajuste.ip_por_salida_ajustado} IP por salida`}
            {proyeccion.rival ? `\nRival: ${proyeccion.fuente_k_rival}` : ""}
            {`\nMuestra: ${ajuste.bateadores_de_muestra} bateadores enfrentados`}
          </p>

          {proyeccion.advertencias.map((a, i) => (
            <Mensaje key={i} tono="advertencia">
              {a}
            </Mensaje>
          ))}

          {proyeccion.veredicto && proyeccion.veredicto !== pick && (
            <Mensaje tono="peligro">
              Elegiste {pick} pero la proyección favorece {proyeccion.veredicto}. Revisá antes de guardar.
            </Mensaje>
          )}
        </div>
      )}

      <Seccion>Guardar</Seccion>
      <div className="tarjeta">
        <Campo
          id="np-confianza"
          etiqueta="Confianza final (%)"
          valor={confianza}
          alCambiar={setConfianza}
          inputMode="decimal"
          placeholder="82"
        />
        <p className="suave" style={{ margin: 0 }}>
          {proyeccion
            ? "Viene de la calculadora. Podés ajustarla si sabés algo que ella no (lineup, lesión, clima)."
            : "Calculá primero para que se llene sola, o ponela a mano."}
        </p>

        <div className="campo">
          <label id="np-nivel-etiqueta">Nivel</label>
          <p className="suave" style={{ margin: 0 }}>
            Va con la ganancia esperada, no con la confianza: {RANGO_NIVEL[nivel]} = {ETIQUETA_NIVEL[nivel]}.
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 4 }} role="group" aria-labelledby="np-nivel-etiqueta">
            {NIVELES.map((n) => (
              <button key={n} className="chip" aria-pressed={nivel === n} onClick={() => setNivel(n)}>
                {ETIQUETA_NIVEL[n]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Fecha y código casi nunca se tocan: no merecen espacio permanente. */}
      {opcionesAbiertas ? (
        <div className="tarjeta">
          <div className="fila">
            <strong style={{ fontSize: 14 }}>Opcional</strong>
            <button className="enlace apagado" onClick={() => setOpcionesAbiertas(false)}>
              Ocultar
            </button>
          </div>
          <Campo id="np-fecha" etiqueta="Fecha" valor={fecha} alCambiar={setFecha} placeholder="2026-08-27" />
          <Campo id="np-codigo" etiqueta="Código del ticket" valor={codigo} alCambiar={setCodigo} placeholder="Star Sport" />
        </div>
      ) : (
        <button className="enlace apagado" onClick={() => setOpcionesAbiertas(true)}>
          Fecha y código del ticket
        </button>
      )}

      {ok && <Mensaje tono="exito">{ok}</Mensaje>}

      <Boton alTocar={() => void guardar()} cargando={guardando}>
        Guardar pick
      </Boton>
    </div>
  );
}
