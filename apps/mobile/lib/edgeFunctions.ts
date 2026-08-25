import type { PickTipo, TasaSuperacionLinea } from "@strikeoutlab/core";
import type { BandaCalibracion } from "@strikeoutlab/core";
import { supabase } from "./supabase";

export interface PropuestaAprendizaje {
  descubrimiento: string;
  fuente: string;
  regla_nueva: string | null;
  por_que_importa: string | null;
}

export interface JuicioIA {
  confianza: number;
  nivel: "DIAMANTE_ALTO" | "DIAMANTE" | "ORO_ALTO" | "ORO" | "IMPUREZA";
  veredicto: "OVER" | "UNDER" | "NO_BET";
  motivo: string;
  factores_clave: string[];
  propuesta_aprendizaje: PropuestaAprendizaje | null;
}

export interface BusquedaRealizada {
  query: string;
  resultado: string;
}

export interface StatsPitcherGuardado {
  pitcher: string;
  k_pct?: number;
  whiff_pct?: number;
  csw_pct?: number;
  swstr_pct?: number;
  k_9?: number;
  whip?: number;
  ip?: number;
  correa_pitcheos_promedio?: number;
  correa_nota?: string;
  fuente: string;
}

export interface StatsEquipoGuardado {
  equipo: string;
  ventana: "TEMPORADA" | "ULTIMOS_14";
  vs_mano: "RHP" | "LHP";
  k_pct?: number;
  swing_pct?: number;
  chase_pct?: number;
  fuente: string;
}

export interface AnalizarPitcherRespuesta {
  calculada: TasaSuperacionLinea | null;
  juicioIA: JuicioIA;
  contextoCalibracionUsado: BandaCalibracion[];
  busquedasRealizadas: BusquedaRealizada[];
  statsPitcherGuardados: StatsPitcherGuardado[];
  statsEquipoGuardados: StatsEquipoGuardado[];
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
