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

/** Cuota típica de Star Sport: arriesgar 130 para ganar 100. */
export const CUOTA_POR_DEFECTO = -130;

export type VeredictoApuesta = "CONVIENE" | "FLOJO" | "NO CONVIENE";

export interface EvaluacionApuesta {
  cuota_americana: number;
  ganancia_por_peso: number;
  /** El porcentaje que hay que acertar solo para no perder plata. */
  prob_de_equilibrio: number;
  prob_ganar: number;
  prob_perder: number;
  prob_empate: number;
  ventaja: number;
  valor_esperado: number;
  retorno_pct: number;
  kelly_completo: number;
  apuesta_recomendada_pct: number;
  veredicto: VeredictoApuesta;
  explicacion: string;
}

/**
 * Convierte la confianza de la proyección en decisión, contra la cuota real.
 * La probabilidad sola no decide nada: al -130 hace falta 56.5% para empatar.
 */
export async function evaluarApuesta(params: {
  probabilidad: number;
  cuota?: number;
  probEmpate?: number;
}): Promise<EvaluacionApuesta> {
  const { data, error } = await supabase.rpc("evaluar_apuesta", {
    p_prob_ganar: params.probabilidad,
    p_cuota: params.cuota ?? CUOTA_POR_DEFECTO,
    p_prob_empate: params.probEmpate ?? 0,
  });
  if (error) throw new Error(error.message);
  return data as EvaluacionApuesta;
}

export interface Calibracion {
  factor: number;
  confiabilidad: "SIN DATOS" | "PRELIMINAR" | "RAZONABLE" | "BUENA";
  picks_decididos: number;
  aciertos: number;
  empates: number;
  tasa_observada: number | null;
  tasa_estimada: number | null;
  confianza_declarada_media: number | null;
  explicacion: string;
}

export interface EscalonParlay {
  patas: number;
  probabilidad: number;
  pago_por_peso: number;
  valor_esperado: number;
  apuesta_recomendada_pct: number;
  terminas_con_mediana: number;
  terminas_con_promedio: number;
  prob_fundirte: number;
}

export interface EvaluacionParlay {
  calibracion: Calibracion;
  cuota_por_pata: number;
  apuestas_simuladas: number;
  apuesta_fija_pct: number;
  modo: string;
  patas: Array<{ etiqueta: string; confianza_declarada: number; confianza_honesta: number }>;
  tu_parlay: {
    patas: number;
    probabilidad: number;
    pago_por_peso: number;
    valor_esperado: number;
    veredicto: VeredictoApuesta;
  };
  escalera: EscalonParlay[];
  como_leer_la_escalera: string;
  recomendacion: { patas_optimas: number | null; criterio: string };
  nota_empate: string;
}

/**
 * Evalúa un parlay con las confianzas ya corregidas por la calibración real,
 * y devuelve la escalera de 1 a 12 patas para poder ver dónde conviene cortar.
 */
export async function evaluarParlay(params: {
  probabilidades: number[];
  etiquetas?: string[];
  cuota?: number;
  apuestaFijaPct?: number;
}): Promise<EvaluacionParlay> {
  const { data, error } = await supabase.rpc("evaluar_parlay", {
    p_probabilidades: params.probabilidades,
    p_cuota: params.cuota ?? CUOTA_POR_DEFECTO,
    p_apuestas_por_temporada: 100,
    p_etiquetas: params.etiquetas ?? null,
    p_apuesta_fija_pct: params.apuestaFijaPct ?? 5,
  });
  if (error) throw new Error(error.message);
  return data as EvaluacionParlay;
}

/** Cuánto vale de verdad la confianza del modelo, según el historial. */
export async function calibracionReal(): Promise<Calibracion> {
  const { data, error } = await supabase.rpc("calibracion_real");
  if (error) throw new Error(error.message);
  return data as Calibracion;
}
