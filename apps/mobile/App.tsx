import { Ionicons } from "@expo/vector-icons";
import type { Session } from "@supabase/supabase-js";
import { StatusBar } from "expo-status-bar";
import React, { useEffect, useState } from "react";
import { Pressable, SafeAreaView, Text, View } from "react-native";
import { Boton, colores, estilos } from "./components/ui";
import { confirmarAccion } from "./lib/confirmacion";
import type { DatosExtraidosFoto } from "./lib/edgeFunctions";
import { supabase } from "./lib/supabase";
import AnalizarFotoScreen from "./screens/AnalizarFotoScreen";
import DashboardScreen from "./screens/DashboardScreen";
import HistorialScreen from "./screens/HistorialScreen";
import LoginScreen from "./screens/LoginScreen";
import NuevaPickScreen, { type BorradorPick } from "./screens/NuevaPickScreen";
import ParlayScreen from "./screens/ParlayScreen";
import RivalesScreen from "./screens/RivalesScreen";

const PESTANAS = [
  { id: "dashboard", titulo: "Calibración", icono: "stats-chart" },
  { id: "nuevoPick", titulo: "Nuevo Pick", icono: "add-circle" },
  { id: "foto", titulo: "Foto", icono: "camera" },
  { id: "historial", titulo: "Historial", icono: "time" },
  { id: "rivales", titulo: "Rivales", icono: "people" },
  { id: "parlay", titulo: "Parlay", icono: "layers" },
] as const satisfies ReadonlyArray<{ id: string; titulo: string; icono: keyof typeof Ionicons.glyphMap }>;

type PestanaId = (typeof PESTANAS)[number]["id"];

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [cargandoSesion, setCargandoSesion] = useState(true);
  const [pestana, setPestana] = useState<PestanaId>("dashboard");
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
      <SafeAreaView style={estilos.pantalla}>
        <LoginScreen />
        <StatusBar style="light" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={estilos.pantalla}>
      <View style={{ flex: 1 }}>
        {pestana === "dashboard" && <DashboardScreen />}
        {pestana === "nuevoPick" && <NuevaPickScreen borrador={borrador} />}
        {pestana === "foto" && <AnalizarFotoScreen onUsarDatos={usarDatosDeFoto} />}
        {pestana === "historial" && <HistorialScreen />}
        {pestana === "rivales" && <RivalesScreen />}
        {pestana === "parlay" && <ParlayScreen />}
      </View>

      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          borderTopWidth: 1,
          borderTopColor: colores.borde,
          backgroundColor: colores.tarjeta,
          paddingVertical: 6,
        }}
      >
        {PESTANAS.map((p) => {
          const activa = pestana === p.id;
          return (
            <Pressable
              key={p.id}
              onPress={() => setPestana(p.id)}
              style={{ flexBasis: "33%", alignItems: "center", paddingVertical: 6, gap: 2 }}
            >
              <View
                style={{
                  width: 40,
                  height: 26,
                  borderRadius: 13,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: activa ? colores.acento + "26" : "transparent",
                }}
              >
                <Ionicons
                  name={activa ? p.icono : (`${p.icono}-outline` as keyof typeof Ionicons.glyphMap)}
                  size={18}
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

      <View style={{ paddingHorizontal: 12, paddingBottom: 4 }}>
        <Boton
          titulo="Cerrar sesión"
          variante="secundario"
          onPress={() =>
            confirmarAccion({
              titulo: "¿Cerrar sesión?",
              mensaje: "Vas a tener que volver a iniciar sesión para usar la app.",
              tituloBotonConfirmar: "Cerrar sesión",
              onConfirmar: () => supabase.auth.signOut(),
            })
          }
        />
      </View>

      <StatusBar style="light" />
    </SafeAreaView>
  );
}
