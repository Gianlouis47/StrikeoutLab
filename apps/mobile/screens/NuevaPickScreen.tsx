import React, { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { Boton, Campo, Mensaje, SelectorPick, Subtitulo, Tarjeta, Titulo, colores, estilos } from "../components/ui";
import { analizarPitcher, type AnalizarPitcherRespuesta, type DatosExtraidosFoto } from "../lib/edgeFunctions";
import { repositorio } from "../lib/supabase-repository";
import { aprendizajeNuevoSchema, pickNuevoSchema } from "../lib/validators";

const NIVELES = ["DIAMANTE_ALTO", "DIAMANTE", "ORO_ALTO", "ORO", "IMPUREZA"] as const;

export interface BorradorPick {
  datos: DatosExtraidosFoto;
  version: number;
}

export default function NuevaPickScreen({ borrador }: { borrador?: BorradorPick | null }) {
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [codigo, setCodigo] = useState("");
  const [pitcher, setPitcher] = useState("");
  const [equipo, setEquipo] = useState("");
  const [rival, setRival] = useState("");
  const [linea, setLinea] = useState("5.5");
  const [pick, setPick] = useState<"OVER" | "UNDER">("OVER");
  const [confianza, setConfianza] = useState("");
  const [nivel, setNivel] = useState<(typeof NIVELES)[number]>("ORO");
  const [notas, setNotas] = useState("");

  const versionAplicada = React.useRef<number | null>(null);
  React.useEffect(() => {
    if (!borrador || versionAplicada.current === borrador.version) return;
    versionAplicada.current = borrador.version;
    const d = borrador.datos;
    if (d.pitcher) setPitcher(d.pitcher);
    if (d.equipo) setEquipo(d.equipo);
    if (d.rival) setRival(d.rival);
    if (d.linea !== null) setLinea(String(d.linea));
    if (d.pick) setPick(d.pick);
    if (d.codigo) setCodigo(d.codigo);
    if (Object.keys(d.otros_datos ?? {}).length > 0) {
      setNotas(
        Object.entries(d.otros_datos)
          .map(([clave, valor]) => `${clave}: ${valor}`)
          .join("\n"),
      );
    }
  }, [borrador]);

  const [analizando, setAnalizando] = useState(false);
  const [respuestaIA, setRespuestaIA] = useState<AnalizarPitcherRespuesta | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [guardandoAprendizaje, setGuardandoAprendizaje] = useState(false);
  const [aprendizajeGuardado, setAprendizajeGuardado] = useState(false);

  async function pedirOpinionIA() {
    setError(null);
    setOk(null);
    setAprendizajeGuardado(false);
    if (!pitcher || !linea || !pick) {
      setError("Completa al menos pitcher, línea y pick antes de pedir la opinión de la IA.");
      return;
    }
    setAnalizando(true);
    try {
      const respuesta = await analizarPitcher({
        pitcher,
        equipo,
        rival,
        linea: parseFloat(linea),
        pick,
        notas: notas || undefined,
      });
      setRespuestaIA(respuesta);
      setConfianza((respuesta.juicioIA.confianza * 100).toFixed(0));
      setNivel(respuesta.juicioIA.nivel);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setAnalizando(false);
    }
  }

  async function guardarPick(fuenteConfianza: "CALCULADA" | "JUICIO") {
    setError(null);
    setOk(null);

    const validacion = pickNuevoSchema.safeParse({
      fecha,
      codigo: codigo || null,
      pitcher,
      equipo,
      rival,
      linea: parseFloat(linea),
      pick,
      confianza: parseFloat(confianza) / 100,
      nivel,
      fuenteConfianza,
      motivo: respuestaIA?.juicioIA.motivo ?? null,
    });
    if (!validacion.success) {
      setError(validacion.error.issues[0]?.message ?? "Datos inválidos.");
      return;
    }

    setGuardando(true);
    try {
      const datos = validacion.data;
      await repositorio.crear("picks", {
        fecha: datos.fecha,
        codigo: datos.codigo,
        pitcher: datos.pitcher,
        equipo: datos.equipo,
        rival: datos.rival,
        linea: datos.linea,
        pick: datos.pick,
        confianza: datos.confianza,
        nivel: datos.nivel,
        fuente_confianza: datos.fuenteConfianza,
        motivo: datos.motivo,
      });
      setOk("Pick guardado.");
      setPitcher("");
      setEquipo("");
      setRival("");
      setCodigo("");
      setConfianza("");
      setNotas("");
      setRespuestaIA(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setGuardando(false);
    }
  }

  async function guardarAprendizaje() {
    const propuesta = respuestaIA?.juicioIA.propuesta_aprendizaje;
    if (!propuesta) return;

    const validacion = aprendizajeNuevoSchema.safeParse({
      descubrimiento: propuesta.descubrimiento,
      fuente: propuesta.fuente ?? null,
      reglaNueva: propuesta.regla_nueva,
      porQueImporta: propuesta.por_que_importa,
    });
    if (!validacion.success) {
      setError(validacion.error.issues[0]?.message ?? "Propuesta de aprendizaje inválida.");
      return;
    }

    setGuardandoAprendizaje(true);
    setError(null);
    try {
      const datos = validacion.data;
      await repositorio.crear("learning_log", {
        descubrimiento: datos.descubrimiento,
        fuente: datos.fuente,
        regla_nueva: datos.reglaNueva,
        por_que_importa: datos.porQueImporta,
      });
      setAprendizajeGuardado(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setGuardandoAprendizaje(false);
    }
  }

  return (
    <ScrollView style={estilos.pantalla} contentContainerStyle={estilos.contenido}>
      <Titulo>Nuevo pick</Titulo>
      <Subtitulo>Registra el pick. La IA solo opina (JUICIO) — tú decides si lo guardas.</Subtitulo>

      <Campo etiqueta="Fecha (YYYY-MM-DD)" value={fecha} onChangeText={setFecha} />
      <Campo etiqueta="Código de la banca" value={codigo} onChangeText={setCodigo} />
      <Campo etiqueta="Pitcher" value={pitcher} onChangeText={setPitcher} placeholder="Ej. Gerrit Cole" />
      <Campo etiqueta="Equipo" value={equipo} onChangeText={setEquipo} autoCapitalize="characters" placeholder="NYY" />
      <Campo etiqueta="Rival" value={rival} onChangeText={setRival} autoCapitalize="characters" placeholder="BOS" />
      <Campo etiqueta="Línea de ponches" value={linea} onChangeText={setLinea} keyboardType="decimal-pad" />

      <View>
        <Text style={estilos.etiqueta}>PICK</Text>
        <SelectorPick valor={pick} onCambiar={setPick} />
      </View>

      <Campo
        etiqueta="Notas / datos adicionales (opcional)"
        value={notas}
        onChangeText={setNotas}
        multiline
        numberOfLines={3}
        placeholder="K%, Whiff%, lineup confirmado, umpire, clima..."
      />

      <Boton titulo="Pedir opinión de la IA (JUICIO)" onPress={pedirOpinionIA} cargando={analizando} variante="secundario" />

      {respuestaIA && (
        <Tarjeta>
          <Text style={{ color: colores.texto, fontWeight: "700" }}>
            Veredicto IA: {respuestaIA.juicioIA.veredicto} — {respuestaIA.juicioIA.nivel} (
            {(respuestaIA.juicioIA.confianza * 100).toFixed(0)}%)
          </Text>
          <Text style={{ color: colores.textoSuave }}>{respuestaIA.juicioIA.motivo}</Text>
          {respuestaIA.calculada && (
            <Text style={{ color: colores.textoSuave }}>
              Tasa CALCULADA real sobre su historial: {(respuestaIA.calculada.tasa * 100).toFixed(1)}% (
              {respuestaIA.calculada.ganadas}/{respuestaIA.calculada.total})
              {respuestaIA.calculada.advertencia ? ` — ${respuestaIA.calculada.advertencia}` : ""}
            </Text>
          )}

          {respuestaIA.busquedasRealizadas.length > 0 && (
            <View style={{ gap: 4 }}>
              <Text style={{ color: colores.textoSuave, fontWeight: "700", fontSize: 12 }}>
                BÚSQUEDAS QUE HIZO LA IA
              </Text>
              {respuestaIA.busquedasRealizadas.map((b, i) => (
                <Text key={i} style={{ color: colores.textoSuave, fontSize: 12 }}>
                  • {b.query}
                </Text>
              ))}
            </View>
          )}

          {respuestaIA.juicioIA.propuesta_aprendizaje && (
            <View style={{ gap: 6, borderTopWidth: 1, borderTopColor: colores.borde, paddingTop: 8 }}>
              <Text style={{ color: colores.acento, fontWeight: "700", fontSize: 12 }}>
                PROPUESTA PARA LA BITÁCORA DE APRENDIZAJE
              </Text>
              <Text style={{ color: colores.texto }}>{respuestaIA.juicioIA.propuesta_aprendizaje.descubrimiento}</Text>
              {respuestaIA.juicioIA.propuesta_aprendizaje.por_que_importa && (
                <Text style={{ color: colores.textoSuave }}>
                  {respuestaIA.juicioIA.propuesta_aprendizaje.por_que_importa}
                </Text>
              )}
              {aprendizajeGuardado ? (
                <Mensaje tipo="exito" texto="Guardado en la bitácora." />
              ) : (
                <Boton
                  titulo="Guardar en bitácora"
                  variante="secundario"
                  onPress={guardarAprendizaje}
                  cargando={guardandoAprendizaje}
                />
              )}
            </View>
          )}
        </Tarjeta>
      )}

      <Campo
        etiqueta="Confianza final (%) — puedes ajustarla a mano"
        value={confianza}
        onChangeText={setConfianza}
        keyboardType="decimal-pad"
        placeholder="82"
      />

      <View>
        <Text style={estilos.etiqueta}>NIVEL</Text>
        <View style={estilos.filaSelector}>
          {NIVELES.map((n) => (
            <Boton
              key={n}
              titulo={n}
              variante={nivel === n ? "primario" : "secundario"}
              onPress={() => setNivel(n)}
            />
          ))}
        </View>
      </View>

      {error && <Mensaje tipo="error" texto={error} />}
      {ok && <Mensaje tipo="exito" texto={ok} />}

      <Boton
        titulo="Guardar como CALCULADA (viene de tasaSuperacionLinea)"
        onPress={() => guardarPick("CALCULADA")}
        cargando={guardando}
      />
      <Boton
        titulo="Guardar como JUICIO (mío o de la IA)"
        onPress={() => guardarPick("JUICIO")}
        cargando={guardando}
        variante="secundario"
      />
    </ScrollView>
  );
}
