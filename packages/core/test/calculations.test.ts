import { describe, it, expect } from "vitest";
import {
  ipADecimal,
  pitcheosPorEntrada,
  tasaSuperacionLinea,
  kRate,
  compararRivales,
  probabilidadParlay,
  detectarCorrelacionMismoJuego,
  evaluarPick,
} from "../src/calculations.js";

describe("ipADecimal", () => {
  it("un out", () => {
    expect(ipADecimal(5.1)).toBeCloseTo(5 + 1 / 3, 6);
  });

  it("dos outs", () => {
    expect(ipADecimal(5.2)).toBeCloseTo(5 + 2 / 3, 6);
  });

  it("entrada completa", () => {
    expect(ipADecimal(6.0)).toBe(6.0);
  });

  it("decimal inválido lanza error", () => {
    expect(() => ipADecimal(5.3)).toThrow();
  });
});

describe("pitcheosPorEntrada", () => {
  it("calcula correctamente", () => {
    const salidas = [
      { k: 0, ip: 6.0, pitcheos: 90 },
      { k: 0, ip: 5.1, pitcheos: 80 },
    ];
    const esperado = (90 + 80) / (6.0 + (5 + 1 / 3));
    expect(pitcheosPorEntrada(salidas)).toBeCloseTo(esperado, 6);
  });

  it("falta pitcheos retorna null", () => {
    const salidas = [
      { k: 0, ip: 6.0, pitcheos: 90 },
      { k: 0, ip: 5.1, pitcheos: null },
    ];
    expect(pitcheosPorEntrada(salidas)).toBeNull();
  });

  it("lista vacía retorna null", () => {
    expect(pitcheosPorEntrada([])).toBeNull();
  });
});

describe("tasaSuperacionLinea — los seis casos obligatorios", () => {
  const tasa = (k: number, linea: number, pick: "OVER" | "UNDER") =>
    tasaSuperacionLinea([{ k }], linea, pick);

  it("OVER media gana", () => {
    const r = tasa(6, 5.5, "OVER");
    expect(r.ganadas).toBe(1);
    expect(r.perdidas).toBe(0);
    expect(r.empates).toBe(0);
  });

  it("OVER media pierde", () => {
    const r = tasa(5, 5.5, "OVER");
    expect(r.ganadas).toBe(0);
    expect(r.perdidas).toBe(1);
    expect(r.empates).toBe(0);
  });

  it("UNDER media gana", () => {
    const r = tasa(5, 5.5, "UNDER");
    expect(r.ganadas).toBe(1);
    expect(r.perdidas).toBe(0);
    expect(r.empates).toBe(0);
  });

  it("UNDER media pierde", () => {
    const r = tasa(6, 5.5, "UNDER");
    expect(r.ganadas).toBe(0);
    expect(r.perdidas).toBe(1);
    expect(r.empates).toBe(0);
  });

  it("OVER entera empata", () => {
    const r = tasa(5, 5.0, "OVER");
    expect(r.empates).toBe(1);
    expect(r.ganadas).toBe(0);
    expect(r.perdidas).toBe(0);
  });

  it("UNDER entera empata", () => {
    const r = tasa(5, 5.0, "UNDER");
    expect(r.empates).toBe(1);
    expect(r.ganadas).toBe(0);
    expect(r.perdidas).toBe(0);
  });

  it("OVER entera gana y pierde", () => {
    expect(tasa(6, 5.0, "OVER").ganadas).toBe(1);
    expect(tasa(4, 5.0, "OVER").perdidas).toBe(1);
  });

  it("UNDER entera gana y pierde", () => {
    expect(tasa(4, 5.0, "UNDER").ganadas).toBe(1);
    expect(tasa(6, 5.0, "UNDER").perdidas).toBe(1);
  });

  it("advierte con muestra menor a cinco", () => {
    const salidas = [{ k: 6 }, { k: 5 }, { k: 7 }, { k: 4 }];
    const r = tasaSuperacionLinea(salidas, 5.5, "OVER");
    expect(r.total).toBe(4);
    expect(r.advertencia).not.toBeNull();
  });

  it("no advierte con cinco o más", () => {
    const salidas = Array.from({ length: 5 }, () => ({ k: 6 }));
    const r = tasaSuperacionLinea(salidas, 5.5, "OVER");
    expect(r.advertencia).toBeNull();
  });

  it("la tasa no es una confianza a ojo (caso documentado en la especificación)", () => {
    // 3 de 5 salidas ganan (60%), no 82-84% asignado "a ojo".
    const salidas = [{ k: 6 }, { k: 6 }, { k: 6 }, { k: 4 }, { k: 5 }];
    const r = tasaSuperacionLinea(salidas, 5.5, "OVER");
    expect(r.tasa).toBeCloseTo(0.6, 6);
  });
});

describe("kRate y compararRivales", () => {
  it("kRate simple", () => {
    expect(kRate(136, 488)).toBeCloseTo(136 / 488, 6);
  });

  it("equipo con más K totales puede tener menor tasa", () => {
    // Caso real que ya produjo un error en producción: 136/488 (~27.87%)
    // tiene MENOR tasa que 132/443 (~29.80%), aunque 136 > 132 en total.
    const equipos = [
      { equipo: "AAA", k: 136, pa: 488 },
      { equipo: "BBB", k: 132, pa: 443 },
    ];
    const ranking = compararRivales(equipos);
    expect(ranking[0].equipo).toBe("BBB");
    expect(ranking[1].equipo).toBe("AAA");
    expect(ranking[0].kRate).toBeGreaterThan(ranking[1].kRate);
  });
});

describe("probabilidadParlay", () => {
  it("cuatro patas no es la confianza individual", () => {
    const resultado = probabilidadParlay([0.85, 0.85, 0.85, 0.85]);
    expect(resultado).toBeCloseTo(0.85 ** 4, 6);
    expect(resultado).toBeCloseTo(0.52200625, 3);
    expect(resultado).not.toBeCloseTo(0.85, 3);
  });

  it("lista vacía lanza error", () => {
    expect(() => probabilidadParlay([])).toThrow();
  });

  it("confianza fuera de rango lanza error", () => {
    expect(() => probabilidadParlay([0.5, 1.5])).toThrow();
  });
});

describe("detectarCorrelacionMismoJuego", () => {
  it("detecta dos abridores del mismo juego", () => {
    const patas = [
      { fecha: "2026-08-24", equipo: "NYY", rival: "BOS" },
      { fecha: "2026-08-24", equipo: "BOS", rival: "NYY" },
    ];
    expect(detectarCorrelacionMismoJuego(patas)).toHaveLength(1);
  });

  it("no advierte juegos distintos", () => {
    const patas = [
      { fecha: "2026-08-24", equipo: "NYY", rival: "BOS" },
      { fecha: "2026-08-24", equipo: "LAD", rival: "SFG" },
    ];
    expect(detectarCorrelacionMismoJuego(patas)).toEqual([]);
  });
});

describe("evaluarPick", () => {
  it("empate en línea entera no es PERDIO", () => {
    expect(evaluarPick(5, 5.0, "OVER")).toBe("EMPATE");
    expect(evaluarPick(5, 5.0, "UNDER")).toBe("EMPATE");
  });

  it("gana y pierde en línea media", () => {
    expect(evaluarPick(6, 5.5, "OVER")).toBe("GANO");
    expect(evaluarPick(5, 5.5, "OVER")).toBe("PERDIO");
    expect(evaluarPick(5, 5.5, "UNDER")).toBe("GANO");
    expect(evaluarPick(6, 5.5, "UNDER")).toBe("PERDIO");
  });

  it("pick inválido lanza error", () => {
    // @ts-expect-error probamos un valor inválido a propósito
    expect(() => evaluarPick(5, 5.5, "OVAR")).toThrow();
  });
});
