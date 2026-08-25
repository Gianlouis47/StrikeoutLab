import { describe, expect, it } from "vitest";
import { calcularPuntajeHeuristico } from "../src/calculadoraHeuristica.js";

describe("calcularPuntajeHeuristico", () => {
  it("devuelve null con advertencia cuando faltan casi todas las variables", () => {
    const resultado = calcularPuntajeHeuristico({
      linea: 5.5,
      pick: "OVER",
      pitcher: { kPct: 30 },
    });
    expect(resultado.puntaje).toBeNull();
    expect(resultado.confianza).toBeNull();
    expect(resultado.nivel).toBeNull();
    expect(resultado.advertencia).toMatch(/Datos insuficientes/);
  });

  it("un pitcher dominante contra un rival ponchador da un puntaje alto en Over", () => {
    const resultado = calcularPuntajeHeuristico({
      linea: 5.5,
      pick: "OVER",
      pitcher: {
        kPct: 34,
        whiffPct: 34,
        cswPct: 33,
        swstrPct: 15,
        k9: 11.5,
        whip: 1.0,
        ip: 120,
        correaPitcheosPromedio: 100,
      },
      rival: { kPct: 29 },
    });
    expect(resultado.puntaje).not.toBeNull();
    expect(resultado.puntaje!).toBeGreaterThan(80);
    expect(["DIAMANTE", "DIAMANTE_ALTO"]).toContain(resultado.nivel);
    expect(resultado.variablesFaltantes).toHaveLength(0);
  });

  it("un pitcher flojo contra un rival de contacto da un puntaje bajo en Over", () => {
    const resultado = calcularPuntajeHeuristico({
      linea: 5.5,
      pick: "OVER",
      pitcher: { kPct: 16, whiffPct: 19, cswPct: 25, swstrPct: 8, k9: 6.5, whip: 1.5 },
      rival: { kPct: 16 },
    });
    expect(resultado.puntaje).not.toBeNull();
    expect(resultado.puntaje!).toBeLessThan(30);
    expect(resultado.nivel).toBe("IMPUREZA");
  });

  it("invierte el ajuste de rival para Under: rival de contacto sube el puntaje", () => {
    const base = {
      linea: 3.5,
      pitcher: { kPct: 20, whiffPct: 22, cswPct: 27 },
    };
    const conRivalContacto = calcularPuntajeHeuristico({ ...base, pick: "UNDER", rival: { kPct: 16 } });
    const conRivalPonchador = calcularPuntajeHeuristico({ ...base, pick: "UNDER", rival: { kPct: 30 } });
    expect(conRivalContacto.puntaje!).toBeGreaterThan(conRivalPonchador.puntaje!);
  });

  it("avisa cuando la muestra de IP es chica, sin dejar de calcular", () => {
    const resultado = calcularPuntajeHeuristico({
      linea: 4.5,
      pick: "OVER",
      pitcher: { kPct: 28, whiffPct: 27, cswPct: 30, ip: 8 },
      rival: { kPct: 25 },
    });
    expect(resultado.puntaje).not.toBeNull();
    expect(resultado.advertencia).toMatch(/Muestra de temporada chica/);
  });

  it("nunca inventa un valor faltante: variablesFaltantes lista lo que no se usó", () => {
    const resultado = calcularPuntajeHeuristico({
      linea: 4.5,
      pick: "OVER",
      pitcher: { kPct: 25, whiffPct: 26, cswPct: 28 },
    });
    expect(resultado.variablesFaltantes).toContain("K% del rival");
    expect(resultado.variablesFaltantes).toContain("K/9");
    expect(resultado.variablesUsadas).toEqual(["K%", "Whiff%", "CSW%"]);
  });
});
