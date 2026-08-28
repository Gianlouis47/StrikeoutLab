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
 *
 * 4. **Regresión a la media (Bayes empírico)** sobre las stats del lanzador.
 *    Un relevista con 2 bateadores enfrentados y 1 K tiene 50% de K%, y eso
 *    no es una tasa: es ruido. Cada stat se empuja hacia un ancla en
 *    proporción a lo poco que sabemos:
 *
 *      estimado = (observado × muestra + ancla × K) / (muestra + K)
 *
 *    donde K es la constante de estabilización — el tamaño de muestra al que
 *    la mitad de lo observado ya es señal real.
 *
 * Esta es la copia en TypeScript de la función `proyectar_ponches` de
 * Postgres, que es la que usa la app. Las dos tienen que dar el mismo
 * número: si tocás una, tocá la otra.
 */

import type { PickTipo } from "./calculations.js";

/** K% promedio de MLB moderna. Solo se usa si no se pasa el real. */
export const LIGA_K_PCT_POR_DEFECTO = 22.1;

/**
 * Cuánto dura una salida real de abridor: IP totales / salidas totales, no
 * el promedio por lanzador. La diferencia importa — el promedio simple
 * mezcla al abridor de 30 aperturas con el emergente de una y da 4.95 en vez
 * de 5.17.
 */
export const IP_POR_SALIDA_POR_DEFECTO = 5.17;

/** Innings por aparición de un relevista típico, con el mismo criterio. */
export const IP_POR_APARICION_RELEVO = 1.2;

/** WHIP de liga (ponderado por IP), para estimar bateadores enfrentados. */
export const LIGA_WHIP_POR_DEFECTO = 1.3;

/**
 * Constantes de estabilización: a cuántos bateadores enfrentados (o salidas)
 * la mitad de lo observado ya es habilidad y no suerte. Son las medidas
 * clásicas de sabermetría — el K% estabiliza rápido, el WHIP lentísimo
 * porque arrastra el BABIP.
 */
export const ESTABILIZACION = {
  /** K%, en bateadores enfrentados. */
  kPct: 70,
  /** WHIP, en bateadores enfrentados: estabiliza lento porque arrastra el BABIP. */
  whip: 500,
  /**
   * Duración de la salida, en salidas. Medido sobre nuestros propios datos
   * descomponiendo la varianza: Var(observado) = Var(verdadera) + σ²/n da
   * σ = 1.51 IP por salida (que coincide con el valor conocido de MLB) y
   * Var(verdadera) ≈ 0.38, o sea K = 1.51² / 0.38 ≈ 6.
   */
  ipPorSalida: 6,
} as const;

/**
 * Recta whiff% → K%, ajustada sobre lanzadores con 400+ bateadores
 * enfrentados (120 lanzadores, R² = 0.79). Es mejor ancla que el promedio de
 * liga: el swing-and-miss explica cuatro quintas partes de la varianza del
 * K% y estabiliza en cientos de lanzamientos, no de bateadores.
 *
 * Se ajusta solo sobre muestras firmes a propósito. Ajustarla sobre todos
 * aplana la pendiente (0.76 en vez de 1.02) porque el ruido en el whiff% de
 * muestra chica la atenúa hacia cero, y quedaría una recta que subestima a
 * los dominantes — justo a quienes más falta les hace.
 *
 * En Postgres esto se recalcula en cada llamada con `regr_slope`, así que
 * mejora solo a medida que pasa la temporada. Acá quedan los valores medidos.
 */
export const RECTA_WHIFF_A_K = { pendiente: 1.0237, intercepto: -3.0555, r2: 0.789 } as const;

/**
 * Recta SwStr% → K% (55 lanzadores, R² = 0.75). Respaldo para quien tenga
 * SwStr% de FanGraphs pero no whiff% de Savant.
 */
export const RECTA_SWSTR_A_K = { pendiente: 2.0887, intercepto: 0.1239, r2: 0.7501 } as const;

/**
 * Empuja un valor observado hacia el ancla según el tamaño de la muestra.
 * Con muestra 0 devuelve el ancla; con muestra infinita, lo observado.
 */
export function regresarALaMedia(
  observado: number,
  muestra: number,
  ancla: number,
  estabilizacion: number,
): number {
  const n = Math.max(0, muestra);
  return (observado * n + ancla * estabilizacion) / (n + estabilizacion);
}

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
  /**
   * Innings totales lanzados en la temporada. De acá sale el tamaño de
   * muestra (BF ≈ IP × (3 + WHIP)) que decide cuánto se le cree a las
   * stats. Sin esto no hay regresión a la media y un 50% de K% con dos
   * bateadores enfrentados se toma como si fuera real.
   */
  ipTotales?: number;
  /** Salidas de la temporada — la muestra de `ipPorSalida`. */
  salidas?: number;
  /** whiff% del lanzador (Savant): la mejor ancla que tenemos. */
  whiffPctPitcher?: number;
  /** SwStr% del lanzador (FanGraphs): ancla de respaldo si no hay whiff%. */
  swstrPctPitcher?: number;
  /** Falso para relevistas: cambia el ancla de duración de la salida. */
  esAbridor?: boolean;
  /** WHIP real de la liga. Si falta, usa el default. */
  ligaWhip?: number;
}

/** Cuánto se movió cada stat al regresarla a la media, para poder auditarlo. */
export interface AjustePorMuestra {
  /** Tamaño de muestra en bateadores enfrentados. */
  bateadoresDeMuestra: number;
  /** Cuánto pesa lo observado frente al ancla, 0-1. */
  pesoDeLoObservado: number;
  kPctCrudo: number | null;
  kPctAjustado: number;
  whipCrudo: number | null;
  whipAjustado: number;
  ipPorSalidaCrudo: number | null;
  ipPorSalidaAjustado: number;
  /** De dónde salió el ancla del K%, en palabras. */
  anclaUsada: string;
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
  /** Cómo quedó cada stat después de regresarla a la media. */
  ajustePorMuestra: AjustePorMuestra;
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

  const ligaWhip = entrada.ligaWhip ?? LIGA_WHIP_POR_DEFECTO;

  // --- Tamaño de muestra: BF ≈ IP × (3 + WHIP) ---
  // Los 3 son los outs por inning; el WHIP agrega los corredores que permite.
  const whipCrudo = entrada.whipPitcher ?? null;
  const bateadoresDeMuestra = (entrada.ipTotales ?? 0) * (3 + (whipCrudo ?? ligaWhip));

  // --- Tasa de ponche observada ---
  let kPctCrudo: number | null;
  if (entrada.kPctPitcher !== undefined) {
    kPctCrudo = entrada.kPctPitcher;
    entradasUsadas.push(
      `K% del pitcher (${kPctCrudo.toFixed(1)}% en ${Math.round(bateadoresDeMuestra)} BF)`,
    );
  } else if (entrada.k9Pitcher !== undefined) {
    // K/9 → K%: un inning son ~4.3 bateadores en promedio de liga.
    kPctCrudo = (entrada.k9Pitcher / (9 * 4.3)) * 100;
    entradasUsadas.push(`K/9 del pitcher (${entrada.k9Pitcher}, convertido a ${kPctCrudo.toFixed(1)}% K)`);
    supuestos.push("K% derivado de K/9 — menos preciso que el K% directo");
  } else {
    // Sin nada observado la muestra es cero, así que el estimado queda
    // entero en el ancla.
    kPctCrudo = null;
    supuestos.push("Sin K% ni K/9 del pitcher");
  }

  // --- Ancla del K%: SwStr% si lo hay, si no el promedio de liga ---
  // whiff% primero: mejor R² y lo tenemos para casi todos los lanzadores.
  let anclaKPct: number;
  let anclaUsada: string;
  if (entrada.whiffPctPitcher !== undefined) {
    const predicho = RECTA_WHIFF_A_K.pendiente * entrada.whiffPctPitcher + RECTA_WHIFF_A_K.intercepto;
    anclaKPct = Math.min(45, Math.max(3, predicho));
    anclaUsada = `whiff% ${entrada.whiffPctPitcher.toFixed(1)}% → ${anclaKPct.toFixed(1)}% K esperado (R²=${RECTA_WHIFF_A_K.r2.toFixed(2)})`;
    entradasUsadas.push(`whiff% (${entrada.whiffPctPitcher.toFixed(1)}%) como ancla`);
  } else if (entrada.swstrPctPitcher !== undefined) {
    const predicho = RECTA_SWSTR_A_K.pendiente * entrada.swstrPctPitcher + RECTA_SWSTR_A_K.intercepto;
    anclaKPct = Math.min(45, Math.max(3, predicho));
    anclaUsada = `SwStr% ${entrada.swstrPctPitcher.toFixed(1)}% → ${anclaKPct.toFixed(1)}% K esperado (R²=${RECTA_SWSTR_A_K.r2.toFixed(2)})`;
    entradasUsadas.push(`SwStr% (${entrada.swstrPctPitcher.toFixed(1)}%) como ancla`);
  } else {
    anclaKPct = ligaKPct;
    anclaUsada = `promedio de liga (${ligaKPct.toFixed(1)}%)`;
  }

  // --- Regresión a la media ---
  const muestraK = kPctCrudo === null ? 0 : bateadoresDeMuestra;
  const kPctPitcher = regresarALaMedia(kPctCrudo ?? anclaKPct, muestraK, anclaKPct, ESTABILIZACION.kPct);

  const whip = regresarALaMedia(
    whipCrudo ?? ligaWhip,
    whipCrudo === null ? 0 : bateadoresDeMuestra,
    ligaWhip,
    ESTABILIZACION.whip,
  );
  if (whipCrudo !== null) {
    entradasUsadas.push(`WHIP (${whipCrudo.toFixed(2)})`);
  } else {
    supuestos.push(`WHIP asumido en ${ligaWhip} (promedio de liga)`);
  }

  // `ipPorSalida` viene en decimal (IP totales / salidas), no en notación de
  // béisbol: 183.67 IP en 28 salidas son 6.56, no 6 y 2/3.
  const anclaIp = entrada.esAbridor === false ? IP_POR_APARICION_RELEVO : IP_POR_SALIDA_POR_DEFECTO;
  const ipCrudo = entrada.ipPorSalida ?? null;
  const ipPorSalida = regresarALaMedia(
    ipCrudo ?? anclaIp,
    ipCrudo === null ? 0 : (entrada.salidas ?? 0),
    anclaIp,
    ESTABILIZACION.ipPorSalida,
  );
  if (ipCrudo !== null) {
    entradasUsadas.push(`IP promedio por salida (${ipCrudo.toFixed(2)} en ${entrada.salidas ?? 0} salidas)`);
  } else {
    supuestos.push(`Duración de salida asumida en ${anclaIp} IP (sin historial real)`);
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

  const bateadoresEsperados = ipPorSalida * (3 + whip);
  const kProyectados = bateadoresEsperados * (kPctCombinado / 100);

  const ajustePorMuestra: AjustePorMuestra = {
    bateadoresDeMuestra,
    pesoDeLoObservado: muestraK / (muestraK + ESTABILIZACION.kPct),
    kPctCrudo,
    kPctAjustado: kPctPitcher,
    whipCrudo,
    whipAjustado: whip,
    ipPorSalidaCrudo: ipCrudo,
    ipPorSalidaAjustado: ipPorSalida,
    anclaUsada,
  };

  if (kPctCrudo === null) {
    advertencias.push(
      `Sin la tasa de ponche del pitcher esta proyección sale entera del ancla (${anclaUsada}) — no significa gran cosa.`,
    );
  } else if (Math.abs(kPctPitcher - kPctCrudo) >= 1.5) {
    advertencias.push(
      `Muestra chica (${Math.round(bateadoresDeMuestra)} BF): su ${kPctCrudo.toFixed(1)}% de K se ajustó a ` +
        `${kPctPitcher.toFixed(1)}% empujándolo hacia ${anclaUsada}. Con tan pocos bateadores el número crudo ` +
        `es más suerte que habilidad.`,
    );
  }

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
    ajustePorMuestra,
    entradasUsadas,
    supuestos,
    advertencias,
  };
}
