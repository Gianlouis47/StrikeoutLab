/**
 * Auditoría de calibración de StrikeoutLab.
 *
 * Este módulo es la razón de ser del proyecto: mide si las confianzas
 * asignadas a los picks (CALCULADA o JUICIO) se sostienen contra los
 * resultados reales. También es la fuente del "ciclo de retroalimentación"
 * que las Edge Functions le pasan como contexto a la IA — no es que el
 * modelo se reentrena, es que ve su propio historial real antes de opinar.
 */

import type { Resultado } from "./calculations.js";

export type FuenteConfianza = "CALCULADA" | "JUICIO";
export type Nivel = "DIAMANTE" | "ORO_ALTO" | "ORO" | "IMPUREZA";

export interface PickCalibracion {
  confianza: number;
  resultado: Resultado | null;
  fuenteConfianza: FuenteConfianza;
}

export interface PickEconomico {
  resultado: Resultado | null;
  nivel: Nivel;
  ticketId?: string | null;
  stake?: number | null;
  payout?: number | null;
}

export interface BandaCalibracion {
  banda: string;
  fuenteConfianza: "TODAS" | FuenteConfianza;
  cantidad: number;
  ganadas: number;
  perdidas: number;
  empates: number;
  confianzaPromedio: number;
  tasaReal: number | null;
  diferencia: number | null;
  muestraInsuficiente: boolean;
}

export interface ResumenEconomico {
  totalPicksResueltos: number;
  porNivel: Record<string, { cantidad: number; ganadas: number; perdidas: number; empates: number }>;
  totalApostado: number | null;
  totalCobrado: number | null;
  neto: number | null;
  advertencia?: string;
}

const BANDAS: Array<{ lo: number; hi: number; etiqueta: string }> = [
  { lo: 0.7, hi: 0.75, etiqueta: "70-74%" },
  { lo: 0.75, hi: 0.8, etiqueta: "75-79%" },
  { lo: 0.8, hi: 0.85, etiqueta: "80-84%" },
  { lo: 0.85, hi: 0.9, etiqueta: "85-89%" },
  { lo: 0.9, hi: 0.95, etiqueta: "90-94%" },
  { lo: 0.95, hi: 1.01, etiqueta: "95-99%" }, // límite superior inclusivo de 1.0 (100%)
];

const MUESTRA_MINIMA = 20;
const RESULTADOS_RESUELTOS: Resultado[] = ["GANO", "PERDIO", "EMPATE"];

function bandaDe(confianza: number): string | null {
  const banda = BANDAS.find((b) => confianza >= b.lo && confianza < b.hi);
  return banda ? banda.etiqueta : null;
}

function resumirGrupo(
  grupo: PickCalibracion[],
  banda: string,
  fuenteConfianza: "TODAS" | FuenteConfianza,
): BandaCalibracion {
  const ganadas = grupo.filter((p) => p.resultado === "GANO").length;
  const perdidas = grupo.filter((p) => p.resultado === "PERDIO").length;
  const empates = grupo.filter((p) => p.resultado === "EMPATE").length;
  const decididas = ganadas + perdidas;
  const tasaReal = decididas > 0 ? ganadas / decididas : null;
  const confianzaPromedio = grupo.reduce((acc, p) => acc + p.confianza, 0) / grupo.length;
  const diferencia = tasaReal !== null ? confianzaPromedio - tasaReal : null;

  return {
    banda,
    fuenteConfianza,
    cantidad: grupo.length,
    ganadas,
    perdidas,
    empates,
    confianzaPromedio,
    tasaReal,
    diferencia,
    muestraInsuficiente: grupo.length < MUESTRA_MINIMA,
  };
}

/**
 * Agrupa los picks resueltos en bandas de confianza y compara la
 * confianza promedio declarada contra la tasa real de acierto.
 *
 * Interpretación esperada: si una banda muestra tasaReal muy por debajo de
 * confianzaPromedio (diferencia positiva grande), el sistema está
 * sobreconfiado en esa banda y las confianzas deben ajustarse a la baja.
 *
 * Los empates cuentan en `cantidad` pero se excluyen del denominador de
 * tasaReal (ganadas / (ganadas + perdidas)): un push no confirma ni refuta
 * la confianza asignada.
 *
 * Cada banda se desglosa también por fuenteConfianza (fila 'TODAS',
 * 'CALCULADA' y 'JUICIO'), porque mezclar ambas sin distinguirlas fue el
 * error original que este proyecto corrige.
 *
 * Una banda con menos de 20 picks queda marcada muestraInsuficiente=true;
 * no debe usarse para concluir que esa banda está sobre o subconfiada.
 */
export function reporteCalibracion(picks: PickCalibracion[]): BandaCalibracion[] {
  const resueltos = picks
    .filter((p) => p.resultado !== null && RESULTADOS_RESUELTOS.includes(p.resultado))
    .map((p) => ({ ...p, banda: bandaDe(p.confianza) }))
    .filter((p): p is PickCalibracion & { banda: string } => p.banda !== null);

  const filas: BandaCalibracion[] = [];

  for (const { etiqueta } of BANDAS) {
    const bandaPicks = resueltos.filter((p) => p.banda === etiqueta);
    if (bandaPicks.length === 0) continue;

    filas.push(resumirGrupo(bandaPicks, etiqueta, "TODAS"));

    for (const fuente of ["CALCULADA", "JUICIO"] as const) {
      const subGrupo = bandaPicks.filter((p) => p.fuenteConfianza === fuente);
      if (subGrupo.length === 0) continue;
      filas.push(resumirGrupo(subGrupo, etiqueta, fuente));
    }
  }

  return filas;
}

/**
 * Resultado económico real de los picks resueltos, sin adornos.
 *
 * El desglose `porNivel` reporta cantidad y resultados (GANO/PERDIO/
 * EMPATE) por nivel de pureza (Diamante/Oro/etc.), no montos: una misma
 * boleta física puede combinar patas de distinto nivel, así que repartir
 * el stake/payout de esa boleta entre niveles sería arbitrario.
 *
 * Los montos totales (stake/payout) solo se calculan si al menos un pick
 * resuelto tiene esos datos. Cuando varias patas comparten `ticketId` se
 * asume que el stake/payout de la boleta física está registrado de forma
 * idéntica en cada una de sus filas, así que se deduplica por ticketId
 * antes de sumar para no contar el monto de una misma boleta más de una
 * vez. Filas sin ticketId se tratan como apuestas sueltas.
 */
export function resumenEconomico(picks: PickEconomico[]): ResumenEconomico {
  const resueltos = picks.filter((p) => p.resultado !== null && RESULTADOS_RESUELTOS.includes(p.resultado));

  const porNivel: ResumenEconomico["porNivel"] = {};
  for (const pick of resueltos) {
    if (!porNivel[pick.nivel]) {
      porNivel[pick.nivel] = { cantidad: 0, ganadas: 0, perdidas: 0, empates: 0 };
    }
    const entrada = porNivel[pick.nivel];
    entrada.cantidad++;
    if (pick.resultado === "GANO") entrada.ganadas++;
    else if (pick.resultado === "PERDIO") entrada.perdidas++;
    else if (pick.resultado === "EMPATE") entrada.empates++;
  }

  const conTicket = new Map<string, PickEconomico>();
  const sinTicket: PickEconomico[] = [];
  for (const pick of resueltos) {
    if (pick.ticketId) {
      if (!conTicket.has(pick.ticketId)) conTicket.set(pick.ticketId, pick);
    } else {
      sinTicket.push(pick);
    }
  }
  const dinero = [...conTicket.values(), ...sinTicket];

  // Un hueco explícito es preferible a un número inventado: si ningún pick
  // resuelto tiene stake/payout realmente registrado, reportar null en vez
  // de sumar puros "undefined" y mostrar un engañoso 0 que parecería un
  // resultado económico real.
  const tieneDatosReales = dinero.some((p) => p.stake != null || p.payout != null);

  if (!tieneDatosReales) {
    return {
      totalPicksResueltos: resueltos.length,
      porNivel,
      totalApostado: null,
      totalCobrado: null,
      neto: null,
      advertencia:
        "Ningún pick resuelto tiene stake/payout registrado; no se puede calcular el resultado económico en pesos.",
    };
  }

  const totalApostado = dinero.reduce((acc, p) => acc + (p.stake ?? 0), 0);
  const totalCobrado = dinero.reduce((acc, p) => acc + (p.payout ?? 0), 0);

  return {
    totalPicksResueltos: resueltos.length,
    porNivel,
    totalApostado,
    totalCobrado,
    neto: totalCobrado - totalApostado,
  };
}
