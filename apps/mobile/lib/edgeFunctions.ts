import type { PickTipo, TasaSuperacionLinea } from "@strikeoutlab/core";
import type { BandaCalibracion } from "@strikeoutlab/core";
import { supabase } from "./supabase";

export interface JuicioIA {
  confianza: number;
  nivel: "DIAMANTE" | "ORO_ALTO" | "ORO" | "IMPUREZA";
  veredicto: "OVER" | "UNDER" | "NO_BET";
  motivo: string;
  factores_clave: string[];
}

export interface AnalizarPitcherRespuesta {
  calculada: TasaSuperacionLinea | null;
  juicioIA: JuicioIA;
  contextoCalibracionUsado: BandaCalibracion[];
}

export async function analizarPitcher(params: {
  pitcher: string;
  equipo: string;
  rival: string;
  linea: number;
  pick: PickTipo;
  notas?: string;
}): Promise<AnalizarPitcherRespuesta> {
  const { data, error } = await supabase.functions.invoke<AnalizarPitcherRespuesta>("analizar-pitcher", {
    body: params,
  });
  if (error) throw error;
  if (!data) throw new Error("analizar-pitcher no devolvió datos");
  return data;
}

export interface DatosExtraidosFoto {
  tipo_detectado: "ticket_star_sport" | "captura_stats" | "boxscore" | "desconocido";
  pitcher: string | null;
  equipo: string | null;
  rival: string | null;
  linea: number | null;
  pick: "OVER" | "UNDER" | null;
  cuota: number | null;
  codigo: string | null;
  otros_datos: Record<string, unknown>;
}

export async function analizarFoto(params: {
  imagenBase64: string;
  mimeType: string;
}): Promise<{ datosExtraidos: DatosExtraidosFoto; modeloUsado: string }> {
  const { data, error } = await supabase.functions.invoke<{
    datosExtraidos: DatosExtraidosFoto;
    modeloUsado: string;
  }>("analizar-foto", { body: params });
  if (error) throw error;
  if (!data) throw new Error("analizar-foto no devolvió datos");
  return data;
}
