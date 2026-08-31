// Buscar Lanzador: la pantalla que hacen Linemate, Props.Cash y Outlier —
// con la parte que a todas les falta.
//
// Ellas muestran barritas verdes y rojas y arriba un porcentaje grande: "7 de
// 10 (70%)". Ese número es CONTAR lo que ya pasó. No sabe contra quién lanza
// hoy, no corrige por muestra chica, y sobre todo no sabe que la casa cobra:
// al -130 hay que acertar 56.5% solo para no perder plata, así que un 70%
// histórico puede ser una apuesta perdedora y un 58% puede ser buena.
//
// Acá van las dos cosas, una al lado de la otra y etiquetadas por lo que son:
//
//   ARRIBA   la probabilidad de verdad — Poisson sobre los bateadores que va
//            a enfrentar, con el K% del rival, regresión a la media y la
//            calibración del sistema. Con su veredicto contra la cuota real.
//
//   ABAJO    el historial, con sus filtros y sus barras. Contexto: sirve para
//            ver rachas, si el rival lo domina, o si un juego enorme le está
//            inflando el promedio. No es una probabilidad y se dice así.
//
// Los dos números salen de Postgres, no del teléfono: es el mismo código que
// usa la IA en el chat, así que la pantalla y el chat no pueden contradecirse.

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { GraficoSalidas, type SalidaHistorica } from "../components/GraficoSalidas";
import {
  Insignia,
  Mensaje,
  Metrica,
  Seccion,
  Subtitulo,
  Tarjeta,
  Titulo,
  colores,
  estilos,
} from "../components/ui";
import { repositorio } from "../lib/supabase-repository";

const CUOTA_STAR_SPORT = -130;

type Ventana = "TEMPORADA" | "ULTIMAS_10" | "ULTIMAS_5" | "CASA" | "VISITA" | "H2H";

const VENTANAS: ReadonlyArray<{ id: Ventana; titulo: string }> = [
  { id: "TEMPORADA", titulo: "Temporada" },
  { id: "ULTIMAS_10", titulo: "Últimas 10" },
  { id: "ULTIMAS_5", titulo: "Últimas 5" },
  { id: "CASA", titulo: "En casa" },
  { id: "VISITA", titulo: "De visita" },
  { id: "H2H", titulo: "Vs. rival" },
];

const LINEAS_COMUNES = [4.5, 5.5, 6.5, 7.5];

interface Candidato {
  pitcher: string;
  certeza: number;
  equipo: string | null;
  mano: string | null;
  k_pct: number | null;
  salidas: number | null;
  es_abridor: boolean | null;
}

interface Destacado {
  pitcher: string;
  equipo: string | null;
  mano: string | null;
  k_pct: number | null;
  salidas: number | null;
  k_por_salida: number | null;
}

interface Historial {
  encontrado: boolean;
  pitcher?: string;
  equipo?: string | null;
  cantidad?: number;
  salidas?: SalidaHistorica[];
  k_promedio?: number | null;
  k_mediana?: number | null;
  k_maximo?: number | null;
  k_minimo?: number | null;
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
  rival?: string | null;
  mano_pitcher?: string | null;
  k_proyectados?: number | null;
  bateadores_esperados?: number | null;
  prob_over?: number | null;
  prob_under?: number | null;
  prob_empate?: number | null;
  veredicto?: string | null;
  nivel?: string | null;
  confianza_calibrada?: number | null;
  fuente_k_rival?: string | null;
  supuestos?: string[];
  advertencias?: string[];
  mensaje?: string;
  apuesta?: {
    veredicto?: string;
    explicacion?: string;
    valor_esperado?: number;
    retorno_pct?: number;
    prob_de_equilibrio?: number;
    apuesta_recomendada_pct?: number;
  };
}

/** "0.6190" -> "61.9%". Null se muestra como raya, no como "0%". */
function pct(v: number | null | undefined, decimales = 1): string {
  if (v === null || v === undefined) return "—";
  return `${(Number(v) * 100).toFixed(decimales)}%`;
}

function num(v: number | null | undefined, decimales = 2): string {
  if (v === null || v === undefined) return "—";
  return Number(v).toFixed(decimales);
}

function Chip({
  texto,
  activo,
  onPress,
}: {
  texto: string;
  activo: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={[estilos.chip, activo && estilos.chipActivo]}>
      <Text style={[estilos.chipTexto, activo && estilos.chipTextoActivo, { fontSize: 13 }]}>{texto}</Text>
    </Pressable>
  );
}

export default function BuscarLanzadorScreen() {
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

  // Mientras se borra el campo para escribir otra línea, queda vacío o a medio
  // escribir ("6."). Se trata como "todavía no hay línea" en vez de mandar un
  // NaN a la base: la proyección se apaga un instante y vuelve.
  const lineaNumero = useMemo(() => {
    const v = Number(linea.replace(",", "."));
    return Number.isFinite(v) && v > 0 ? v : null;
  }, [linea]);

  // Lo que llena la pantalla antes de escribir nada: una pantalla de búsqueda
  // en blanco obliga a saber a quién buscar.
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
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (temporizador.current) clearTimeout(temporizador.current);
    const consulta = texto.trim();
    if (consulta.length < 2) {
      setCandidatos([]);
      return;
    }
    temporizador.current = setTimeout(() => {
      repositorio
        .llamar<Candidato[]>("buscar_pitcher", { texto_busqueda: consulta })
        .then(setCandidatos)
        .catch((e: Error) => setError(e.message));
    }, 250);
    return () => {
      if (temporizador.current) clearTimeout(temporizador.current);
    };
  }, [texto]);

  const consultar = useCallback(
    async (quien: Candidato, l: number | null, v: Ventana, r: string | null) => {
      setCargando(true);
      setError(null);
      try {
        // Las dos van juntas: son independientes y esperarlas en fila
        // duplicaría el tiempo en blanco de la pantalla.
        const [h, p] = await Promise.all([
          repositorio.llamar<Historial>("historial_lanzador", {
            p_pitcher: quien.pitcher,
            p_linea: l,
            p_ventana: v,
            p_rival: r,
          }),
          l === null
            ? Promise.resolve(null)
            : repositorio.llamar<Proyeccion>("proyectar_ponches", {
                p_pitcher: quien.pitcher,
                p_linea: l,
                p_rival: r,
                p_mano: null,
                p_ventana_rival: "TEMPORADA",
                p_cuota: CUOTA_STAR_SPORT,
                p_sistema: "PROYECCION",
              }),
        ]);
        setHistorial(h);
        setProyeccion(p);
      } catch (e) {
        setError((e as Error).message);
      }
      setCargando(false);
    },
    [],
  );

  useEffect(() => {
    if (!elegido) return;
    consultar(elegido, lineaNumero, ventana, rival);
  }, [elegido, lineaNumero, ventana, rival, consultar]);

  function elegir(pitcher: string, datos?: Partial<Candidato>) {
    setElegido({
      pitcher,
      certeza: 100,
      equipo: datos?.equipo ?? null,
      mano: datos?.mano ?? null,
      k_pct: datos?.k_pct ?? null,
      salidas: datos?.salidas ?? null,
      es_abridor: datos?.es_abridor ?? null,
    });
    setTexto("");
    setCandidatos([]);
  }

  const salidas = historial?.salidas ?? [];
  const decididas = (historial?.veces_over ?? 0) + (historial?.veces_under ?? 0);

  // El veredicto de la apuesta manda sobre el del modelo: uno dice hacia dónde
  // se inclina, el otro si eso alcanza para ganarle a la cuota. Solo el
  // segundo se juega con plata.
  const conviene = proyeccion?.apuesta?.veredicto === "CONVIENE";

  return (
    <View style={estilos.pantalla}>
      <ScrollView contentContainerStyle={estilos.contenido} keyboardShouldPersistTaps="handled">
        <View>
          <Titulo>Buscar lanzador</Titulo>
          <Subtitulo>La probabilidad real arriba, el historial con filtros abajo.</Subtitulo>
        </View>

        <View style={estilos.campoContenedor}>
          <Text style={estilos.etiqueta}>Lanzador</Text>
          <TextInput
            value={texto}
            onChangeText={setTexto}
            placeholder="Skubal, T Skubal, Tarik Skubal…"
            placeholderTextColor={colores.textoSuave}
            autoCapitalize="words"
            autoCorrect={false}
            style={estilos.input}
          />
        </View>

        {candidatos.length > 0 && (
          <Tarjeta>
            {candidatos.map((c) => (
              <Pressable
                key={c.pitcher}
                onPress={() => elegir(c.pitcher, c)}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  paddingVertical: 9,
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colores.texto, fontWeight: "700", fontSize: 15 }}>{c.pitcher}</Text>
                  <Text style={{ color: colores.textoSuave, fontSize: 12 }}>
                    {[c.equipo, c.mano, c.salidas ? `${c.salidas} salidas` : null].filter(Boolean).join(" · ")}
                  </Text>
                </View>
                {c.k_pct !== null && (
                  <Text style={{ color: colores.acento, fontWeight: "700", fontSize: 14 }}>
                    {Number(c.k_pct).toFixed(1)}% K
                  </Text>
                )}
              </Pressable>
            ))}
          </Tarjeta>
        )}

        {!elegido && candidatos.length === 0 && destacados.length > 0 && (
          <View style={{ gap: 8 }}>
            <Seccion titulo="Los que más ponchan" />
            <Text style={{ color: colores.textoSuave, fontSize: 12, marginTop: -4 }}>
              Abridores con 10 salidas o más, ordenados por K%. Es por donde se empieza a buscar un Over.
            </Text>
            {destacados.map((d, i) => (
              <Pressable key={d.pitcher} onPress={() => elegir(d.pitcher, d)}>
                <Tarjeta elevada={i < 3}>
                  <View style={estilos.filaEntreEspacio}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}>
                      <Text
                        style={{
                          color: i < 3 ? colores.acento : colores.textoSuave,
                          fontWeight: "700",
                          fontSize: 13,
                          width: 20,
                        }}
                      >
                        {i + 1}
                      </Text>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: colores.texto, fontWeight: "700", fontSize: 15 }}>{d.pitcher}</Text>
                        <Text style={{ color: colores.textoSuave, fontSize: 12 }}>
                          {[d.equipo, d.mano].filter(Boolean).join(" · ")}
                        </Text>
                      </View>
                    </View>
                    <View style={{ alignItems: "flex-end" }}>
                      <Text style={{ color: colores.texto, fontWeight: "700", fontSize: 15 }}>
                        {num(d.k_pct, 1)}% K
                      </Text>
                      <Text style={{ color: colores.textoSuave, fontSize: 11 }}>
                        {num(d.k_por_salida, 2)} K por salida
                      </Text>
                    </View>
                  </View>
                </Tarjeta>
              </Pressable>
            ))}
          </View>
        )}

        {error && <Mensaje tipo="error" texto={error} />}

        {elegido && (
          <>
            <Tarjeta elevada>
              <View style={estilos.filaEntreEspacio}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colores.texto, fontWeight: "800", fontSize: 20 }}>
                    {historial?.pitcher ?? elegido.pitcher}
                  </Text>
                  <Text style={{ color: colores.textoSuave, fontSize: 13 }}>
                    {[
                      proyeccion?.equipo ?? historial?.equipo ?? elegido.equipo,
                      proyeccion?.mano_pitcher ?? elegido.mano,
                      elegido.es_abridor === false ? "relevista" : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </Text>
                </View>
                <Pressable
                  onPress={() => {
                    setElegido(null);
                    setHistorial(null);
                    setProyeccion(null);
                    setRival(null);
                    setVentana("TEMPORADA");
                  }}
                  hitSlop={10}
                >
                  <Text style={{ color: colores.acento, fontSize: 13 }}>Cambiar</Text>
                </Pressable>
              </View>
            </Tarjeta>

            {/* ---------- Línea ---------- */}
            <View style={{ gap: 8 }}>
              <Seccion titulo="Línea de la casa" />
              <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
                {LINEAS_COMUNES.map((l) => (
                  <Chip
                    key={l}
                    texto={String(l)}
                    activo={lineaNumero === l}
                    onPress={() => setLinea(String(l))}
                  />
                ))}
                <TextInput
                  value={linea}
                  onChangeText={setLinea}
                  keyboardType="decimal-pad"
                  placeholder="6.5"
                  placeholderTextColor={colores.textoSuave}
                  style={[estilos.input, { flex: 1, minWidth: 64, textAlign: "center", paddingVertical: 8 }]}
                />
              </View>
            </View>

            {/* ---------- Rival ---------- */}
            <View style={{ gap: 8 }}>
              <Seccion titulo="Rival" />
              <Text style={{ color: colores.textoSuave, fontSize: 12, marginTop: -4 }}>
                Sin rival la proyección trata al equipo de enfrente como promedio de liga. Es el dato que más mueve el
                número después del lanzador.
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                <Chip texto="Sin rival" activo={rival === null} onPress={() => setRival(null)} />
                {equipos
                  .filter((e) => e !== (proyeccion?.equipo ?? elegido.equipo))
                  .map((e) => (
                    <Chip key={e} texto={e} activo={rival === e} onPress={() => setRival(e)} />
                  ))}
              </ScrollView>
            </View>

            {cargando && (
              <View style={{ paddingVertical: 24, alignItems: "center" }}>
                <ActivityIndicator color={colores.acento} />
              </View>
            )}

            {/* ---------- La probabilidad de verdad ---------- */}
            {proyeccion?.encontrado && (
              <View style={{ gap: 8 }}>
                <Seccion titulo="Probabilidad calculada" />
                <Tarjeta elevada>
                  <View style={{ flexDirection: "row", gap: 10 }}>
                    <Metrica
                      valor={pct(proyeccion.prob_over)}
                      etiqueta={`Over ${num(lineaNumero, 1)}`}
                      tono={proyeccion.veredicto === "OVER" ? "exito" : "neutral"}
                    />
                    <Metrica
                      valor={pct(proyeccion.prob_under)}
                      etiqueta={`Under ${num(lineaNumero, 1)}`}
                      tono={proyeccion.veredicto === "UNDER" ? "exito" : "neutral"}
                    />
                    {(proyeccion.prob_empate ?? 0) > 0 && (
                      <Metrica valor={pct(proyeccion.prob_empate)} etiqueta="Empate (devuelven)" />
                    )}
                  </View>

                  <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
                    <Insignia
                      texto={`${num(proyeccion.k_proyectados, 2)} K proyectados`}
                      tono="acento"
                    />
                    <Insignia
                      texto={`${num(proyeccion.bateadores_esperados, 1)} bateadores`}
                    />
                    {proyeccion.nivel && <Insignia texto={proyeccion.nivel} />}
                  </View>

                  {/* Lo único que decide si se apuesta. */}
                  <View
                    style={{
                      marginTop: 8,
                      padding: 12,
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: (conviene ? colores.exito : colores.peligro) + "45",
                      backgroundColor: (conviene ? colores.exito : colores.peligro) + "14",
                      gap: 4,
                    }}
                  >
                    <View style={estilos.filaEntreEspacio}>
                      <Text
                        style={{
                          color: conviene ? colores.exito : colores.peligro,
                          fontWeight: "800",
                          fontSize: 15,
                        }}
                      >
                        {proyeccion.apuesta?.veredicto ?? "—"}
                      </Text>
                      <Text style={{ color: colores.textoSuave, fontSize: 12 }}>
                        al {CUOTA_STAR_SPORT} · equilibrio {pct(proyeccion.apuesta?.prob_de_equilibrio)}
                      </Text>
                    </View>
                    {!!proyeccion.apuesta?.explicacion && (
                      <Text style={{ color: colores.texto, fontSize: 13, lineHeight: 18 }}>
                        {proyeccion.apuesta.explicacion}
                      </Text>
                    )}
                  </View>

                  {!!proyeccion.fuente_k_rival && (
                    <Text style={{ color: colores.textoSuave, fontSize: 11, marginTop: 6 }}>
                      K% del rival: {proyeccion.fuente_k_rival}
                    </Text>
                  )}
                </Tarjeta>

                {(proyeccion.advertencias ?? []).map((a, i) => (
                  <Mensaje key={`adv${i}`} tipo="info" texto={a} />
                ))}
                {(proyeccion.supuestos ?? []).length > 0 && (
                  <Text style={{ color: colores.textoSuave, fontSize: 11, lineHeight: 16 }}>
                    Supuestos: {(proyeccion.supuestos ?? []).join(" · ")}
                  </Text>
                )}
              </View>
            )}

            {proyeccion && !proyeccion.encontrado && !!proyeccion.mensaje && (
              <Mensaje tipo="info" texto={proyeccion.mensaje} />
            )}

            {/* ---------- El historial ---------- */}
            <View style={{ gap: 8 }}>
              <Seccion titulo="Historial" />
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                {VENTANAS.map((v) => (
                  <Chip
                    key={v.id}
                    texto={v.id === "H2H" && rival ? `Vs. ${rival}` : v.titulo}
                    activo={ventana === v.id}
                    onPress={() => setVentana(v.id)}
                  />
                ))}
              </ScrollView>

              {ventana === "H2H" && rival === null && (
                <Mensaje tipo="info" texto="Elegí un rival arriba para ver el head-to-head." />
              )}

              {historial?.encontrado && salidas.length > 0 && (
                <Tarjeta>
                  <View style={estilos.filaEntreEspacio}>
                    <Text style={{ color: colores.texto, fontWeight: "700", fontSize: 15 }}>
                      {historial.veces_over} de {decididas}
                      {(historial.empates ?? 0) > 0 ? ` (+${historial.empates} empate)` : ""}
                    </Text>
                    <Text
                      style={{
                        color:
                          (historial.tasa_historica ?? 0) >= 0.5652 ? colores.exito : colores.peligro,
                        fontWeight: "800",
                        fontSize: 17,
                      }}
                    >
                      {pct(historial.tasa_historica)}
                    </Text>
                  </View>

                  <GraficoSalidas salidas={salidas} linea={lineaNumero} />

                  <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
                    <Metrica valor={num(historial.k_promedio, 2)} etiqueta="K promedio" />
                    <Metrica valor={num(historial.k_mediana, 1)} etiqueta="K mediana" />
                    <Metrica valor={num(historial.ip_promedio, 1)} etiqueta="IP promedio" />
                  </View>

                  {!!historial.racha && (
                    <View style={{ marginTop: 8 }}>
                      <Insignia
                        texto={historial.racha}
                        tono={historial.racha.includes("OVER") ? "exito" : historial.racha.includes("UNDER") ? "peligro" : "advertencia"}
                      />
                    </View>
                  )}

                  {!!historial.aviso && (
                    <Text style={{ color: colores.advertencia, fontSize: 12, marginTop: 8, lineHeight: 17 }}>
                      {historial.aviso}
                    </Text>
                  )}

                  {/*
                    Esto no se saca nunca. Es la diferencia entre esta pantalla
                    y las que cobran por lo mismo: el porcentaje de arriba es
                    cuántas veces pasó, no cuántas va a pasar.
                  */}
                  <Text style={{ color: colores.textoSuave, fontSize: 11, marginTop: 10, lineHeight: 16 }}>
                    Ese {pct(historial.tasa_historica)} es contar cuántas veces pasó la línea antes, no la probabilidad
                    de que la pase hoy: no sabe contra quién lanza ni cuánto cobra la casa. La probabilidad está arriba.
                  </Text>
                </Tarjeta>
              )}

              {historial?.encontrado && salidas.length === 0 && !cargando && (
                <Mensaje tipo="info" texto={historial.mensaje ?? "No hay salidas en esta ventana."} />
              )}

              {salidas.length > 0 && (
                <Tarjeta>
                  <Text style={{ color: colores.textoSuave, fontSize: 12, marginBottom: 4 }}>
                    {salidas.length} salida{salidas.length === 1 ? "" : "s"}, de la más nueva a la más vieja
                  </Text>
                  {salidas.map((s, i) => (
                    <View
                      key={`${s.fecha}-${i}`}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "space-between",
                        paddingVertical: 7,
                        borderTopWidth: i === 0 ? 0 : 1,
                        borderTopColor: colores.borde,
                      }}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: colores.texto, fontSize: 13, fontWeight: "600" }}>
                          {s.es_local === false ? "@" : "vs "}
                          {s.rival}
                        </Text>
                        <Text style={{ color: colores.textoSuave, fontSize: 11 }}>{s.fecha}</Text>
                      </View>
                      <Text style={{ color: colores.textoSuave, fontSize: 12, width: 92 }}>
                        {s.ip} IP · {s.bb} BB
                        {s.pitcheos ? ` · ${s.pitcheos} p` : ""}
                      </Text>
                      <Text
                        style={{
                          width: 34,
                          textAlign: "right",
                          color:
                            s.resultado === "OVER"
                              ? colores.exito
                              : s.resultado === "UNDER"
                                ? colores.peligro
                                : s.resultado === "EMPATE"
                                  ? colores.advertencia
                                  : colores.texto,
                          fontWeight: "800",
                          fontSize: 15,
                        }}
                      >
                        {s.k}
                      </Text>
                    </View>
                  ))}
                </Tarjeta>
              )}
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}
