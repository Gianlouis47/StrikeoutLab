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

export interface ResultadoCalculadora {
  puntaje: number | null;
  confianza: number | null;
  nivel: "DIAMANTE_ALTO" | "DIAMANTE" | "ORO_ALTO" | "ORO" | "IMPUREZA" | null;
  variablesUsadas: string[];
  variablesFaltantes: string[];
  advertencia: string | null;
}

export interface AnalizarPitcherRespuesta {
  calculada: TasaSuperacionLinea | null;
  juicioIA: JuicioIA;
  contextoCalibracionUsado: BandaCalibracion[];
  busquedasRealizadas: BusquedaRealizada[];
  statsPitcherGuardados: StatsPitcherGuardado[];
  statsEquipoGuardados: StatsEquipoGuardado[];
  puntajeHeuristico: ResultadoCalculadora;
}

export async function analizarPitcher(params: {
  pitcher: string;
  equipo: string;
  rival: string;
  linea: number;
  pick: PickTipo;
  notas?: string;
  manoPitcher?: "RHP" | "LHP";
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
  fecha: string | null;
  k: number | null;
  ip: number | null;
  bb: number | null;
  pitcheos: number | null;
  otros_datos: Record<string, unknown>;
}

export interface MensajeChat {
  rol: "usuario" | "asistente";
  texto?: string;
  imagenBase64?: string;
  mimeType?: string;
}

export interface RespuestaChat {
  respuesta: string;
  transcripciones: Array<{ modelo: string; texto: string }>;
  herramientasUsadas: Array<{ nombre: string; argumentos: unknown; resultado: unknown }>;
  razonamiento: string | null;
  modeloUsado: string;
}

/**
 * Única puerta de entrada del análisis: se le manda la conversación (con
 * fotos si las hay) y del otro lado la IA lee, busca los datos, llama a la
 * calculadora y responde. No hay que llenar ningún formulario.
 */
export async function chat(params: { mensajes: MensajeChat[] }): Promise<RespuestaChat> {
  const { data, error } = await supabase.functions.invoke<RespuestaChat>("chat", { body: params });
  if (error) {
    // El cuerpo de error de la Edge Function trae el motivo real; sin esto
    // el usuario solo vería "Edge Function returned a non-2xx status code".
    const detalle = await (error as { context?: { json?: () => Promise<{ error?: string }> } })
      .context?.json?.()
      .then((j) => j?.error)
      .catch(() => undefined);
    throw new Error(detalle ?? error.message);
  }
  if (!data) throw new Error("El chat no devolvió respuesta");
  return data;
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
