import { Ionicons } from "@expo/vector-icons";
import type { Session } from "@supabase/supabase-js";
import { StatusBar } from "expo-status-bar";
import React, { useCallback, useEffect, useState } from "react";
import { Pressable, SafeAreaView, Text, View } from "react-native";
import { KeyboardAvoidingView, KeyboardProvider } from "react-native-keyboard-controller";
import { Boton, colores, estilos } from "./components/ui";
import { confirmarAccion } from "./lib/confirmacion";
import type { DatosExtraidosFoto } from "./lib/edgeFunctions";
import { supabase } from "./lib/supabase";
import AnalizarFotoScreen from "./screens/AnalizarFotoScreen";
import BuscarLanzadorScreen from "./screens/BuscarLanzadorScreen";
import ChatScreen from "./screens/ChatScreen";
import DashboardScreen from "./screens/DashboardScreen";
import HistorialScreen from "./screens/HistorialScreen";
import LoginScreen from "./screens/LoginScreen";
import NuevaPickScreen, { type BorradorPick } from "./screens/NuevaPickScreen";
import ParlayScreen from "./screens/ParlayScreen";
import RegistrarSalidaScreen from "./screens/RegistrarSalidaScreen";
import RivalesScreen from "./screens/RivalesScreen";

// El chat es la pantalla principal: ahí la IA lee las fotos, busca los datos
// y calcula sola. Las demás son para revisar o corregir a mano, así que van
// detrás de "Más" en vez de competir por espacio en la barra.
const PESTANAS_PRINCIPALES = [
  { id: "chat", titulo: "Análisis", icono: "chatbubbles" },
  { id: "buscar", titulo: "Lanzador", icono: "search" },
  { id: "historial", titulo: "Historial", icono: "time" },
  { id: "mas", titulo: "Más", icono: "ellipsis-horizontal" },
] as const satisfies ReadonlyArray<{ id: string; titulo: string; icono: keyof typeof Ionicons.glyphMap }>;

const PESTANAS_SECUNDARIAS = [
  { id: "dashboard", titulo: "Calibración", icono: "stats-chart" },
  { id: "nuevoPick", titulo: "Pick manual", icono: "add-circle" },
  { id: "salida", titulo: "Salida manual", icono: "baseball" },
  { id: "foto", titulo: "Foto suelta", icono: "camera" },
  { id: "rivales", titulo: "Rivales", icono: "people" },
  { id: "parlay", titulo: "Parlay", icono: "layers" },
] as const satisfies ReadonlyArray<{ id: string; titulo: string; icono: keyof typeof Ionicons.glyphMap }>;

type PestanaId =
  | (typeof PESTANAS_PRINCIPALES)[number]["id"]
  | (typeof PESTANAS_SECUNDARIAS)[number]["id"];

/**
 * Una pantalla que se esconde en vez de desmontarse.
 *
 * Antes esto era `{pestana === "chat" && <ChatScreen />}`, y ahí está el
 * "se borra todo": al cambiar de pestaña React desmonta el componente y con
 * él se van el useState, lo que estabas escribiendo y la conversación
 * entera. Volver no la recupera porque no quedó nada que recuperar.
 *
 * Con `display: "none"` la pantalla sigue montada y conserva su estado, pero
 * no ocupa lugar ni se dibuja. `visitada` es para no montar las ocho de
 * entrada: cada una carga sus datos al montarse, y arrancar la app pidiendo
 * ocho consultas a la vez la haría lenta justo al abrirla.
 */
function Pestana({
  activa,
  visitada,
  children,
}: {
  activa: boolean;
  visitada: boolean;
  children: React.ReactNode;
}) {
  if (!visitada) return null;
  return <View style={{ flex: 1, display: activa ? "flex" : "none" }}>{children}</View>;
}

function Contenido() {
  const [session, setSession] = useState<Session | null>(null);
  const [cargandoSesion, setCargandoSesion] = useState(true);
  const [pestana, setPestana] = useState<PestanaId>("chat");
  // Qué pantallas ya se abrieron alguna vez. Una vez montadas se quedan
  // montadas, para que no pierdan lo que tienen escrito o cargado.
  const [visitadas, setVisitadas] = useState<Set<PestanaId>>(() => new Set<PestanaId>(["chat"]));
  const [menuAbierto, setMenuAbierto] = useState(false);
  const [borrador, setBorrador] = useState<BorradorPick | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setCargandoSesion(false);
    });
    const { data: suscripcion } = supabase.auth.onAuthStateChange((_evento, nuevaSesion) => {
      setSession(nuevaSesion);
    });
    return () => suscripcion.subscription.unsubscribe();
  }, []);

  const irA = useCallback((id: PestanaId) => {
    setPestana(id);
    setVisitadas((previas) => (previas.has(id) ? previas : new Set(previas).add(id)));
  }, []);

  function usarDatosDeFoto(datos: DatosExtraidosFoto) {
    setBorrador((prev) => ({ datos, version: (prev?.version ?? 0) + 1 }));
    irA("nuevoPick");
  }

  if (cargandoSesion) {
    return (
      <SafeAreaView style={[estilos.pantalla, { alignItems: "center", justifyContent: "center" }]}>
        <Text style={{ color: colores.texto }}>Cargando…</Text>
      </SafeAreaView>
    );
  }

  if (!session) {
    return (
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <SafeAreaView style={estilos.pantalla}>
          <LoginScreen />
          <StatusBar style="light" />
        </SafeAreaView>
      </KeyboardAvoidingView>
    );
  }

  const enSecundaria = PESTANAS_SECUNDARIAS.some((p) => p.id === pestana);

  return (
    // El KeyboardAvoidingView es el de react-native-keyboard-controller, no
    // el de React Native. Desde Android 15 el sistema ya no achica la ventana
    // cuando sale el teclado (edge-to-edge forzado), y el de React Native
    // quedó estructuralmente roto ahí: por eso el campo se veía tapado.
    // Este corre en el hilo de UI y se comporta igual en los dos sistemas.
    //
    // Va envolviendo TODO, pantallas y barra de pestañas juntas, que es el
    // comportamiento que las pantallas ya esperaban de cuando adjustResize
    // funcionaba.
    <SafeAreaView style={estilos.pantalla}>
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
      <View style={{ flex: 1 }}>
        <Pestana activa={pestana === "chat"} visitada={visitadas.has("chat")}>
          <ChatScreen />
        </Pestana>
        <Pestana activa={pestana === "buscar"} visitada={visitadas.has("buscar")}>
          <BuscarLanzadorScreen />
        </Pestana>
        <Pestana activa={pestana === "dashboard"} visitada={visitadas.has("dashboard")}>
          <DashboardScreen />
        </Pestana>
        <Pestana activa={pestana === "nuevoPick"} visitada={visitadas.has("nuevoPick")}>
          <NuevaPickScreen borrador={borrador} />
        </Pestana>
        <Pestana activa={pestana === "foto"} visitada={visitadas.has("foto")}>
          <AnalizarFotoScreen onUsarDatos={usarDatosDeFoto} />
        </Pestana>
        <Pestana activa={pestana === "salida"} visitada={visitadas.has("salida")}>
          <RegistrarSalidaScreen />
        </Pestana>
        <Pestana activa={pestana === "historial"} visitada={visitadas.has("historial")}>
          <HistorialScreen />
        </Pestana>
        <Pestana activa={pestana === "rivales"} visitada={visitadas.has("rivales")}>
          <RivalesScreen />
        </Pestana>
        <Pestana activa={pestana === "parlay"} visitada={visitadas.has("parlay")}>
          <ParlayScreen />
        </Pestana>
      </View>

      {menuAbierto && (
        <View
          style={{
            borderTopWidth: 1,
            borderTopColor: colores.borde,
            backgroundColor: colores.tarjetaElevada,
            paddingVertical: 6,
          }}
        >
          {PESTANAS_SECUNDARIAS.map((p) => (
            <Pressable
              key={p.id}
              onPress={() => {
                irA(p.id);
                setMenuAbierto(false);
              }}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
                paddingVertical: 11,
                paddingHorizontal: 20,
              }}
            >
              <Ionicons
                name={pestana === p.id ? p.icono : (`${p.icono}-outline` as keyof typeof Ionicons.glyphMap)}
                size={19}
                color={pestana === p.id ? colores.acento : colores.textoSuave}
              />
              <Text
                style={{
                  color: pestana === p.id ? colores.acento : colores.texto,
                  fontWeight: pestana === p.id ? "700" : "400",
                  fontSize: 14,
                }}
              >
                {p.titulo}
              </Text>
            </Pressable>
          ))}
          <Pressable
            onPress={() => {
              setMenuAbierto(false);
              confirmarAccion({
                titulo: "¿Cerrar sesión?",
                mensaje: "Vas a tener que volver a iniciar sesión para usar la app.",
                tituloBotonConfirmar: "Cerrar sesión",
                onConfirmar: () => supabase.auth.signOut(),
              });
            }}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 12,
              paddingVertical: 11,
              paddingHorizontal: 20,
              borderTopWidth: 1,
              borderTopColor: colores.borde,
              marginTop: 4,
            }}
          >
            <Ionicons name="log-out-outline" size={19} color={colores.peligro} />
            <Text style={{ color: colores.peligro, fontSize: 14 }}>Cerrar sesión</Text>
          </Pressable>
        </View>
      )}

      <View
        style={{
          flexDirection: "row",
          borderTopWidth: 1,
          borderTopColor: colores.borde,
          backgroundColor: colores.tarjeta,
          paddingVertical: 6,
        }}
      >
        {PESTANAS_PRINCIPALES.map((p) => {
          const esMenu = p.id === "mas";
          // "Más" se ve activo cuando estás dentro de cualquiera de sus pantallas.
          const activa = esMenu ? menuAbierto || enSecundaria : pestana === p.id;
          return (
            <Pressable
              key={p.id}
              onPress={() => {
                if (esMenu) {
                  setMenuAbierto((v) => !v);
                } else {
                  irA(p.id as PestanaId);
                  setMenuAbierto(false);
                }
              }}
              style={{ flex: 1, alignItems: "center", paddingVertical: 6, gap: 2 }}
            >
              <View
                style={{
                  width: 42,
                  height: 26,
                  borderRadius: 13,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: activa ? colores.acento + "26" : "transparent",
                }}
              >
                <Ionicons
                  name={activa ? p.icono : (`${p.icono}-outline` as keyof typeof Ionicons.glyphMap)}
                  size={19}
                  color={activa ? colores.acento : colores.textoSuave}
                />
              </View>
              <Text
                style={{
                  color: activa ? colores.acento : colores.textoSuave,
                  fontWeight: activa ? "700" : "400",
                  fontSize: 11,
                }}
              >
                {p.titulo}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <StatusBar style="light" />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/**
 * KeyboardProvider va en la raíz, arriba de todo, incluida la pantalla de
 * carga y la de login: es el que instala el listener nativo que sigue al
 * teclado cuadro a cuadro. Sin él, los componentes de la librería no se
 * mueven y volvemos al problema original.
 */
export default function App() {
  return (
    <KeyboardProvider>
      <Contenido />
    </KeyboardProvider>
  );
}
