import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import React, { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { Boton, Campo, Mensaje, colores, degradadoAcento, estilos } from "../components/ui";
import { supabase } from "../lib/supabase";

export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [modo, setModo] = useState<"entrar" | "crear">("entrar");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mensajeInfo, setMensajeInfo] = useState<string | null>(null);

  async function enviar() {
    setError(null);
    setMensajeInfo(null);
    if (!email || !password) {
      setError("Completá email y contraseña.");
      return;
    }
    setCargando(true);
    try {
      if (modo === "entrar") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        setMensajeInfo("Cuenta creada. Si el proyecto pide confirmación por correo, revisá tu email antes de entrar.");
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCargando(false);
    }
  }

  return (
    <KeyboardAvoidingView style={estilos.pantalla} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView
        contentContainerStyle={{ padding: 24, justifyContent: "center", flexGrow: 1, gap: 18 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Marca centrada: es la primera pantalla, conviene que se sienta
            como una app y no como un formulario suelto. */}
        <View style={{ alignItems: "center", gap: 12, marginBottom: 8 }}>
          <LinearGradient
            colors={degradadoAcento}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{ width: 68, height: 68, borderRadius: 20, alignItems: "center", justifyContent: "center" }}
          >
            <Ionicons name="baseball" size={34} color="#fff" />
          </LinearGradient>
          <Text style={{ color: colores.texto, fontSize: 27, fontWeight: "800", letterSpacing: -0.4 }}>
            StrikeoutLab
          </Text>
          <Text style={{ color: colores.textoSuave, fontSize: 14, textAlign: "center" }}>
            Análisis de ponches para Star Sport
          </Text>
        </View>

        <View style={{ gap: 12 }}>
          <Campo
            etiqueta="Email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            placeholder="tucorreo@ejemplo.com"
          />
          <Campo
            etiqueta="Contraseña"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete={modo === "entrar" ? "current-password" : "new-password"}
            placeholder="••••••••"
            onSubmitEditing={enviar}
            returnKeyType="go"
          />
        </View>

        {error && <Mensaje tipo="error" texto={error} />}
        {mensajeInfo && <Mensaje tipo="info" texto={mensajeInfo} />}

        <Boton titulo={modo === "entrar" ? "Entrar" : "Crear cuenta"} onPress={enviar} cargando={cargando} />

        {/* Cambiar de modo es una acción rara: como enlace, no como botón
            del mismo peso que el de entrar. */}
        <Pressable
          onPress={() => {
            setModo(modo === "entrar" ? "crear" : "entrar");
            setError(null);
            setMensajeInfo(null);
          }}
          style={{ alignItems: "center", paddingVertical: 6 }}
          hitSlop={10}
        >
          <Text style={{ color: colores.textoSuave, fontSize: 13 }}>
            {modo === "entrar" ? "No tengo cuenta todavía" : "Ya tengo cuenta"}
          </Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
