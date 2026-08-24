import React, { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView } from "react-native";
import { Boton, Campo, Mensaje, Subtitulo, Titulo, estilos } from "../components/ui";
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
      setError("Completa email y contraseña.");
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
        setMensajeInfo("Cuenta creada. Si tu proyecto pide confirmación por correo, revisa tu email antes de entrar.");
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCargando(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={estilos.pantalla}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView contentContainerStyle={[estilos.contenido, { justifyContent: "center", flexGrow: 1 }]}>
        <Titulo>StrikeoutLab</Titulo>
        <Subtitulo>
          {modo === "entrar" ? "Inicia sesión con tu cuenta" : "Crea tu cuenta (app de un solo usuario)"}
        </Subtitulo>

        <Campo
          etiqueta="Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          placeholder="tucorreo@ejemplo.com"
        />
        <Campo
          etiqueta="Contraseña"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          placeholder="••••••••"
        />

        {error && <Mensaje tipo="error" texto={error} />}
        {mensajeInfo && <Mensaje tipo="info" texto={mensajeInfo} />}

        <Boton
          titulo={modo === "entrar" ? "Iniciar sesión" : "Crear cuenta"}
          onPress={enviar}
          cargando={cargando}
        />
        <Boton
          titulo={modo === "entrar" ? "No tengo cuenta todavía" : "Ya tengo cuenta"}
          variante="secundario"
          onPress={() => setModo(modo === "entrar" ? "crear" : "entrar")}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
