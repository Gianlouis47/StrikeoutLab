import { describe, expect, it } from "vitest";
import { evaluarParlay } from "../src/apuesta.js";

/**
 * La misma matemática vive en TypeScript y en Postgres (evaluar_parlay). Si
 * las dos no dan el mismo número, una está mal. Estos son los valores que
 * devolvió la función de Postgres con las mismas entradas.
 */
describe("TypeScript y Postgres dan el mismo parlay", () => {
  const DE_POSTGRES: Record<number, { prob: number; ev: number; mediana: number; promedio: number; ruina: number }> = {
    1:  { prob: 0.5875, ev: 0.0394, mediana: 1.132, promedio: 1.218, ruina: 0.0001 },
    2:  { prob: 0.3452, ev: 0.0804, mediana: 1.232, promedio: 1.494, ruina: 0.0087 },
    3:  { prob: 0.2028, ev: 0.1230, mediana: 0.986, promedio: 1.846, ruina: 0.0408 },
    4:  { prob: 0.1191, ev: 0.1673, mediana: 0.870, promedio: 2.300, ruina: 0.1443 },
    6:  { prob: 0.0411, ev: 0.2611, mediana: 0.277, promedio: 3.659, ruina: 0.4075 },
    8:  { prob: 0.0142, ev: 0.3625, mediana: 0.036, promedio: 6.027, ruina: 0.5842 },
    12: { prob: 0.0017, ev: 0.5904, mediana: 0.006, promedio: 18.344, ruina: 0.8443 },
  };

  const resultado = evaluarParlay([0.85, 0.85, 0.85, 0.85, 0.85, 0.85], {
    factorCalibracion: 0.25,
    cuotaAmericana: -130,
    apuestasPorTemporada: 100,
    apuestaFija: 0.05,
  });

  for (const [patas, esperado] of Object.entries(DE_POSTGRES)) {
    it(`coincide en ${patas} pata(s)`, () => {
      const e = resultado.escalera.find((x) => x.patas === Number(patas))!;
      expect(e.probabilidad).toBeCloseTo(esperado.prob, 4);
      expect(e.valorEsperado).toBeCloseTo(esperado.ev, 4);
      expect(e.terminasConMediana).toBeCloseTo(esperado.mediana, 3);
      expect(e.terminasConPromedio).toBeCloseTo(esperado.promedio, 3);
      expect(e.probFundirte).toBeCloseTo(esperado.ruina, 4);
    });
  }

  it("recomienda la misma cantidad de patas que Postgres", () => {
    expect(resultado.patasOptimas).toBe(2);
  });
});
