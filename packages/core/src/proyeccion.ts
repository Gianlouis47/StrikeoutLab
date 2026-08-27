/**
 * Proyección de ponches — la calculadora que responde "¿cuántos K va a
 * sacar?" en vez de "¿qué tan bueno es el pick que ya elegiste?".
 *
 * A diferencia de calcularPuntajeHeuristico (que puntúa un pick que vos ya
 * decidiste), acá no se le pasa OVER/UNDER: se proyectan los K esperados,
 * se comparan con la línea, y el veredicto sale solo. Esto es aritmética
 * exacta — nada de opinión.
 *
 * El método no es inventado, es el estándar de sabermetría:
 *
 * 1. **log5 (Bill James)** para combinar la tasa de ponche del pitcher con
 *    la del equipo que batea, relativas al promedio de la liga. Un pitcher
 *    que poncha 30% contra un equipo que se poncha 26% (liga 22%) no da ni
 *    30% ni 26%: da más que ambos, porque las dos fuerzas empujan al mismo
 *    lado. log5 es la fórmula que resuelve eso correctamente.
 *
 * 2. **Bateadores enfrentados** derivados de la duración esperada de la
 *    salida: BF ≈ IP × (3 + WHIP). Los 3 son los outs por inning; el WHIP
 *    agrega los corredores que permite por inning. Es identidad contable,
 *    no una estimación.
 *
 * 3. **Poisson** para pasar de "K esperados" a probabilidad de superar la
 *    línea. Es la aproximación estándar para conteos de eventos raros e
 *    independientes. Los K reales están levemente sobredispersos respecto a
 *    Poisson (la varianza real es un poco mayor), así que las probabilidades
 *    extremas quedan algo optimistas — por eso `advertencias` lo dice cuando
 *    la probabilidad supera 90%.
 */

import type { PickTipo } from "./calculations.js";

/** K% promedio de MLB moderna. Solo se usa si no se pasa el real. */
export const LIGA_K_PCT_POR_DEFECTO = 22.5;

/** Innings por salida de un abridor típico, si no hay historial real. */
export const IP_POR_SALIDA_POR_DEFECTO = 5.2;

/** WHIP de liga, usado solo para estimar bateadores enfrentados. */
export const LIGA_WHIP_POR_DEFECTO = 1.28;

export interface EntradaProyeccion {
  /** Línea de la casa (ej. 6.5, o 7 para línea entera con empate posible). */
  linea: number;
  /** K% del pitcher esta temporada, 0-100. Es la variable más importante. */
  kPctPitcher?: number;
  /** K/9 del pitcher — alternativa si no hay K%. */
  k9Pitcher?: number;
  /** WHIP del pitcher; afina cuántos bateadores enfrenta por inning. */
  whipPitcher?: number;
  /** Innings promedio por salida (de su historial real, no de la temporada). */
  ipPorSalida?: number;
  /** K% del equipo rival bateando (idealmente vs la mano de este pitcher). */
  kPctRival?: number;
  /** K% real de la liga, calculado de team_k. Si falta, usa el default. */
  ligaKPct?: number;
}

export interface ResultadoProyeccion {
  /** K esperados (el número que responde "¿cuántos va a sacar?"). */
  kProyectados: number;
  /** Bateadores que se espera que enfrente. */
  bateadoresEsperados: number;
  /** K% ya combinado pitcher-vs-rival por log5, 0-100. */
  kPctCombinado: number;
  /** Probabilidad de superar la línea (OVER gana). */
  probOver: number;
  /** Probabilidad de quedar debajo (UNDER gana). */
  probUnder: number;
  /** Probabilidad de empate exacto — solo > 0 en líneas enteras. */
  probEmpate: number;
  /** El lado que la aritmética favorece, o null si están parejos. */
  veredicto: PickTipo | null;
  /**
   * Confianza del lado favorecido, ya normalizada sobre las apuestas que
   * se deciden (excluye el empate, que devuelve la plata).
   */
  confianza: number;
  /** Qué datos se usaron de verdad, para poder auditar el número. */
  entradasUsadas: string[];
  /** Qué faltó y con qué se sustituyó. */
  supuestos: string[];
  /** Avisos sobre la calidad del resultado. */
  advertencias: string[];
}

/**
 * log5: combina dos tasas relativas al promedio de la liga.
 * Devuelve la tasa esperada del enfrentamiento, en la misma escala 0-1.
 */
export function log5(tasaPitcher: number, tasaBateador: number, tasaLiga: number): number {
  if (tasaLiga <= 0 || tasaLiga >= 1) return tasaPitcher;
  const numerador = (tasaPitcher * tasaBateador) / tasaLiga;
  const complemento = ((1 - tasaPitcher) * (1 - tasaBateador)) / (1 - tasaLiga);
  const total = numerador + complemento;
  return total > 0 ? numerador / total : tasaPitcher;
}

/** P(X = k) para una Poisson de media lambda. */
function poissonPuntual(k: number, lambda: number): number {
  if (k < 0) return 0;
  // Calculado en escala logarítmica para no desbordar con factoriales.
  let logFactorial = 0;
  for (let i = 2; i <= k; i++) logFactorial += Math.log(i);
  return Math.exp(-lambda + k * Math.log(lambda) - logFactorial);
}

/** P(X <= k) para una Poisson de media lambda. */
function poissonAcumulada(k: number, lambda: number): number {
  let acumulado = 0;
  for (let i = 0; i <= k; i++) acumulado += poissonPuntual(i, lambda);
  return Math.min(1, acumulado);
}

export function proyectarPonches(entrada: EntradaProyeccion): ResultadoProyeccion {
  const entradasUsadas: string[] = [];
  const supuestos: string[] = [];
  const advertencias: string[] = [];

  const ligaKPct = entrada.ligaKPct ?? LIGA_K_PCT_POR_DEFECTO;
  if (entrada.ligaKPct !== undefined) {
    entradasUsadas.push(`K% de liga real (${ligaKPct.toFixed(1)}%)`);
  } else {
    supuestos.push(`K% de liga asumido en ${ligaKPct}% (no se pasó el real)`);
  }

  // --- Tasa de ponche del pitcher ---
  let kPctPitcher: number;
  if (entrada.kPctPitcher !== undefined) {
    kPctPitcher = entrada.kPctPitcher;
    entradasUsadas.push(`K% del pitcher (${kPctPitcher.toFixed(1)}%)`);
  } else if (entrada.k9Pitcher !== undefined) {
    // K/9 → K%: un inning son ~4.3 bateadores en promedio de liga.
    kPctPitcher = (entrada.k9Pitcher / (9 * 4.3)) * 100;
    entradasUsadas.push(`K/9 del pitcher (${entrada.k9Pitcher}, convertido a ${kPctPitcher.toFixed(1)}% K)`);
    supuestos.push("K% derivado de K/9 — menos preciso que el K% directo");
  } else {
    kPctPitcher = ligaKPct;
    supuestos.push(`Sin K% ni K/9 del pitcher: se usó el promedio de liga (${ligaKPct}%)`);
    advertencias.push(
      "Sin la tasa de ponche del pitcher esta proyección no significa gran cosa — es prácticamente el promedio de la liga.",
    );
  }

  // --- Tasa de ponche del rival bateando ---
  let kPctRival: number;
  if (entrada.kPctRival !== undefined) {
    kPctRival = entrada.kPctRival;
    entradasUsadas.push(`K% del rival bateando (${kPctRival.toFixed(1)}%)`);
  } else {
    kPctRival = ligaKPct;
    supuestos.push(`Sin K% del rival: se usó el promedio de liga (${ligaKPct}%), o sea rival neutral`);
  }

  // --- Combinación log5 ---
  const kPctCombinado = log5(kPctPitcher / 100, kPctRival / 100, ligaKPct / 100) * 100;

  // --- Cuántos bateadores va a enfrentar ---
  const ipPorSalida = entrada.ipPorSalida ?? IP_POR_SALIDA_POR_DEFECTO;
  if (entrada.ipPorSalida !== undefined) {
    entradasUsadas.push(`IP promedio por salida (${ipPorSalida.toFixed(1)})`);
  } else {
    supuestos.push(`Duración de salida asumida en ${IP_POR_SALIDA_POR_DEFECTO} IP (sin historial real)`);
  }

  const whip = entrada.whipPitcher ?? LIGA_WHIP_POR_DEFECTO;
  if (entrada.whipPitcher !== undefined) {
    entradasUsadas.push(`WHIP (${whip.toFixed(2)})`);
  } else {
    supuestos.push(`WHIP asumido en ${LIGA_WHIP_POR_DEFECTO} (promedio de liga)`);
  }

  // IP viene en notación de béisbol (6.2 = 6 innings y 2/3), hay que pasarla
  // a decimal real antes de multiplicar.
  const ipEnteros = Math.floor(ipPorSalida);
  const tercios = Math.round((ipPorSalida - ipEnteros) * 10);
  const ipDecimal = ipEnteros + Math.min(tercios, 2) / 3;

  const bateadoresEsperados = ipDecimal * (3 + whip);
  const kProyectados = bateadoresEsperados * (kPctCombinado / 100);

  // --- De K esperados a probabilidad de pasar la línea ---
  const lineaEsEntera = Number.isInteger(entrada.linea);
  let probOver: number;
  let probUnder: number;
  let probEmpate: number;

  if (lineaEsEntera) {
    // Línea entera: si cae exacto es empate (devuelven la plata).
    probEmpate = poissonPuntual(entrada.linea, kProyectados);
    probUnder = poissonAcumulada(entrada.linea - 1, kProyectados);
    probOver = Math.max(0, 1 - probUnder - probEmpate);
  } else {
    probEmpate = 0;
    probUnder = poissonAcumulada(Math.floor(entrada.linea), kProyectados);
    probOver = Math.max(0, 1 - probUnder);
  }

  // La confianza se mide sobre las apuestas que se deciden: el empate no se
  // gana ni se pierde, así que no debe diluir el número.
  const decidido = probOver + probUnder;
  const probOverNorm = decidido > 0 ? probOver / decidido : 0.5;
  const probUnderNorm = decidido > 0 ? probUnder / decidido : 0.5;

  let veredicto: PickTipo | null;
  let confianza: number;
  if (Math.abs(probOverNorm - probUnderNorm) < 0.02) {
    veredicto = null;
    confianza = Math.max(probOverNorm, probUnderNorm);
    advertencias.push(
      "La línea está prácticamente en el centro de la proyección — no hay ventaja matemática para ningún lado.",
    );
  } else if (probOverNorm > probUnderNorm) {
    veredicto = "OVER";
    confianza = probOverNorm;
  } else {
    veredicto = "UNDER";
    confianza = probUnderNorm;
  }

  if (supuestos.length >= 3) {
    advertencias.push(
      `La proyección se apoya en ${supuestos.length} supuestos por falta de datos reales — tomala como orientativa, no como número firme.`,
    );
  }
  if (confianza > 0.9) {
    advertencias.push(
      "Confianza arriba de 90%: el modelo Poisson subestima un poco la variabilidad real de los ponches, así que el número verdadero es algo más bajo.",
    );
  }
  if (lineaEsEntera && probEmpate > 0.12) {
    advertencias.push(
      `Línea entera con ${(probEmpate * 100).toFixed(0)}% de probabilidad de empate exacto — buena parte del tiempo devuelven la plata.`,
    );
  }

  return {
    kProyectados,
    bateadoresEsperados,
    kPctCombinado,
    probOver,
    probUnder,
    probEmpate,
    veredicto,
    confianza,
    entradasUsadas,
    supuestos,
    advertencias,
  };
}
