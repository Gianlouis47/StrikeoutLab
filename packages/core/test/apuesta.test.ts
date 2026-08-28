import { describe, expect, it } from "vitest";
import {
  binomialAcumulada,
  evaluarApuesta,
  evaluarParlay,
  gananciaPorPeso,
  probabilidadDeEquilibrio,
} from "../src/apuesta.js";

describe("cuotas americanas", () => {
  it("convierte el -130 de Star Sport", () => {
    // Arriesgar 130 para ganar 100.
    expect(gananciaPorPeso(-130)).toBeCloseTo(100 / 130, 6);
    expect(probabilidadDeEquilibrio(-130)).toBeCloseTo(0.5652, 4);
  });

  it("convierte cuotas positivas", () => {
    expect(gananciaPorPeso(150)).toBeCloseTo(1.5, 6);
    expect(probabilidadDeEquilibrio(150)).toBeCloseTo(0.4, 6);
  });

  it("el -110 típico pide 52.4%", () => {
    expect(probabilidadDeEquilibrio(-110)).toBeCloseTo(0.5238, 4);
  });

  it("rechaza cuotas imposibles", () => {
    expect(() => gananciaPorPeso(0)).toThrow();
    expect(() => gananciaPorPeso(50)).toThrow();
    expect(() => gananciaPorPeso(-99)).toThrow();
  });
});

describe("evaluarApuesta", () => {
  it("en la probabilidad de equilibrio el valor esperado es cero", () => {
    const r = evaluarApuesta(probabilidadDeEquilibrio(-130), -130);
    expect(r.valorEsperado).toBeCloseTo(0, 6);
    expect(r.veredicto).toBe("NO CONVIENE");
  });

  it("56% pierde plata al -130 aunque gane más veces de las que pierde", () => {
    const r = evaluarApuesta(0.56, -130);
    expect(r.valorEsperado).toBeLessThan(0);
    expect(r.veredicto).toBe("NO CONVIENE");
    expect(r.apuestaRecomendada).toBe(0);
  });

  it("58% gana pero tan poco que no vale la pena", () => {
    const r = evaluarApuesta(0.58, -130);
    expect(r.valorEsperado).toBeGreaterThan(0);
    expect(r.veredicto).toBe("FLOJO");
  });

  it("62% sí conviene", () => {
    const r = evaluarApuesta(0.62, -130);
    expect(r.veredicto).toBe("CONVIENE");
    expect(r.ventaja).toBeGreaterThan(0.05);
    expect(r.valorEsperado).toBeCloseTo(0.62 * (100 / 130) - 0.38, 6);
  });

  it("nunca recomienda apostar más del 5% del bankroll", () => {
    for (const p of [0.7, 0.85, 0.95, 0.999]) {
      expect(evaluarApuesta(p, -130).apuestaRecomendada).toBeLessThanOrEqual(0.05);
    }
  });

  it("el empate no resta: devuelve la plata", () => {
    const sinEmpate = evaluarApuesta(0.5, -130, 0);
    const conEmpate = evaluarApuesta(0.5, -130, 0.2);
    // Con la misma probabilidad de ganar, tener empates en vez de derrotas
    // mejora el resultado esperado.
    expect(conEmpate.valorEsperado).toBeGreaterThan(sinEmpate.valorEsperado);
    expect(conEmpate.probPerder).toBeCloseTo(0.3, 6);
  });

  it("no acepta que ganar y empatar sumen más de 1", () => {
    expect(() => evaluarApuesta(0.7, -130, 0.4)).toThrow();
  });
});

describe("binomialAcumulada", () => {
  it("suma 1 cuando cubre todos los casos", () => {
    expect(binomialAcumulada(10, 10, 0.37)).toBeCloseTo(1, 9);
  });

  it("coincide con el cálculo a mano en un caso chico", () => {
    // P(X <= 1) con n=3, p=0.5 → (1 + 3)/8 = 0.5
    expect(binomialAcumulada(1, 3, 0.5)).toBeCloseTo(0.5, 9);
  });

  it("es monótona en k", () => {
    let previo = -1;
    for (let k = 0; k <= 20; k++) {
      const v = binomialAcumulada(k, 20, 0.3);
      expect(v).toBeGreaterThanOrEqual(previo);
      previo = v;
    }
  });
});

describe("evaluarParlay", () => {
  const seisPatas = [0.85, 0.85, 0.85, 0.85, 0.85, 0.85];

  it("dos patas al 85% no dan 85%", () => {
    const r = evaluarParlay([0.85, 0.85], { factorCalibracion: 1 });
    expect(r.tuParlay.probabilidad).toBeCloseTo(0.7225, 4);
  });

  it("la calibración comprime la confianza hacia el 50%", () => {
    const r = evaluarParlay([0.85], { factorCalibracion: 0.25 });
    expect(r.probabilidadesHonestas[0]).toBeCloseTo(0.5875, 4);
  });

  it("más patas siempre suben el valor esperado si cada pata tiene ventaja", () => {
    // Es contraintuitivo pero es cierto: la ventaja se multiplica. Por eso el
    // valor esperado solo no sirve para decidir cuántas patas jugar.
    const r = evaluarParlay(seisPatas, { factorCalibracion: 0.25, maxPatas: 12 });
    for (let i = 1; i < r.escalera.length; i++) {
      expect(r.escalera[i]!.valorEsperado).toBeGreaterThan(r.escalera[i - 1]!.valorEsperado);
    }
  });

  it("y sin embargo doce patas te funden", () => {
    const r = evaluarParlay(seisPatas, { factorCalibracion: 0.25, apuestaFija: 0.05 });
    const doce = r.escalera.find((e) => e.patas === 12)!;
    // El promedio dice "la mejor apuesta de la tabla"...
    expect(doce.valorEsperado).toBe(Math.max(...r.escalera.map((e) => e.valorEsperado)));
    // ...y la mediana dice que terminás sin nada.
    expect(doce.terminasConMediana).toBeLessThan(0.1);
    expect(doce.probFundirte).toBeGreaterThan(0.5);
  });

  it("recomienda pocas patas, no la de mayor valor esperado", () => {
    const r = evaluarParlay(seisPatas, { factorCalibracion: 0.25, apuestaFija: 0.05 });
    expect(r.patasOptimas).toBeLessThanOrEqual(4);
    // La óptima es la de mediana más alta, por definición.
    const mejor = r.escalera.find((e) => e.patas === r.patasOptimas)!;
    expect(mejor.terminasConMediana).toBe(Math.max(...r.escalera.map((e) => e.terminasConMediana)));
  });

  it("la probabilidad del parlay cae al agregar patas", () => {
    const r = evaluarParlay(seisPatas, { factorCalibracion: 1 });
    for (let i = 1; i < r.escalera.length; i++) {
      expect(r.escalera[i]!.probabilidad).toBeLessThan(r.escalera[i - 1]!.probabilidad);
    }
  });

  it("la escalera se queda con las mejores patas primero", () => {
    const r = evaluarParlay([0.6, 0.9, 0.75], { factorCalibracion: 1 });
    // Una sola pata → la mejor de las tres.
    expect(r.escalera[0]!.probabilidad).toBeCloseTo(0.9, 6);
    // Dos patas → las dos mejores.
    expect(r.escalera[1]!.probabilidad).toBeCloseTo(0.9 * 0.75, 6);
  });

  it("nunca recomienda apostar más del 5%, ni con patas casi seguras", () => {
    const r = evaluarParlay([0.99, 0.99, 0.99], { factorCalibracion: 1 });
    for (const e of r.escalera) expect(e.apuestaRecomendadaPct).toBeLessThanOrEqual(5);
  });

  it("con patas sin ventaja no manda apostar nada", () => {
    const r = evaluarParlay([0.5, 0.5], { factorCalibracion: 1 });
    expect(r.escalera[0]!.apuestaRecomendadaPct).toBe(0);
    expect(r.escalera[0]!.valorEsperado).toBeLessThan(0);
  });

  it("el promedio siempre queda por encima de la mediana en parlays largos", () => {
    // Es la firma de la rifa: unos pocos aciertos enormes suben el promedio
    // sin que a vos te pase nunca.
    const r = evaluarParlay(seisPatas, { factorCalibracion: 0.25, apuestaFija: 0.05 });
    const largo = r.escalera.find((e) => e.patas === 10)!;
    expect(largo.terminasConPromedio).toBeGreaterThan(largo.terminasConMediana);
  });

  it("rechaza un parlay sin patas", () => {
    expect(() => evaluarParlay([])).toThrow();
  });
});
