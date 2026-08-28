import { Ionicons } from "@expo/vector-icons";
import type { Session } from "@supabase/supabase-js";
import { StatusBar } from "expo-status-bar";
import React, { useEffect, useState } from "react";
import { Pressable, SafeAreaView, Text, View } from "react-native";
import { Boton, colores, estilos } from "./components/ui";
import { confirmarAccion } from "./lib/confirmacion";
import type { DatosExtraidosFoto } from "./lib/edgeFunctions";
import { supabase } from "./lib/supabase";
import { useEspacioTeclado } from "./lib/teclado";
import AnalizarFotoScreen from "./screens/AnalizarFotoScreen";
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
  { id: "historial", titulo: "Historial", icono: "time" },
  { id: "dashboard", titulo: "Calibración", icono: "stats-chart" },
  { id: "mas", titulo: "Más", icono: "ellipsis-horizontal" },
] as const satisfies ReadonlyArray<{ id: string; titulo: string; icono: keyof typeof Ionicons.glyphMap }>;

const PESTANAS_SECUNDARIAS = [
  { id: "nuevoPick", titulo: "Pick manual", icono: "add-circle" },
  { id: "salida", titulo: "Salida manual", icono: "baseball" },
  { id: "foto", titulo: "Foto suelta", icono: "camera" },
  { id: "rivales", titulo: "Rivales", icono: "people" },
  { id: "parlay", titulo: "Parlay", icono: "layers" },
] as const satisfies ReadonlyArray<{ id: string; titulo: string; icono: keyof typeof Ionicons.glyphMap }>;

type PestanaId =
  | (typeof PESTANAS_PRINCIPALES)[number]["id"]
  | (typeof PESTANAS_SECUNDARIAS)[number]["id"];

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [cargandoSesion, setCargandoSesion] = useState(true);
  const [pestana, setPestana] = useState<PestanaId>("chat");
  const [menuAbierto, setMenuAbierto] = useState(false);
  const [borrador, setBorrador] = useState<BorradorPick | null>(null);
  // El teclado se maneja acá arriba y no adentro de cada pantalla: así la
  // barra de pestañas también se corre y ninguna queda tapada por su cuenta.
  const teclado = useEspacioTeclado();

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

  function usarDatosDeFoto(datos: DatosExtraidosFoto) {
    setBorrador((prev) => ({ datos, version: (prev?.version ?? 0) + 1 }));
    setPestana("nuevoPick");
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
      <SafeAreaView
        style={[estilos.pantalla, { paddingBottom: teclado.espacio }]}
        onLayout={teclado.onLayout}
      >
        <LoginScreen />
        <StatusBar style="light" />
      </SafeAreaView>
    );
  }

  const enSecundaria = PESTANAS_SECUNDARIAS.some((p) => p.id === pestana);

  return (
    <SafeAreaView
      style={[estilos.pantalla, { paddingBottom: teclado.espacio }]}
      onLayout={teclado.onLayout}
    >
      <View style={{ flex: 1 }}>
        {pestana === "chat" && <ChatScreen />}
        {pestana === "dashboard" && <DashboardScreen />}
        {pestana === "nuevoPick" && <NuevaPickScreen borrador={borrador} />}
        {pestana === "foto" && <AnalizarFotoScreen onUsarDatos={usarDatosDeFoto} />}
        {pestana === "salida" && <RegistrarSalidaScreen />}
        {pestana === "historial" && <HistorialScreen />}
        {pestana === "rivales" && <RivalesScreen />}
        {pestana === "parlay" && <ParlayScreen />}
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
                setPestana(p.id);
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
                  setPestana(p.id as PestanaId);
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
    </SafeAreaView>
  );
}
