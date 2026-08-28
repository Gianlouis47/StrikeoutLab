import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import React, { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { Barra, Boton, Insignia, Mensaje, colores, estilos } from "../components/ui";
import { SISTEMA_ACTUAL, type Proyeccion } from "../lib/calculadora";
import { chat, type MensajeChat } from "../lib/edgeFunctions";
import { repositorio } from "../lib/supabase-repository";

interface Burbuja {
  id: string;
  rol: "usuario" | "asistente";
  texto: string;
  uriImagen?: string;
  /** Qué hizo la IA por dentro, para poder auditar de dónde salió el número. */
  detalle?: string[];
  /** Pick ya armado por la calculadora, listo para guardar de un toque. */
  pick?: Proyeccion;
  /** id del pick en la base una vez guardado, para no duplicarlo. */
  pickGuardadoId?: string;
}

/**
 * Saca del detalle de herramientas la última proyección que hizo la
 * calculadora. Así el usuario recibe el pick armado en vez de tener que
 * copiar los números a otra pantalla.
 */
function extraerPick(herramientas: Array<{ nombre: string; resultado: unknown }>): Proyeccion | undefined {
  for (let i = herramientas.length - 1; i >= 0; i--) {
    const h = herramientas[i];
    if (h.nombre !== "proyectar_ponches") continue;
    const r = h.resultado as Proyeccion | { encontrado: false } | null;
    if (r && typeof r === "object" && "encontrado" in r && r.encontrado) return r as Proyeccion;
  }
  return undefined;
}

/**
 * Si el usuario ya pidió por escrito que lo guardara, la IA lo guardó con su
 * propia herramienta. Detectarlo evita ofrecer el botón y terminar con el
 * mismo pick dos veces en el historial.
 */
function yaLoGuardoLaIA(herramientas: Array<{ nombre: string; resultado: unknown }>): boolean {
  return herramientas.some((h) => {
    if (h.nombre !== "guardar_pick") return false;
    const r = h.resultado as { guardado?: boolean } | null;
    return !!r && typeof r === "object" && r.guardado === true;
  });
}

const SUGERENCIAS = [
  "Tirá la foto de un ticket y te digo si conviene",
  "Foto de un boxscore y guardo la salida",
  "¿Cuántos K proyecta deGrom con línea 7?",
];

export default function ChatScreen() {
  const [burbujas, setBurbujas] = useState<Burbuja[]>([]);
  const [entrada, setEntrada] = useState("");
  const [imagenPendiente, setImagenPendiente] = useState<
    { base64: string; mimeType: string; uri: string } | null
  >(null);
  const [pensando, setPensando] = useState(false);
  const [guardandoPick, setGuardandoPick] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const listaRef = useRef<FlatList<Burbuja>>(null);

  const irAlFinal = useCallback(() => {
    setTimeout(() => listaRef.current?.scrollToEnd({ animated: true }), 60);
  }, []);

  async function adjuntar(desdeCamara: boolean) {
    setError(null);
    const permiso = desdeCamara
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permiso.granted) {
      setError(
        desdeCamara
          ? "Necesito permiso de cámara para tomar la foto."
          : "Necesito permiso de galería para elegir la imagen.",
      );
      return;
    }
    const opciones: ImagePicker.ImagePickerOptions = { base64: true, quality: 0.6 };
    const resultado = desdeCamara
      ? await ImagePicker.launchCameraAsync(opciones)
      : await ImagePicker.launchImageLibraryAsync(opciones);
    if (resultado.canceled) return;
    const asset = resultado.assets[0];
    if (!asset.base64) {
      setError("No pude leer esa imagen, probá con otra.");
      return;
    }
    setImagenPendiente({
      base64: asset.base64,
      mimeType: asset.mimeType ?? "image/jpeg",
      uri: asset.uri,
    });
  }

  async function enviar() {
    const texto = entrada.trim();
    if (!texto && !imagenPendiente) return;

    const propia: Burbuja = {
      id: `u-${Date.now()}`,
      rol: "usuario",
      texto: texto || (imagenPendiente ? "(foto)" : ""),
      uriImagen: imagenPendiente?.uri,
    };
    const historialPrevio = burbujas;
    setBurbujas((prev) => [...prev, propia]);
    setEntrada("");
    const imagen = imagenPendiente;
    setImagenPendiente(null);
    setError(null);
    setPensando(true);
    irAlFinal();

    // Se manda la conversación completa para que la IA tenga contexto, pero
    // solo la imagen nueva: las anteriores ya vienen transcritas en el hilo.
    const mensajes: MensajeChat[] = [
      ...historialPrevio.map((b) => ({ rol: b.rol, texto: b.texto })),
      {
        rol: "usuario" as const,
        texto,
        imagenBase64: imagen?.base64,
        mimeType: imagen?.mimeType,
      },
    ];

    try {
      const r = await chat({ mensajes });
      const detalle: string[] = [];
      for (const t of r.transcripciones ?? []) {
        detalle.push(`Leyó la imagen con ${t.modelo}`);
      }
      for (const h of r.herramientasUsadas ?? []) {
        detalle.push(`Usó ${h.nombre}`);
      }
      const herramientas = r.herramientasUsadas ?? [];
      setBurbujas((prev) => [
        ...prev,
        {
          id: `a-${Date.now()}`,
          rol: "asistente",
          texto: r.respuesta,
          detalle,
          pick: extraerPick(herramientas),
          pickGuardadoId: yaLoGuardoLaIA(herramientas) ? "guardado-por-la-ia" : undefined,
        },
      ]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPensando(false);
      irAlFinal();
    }
  }

  async function guardarPick(burbuja: Burbuja) {
    const p = burbuja.pick;
    if (!p || !p.veredicto) return;
    setGuardandoPick(burbuja.id);
    setError(null);
    try {
      const fila = await repositorio.crear<{ id: string }>("picks", {
        fecha: new Date().toISOString().slice(0, 10),
        pitcher: p.pitcher,
        equipo: (p.equipo ?? "").toUpperCase(),
        rival: (p.rival ?? "").toUpperCase(),
        linea: p.linea,
        pick: p.veredicto,
        // La calibrada, no la cruda: es la que la app mostró y la que se va a
        // medir después contra el resultado real.
        confianza: p.confianza_calibrada,
        nivel: p.nivel,
        // Sale de estadísticas de temporada, no de contar salidas reales.
        fuente_confianza: "JUICIO",
        sistema: SISTEMA_ACTUAL,
        motivo: `${p.k_proyectados} K proyectados vs línea ${p.linea}. ${p.entradas_usadas.join(", ")}.`,
      });
      setBurbujas((prev) =>
        prev.map((b) => (b.id === burbuja.id ? { ...b, pickGuardadoId: fila.id } : b)),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setGuardandoPick(null);
    }
  }

  /** El pick ya armado: nada que escribir, solo confirmar. */
  function TarjetaPick({ burbuja }: { burbuja: Burbuja }) {
    const p = burbuja.pick!;
    const guardado = !!burbuja.pickGuardadoId;
    const faltaEquipo = !p.equipo;
    const colorLado = p.veredicto === "OVER" ? colores.exito : colores.advertencia;
    const ajusteVisible =
      p.ajuste_por_muestra?.k_pct_crudo != null &&
      Math.abs(p.ajuste_por_muestra.k_pct_ajustado - p.ajuste_por_muestra.k_pct_crudo) >= 1.5;
    // Sale de la MISMA proyección que el resto de la tarjeta, así que el
    // veredicto, el nivel y la confianza no pueden contradecirse entre sí.
    const ev = p.apuesta;
    const colorVeredicto =
      ev.veredicto === "CONVIENE"
        ? colores.exito
        : ev.veredicto === "FLOJO"
          ? colores.advertencia
          : colores.peligro;

    return (
      <View
        style={{
          marginTop: 8,
          backgroundColor: colores.tarjetaElevada,
          borderRadius: 14,
          borderWidth: 1,
          borderColor: guardado ? colores.exito + "55" : colores.acento + "55",
          padding: 14,
          gap: 10,
        }}
      >
        <View style={estilos.filaEntreEspacio}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colores.texto, fontWeight: "700", fontSize: 15 }} numberOfLines={1}>
              {p.pitcher}
            </Text>
            <Text style={{ color: colores.textoSuave, fontSize: 12 }}>
              {p.equipo ?? "—"} vs {p.rival || "—"}
            </Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={{ color: colores.texto, fontSize: 22, fontWeight: "800" }}>{p.k_proyectados}</Text>
            <Text style={{ color: colores.textoSuave, fontSize: 10 }}>K proyectados</Text>
          </View>
        </View>

        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
            paddingVertical: 9,
            backgroundColor: colores.fondo,
            borderRadius: 10,
          }}
        >
          <Text style={{ color: colorLado, fontSize: 18, fontWeight: "800" }}>
            {p.veredicto ?? "SIN VENTAJA"}
          </Text>
          <Text style={{ color: colores.texto, fontSize: 17, fontWeight: "700" }}>{p.linea}</Text>
          <Text style={{ color: colores.textoSuave, fontSize: 14 }}>
            {(p.confianza_calibrada * 100).toFixed(0)}%
          </Text>
          <Insignia
            texto={p.nivel.replace("_", " ")}
            tono={
              ev.veredicto === "CONVIENE" ? "exito" : ev.veredicto === "FLOJO" ? "advertencia" : "peligro"
            }
          />
        </View>

        <Barra
          proporcion={p.confianza_calibrada}
          tono={
            ev.veredicto === "CONVIENE" ? "exito" : ev.veredicto === "FLOJO" ? "advertencia" : "peligro"
          }
          alto={5}
        />

        {/* La probabilidad sola no decide nada: al -130 hace falta 56.5% solo
            para no perder plata. Esto es lo que responde "¿la juego?". */}
        {(
          <View
            style={{
              borderTopWidth: 1,
              borderTopColor: colores.borde,
              paddingTop: 9,
              gap: 4,
            }}
          >
            <View style={estilos.filaEntreEspacio}>
              <Text style={{ color: colorVeredicto, fontSize: 15, fontWeight: "800" }}>
                {ev.veredicto}
              </Text>
              <Text style={{ color: colores.textoSuave, fontSize: 11 }}>
                al {ev.cuota_americana} · pide {(ev.prob_de_equilibrio * 100).toFixed(1)}%
              </Text>
            </View>
            <Text style={{ color: colores.textoSuave, fontSize: 11, lineHeight: 16 }}>
              {ev.retorno_pct >= 0
                ? `Ganás ${ev.retorno_pct.toFixed(1)} centavos por peso.`
                : `Perdés ${Math.abs(ev.retorno_pct).toFixed(1)} centavos por peso.`}
              {ev.apuesta_recomendada_pct > 0
                ? ` Apostá hasta ${ev.apuesta_recomendada_pct.toFixed(1)}% del bankroll.`
                : ""}
            </Text>
          </View>
        )}

        {/* Si la muestra del lanzador es chica, el número crudo no es una tasa
            sino ruido, y la calculadora lo corrigió. Vale decirlo acá mismo:
            es la diferencia entre un pick de 41% de K% y uno de 26%. */}
        {ajusteVisible && (
          <Text style={{ color: colores.textoSuave, fontSize: 11, lineHeight: 16 }}>
            Con solo {p.ajuste_por_muestra.bateadores_de_muestra} bateadores enfrentados, su{" "}
            {p.ajuste_por_muestra.k_pct_crudo}% de K se ajustó a {p.ajuste_por_muestra.k_pct_ajustado}%.
          </Text>
        )}

        {faltaEquipo && !guardado && (
          <Text style={{ color: colores.advertencia, fontSize: 12 }}>
            No sé en qué equipo juega (cambió de equipo esta temporada). Decímelo y lo guardo.
          </Text>
        )}

        {guardado ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 7, justifyContent: "center" }}>
            <Ionicons name="checkmark-circle" size={17} color={colores.exito} />
            <Text style={{ color: colores.exito, fontSize: 13, fontWeight: "600" }}>
              Guardado en Historial
            </Text>
          </View>
        ) : (
          <Boton
            titulo="Guardar este pick"
            onPress={() => guardarPick(burbuja)}
            cargando={guardandoPick === burbuja.id}
            deshabilitado={!p.veredicto || faltaEquipo}
          />
        )}
      </View>
    );
  }

  function renderBurbuja({ item }: { item: Burbuja }) {
    const esUsuario = item.rol === "usuario";
    return (
      <View
        style={{
          alignSelf: esUsuario ? "flex-end" : "flex-start",
          // El pick armado necesita más ancho que una burbuja de texto.
          maxWidth: item.pick ? "100%" : "88%",
          width: item.pick ? "100%" : undefined,
          marginBottom: 10,
        }}
      >
        <View
          style={{
            backgroundColor: esUsuario ? colores.acento : colores.tarjetaElevada,
            borderRadius: 16,
            borderBottomRightRadius: esUsuario ? 4 : 16,
            borderBottomLeftRadius: esUsuario ? 16 : 4,
            paddingHorizontal: 14,
            paddingVertical: 10,
            borderWidth: esUsuario ? 0 : 1,
            borderColor: colores.borde,
          }}
        >
          {item.uriImagen && (
            <Image
              source={{ uri: item.uriImagen }}
              style={{ width: 200, height: 140, borderRadius: 10, marginBottom: 8 }}
              resizeMode="cover"
            />
          )}
          <Text
            style={{
              color: esUsuario ? "#fff" : colores.texto,
              fontSize: 15,
              lineHeight: 21,
            }}
          >
            {item.texto}
          </Text>
        </View>

        {item.pick && <TarjetaPick burbuja={item} />}

        {item.detalle && item.detalle.length > 0 && (
          <Text style={{ color: colores.textoSuave, fontSize: 11, marginTop: 4, marginLeft: 6 }}>
            {item.detalle.join(" · ")}
          </Text>
        )}
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={8}
    >
      <FlatList
        ref={listaRef}
        style={estilos.pantalla}
        contentContainerStyle={{ padding: 14, paddingBottom: 4, flexGrow: 1 }}
        data={burbujas}
        keyExtractor={(b) => b.id}
        renderItem={renderBurbuja}
        onContentSizeChange={irAlFinal}
        ListEmptyComponent={
          <View style={{ flex: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: 20 }}>
            <Ionicons name="baseball" size={44} color={colores.acento} />
            <Text
              style={{
                color: colores.texto,
                fontSize: 19,
                fontWeight: "700",
                marginTop: 14,
                textAlign: "center",
              }}
            >
              Mandame la foto y yo hago el resto
            </Text>
            <Text
              style={{
                color: colores.textoSuave,
                fontSize: 13,
                marginTop: 8,
                textAlign: "center",
                lineHeight: 19,
              }}
            >
              Leo el ticket o el boxscore, busco las estadísticas, calculo los ponches proyectados y te digo
              si conviene.
            </Text>
            <View style={{ marginTop: 22, gap: 8, width: "100%" }}>
              {SUGERENCIAS.map((s) => (
                <View
                  key={s}
                  style={{
                    backgroundColor: colores.tarjeta,
                    borderWidth: 1,
                    borderColor: colores.borde,
                    borderRadius: 12,
                    paddingVertical: 10,
                    paddingHorizontal: 14,
                  }}
                >
                  <Text style={{ color: colores.textoSuave, fontSize: 13 }}>{s}</Text>
                </View>
              ))}
            </View>
          </View>
        }
      />

      {pensando && (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 18, paddingBottom: 6 }}>
          <ActivityIndicator color={colores.acento} size="small" />
          <Text style={{ color: colores.textoSuave, fontSize: 13 }}>
            Leyendo, buscando datos y calculando…
          </Text>
        </View>
      )}

      {error && (
        <View style={{ paddingHorizontal: 14, paddingBottom: 6 }}>
          <Mensaje tipo="error" texto={error} />
        </View>
      )}

      {imagenPendiente && (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
            marginHorizontal: 14,
            marginBottom: 6,
            padding: 8,
            backgroundColor: colores.tarjeta,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: colores.borde,
          }}
        >
          <Image source={{ uri: imagenPendiente.uri }} style={{ width: 44, height: 44, borderRadius: 8 }} />
          <Text style={{ color: colores.textoSuave, fontSize: 13, flex: 1 }}>
            Foto lista para enviar
          </Text>
          <Pressable onPress={() => setImagenPendiente(null)} hitSlop={10}>
            <Ionicons name="close-circle" size={22} color={colores.textoSuave} />
          </Pressable>
        </View>
      )}

      <View
        style={{
          flexDirection: "row",
          alignItems: "flex-end",
          gap: 8,
          paddingHorizontal: 12,
          paddingTop: 8,
          paddingBottom: 10,
          borderTopWidth: 1,
          borderTopColor: colores.borde,
          backgroundColor: colores.tarjeta,
        }}
      >
        <Pressable onPress={() => adjuntar(true)} disabled={pensando} hitSlop={8} style={{ padding: 6 }}>
          <Ionicons name="camera" size={24} color={pensando ? colores.borde : colores.acento} />
        </Pressable>
        <Pressable onPress={() => adjuntar(false)} disabled={pensando} hitSlop={8} style={{ padding: 6 }}>
          <Ionicons name="image" size={23} color={pensando ? colores.borde : colores.acento} />
        </Pressable>
        <TextInput
          style={{
            flex: 1,
            color: colores.texto,
            backgroundColor: colores.fondo,
            borderWidth: 1,
            borderColor: colores.borde,
            borderRadius: 20,
            paddingHorizontal: 14,
            paddingVertical: 9,
            maxHeight: 110,
            fontSize: 15,
          }}
          placeholder="Escribí o mandá una foto…"
          placeholderTextColor={colores.textoSuave}
          value={entrada}
          onChangeText={setEntrada}
          multiline
          editable={!pensando}
        />
        <Pressable
          onPress={enviar}
          disabled={pensando || (!entrada.trim() && !imagenPendiente)}
          style={{
            backgroundColor:
              pensando || (!entrada.trim() && !imagenPendiente) ? colores.borde : colores.acento,
            borderRadius: 20,
            width: 40,
            height: 40,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Ionicons name="arrow-up" size={20} color="#fff" />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}
