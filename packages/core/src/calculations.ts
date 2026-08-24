/**
 * Funciones de cálculo puras de StrikeoutLab.
 *
 * Toda función en este módulo es determinista (mismo input -> mismo
 * output) y no tiene efectos secundarios: no llama a Supabase, no hace
 * fetch, no lee archivos. Eso vive en las Edge Functions y en la app.
 */

export type PickTipo = "OVER" | "UNDER";
export type Resultado = "GANO" | "PERDIO" | "EMPATE";

export interface Salida {
  k: number;
  ip?: number;
  pitcheos?: number | null;
}

export interface TasaSuperacionLinea {
  ganadas: number;
  perdidas: number;
  empates: number;
  total: number;
  tasa: number;
  advertencia: string | null;
}

export interface Equipo {
  equipo: string;
  k: number;
  pa: number;
}

export interface EquipoConTasa extends Equipo {
  kRate: number;
}

export interface PataParlay {
  fecha: string;
  equipo: string;
  rival: string;
}

/**
 * Convierte innings pitcheados en notación de béisbol a decimal real.
 *
 * La notación de béisbol usa el decimal para representar outs, no
 * fracciones de diez: 5.1 significa 5 entradas y 1 out (5 y 1/3), 5.2
 * significa 5 entradas y 2 outs (5 y 2/3). 6.0 es exactamente 6 entradas.
 *
 * Ejemplos: 5.1 -> 5.3333..., 5.2 -> 5.6667..., 6.0 -> 6.0.
 *
 * Lanza un error si la parte decimal no es .0, .1 o .2, porque esos son
 * los únicos valores posibles (un inning solo tiene 3 outs).
 */
export function ipADecimal(ip: number): number {
  const entero = Math.floor(ip);
  // Redondear evita que errores de punto flotante (5.2 - 5 = 0.19999...)
  // hagan fallar la comparación exacta contra 0.1 / 0.2.
  const resto = Math.round((ip - entero) * 10) / 10;

  if (resto === 0) return entero;
  if (resto === 0.1) return entero + 1 / 3;
  if (resto === 0.2) return entero + 2 / 3;

  throw new Error(
    `IP inválido: ${ip}. La parte decimal debe ser .0, .1 o .2 (notación de innings: outs, no décimas).`,
  );
}

/**
 * Pitcheos totales / entradas totales (decimal) de las salidas dadas.
 *
 * Retorna null si a cualquier salida le falta el conteo de pitcheos: nunca
 * se estima ni se promedia con datos parciales.
 */
export function pitcheosPorEntrada(salidas: Salida[]): number | null {
  if (salidas.length === 0) return null;

  let totalPitcheos = 0;
  let totalEntradas = 0;

  for (const salida of salidas) {
    if (salida.pitcheos === null || salida.pitcheos === undefined) return null;
    if (salida.ip === undefined) return null;
    totalPitcheos += salida.pitcheos;
    totalEntradas += ipADecimal(salida.ip);
  }

  if (totalEntradas === 0) return null;
  return totalPitcheos / totalEntradas;
}

function validarPick(pick: PickTipo): void {
  if (pick !== "OVER" && pick !== "UNDER") {
    throw new Error(`pick debe ser OVER o UNDER, recibido: ${pick}`);
  }
}

/**
 * Regla de negocio compartida por evaluarPick y tasaSuperacionLinea.
 *
 * Línea con .5 (media): nunca hay empate, K entero jamás cae en la línea.
 * Línea entera: K === línea es EMPATE, no GANO ni PERDIO. En este
 * consorcio un empate en línea entera se paga con recorte, pero sigue
 * siendo un estado distinto de ganar o perder y nunca debe colapsarse en
 * ninguno de los dos.
 */
function evaluar(k: number, linea: number, pick: PickTipo): Resultado {
  validarPick(pick);

  if (Number.isInteger(linea) && k === linea) return "EMPATE";

  if (pick === "OVER") return k > linea ? "GANO" : "PERDIO";
  return k < linea ? "GANO" : "PERDIO";
}

/** Retorna GANO, PERDIO o EMPATE para un resultado real ya conocido. */
export function evaluarPick(resultadoK: number, linea: number, pick: PickTipo): Resultado {
  return evaluar(resultadoK, linea, pick);
}

/**
 * Cuenta cuántas de las salidas dadas habrían ganado el pick indicado.
 *
 * La tasa se calcula como ganadas / total (incluyendo empates en el
 * denominador), para no inflar el porcentaje ignorando resultados
 * incómodos. Con menos de 5 salidas, `advertencia` explica que la muestra
 * es demasiado chica para ser confiable.
 */
export function tasaSuperacionLinea(
  salidas: Salida[],
  linea: number,
  pick: PickTipo,
): TasaSuperacionLinea {
  validarPick(pick);

  let ganadas = 0;
  let perdidas = 0;
  let empates = 0;

  for (const salida of salidas) {
    const resultado = evaluar(salida.k, linea, pick);
    if (resultado === "GANO") ganadas++;
    else if (resultado === "PERDIO") perdidas++;
    else empates++;
  }

  const total = salidas.length;
  const tasa = total > 0 ? ganadas / total : 0;

  const advertencia =
    total < 5
      ? `Muestra insuficiente: ${total} salida(s). Una tasa calculada sobre menos de 5 salidas tiene un margen de error demasiado grande para asignarle una confianza.`
      : null;

  return { ganadas, perdidas, empates, total, tasa, advertencia };
}

/**
 * K / PA. Existe como función explícita para que nadie compare K totales
 * crudos entre equipos con distinto volumen de apariciones al plato.
 */
export function kRate(k: number, pa: number): number {
  if (pa === 0) throw new Error("pa no puede ser 0");
  return k / pa;
}

/**
 * Ordena equipos por kRate descendente, nunca por K total.
 */
export function compararRivales(equipos: Equipo[]): EquipoConTasa[] {
  return equipos
    .map((equipo) => ({ ...equipo, kRate: kRate(equipo.k, equipo.pa) }))
    .sort((a, b) => b.kRate - a.kRate);
}

/**
 * Producto de las confianzas de todas las patas de un parlay.
 *
 * Asume independencia entre patas: esto es una simplificación. Dos
 * lanzadores del mismo juego (o el mismo bullpen, el mismo lineup rival,
 * etc.) no son eventos estadísticamente independientes, así que el
 * resultado puede sobre o subestimar la probabilidad combinada real. Usar
 * detectarCorrelacionMismoJuego para marcar ese caso antes de confiar en
 * este número.
 */
export function probabilidadParlay(confianzas: number[]): number {
  if (confianzas.length === 0) throw new Error("confianzas no puede estar vacío");

  let producto = 1;
  for (const confianza of confianzas) {
    if (confianza < 0 || confianza > 1) {
      throw new Error(`confianza fuera de rango [0,1]: ${confianza}`);
    }
    producto *= confianza;
  }
  return producto;
}

/**
 * Marca patas de un parlay que pertenecen al mismo enfrentamiento.
 *
 * Dos patas con la misma fecha y el mismo par de equipos (en cualquier
 * orden) vienen del mismo juego y por lo tanto no son independientes para
 * efectos de probabilidadParlay. Retorna una lista de advertencias (vacía
 * si no hay correlación detectada).
 */
export function detectarCorrelacionMismoJuego(patas: PataParlay[]): string[] {
  const advertencias: string[] = [];
  const vistos = new Map<string, number>();

  patas.forEach((pata, i) => {
    const equipos = [pata.equipo, pata.rival].sort().join("|");
    const clave = `${pata.fecha}::${equipos}`;
    const j = vistos.get(clave);
    if (j !== undefined) {
      advertencias.push(
        `Patas ${j} y ${i} son del mismo juego (${pata.equipo} vs ${pata.rival} el ${pata.fecha}): ` +
          "no son eventos independientes; probabilidadParlay puede estar sobre o subestimando la probabilidad real combinada.",
      );
    } else {
      vistos.set(clave, i);
    }
  });

  return advertencias;
}
