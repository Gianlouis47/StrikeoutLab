import { detectarCorrelacionMismoJuego, probabilidadParlay } from "@strikeoutlab/core";
import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import {
  Barra,
  Boton,
  Campo,
  Mensaje,
  Metrica,
  Seccion,
  Subtitulo,
  Tarjeta,
  Titulo,
  colores,
  estilos,
} from "../components/ui";

interface Pata {
  confianza: string;
  fecha: string;
  equipo: string;
  rival: string;
}

function pataVacia(): Pata {
  return { confianza: "", fecha: new Date().toISOString().slice(0, 10), equipo: "", rival: "" };
}

export default function ParlayScreen() {
  const [patas, setPatas] = useState<Pata[]>([pataVacia(), pataVacia()]);
  const [resultado, setResultado] = useState<number | null>(null);
  const [confianzasUsadas, setConfianzasUsadas] = useState<number[]>([]);
  const [advertencias, setAdvertencias] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [detalleAbierto, setDetalleAbierto] = useState<number | null>(null);

  function actualizarPata(i: number, campo: keyof Pata, valor: string) {
    setPatas((prev) => prev.map((p, idx) => (idx === i ? { ...p, [campo]: valor } : p)));
    setResultado(null);
  }

  function calcular() {
    setError(null);
    setResultado(null);
    setAdvertencias([]);
    try {
      const confianzas = patas.map((p) => {
        const num = parseFloat(p.confianza) / 100;
        if (Number.isNaN(num)) throw new Error("Todas las patas necesitan una confianza (%) válida.");
        return num;
      });
      const probabilidad = probabilidadParlay(confianzas);
      setResultado(probabilidad);
      setConfianzasUsadas(confianzas);

      const patasConDatos = patas.filter((p) => p.equipo && p.rival);
      if (patasConDatos.length === patas.length) {
        setAdvertencias(
          detectarCorrelacionMismoJuego(
            patas.map((p) => ({ fecha: p.fecha, equipo: p.equipo.toUpperCase(), rival: p.rival.toUpperCase() })),
          ),
        );
      }
    } catch (e) {
      setError((e as Error).message);
    }
  }

  // La caída es lo que la gente subestima: dos patas al 85% no dan 85%.
  const peor = confianzasUsadas.length > 0 ? Math.min(...confianzasUsadas) : null;

  return (
    <ScrollView style={estilos.pantalla} contentContainerStyle={estilos.contenido}>
      <View>
        <Titulo>Parlay</Titulo>
        <Subtitulo>Cuánto queda de verdad al combinar varias patas</Subtitulo>
      </View>

      {resultado !== null && (
        <Tarjeta elevada>
          <View style={{ alignItems: "center", gap: 6, paddingVertical: 4 }}>
            <Text
              style={{
                color: resultado >= 0.5 ? colores.exito : resultado >= 0.3 ? colores.advertencia : colores.peligro,
                fontSize: 42,
                fontWeight: "800",
                letterSpacing: -1,
              }}
            >
              {(resultado * 100).toFixed(1)}%
            </Text>
            <Text style={{ color: colores.textoSuave, fontSize: 13 }}>
              probabilidad de que salgan las {patas.length} patas
            </Text>
          </View>

          <Barra
            proporcion={resultado}
            tono={resultado >= 0.5 ? "exito" : resultado >= 0.3 ? "advertencia" : "peligro"}
            alto={8}
          />

          {peor !== null && (
            <Text style={{ color: colores.textoSuave, fontSize: 12, marginTop: 6, lineHeight: 17 }}>
              Tu pata más floja está en {(peor * 100).toFixed(0)}%, y el combinado queda en{" "}
              {(resultado * 100).toFixed(1)}%: cada pata que agregás baja el total, aunque todas se vean buenas.
            </Text>
          )}

          {advertencias.map((a, i) => (
            <Mensaje key={i} tipo="error" texto={a} />
          ))}
        </Tarjeta>
      )}

      <Seccion titulo={`${patas.length} patas`} />

      {patas.map((pata, i) => {
        const abierto = detalleAbierto === i;
        return (
          <Tarjeta key={i}>
            <View style={estilos.filaEntreEspacio}>
              <Text style={{ color: colores.texto, fontWeight: "700", fontSize: 15 }}>Pata {i + 1}</Text>
              {patas.length > 2 && (
                <Pressable
                  onPress={() => {
                    setPatas((prev) => prev.filter((_, idx) => idx !== i));
                    setResultado(null);
                  }}
                  hitSlop={10}
                >
                  <Ionicons name="trash-outline" size={18} color={colores.peligro} />
                </Pressable>
              )}
            </View>

            <Campo
              etiqueta="Confianza (%)"
              value={pata.confianza}
              onChangeText={(v) => actualizarPata(i, "confianza", v)}
              keyboardType="decimal-pad"
              placeholder="85"
            />

            {/* Los campos de equipo solo sirven para detectar patas del mismo
                juego: van escondidos para no competir con lo importante. */}
            {abierto ? (
              <View style={{ gap: 8, marginTop: 4 }}>
                <Text style={{ color: colores.textoSuave, fontSize: 12 }}>
                  Con esto detecto si dos patas son del mismo juego (ahí la probabilidad real cambia).
                </Text>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <View style={{ flex: 1 }}>
                    <Campo
                      etiqueta="Equipo"
                      value={pata.equipo}
                      onChangeText={(v) => actualizarPata(i, "equipo", v)}
                      autoCapitalize="characters"
                      placeholder="NYY"
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Campo
                      etiqueta="Rival"
                      value={pata.rival}
                      onChangeText={(v) => actualizarPata(i, "rival", v)}
                      autoCapitalize="characters"
                      placeholder="BOS"
                    />
                  </View>
                </View>
                <Pressable onPress={() => setDetalleAbierto(null)} hitSlop={8}>
                  <Text style={{ color: colores.textoSuave, fontSize: 12 }}>Ocultar</Text>
                </Pressable>
              </View>
            ) : (
              <Pressable
                onPress={() => setDetalleAbierto(i)}
                style={{ flexDirection: "row", alignItems: "center", gap: 5 }}
                hitSlop={8}
              >
                <Ionicons name="add-circle-outline" size={15} color={colores.textoSuave} />
                <Text style={{ color: colores.textoSuave, fontSize: 12 }}>
                  {pata.equipo && pata.rival ? `${pata.equipo} vs ${pata.rival}` : "Agregar equipo y rival (opcional)"}
                </Text>
              </Pressable>
            )}
          </Tarjeta>
        );
      })}

      {error && <Mensaje tipo="error" texto={error} />}

      <Boton
        titulo="Agregar otra pata"
        variante="secundario"
        onPress={() => {
          setPatas((prev) => [...prev, pataVacia()]);
          setResultado(null);
        }}
      />
      <Boton titulo="Calcular" onPress={calcular} />
    </ScrollView>
  );
}
