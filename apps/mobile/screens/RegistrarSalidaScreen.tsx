import * as ImagePicker from "expo-image-picker";
import React, { useState } from "react";
import { Image, ScrollView, Text, View } from "react-native";
import { Boton, Campo, Mensaje, Subtitulo, Tarjeta, Titulo, colores, estilos } from "../components/ui";
import { analizarFoto } from "../lib/edgeFunctions";
import { repositorio } from "../lib/supabase-repository";
import { salidaNuevaSchema } from "../lib/validators";

function vacio() {
  return {
    pitcher: "",
    fecha: new Date().toISOString().slice(0, 10),
    rival: "",
    ip: "",
    k: "",
    bb: "",
    pitcheos: "",
  };
}

export default function RegistrarSalidaScreen() {
  const [form, setForm] = useState(vacio());
  const [uriImagen, setUriImagen] = useState<string | null>(null);
  const [leyendoFoto, setLeyendoFoto] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);

  function actualizar(campo: keyof ReturnType<typeof vacio>, valor: string) {
    setForm((prev) => ({ ...prev, [campo]: valor }));
  }

  async function leerFoto(base64: string, mimeType: string, uri: string) {
    setError(null);
    setExito(null);
    setUriImagen(uri);
    setLeyendoFoto(true);
    try {
      const { datosExtraidos } = await analizarFoto({ imagenBase64: base64, mimeType });
      if (datosExtraidos.tipo_detectado !== "boxscore") {
        setError(
          `La IA detectó esta imagen como "${datosExtraidos.tipo_detectado}", no como boxscore — revisa los campos igual, puede que haya leído algo útil, pero probablemente falten datos.`,
        );
      }
      setForm((prev) => ({
        pitcher: datosExtraidos.pitcher ?? prev.pitcher,
        fecha: datosExtraidos.fecha ?? prev.fecha,
        rival: datosExtraidos.rival ?? prev.rival,
        ip: datosExtraidos.ip !== null ? String(datosExtraidos.ip) : prev.ip,
        k: datosExtraidos.k !== null ? String(datosExtraidos.k) : prev.k,
        bb: datosExtraidos.bb !== null ? String(datosExtraidos.bb) : prev.bb,
        pitcheos: datosExtraidos.pitcheos !== null ? String(datosExtraidos.pitcheos) : prev.pitcheos,
      }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLeyendoFoto(false);
    }
  }

  async function tomarFoto() {
    const permiso = await ImagePicker.requestCameraPermissionsAsync();
    if (!permiso.granted) {
      setError("Necesitas dar permiso de cámara para usar esta función.");
      return;
    }
    const resultado = await ImagePicker.launchCameraAsync({ base64: true, quality: 0.7 });
    if (resultado.canceled || !resultado.assets[0].base64) return;
    const asset = resultado.assets[0];
    await leerFoto(asset.base64!, asset.mimeType ?? "image/jpeg", asset.uri);
  }

  async function elegirDeGaleria() {
    const permiso = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permiso.granted) {
      setError("Necesitas dar permiso de galería para usar esta función.");
      return;
    }
    const resultado = await ImagePicker.launchImageLibraryAsync({ base64: true, quality: 0.7 });
    if (resultado.canceled || !resultado.assets[0].base64) return;
    const asset = resultado.assets[0];
    await leerFoto(asset.base64!, asset.mimeType ?? "image/jpeg", asset.uri);
  }

  async function guardar() {
    setError(null);
    setExito(null);

    const validacion = salidaNuevaSchema.safeParse({
      pitcher: form.pitcher.trim(),
      fecha: form.fecha.trim(),
      rival: form.rival.trim().toUpperCase(),
      ip: parseFloat(form.ip),
      k: parseInt(form.k, 10),
      bb: parseInt(form.bb, 10),
      pitcheos: form.pitcheos.trim() ? parseInt(form.pitcheos, 10) : null,
    });
    if (!validacion.success) {
      setError(validacion.error.issues[0]?.message ?? "Datos inválidos.");
      return;
    }

    setGuardando(true);
    try {
      await repositorio.crear("game_logs", {
        pitcher: validacion.data.pitcher,
        fecha: validacion.data.fecha,
        rival: validacion.data.rival,
        ip: validacion.data.ip,
        k: validacion.data.k,
        bb: validacion.data.bb,
        pitcheos: validacion.data.pitcheos,
      });
      setExito(`Salida de ${validacion.data.pitcher} guardada — ya cuenta para su tasa CALCULADA.`);
      setForm(vacio());
      setUriImagen(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <ScrollView style={estilos.pantalla} contentContainerStyle={estilos.contenido}>
      <Titulo>Registrar salida</Titulo>
      <Subtitulo>
        Guarda el resultado real de un pitcher al terminar su juego — esto alimenta la tasa CALCULADA (historial
        real), distinta del pick que apostaste.
      </Subtitulo>

      <View style={{ flexDirection: "row", gap: 8 }}>
        <View style={{ flex: 1 }}>
          <Boton titulo="Tomar foto del boxscore" onPress={tomarFoto} cargando={leyendoFoto} />
        </View>
        <View style={{ flex: 1 }}>
          <Boton titulo="Elegir de galería" onPress={elegirDeGaleria} variante="secundario" cargando={leyendoFoto} />
        </View>
      </View>

      {uriImagen && (
        <Image source={{ uri: uriImagen }} style={{ width: "100%", height: 180, borderRadius: 12 }} resizeMode="contain" />
      )}

      <Tarjeta>
        <Campo etiqueta="Pitcher" value={form.pitcher} onChangeText={(v) => actualizar("pitcher", v)} placeholder="Nombre completo" />
        <Campo etiqueta="Fecha (YYYY-MM-DD)" value={form.fecha} onChangeText={(v) => actualizar("fecha", v)} />
        <Campo etiqueta="Rival" value={form.rival} onChangeText={(v) => actualizar("rival", v)} autoCapitalize="characters" placeholder="Ej. NYY" />
        <View style={{ flexDirection: "row", gap: 8 }}>
          <View style={{ flex: 1 }}>
            <Campo etiqueta="IP (ej. 6.2)" value={form.ip} onChangeText={(v) => actualizar("ip", v)} keyboardType="decimal-pad" />
          </View>
          <View style={{ flex: 1 }}>
            <Campo etiqueta="K (ponches)" value={form.k} onChangeText={(v) => actualizar("k", v)} keyboardType="number-pad" />
          </View>
        </View>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <View style={{ flex: 1 }}>
            <Campo etiqueta="BB (bases por bolas)" value={form.bb} onChangeText={(v) => actualizar("bb", v)} keyboardType="number-pad" />
          </View>
          <View style={{ flex: 1 }}>
            <Campo etiqueta="Pitcheos (opcional)" value={form.pitcheos} onChangeText={(v) => actualizar("pitcheos", v)} keyboardType="number-pad" />
          </View>
        </View>

        {error && <Mensaje tipo="error" texto={error} />}
        {exito && <Mensaje tipo="exito" texto={exito} />}

        <Boton titulo="Guardar salida" onPress={guardar} cargando={guardando} />
      </Tarjeta>

      <Text style={{ color: colores.textoSuave, fontSize: 12 }}>
        Tip: si la foto no trae todos los datos (o los lee mal), corrígelos a mano antes de guardar — la IA solo
        transcribe, vos confirmás.
      </Text>
    </ScrollView>
  );
}
