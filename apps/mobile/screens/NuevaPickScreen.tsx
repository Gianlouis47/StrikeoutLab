import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import {
  Barra,
  Boton,
  Campo,
  Insignia,
  Mensaje,
  Seccion,
  Subtitulo,
  Tarjeta,
  Titulo,
  colores,
  estilos,
} from "../components/ui";
import { proyectarPonches, SISTEMA_ACTUAL, type Proyeccion } from "../lib/calculadora";
import type { DatosExtraidosFoto } from "../lib/edgeFunctions";
import { repositorio } from "../lib/supabase-repository";
import { pickNuevoSchema } from "../lib/validators";

const NIVELES = ["DIAMANTE_ALTO", "DIAMANTE", "ORO_ALTO", "ORO", "IMPUREZA"] as const;
type Nivel = (typeof NIVELES)[number];

const ETIQUETA_NIVEL: Record<Nivel, string> = {
  DIAMANTE_ALTO: "Diamante Alto",
  DIAMANTE: "Diamante",
  ORO_ALTO: "Oro Alto",
  ORO: "Oro",
  IMPUREZA: "Impureza",
};
// El nivel ya no son bandas de confianza sino de ganancia esperada por peso
// apostado. Antes decía "95-100%" y esas bandas venían del puntuador viejo,
// que declaraba 76-90%: con la calculadora nueva (50-79%) casi todo caía en
// IMPUREZA aunque fuera buen pick.
const RANGO_NIVEL: Record<Nivel, string> = {
  DIAMANTE_ALTO: "más de 30¢ por peso",
  DIAMANTE: "15-30¢ por peso",
  ORO_ALTO: "5-15¢ por peso",
  ORO: "hasta 5¢ por peso",
  IMPUREZA: "no le gana a la cuota",
};

export interface BorradorPick {
  datos: DatosExtraidosFoto;
  version: number;
}

/** Chip seleccionable. Los botones grandes para elegir una opción entre dos
 *  hacían que todo pesara igual que la acción principal. */
function Opcion({
  texto,
  activo,
  onPress,
  tono = "acento",
}: {
  texto: string;
  activo: boolean;
  onPress: () => void;
  tono?: "acento" | "exito" | "advertencia";
}) {
  const color = tono === "exito" ? colores.exito : tono === "advertencia" ? colores.advertencia : colores.acento;
  return (
    <Pressable
      onPress={onPress}
      style={{
        flex: 1,
        paddingVertical: 10,
        borderRadius: 12,
        borderWidth: 1,
        alignItems: "center",
        backgroundColor: activo ? color + "26" : colores.tarjeta,
        borderColor: activo ? color : colores.borde,
      }}
    >
      <Text style={{ color: activo ? color : colores.textoSuave, fontWeight: activo ? "700" : "500", fontSize: 14 }}>
        {texto}
      </Text>
    </Pressable>
  );
}

export default function NuevaPickScreen({ borrador }: { borrador?: BorradorPick | null }) {
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [codigo, setCodigo] = useState("");
  const [pitcher, setPitcher] = useState("");
  const [equipo, setEquipo] = useState("");
  const [rival, setRival] = useState("");
  const [linea, setLinea] = useState("5.5");
  const [pick, setPick] = useState<"OVER" | "UNDER">("OVER");
  const [manoPitcher, setManoPitcher] = useState<"RHP" | "LHP">("RHP");
  const [confianza, setConfianza] = useState("");
  const [nivel, setNivel] = useState<Nivel>("ORO");

  const [opcionesAbiertas, setOpcionesAbiertas] = useState(false);
  const [calculando, setCalculando] = useState(false);
  const [proyeccion, setProyeccion] = useState<Proyeccion | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

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
  }, [borrador]);

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
        linea: parseFloat(linea),
        rival: rival.trim() || undefined,
        manoPitcher,
      });
      if (!r.encontrado) {
        setProyeccion(null);
        setError(r.mensaje);
        return;
      }
      setProyeccion(r);
      // La calculadora manda: se prellenan confianza, nivel y hasta el lado.
      // La confianza que se guarda es la calibrada — la cruda solo sirve para
      // auditar cuánto la movió el historial del sistema.
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
      linea: parseFloat(linea),
      pick,
      confianza: parseFloat(confianza) / 100,
      nivel,
      // Sale de estadísticas de temporada, no de contar salidas reales:
      // por definición del esquema eso es JUICIO, no CALCULADA.
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

  const coincide = proyeccion?.veredicto === pick;
  const ajuste = proyeccion?.ajuste_por_muestra;
  // Solo vale la pena mostrar el crudo si el ajuste lo movió de verdad.
  const ajusteMovioElKPct =
    ajuste?.k_pct_crudo != null && Math.abs(ajuste.k_pct_ajustado - ajuste.k_pct_crudo) >= 1;

  return (
    <ScrollView style={estilos.pantalla} contentContainerStyle={estilos.contenido} keyboardShouldPersistTaps="handled">
      <View>
        <Titulo>Pick manual</Titulo>
        <Subtitulo>Para cuando querés cargarlo a mano. Lo normal es mandar la foto en Análisis.</Subtitulo>
      </View>

      <Seccion titulo="El partido" />
      <Tarjeta>
        <Campo
          etiqueta="Lanzador"
          value={pitcher}
          onChangeText={setPitcher}
          placeholder="deGrom, T Rogers, Skenes…"
          autoCapitalize="words"
        />
        <View style={{ flexDirection: "row", gap: 8 }}>
          <View style={{ flex: 1 }}>
            <Campo
              etiqueta="Su equipo"
              value={equipo}
              onChangeText={setEquipo}
              autoCapitalize="characters"
              placeholder="TEX"
            />
          </View>
          <View style={{ flex: 1 }}>
            <Campo
              etiqueta="Rival"
              value={rival}
              onChangeText={setRival}
              autoCapitalize="characters"
              placeholder="CIN"
            />
          </View>
        </View>
        <View style={{ gap: 6 }}>
          <Text style={estilos.etiqueta}>Mano del lanzador</Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Opcion texto="Derecho" activo={manoPitcher === "RHP"} onPress={() => setManoPitcher("RHP")} />
            <Opcion texto="Zurdo" activo={manoPitcher === "LHP"} onPress={() => setManoPitcher("LHP")} />
          </View>
        </View>
      </Tarjeta>

      <Seccion titulo="La apuesta" />
      <Tarjeta>
        <Campo
          etiqueta="Línea de ponches"
          value={linea}
          onChangeText={setLinea}
          keyboardType="decimal-pad"
          placeholder="6.5"
        />
        <View style={{ gap: 6 }}>
          <Text style={estilos.etiqueta}>Lado</Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Opcion texto="OVER" activo={pick === "OVER"} onPress={() => setPick("OVER")} tono="exito" />
            <Opcion texto="UNDER" activo={pick === "UNDER"} onPress={() => setPick("UNDER")} tono="advertencia" />
          </View>
        </View>
      </Tarjeta>

      <Boton
        titulo={proyeccion ? "Recalcular" : "Calcular proyección"}
        onPress={calcular}
        cargando={calculando}
        variante={proyeccion ? "secundario" : "primario"}
      />

      {error && <Mensaje tipo="error" texto={error} />}

      {proyeccion && ajuste && (
        <Tarjeta elevada>
          {/* El número que responde la pregunta, arriba y grande. */}
          <View style={{ alignItems: "center", gap: 2, paddingVertical: 6 }}>
            <Text style={{ color: colores.texto, fontSize: 40, fontWeight: "800", letterSpacing: -1 }}>
              {proyeccion.k_proyectados}
            </Text>
            <Text style={{ color: colores.textoSuave, fontSize: 13 }}>ponches proyectados</Text>
          </View>

          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 10,
              paddingVertical: 10,
              backgroundColor: colores.fondo,
              borderRadius: 12,
            }}
          >
            <Text
              style={{
                color: proyeccion.veredicto === "OVER" ? colores.exito : colores.advertencia,
                fontSize: 20,
                fontWeight: "800",
              }}
            >
              {proyeccion.veredicto ?? "SIN VENTAJA"}
            </Text>
            <Text style={{ color: colores.textoSuave, fontSize: 15 }}>
              {(proyeccion.confianza * 100).toFixed(0)}%
            </Text>
            <Insignia texto={ETIQUETA_NIVEL[proyeccion.nivel]} tono="acento" />
          </View>

          {/* Las tres probabilidades: el empate importa en línea entera. */}
          <View style={{ gap: 6, marginTop: 4 }}>
            <View style={{ gap: 3 }}>
              <View style={estilos.filaEntreEspacio}>
                <Text style={{ color: colores.textoSuave, fontSize: 12 }}>Over</Text>
                <Text style={{ color: colores.textoSuave, fontSize: 12 }}>
                  {(proyeccion.prob_over * 100).toFixed(0)}%
                </Text>
              </View>
              <Barra proporcion={proyeccion.prob_over} tono="exito" alto={5} />
            </View>
            <View style={{ gap: 3 }}>
              <View style={estilos.filaEntreEspacio}>
                <Text style={{ color: colores.textoSuave, fontSize: 12 }}>Under</Text>
                <Text style={{ color: colores.textoSuave, fontSize: 12 }}>
                  {(proyeccion.prob_under * 100).toFixed(0)}%
                </Text>
              </View>
              <Barra proporcion={proyeccion.prob_under} tono="advertencia" alto={5} />
            </View>
            {proyeccion.prob_empate > 0 && (
              <View style={{ gap: 3 }}>
                <View style={estilos.filaEntreEspacio}>
                  <Text style={{ color: colores.textoSuave, fontSize: 12 }}>Empate (devuelven)</Text>
                  <Text style={{ color: colores.textoSuave, fontSize: 12 }}>
                    {(proyeccion.prob_empate * 100).toFixed(0)}%
                  </Text>
                </View>
                <Barra proporcion={proyeccion.prob_empate} tono="acento" alto={5} />
              </View>
            )}
          </View>

          {/* Antes de las estadísticas: si contra la cuota conviene o no. Esa
              es la pregunta, no cuál es la probabilidad. */}
          {proyeccion.apuesta && (
            <View
              style={{
                borderTopWidth: 1,
                borderTopColor: colores.borde,
                paddingTop: 10,
                marginTop: 4,
                gap: 4,
              }}
            >
              <View style={estilos.filaEntreEspacio}>
                <Text
                  style={{
                    color:
                      proyeccion.apuesta.veredicto === "CONVIENE"
                        ? colores.exito
                        : proyeccion.apuesta.veredicto === "FLOJO"
                          ? colores.advertencia
                          : colores.peligro,
                    fontSize: 17,
                    fontWeight: "800",
                  }}
                >
                  {proyeccion.apuesta.veredicto}
                </Text>
                <Text style={{ color: colores.textoSuave, fontSize: 12 }}>
                  al {proyeccion.apuesta.cuota_americana} · pide {(proyeccion.apuesta.prob_de_equilibrio * 100).toFixed(1)}%
                </Text>
              </View>
              <Text style={{ color: colores.textoSuave, fontSize: 12, lineHeight: 18 }}>
                {proyeccion.apuesta.explicacion}
              </Text>
            </View>
          )}

          <View style={{ height: 1, backgroundColor: colores.borde, marginVertical: 6 }} />

          {/* Se muestran los valores que la calculadora usó de verdad — los
              ajustados por muestra — porque enseñar el K% crudo al lado de una
              proyección hecha con otro número se lee como una contradicción. */}
          <Text style={{ color: colores.textoSuave, fontSize: 12, lineHeight: 18 }}>
            {proyeccion.pitcher}
            {` · K% ${ajuste.k_pct_ajustado}`}
            {ajusteMovioElKPct ? ` (crudo ${ajuste.k_pct_crudo})` : ""}
            {` · WHIP ${ajuste.whip_ajustado}`}
            {` · ${ajuste.ip_por_salida_ajustado} IP por salida`}
            {proyeccion.rival ? `\nRival: ${proyeccion.fuente_k_rival}` : ""}
            {`\nMuestra: ${ajuste.bateadores_de_muestra} bateadores enfrentados`}
          </Text>

          {proyeccion.advertencias.map((a, i) => (
            <Mensaje key={i} tipo="info" texto={a} />
          ))}

          {!coincide && proyeccion.veredicto && (
            <Mensaje
              tipo="error"
              texto={`Elegiste ${pick} pero la proyección favorece ${proyeccion.veredicto}. Revisá antes de guardar.`}
            />
          )}
        </Tarjeta>
      )}

      <Seccion titulo="Guardar" />
      <Tarjeta>
        <Campo
          etiqueta="Confianza final (%)"
          value={confianza}
          onChangeText={setConfianza}
          keyboardType="decimal-pad"
          placeholder="82"
        />
        <Text style={{ color: colores.textoSuave, fontSize: 12, lineHeight: 17 }}>
          {proyeccion
            ? "Viene de la calculadora. Podés ajustarla si sabés algo que ella no (lineup, lesión, clima)."
            : "Calculá primero para que se llene sola, o ponela a mano."}
        </Text>

        <View style={{ gap: 6, marginTop: 6 }}>
          <Text style={estilos.etiqueta}>Nivel</Text>
          <Text style={{ color: colores.textoSuave, fontSize: 12, lineHeight: 17 }}>
            Va con la confianza de arriba: {RANGO_NIVEL[nivel]} = {ETIQUETA_NIVEL[nivel]}. De 85% para arriba es donde
            conviene jugar.
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 2 }}>
            {NIVELES.map((n) => (
              <Pressable
                key={n}
                onPress={() => setNivel(n)}
                style={[estilos.chip, nivel === n && estilos.chipActivo, { paddingHorizontal: 12, paddingVertical: 7 }]}
              >
                <Text style={[estilos.chipTexto, nivel === n && estilos.chipTextoActivo, { fontSize: 13 }]}>
                  {ETIQUETA_NIVEL[n]}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      </Tarjeta>

      {/* Fecha y código casi nunca se tocan: no merecen espacio permanente. */}
      {opcionesAbiertas ? (
        <Tarjeta>
          <View style={estilos.filaEntreEspacio}>
            <Text style={{ color: colores.texto, fontWeight: "700", fontSize: 14 }}>Opcional</Text>
            <Pressable onPress={() => setOpcionesAbiertas(false)} hitSlop={10}>
              <Text style={{ color: colores.textoSuave, fontSize: 13 }}>Ocultar</Text>
            </Pressable>
          </View>
          <Campo etiqueta="Fecha" value={fecha} onChangeText={setFecha} placeholder="2026-08-27" />
          <Campo etiqueta="Código del ticket" value={codigo} onChangeText={setCodigo} placeholder="Star Sport" />
        </Tarjeta>
      ) : (
        <Pressable
          onPress={() => setOpcionesAbiertas(true)}
          style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 4 }}
          hitSlop={8}
        >
          <Ionicons name="options-outline" size={16} color={colores.textoSuave} />
          <Text style={{ color: colores.textoSuave, fontSize: 13 }}>Fecha y código del ticket</Text>
        </Pressable>
      )}

      {ok && <Mensaje tipo="exito" texto={ok} />}

      <Boton titulo="Guardar pick" onPress={guardar} cargando={guardando} />
    </ScrollView>
  );
}
