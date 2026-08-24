import { describe, it, expect } from "vitest";
import { reporteCalibracion, resumenEconomico, type PickCalibracion, type PickEconomico } from "../src/calibration.js";
import type { Resultado } from "../src/calculations.js";

function pick(
  confianza: number,
  resultado: Resultado | null,
  fuenteConfianza: "CALCULADA" | "JUICIO" = "CALCULADA",
): PickCalibracion {
  return { confianza, resultado, fuenteConfianza };
}

function buscarBanda(filas: ReturnType<typeof reporteCalibracion>, banda: string, fuente: string) {
  const fila = filas.find((f) => f.banda === banda && f.fuenteConfianza === fuente);
  if (!fila) throw new Error(`no se encontró banda ${banda}/${fuente}`);
  return fila;
}

describe("reporteCalibracion", () => {
  it("separa CALCULADA de JUICIO y excluye empates de la tasa", () => {
    const filas: PickCalibracion[] = [
      ...Array.from({ length: 10 }, () => pick(0.82, "GANO", "CALCULADA")),
      ...Array.from({ length: 4 }, () => pick(0.82, "PERDIO", "CALCULADA")),
      ...Array.from({ length: 1 }, () => pick(0.82, "EMPATE", "CALCULADA")),
      ...Array.from({ length: 3 }, () => pick(0.83, "GANO", "JUICIO")),
      ...Array.from({ length: 7 }, () => pick(0.83, "PERDIO", "JUICIO")),
    ];

    const reporte = reporteCalibracion(filas);

    const todas = buscarBanda(reporte, "80-84%", "TODAS");
    expect(todas.cantidad).toBe(25);
    expect(todas.ganadas).toBe(13);
    expect(todas.perdidas).toBe(11);
    expect(todas.empates).toBe(1);
    expect(todas.tasaReal).toBeCloseTo(13 / 24, 6);
    expect(todas.muestraInsuficiente).toBe(false);

    const calculada = buscarBanda(reporte, "80-84%", "CALCULADA");
    expect(calculada.cantidad).toBe(15);
    expect(calculada.tasaReal).toBeCloseTo(10 / 14, 6);
    expect(calculada.muestraInsuficiente).toBe(true); // 15 < 20

    const juicio = buscarBanda(reporte, "80-84%", "JUICIO");
    expect(juicio.cantidad).toBe(10);
    expect(juicio.tasaReal).toBeCloseTo(3 / 10, 6);
    expect(juicio.muestraInsuficiente).toBe(true);
  });

  it("marca muestra insuficiente en banda chica", () => {
    const filas: PickCalibracion[] = [
      pick(0.92, "GANO"),
      pick(0.92, "GANO"),
      pick(0.93, "PERDIO"),
    ];
    const reporte = reporteCalibracion(filas);
    const fila = buscarBanda(reporte, "90-94%", "TODAS");
    expect(fila.cantidad).toBe(3);
    expect(fila.muestraInsuficiente).toBe(true);
  });

  it("excluye picks no resueltos", () => {
    const filas: PickCalibracion[] = [pick(0.82, "GANO"), pick(0.82, null)];
    const reporte = reporteCalibracion(filas);
    const fila = buscarBanda(reporte, "80-84%", "TODAS");
    expect(fila.cantidad).toBe(1);
  });

  it("reporte vacío sin picks resueltos", () => {
    const reporte = reporteCalibracion([pick(0.82, null)]);
    expect(reporte).toEqual([]);
  });
});

describe("resumenEconomico", () => {
  it("desglosa por nivel sin repartir dinero de boleta mixta", () => {
    const filas: PickEconomico[] = [
      { resultado: "GANO", nivel: "DIAMANTE", ticketId: "T1", stake: 150, payout: 900 },
      { resultado: "GANO", nivel: "ORO", ticketId: "T1", stake: 150, payout: 900 },
      { resultado: "PERDIO", nivel: "ORO", ticketId: "T2", stake: 100, payout: 0 },
    ];
    const resumen = resumenEconomico(filas);

    expect(resumen.totalPicksResueltos).toBe(3);
    // T1 se deduplica: el stake/payout de la boleta no se cuenta dos veces
    expect(resumen.totalApostado).toBeCloseTo(250, 6);
    expect(resumen.totalCobrado).toBeCloseTo(900, 6);
    expect(resumen.neto).toBeCloseTo(650, 6);

    expect(resumen.porNivel.DIAMANTE.cantidad).toBe(1);
    expect(resumen.porNivel.ORO.cantidad).toBe(2);
    expect(resumen.porNivel.ORO.ganadas).toBe(1);
    expect(resumen.porNivel.ORO.perdidas).toBe(1);
  });

  it("sin datos de dinero advierte en vez de inventar", () => {
    const resumen = resumenEconomico([{ resultado: "GANO", nivel: "ORO" }]);
    expect(resumen.totalApostado).toBeNull();
    expect(resumen.advertencia).toBeDefined();
  });

  it("columnas de dinero presentes pero vacías no reporta cero falso", () => {
    const resumen = resumenEconomico([
      { resultado: "GANO", nivel: "ORO", ticketId: null, stake: null, payout: null },
    ]);
    expect(resumen.totalApostado).toBeNull();
    expect(resumen.advertencia).toBeDefined();
  });
});
