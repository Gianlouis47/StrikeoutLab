import * as ImagePicker from "expo-image-picker";
import React, { useState } from "react";
import { Image, ScrollView, Text, View } from "react-native";
import { Boton, Mensaje, Subtitulo, Tarjeta, Titulo, colores, estilos } from "../components/ui";
import { analizarFoto, type DatosExtraidosFoto } from "../lib/edgeFunctions";

export default function AnalizarFotoScreen({
  onUsarDatos,
}: {
  onUsarDatos: (datos: DatosExtraidosFoto) => void;
}) {
  const [uriImagen, setUriImagen] = useState<string | null>(null);
  const [analizando, setAnalizando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<DatosExtraidosFoto | null>(null);

  async function analizar(base64: string, mimeType: string, uri: string) {
    setError(null);
    setResultado(null);
    setUriImagen(uri);
    setAnalizando(true);
    try {
      const { datosExtraidos } = await analizarFoto({ imagenBase64: base64, mimeType });
      setResultado(datosExtraidos);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setAnalizando(false);
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
    await analizar(asset.base64!, asset.mimeType ?? "image/jpeg", asset.uri);
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
    await analizar(asset.base64!, asset.mimeType ?? "image/jpeg", asset.uri);
  }

  return (
    <ScrollView style={estilos.pantalla} contentContainerStyle={estilos.contenido}>
      <Titulo>Analizar foto</Titulo>
      <Subtitulo>Ticket de Star Sport, captura de stats, o boxscore. La IA lee lo que puede — revisa antes de guardar.</Subtitulo>

      <View style={{ flexDirection: "row", gap: 8 }}>
        <View style={{ flex: 1 }}>
          <Boton titulo="Tomar foto" onPress={tomarFoto} cargando={analizando} />
        </View>
        <View style={{ flex: 1 }}>
          <Boton titulo="Elegir de galería" onPress={elegirDeGaleria} variante="secundario" cargando={analizando} />
        </View>
      </View>

      {uriImagen && (
        <Image source={{ uri: uriImagen }} style={{ width: "100%", height: 220, borderRadius: 12 }} resizeMode="contain" />
      )}

      {error && <Mensaje tipo="error" texto={error} />}

      {resultado && (
        <Tarjeta>
          <Text style={{ color: colores.texto, fontWeight: "700" }}>
            Tipo detectado: {resultado.tipo_detectado}
          </Text>
          <Text style={{ color: colores.textoSuave }}>Pitcher: {resultado.pitcher ?? "—"}</Text>
          <Text style={{ color: colores.textoSuave }}>Equipo / Rival: {resultado.equipo ?? "—"} / {resultado.rival ?? "—"}</Text>
          <Text style={{ color: colores.textoSuave }}>
            Línea / Pick: {resultado.linea ?? "—"} / {resultado.pick ?? "—"}
          </Text>
          <Text style={{ color: colores.textoSuave }}>Cuota: {resultado.cuota ?? "—"}</Text>
          <Text style={{ color: colores.textoSuave }}>Código: {resultado.codigo ?? "—"}</Text>
          {Object.keys(resultado.otros_datos ?? {}).length > 0 && (
            <Text style={{ color: colores.textoSuave }}>
              Otros datos: {JSON.stringify(resultado.otros_datos)}
            </Text>
          )}
          <Boton titulo="Usar estos datos en Nuevo Pick" onPress={() => onUsarDatos(resultado)} />
        </Tarjeta>
      )}
    </ScrollView>
  );
}
