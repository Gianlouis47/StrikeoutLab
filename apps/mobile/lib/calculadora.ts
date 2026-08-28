// Cliente de la calculadora que vive en Postgres (función proyectar_ponches).
//
// No pasa por la IA: es aritmética exacta y responde en milisegundos. La
// pantalla la llama directo, sin intermediarios.

import { supabase } from "./supabase";

export interface StatsUsadas {
  k_pct: number | null;
  whip: number | null;
  ip_por_salida: number | null;
  salidas: number | null;
  es_abridor: boolean | null;
  swstr_pct: number | null;
  csw_pct: number | null;
  chase_pct: number | null;
}

/**
 * Cuánto se corrigió cada stat por el tamaño de la muestra. Un lanzador con
 * dos bateadores enfrentados y un ponche tiene 50% de K%, y eso no es una
 * tasa: es ruido. La calculadora lo empuja hacia un ancla en proporción a lo
 * poco que sabemos, y acá queda el rastro para poder auditarlo.
 */
export interface AjustePorMuestra {
  bateadores_de_muestra: number;
  /** Cuánto pesó lo observado frente al ancla, 0-1. */
  peso_de_lo_observado: number;
  k_pct_crudo: number | null;
  k_pct_ajustado: number;
  whip_crudo: number | null;
  whip_ajustado: number;
  ip_por_salida_crudo: number | null;
  ip_por_salida_ajustado: number;
  /** De dónde salió el ancla del K%, en palabras. */
  ancla_usada: string;
}

export interface Proyeccion {
  encontrado: true;
  pitcher: string;
  /** Equipo del lanzador. Null si cambió de equipo esta temporada. */
  equipo: string | null;
  linea: number;
  rival: string;
  mano_pitcher: "RHP" | "LHP" | null;
  fuente_k_rival: string;
  k_proyectados: number;
  bateadores_esperados: number;
  k_pct_combinado: number;
  prob_over: number;
  prob_under: number;
  prob_empate: number;
  veredicto: "OVER" | "UNDER" | null;
  confianza: number;
  nivel: "DIAMANTE_ALTO" | "DIAMANTE" | "ORO_ALTO" | "ORO" | "IMPUREZA";
  stats_usadas: StatsUsadas;
  ajuste_por_muestra: AjustePorMuestra;
  entradas_usadas: string[];
  supuestos: string[];
  advertencias: string[];
}

export interface PitcherNoEncontrado {
  encontrado: false;
  buscado: string;
  mensaje: string;
}

export type ResultadoProyeccion = Proyeccion | PitcherNoEncontrado;

/**
 * Proyecta los ponches de un lanzador contra un rival y una línea. Busca
 * sola las estadísticas guardadas — solo hace falta el nombre y la línea.
 */
export async function proyectarPonches(params: {
  pitcher: string;
  linea: number;
  rival?: string;
  manoPitcher?: "RHP" | "LHP";
  ventanaRival?: "TEMPORADA" | "ULTIMOS_14";
}): Promise<ResultadoProyeccion> {
  const { data, error } = await supabase.rpc("proyectar_ponches", {
    p_pitcher: params.pitcher,
    p_linea: params.linea,
    p_rival: params.rival || null,
    p_mano: params.manoPitcher ?? null,
    p_ventana_rival: params.ventanaRival ?? "TEMPORADA",
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("La calculadora no devolvió resultado.");
  return data as ResultadoProyeccion;
}

export interface CandidatoPitcher {
  pitcher: string;
  certeza: number;
  k_pct: number | null;
  whip: number | null;
  ip_por_salida: number | null;
  salidas: number | null;
  es_abridor: boolean | null;
}

/** Busca lanzadores por nombre, tolerando abreviaciones y acentos. */
export async function buscarPitcher(nombre: string): Promise<CandidatoPitcher[]> {
  const { data, error } = await supabase.rpc("buscar_pitcher", { texto_busqueda: nombre });
  if (error) throw new Error(error.message);
  return (data ?? []) as CandidatoPitcher[];
}
