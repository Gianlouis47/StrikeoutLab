/**
 * Calculadora heurística.
 *
 * Esta NO es la IA — es aritmética exacta sobre las estadísticas reales ya
 * guardadas del pitcher y del rival. Cuando tiene suficientes variables
 * (3 o más), su número (`confianza`/`nivel`) es la fuente de verdad para el
 * análisis: la IA (ver supabase/functions/analizar-pitcher) usa este mismo
 * número en vez de inventar el suyo, salvo que tenga un motivo contextual
 * real (lineup no confirmado, clima, lesión) para bajar el veredicto a
 * NO_BET.
 *
 * Los pesos y anclas de esta fórmula son un punto de partida razonable,
 * no una verdad validada — a diferencia de `tasaSuperacionLinea()`, que sí
 * cuenta resultados reales de historial. Por eso esto nunca se guarda como
 * fuente_confianza=CALCULADA en `picks` (esa etiqueta es solo para lo que
 * sale de contar salidas reales) — sigue siendo fuente_confianza=JUICIO,
 * aunque el número en sí no lo haya inventado la IA (ver docs/framework/
 * 00_marco_transversal.md y 15_mlb_refiner_15_layer_filter.md).
 */

import type { Nivel } from "./calibration.js";
import type { PickTipo } from "./calculations.js";

export interface StatsPitcherEntrada {
  kPct?: number;
  whiffPct?: number;
  cswPct?: number;
  swstrPct?: number;
  k9?: number;
  whip?: number;
  ip?: number;
  correaPitcheosPromedio?: number;
}

export interface StatsRivalEntrada {
  kPct?: number;
}

export interface EntradaCalculadora {
  linea: number;
  pick: PickTipo;
  pitcher: StatsPitcherEntrada;
  rival?: StatsRivalEntrada;
}

export interface ResultadoCalculadora {
  puntaje: number | null;
  confianza: number | null;
  nivel: Nivel | null;
  variablesUsadas: string[];
  variablesFaltantes: string[];
  advertencia: string | null;
}

// Anclas aproximadas de liga (bajo/promedio/alto) usadas solo para ubicar
// cada estadística en una escala 0-100 comparable entre sí. Son valores de
// referencia de sabermetría general, no un dato "oficial" de una fuente.
const ANCLA_K_PCT = { bajo: 15, alto: 35 };
const ANCLA_WHIFF_PCT = { bajo: 18, alto: 35 };
const ANCLA_CSW_PCT = { bajo: 24, alto: 34 };
const ANCLA_SWSTR_PCT = { bajo: 7, alto: 16 };
const ANCLA_K9 = { bajo: 6, alto: 12 };
const ANCLA_WHIP = { bajo: 1.6, alto: 0.95 }; // invertido: más bajo WHIP es mejor
const ANCLA_CORREA = { bajo: 70, alto: 105 };
const ANCLA_RIVAL_K_PCT = { bajo: 15, alto: 30 };

const MUESTRA_IP_MINIMA = 15;

function escalar(valor: number, bajo: number, alto: number): number {
  const proporcion = (valor - bajo) / (alto - bajo);
  return Math.max(0, Math.min(100, proporcion * 100));
}

function nivelDe(confianza: number): Nivel {
  if (confianza >= 0.95) return "DIAMANTE_ALTO";
  if (confianza >= 0.9) return "DIAMANTE";
  if (confianza >= 0.85) return "ORO_ALTO";
  if (confianza >= 0.8) return "ORO";
  return "IMPUREZA";
}

/**
 * Calcula un puntaje 0-100 a partir de las estadísticas reales disponibles.
 * Solo usa lo que efectivamente se le pasó — nunca rellena con promedios ni
 * asume un valor por defecto. Si hay muy poca información, devuelve
 * puntaje/confianza/nivel en null con una advertencia explicando por qué.
 */
export function calcularPuntajeHeuristico(entrada: EntradaCalculadora): ResultadoCalculadora {
  const { pitcher, rival, pick } = entrada;
  const componentes: Array<{ nombre: string; valor: number; peso: number }> = [];
  const variablesUsadas: string[] = [];
  const variablesFaltantes: string[] = [];

  function agregar(nombre: string, valor: number | undefined, ancla: { bajo: number; alto: number }, peso: number) {
    if (valor === undefined) {
      variablesFaltantes.push(nombre);
      return;
    }
    componentes.push({ nombre, valor: escalar(valor, ancla.bajo, ancla.alto), peso });
    variablesUsadas.push(nombre);
  }

  agregar("K%", pitcher.kPct, ANCLA_K_PCT, 1);
  agregar("Whiff%", pitcher.whiffPct, ANCLA_WHIFF_PCT, 1);
  agregar("CSW%", pitcher.cswPct, ANCLA_CSW_PCT, 1);
  agregar("SwStr%", pitcher.swstrPct, ANCLA_SWSTR_PCT, 1);
  agregar("K/9", pitcher.k9, ANCLA_K9, 1);
  agregar("WHIP", pitcher.whip, ANCLA_WHIP, 0.7);
  agregar("correa del mánager", pitcher.correaPitcheosPromedio, ANCLA_CORREA, 0.7);

  if (rival?.kPct !== undefined) {
    const escaladoRival = escalar(rival.kPct, ANCLA_RIVAL_K_PCT.bajo, ANCLA_RIVAL_K_PCT.alto);
    const valorRival = pick === "OVER" ? escaladoRival : 100 - escaladoRival;
    componentes.push({ nombre: "K% del rival", valor: valorRival, peso: 1.2 });
    variablesUsadas.push("K% del rival");
  } else {
    variablesFaltantes.push("K% del rival");
  }

  if (componentes.length < 3) {
    return {
      puntaje: null,
      confianza: null,
      nivel: null,
      variablesUsadas,
      variablesFaltantes,
      advertencia: `Datos insuficientes para un puntaje confiable (solo ${componentes.length} variable(s) disponible(s) de ${componentes.length + variablesFaltantes.length}).`,
    };
  }

  const pesoTotal = componentes.reduce((acc, c) => acc + c.peso, 0);
  const puntaje = componentes.reduce((acc, c) => acc + c.valor * c.peso, 0) / pesoTotal;

  let advertencia: string | null = null;
  if (pitcher.ip !== undefined && pitcher.ip < MUESTRA_IP_MINIMA) {
    advertencia = `Muestra de temporada chica (${pitcher.ip} IP) — el puntaje puede ser volátil todavía.`;
  }
  if (variablesFaltantes.length > 0) {
    const nota = `Calculado sin: ${variablesFaltantes.join(", ")}.`;
    advertencia = advertencia ? `${advertencia} ${nota}` : nota;
  }

  const confianza = puntaje / 100;
  return {
    puntaje,
    confianza,
    nivel: nivelDe(confianza),
    variablesUsadas,
    variablesFaltantes,
    advertencia,
  };
}
