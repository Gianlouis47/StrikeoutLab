import { detectarCorrelacionMismoJuego, probabilidadParlay } from "@strikeoutlab/core";
import React, { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { Boton, Campo, Mensaje, Subtitulo, Tarjeta, Titulo, colores, estilos } from "../components/ui";

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
  const [advertencias, setAdvertencias] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  function actualizarPata(i: number, campo: keyof Pata, valor: string) {
    setPatas((prev) => prev.map((p, idx) => (idx === i ? { ...p, [campo]: valor } : p)));
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

  return (
    <ScrollView style={estilos.pantalla} contentContainerStyle={estilos.contenido}>
      <Titulo>Parlay</Titulo>
      <Subtitulo>Probabilidad combinada real — asume independencia entre patas</Subtitulo>

      {patas.map((pata, i) => (
        <Tarjeta key={i}>
          <View style={estilos.filaEntreEspacio}>
            <Text style={{ color: colores.texto, fontWeight: "700" }}>Pata {i + 1}</Text>
            {patas.length > 2 && (
              <Boton
                titulo="Quitar"
                variante="peligro"
                onPress={() => setPatas((prev) => prev.filter((_, idx) => idx !== i))}
              />
            )}
          </View>
          <Campo
            etiqueta="Confianza (%)"
            value={pata.confianza}
            onChangeText={(v) => actualizarPata(i, "confianza", v)}
            keyboardType="decimal-pad"
            placeholder="85"
          />
          <Text style={{ color: colores.textoSuave, fontSize: 12 }}>
            Opcional (para detectar patas del mismo juego):
          </Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Campo etiqueta="Equipo" value={pata.equipo} onChangeText={(v) => actualizarPata(i, "equipo", v)} autoCapitalize="characters" />
            </View>
            <View style={{ flex: 1 }}>
              <Campo etiqueta="Rival" value={pata.rival} onChangeText={(v) => actualizarPata(i, "rival", v)} autoCapitalize="characters" />
            </View>
          </View>
        </Tarjeta>
      ))}

      <Boton titulo="Agregar pata" variante="secundario" onPress={() => setPatas((prev) => [...prev, pataVacia()])} />
      <Boton titulo="Calcular probabilidad" onPress={calcular} />

      {error && <Mensaje tipo="error" texto={error} />}

      {resultado !== null && (
        <Tarjeta>
          <Text style={{ color: colores.texto, fontWeight: "700", fontSize: 18 }}>
            Probabilidad combinada: {(resultado * 100).toFixed(2)}%
          </Text>
          {advertencias.map((a, i) => (
            <Mensaje key={i} tipo="error" texto={a} />
          ))}
        </Tarjeta>
      )}
    </ScrollView>
  );
}
