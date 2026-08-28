/**
 * De probabilidad a decisión de apuesta.
 *
 * `proyeccion.ts` responde "¿cuántos ponches va a sacar?". Esto responde la
 * pregunta que sigue, que es la que cuesta plata: "¿conviene jugarlo?".
 *
 * Una proyección al 58% suena bien hasta que se mira la cuota. En Star Sport
 * el -130 significa arriesgar 130 para ganar 100, así que hay que acertar
 * 130/(130+100) = 56.5% solo para empatar. Un pick de 58% gana 1.3 centavos
 * por peso: es ganador, pero tan flaco que cualquier error del modelo se lo
 * come. Uno de 56% ya pierde plata, aunque gane más veces de las que pierde.
 *
 * Es la copia en TypeScript de las funciones `evaluar_apuesta` y
 * `evaluar_parlay` de Postgres, que son las que usa la app. Las dos tienen
 * que dar el mismo número: si tocás una, tocá la otra.
 */

/** Un cuarto de Kelly: el estándar de quien apuesta con un modelo, no con certezas. */
export const KELLY_FRACCION = 0.25;

/** Tope duro: nunca más del 5% del bankroll en una sola apuesta. */
export const KELLY_TOPE = 0.05;

/** Debajo de este retorno la ventaja es más chica que el error del modelo. */
export const UMBRAL_FLOJO = 0.05;

/** Terminar con menos de esto es "te fundiste". */
export const UMBRAL_RUINA = 0.2;

export type VeredictoApuesta = "CONVIENE" | "FLOJO" | "NO CONVIENE";

/**
 * Cuánto se gana por cada peso arriesgado, según la cuota americana.
 * -130 → 0.769 (arriesgás 130 para ganar 100). +150 → 1.5.
 */
export function gananciaPorPeso(cuotaAmericana: number): number {
  if (cuotaAmericana === 0 || (cuotaAmericana > -100 && cuotaAmericana < 100)) {
    throw new Error(`Cuota americana inválida: ${cuotaAmericana}`);
  }
  return cuotaAmericana < 0 ? 100 / Math.abs(cuotaAmericana) : Math.abs(cuotaAmericana) / 100;
}

/** El porcentaje que hay que acertar para no perder ni ganar. */
export function probabilidadDeEquilibrio(cuotaAmericana: number): number {
  return 1 / (1 + gananciaPorPeso(cuotaAmericana));
}

export interface EvaluacionApuesta {
  cuotaAmericana: number;
  gananciaPorPeso: number;
  probDeEquilibrio: number;
  probGanar: number;
  probPerder: number;
  probEmpate: number;
  /** Puntos de probabilidad por encima del equilibrio. Negativo = perdés. */
  ventaja: number;
  /** Ganancia esperada por cada peso apostado. */
  valorEsperado: number;
  /** Fracción de Kelly completa — óptima solo si la probabilidad fuera exacta. */
  kellyCompleto: number;
  /** Lo que conviene apostar de verdad: un cuarto de Kelly, topado. */
  apuestaRecomendada: number;
  veredicto: VeredictoApuesta;
  explicacion: string;
}

/**
 * Convierte probabilidad + cuota en decisión. El empate no suma ni resta:
 * devuelve la plata.
 */
export function evaluarApuesta(
  probGanar: number,
  cuotaAmericana = -130,
  probEmpate = 0,
): EvaluacionApuesta {
  const ganancia = gananciaPorPeso(cuotaAmericana);
  const equilibrio = 1 / (1 + ganancia);

  const pGanar = Math.min(1, Math.max(0, probGanar));
  const pEmpate = Math.min(1, Math.max(0, probEmpate));
  if (pGanar + pEmpate > 1) {
    throw new Error("Ganar y empatar no pueden sumar más de 1.");
  }
  const pPerder = 1 - pGanar - pEmpate;

  const valorEsperado = pGanar * ganancia - pPerder;
  const kellyCompleto = valorEsperado / ganancia;
  // Kelly negativo significa "no apuestes", no "apostá al revés".
  const apuestaRecomendada = Math.max(0, Math.min(KELLY_TOPE, kellyCompleto * KELLY_FRACCION));

  const pct = (x: number) => (x * 100).toFixed(1);
  let veredicto: VeredictoApuesta;
  let explicacion: string;
  // Justo en el punto de equilibrio la coma flotante deja una ventaja de
  // 1e-17, que no es ventaja. Postgres usa `numeric` y da 0 exacto; el
  // epsilon hace que las dos implementaciones digan lo mismo.
  if (valorEsperado <= 1e-9) {
    veredicto = "NO CONVIENE";
    explicacion =
      `Al ${cuotaAmericana} hay que acertar ${pct(equilibrio)}% para no perder plata, y esto da ` +
      `${pct(pGanar)}%. Cada peso apostado pierde ${pct(Math.abs(valorEsperado))} centavos a la larga.`;
  } else if (valorEsperado <= UMBRAL_FLOJO) {
    veredicto = "FLOJO";
    explicacion =
      `Gana, pero apenas: ${pct(pGanar)}% contra el ${pct(equilibrio)}% que pide el ${cuotaAmericana}. ` +
      `Son ${pct(valorEsperado)} centavos por peso, menos que el error del modelo. Se juega si no hay ` +
      `nada mejor, no porque sea buena.`;
  } else {
    veredicto = "CONVIENE";
    explicacion =
      `${pct(pGanar)}% contra el ${pct(equilibrio)}% que pide el ${cuotaAmericana}: ` +
      `${pct(pGanar - equilibrio)} puntos de ventaja, ${pct(valorEsperado)} centavos de ganancia por peso.`;
  }
  if (pEmpate > 0.01) {
    explicacion += ` (Con ${pct(pEmpate)}% de empate, que devuelve la plata y por eso no resta.)`;
  }

  return {
    cuotaAmericana,
    gananciaPorPeso: ganancia,
    probDeEquilibrio: equilibrio,
    probGanar: pGanar,
    probPerder: pPerder,
    probEmpate: pEmpate,
    ventaja: pGanar - equilibrio,
    valorEsperado,
    kellyCompleto,
    apuestaRecomendada,
    veredicto,
    explicacion,
  };
}

/** P(X <= k) para X binomial(n, p). */
export function binomialAcumulada(k: number, n: number, p: number): number {
  if (k < 0) return 0;
  if (k >= n) return 1;
  if (p <= 0) return 1;
  if (p >= 1) return 0;
  let termino = Math.pow(1 - p, n);
  let suma = termino;
  for (let i = 0; i < k; i++) {
    termino *= ((n - i) / (i + 1)) * (p / (1 - p));
    suma += termino;
  }
  return Math.min(1, Math.max(0, suma));
}

export interface EscalonParlay {
  patas: number;
  probabilidad: number;
  pagoPorPeso: number;
  valorEsperado: number;
  /** Lo que Kelly diría que apuestes. Es aparte de la apuesta fija. */
  apuestaRecomendadaPct: number;
  /** Con qué terminás la mitad de las veces, apostando la fracción fija. */
  terminasConMediana: number;
  /** El promedio, que unos pocos aciertos de lotería inflan. */
  terminasConPromedio: number;
  probFundirte: number;
}

export interface OpcionesParlay {
  cuotaAmericana?: number;
  apuestasPorTemporada?: number;
  /** Fracción del bankroll que se apuesta cada vez, 0-1. */
  apuestaFija?: number;
  /** Compresión de la confianza hacia el 50%, de la calibración real. */
  factorCalibracion?: number;
  maxPatas?: number;
}

export interface EvaluacionParlay {
  probabilidadesHonestas: number[];
  tuParlay: { patas: number; probabilidad: number; pagoPorPeso: number; valorEsperado: number };
  escalera: EscalonParlay[];
  patasOptimas: number;
}

/**
 * Evalúa un parlay y, sobre todo, dice cuántas patas conviene jugar.
 *
 * Dos cosas que la gente confunde y acá quedan separadas:
 *
 * 1. **Más patas siempre suben el valor esperado** si cada pata tiene ventaja
 *    — la ventaja se multiplica. Y sin embargo te funden, porque la
 *    probabilidad cae más rápido de lo que el bolsillo aguanta. Por eso se
 *    informan mediana Y promedio: cuando el promedio es alto y la mediana
 *    baja, el parlay es una rifa.
 *
 * 2. **La apuesta recomendada (Kelly) no es la apuesta fija.** Las columnas de
 *    bankroll suponen fracción fija, que es como se apuesta en una banca
 *    física; Kelly va aparte, como consejo.
 *
 * El bankroll no hace falta simularlo: apostando siempre la misma fracción f,
 * después de N apuestas con k aciertos queda B0·(1+f·pago)^k·(1−f)^(N−k), y
 * como multiplicar conmuta, todo depende de k, que es binomial(N, prob).
 */
export function evaluarParlay(
  probabilidades: number[],
  opciones: OpcionesParlay = {},
): EvaluacionParlay {
  const cuota = opciones.cuotaAmericana ?? -130;
  const apuestas = opciones.apuestasPorTemporada ?? 100;
  const fija = Math.min(0.5, Math.max(0.001, opciones.apuestaFija ?? 0.05));
  const factor = opciones.factorCalibracion ?? 1;
  const maxPatas = opciones.maxPatas ?? 12;

  if (probabilidades.length === 0) throw new Error("Hacen falta las probabilidades de las patas.");
  const ganancia = gananciaPorPeso(cuota);

  const honestas = probabilidades.map((p) =>
    Math.min(0.99, Math.max(0.01, 0.5 + (p - 0.5) * factor)),
  );
  // Para la escalera se ordenan de mejor a peor: si conviene recortar patas,
  // las que se van son las más flojas.
  const orden = [...honestas].sort((a, b) => b - a);

  const tuProb = honestas.reduce((acc, p) => acc * p, 1);
  const tuPago = Math.pow(1 + ganancia, honestas.length) - 1;

  const escalera: EscalonParlay[] = [];
  let mejorN = 1;
  let mejorMediana = -Infinity;

  for (let j = 1; j <= maxPatas; j++) {
    let prob = 1;
    for (let i = 0; i < j; i++) prob *= orden[i] ?? orden[orden.length - 1]!;

    const pago = Math.pow(1 + ganancia, j) - 1;
    const valorEsperado = prob * pago - (1 - prob);
    const kelly = valorEsperado / pago;
    const fKelly = Math.max(0, Math.min(KELLY_TOPE, kelly * KELLY_FRACCION));

    const kMediana = Math.round(apuestas * prob);
    const lnMediana = kMediana * Math.log(1 + fija * pago) + (apuestas - kMediana) * Math.log(1 - fija);
    const lnPromedio = apuestas * Math.log((1 - fija) * (1 - prob) + prob * (1 + fija * pago));
    const kMinimo =
      (Math.log(UMBRAL_RUINA) - apuestas * Math.log(1 - fija)) /
      (Math.log(1 + fija * pago) - Math.log(1 - fija));

    if (lnMediana > mejorMediana) {
      mejorMediana = lnMediana;
      mejorN = j;
    }

    escalera.push({
      patas: j,
      probabilidad: prob,
      pagoPorPeso: pago,
      valorEsperado,
      apuestaRecomendadaPct: fKelly * 100,
      terminasConMediana: Math.exp(Math.min(lnMediana, 40)),
      terminasConPromedio: Math.exp(Math.min(lnPromedio, 40)),
      probFundirte: binomialAcumulada(Math.ceil(kMinimo) - 1, apuestas, prob),
    });
  }

  return {
    probabilidadesHonestas: honestas,
    tuParlay: {
      patas: honestas.length,
      probabilidad: tuProb,
      pagoPorPeso: tuPago,
      valorEsperado: tuProb * tuPago - (1 - tuProb),
    },
    escalera,
    patasOptimas: mejorN,
  };
}
