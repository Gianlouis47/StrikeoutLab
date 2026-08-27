import { describe, expect, it } from "vitest";
import { log5, proyectarPonches } from "../src/proyeccion.js";

describe("log5", () => {
  it("devuelve la tasa de liga cuando pitcher y bateador son ambos promedio", () => {
    expect(log5(0.225, 0.225, 0.225)).toBeCloseTo(0.225, 5);
  });

  it("empuja hacia arriba cuando ambos lados favorecen el ponche", () => {
    // Pitcher que poncha mucho (30%) vs equipo que se poncha mucho (26%),
    // en una liga de 22.5%: el resultado debe superar a los dos.
    const combinado = log5(0.3, 0.26, 0.225);
    expect(combinado).toBeGreaterThan(0.3);
    expect(combinado).toBeGreaterThan(0.26);
  });

  it("empuja hacia abajo cuando ambos lados evitan el ponche", () => {
    const combinado = log5(0.16, 0.18, 0.225);
    expect(combinado).toBeLessThan(0.16);
    expect(combinado).toBeLessThan(0.18);
  });

  it("queda entre ambos cuando se contrarrestan", () => {
    const combinado = log5(0.32, 0.17, 0.225);
    expect(combinado).toBeGreaterThan(0.17);
    expect(combinado).toBeLessThan(0.32);
  });
});

describe("proyectarPonches", () => {
  it("proyecta menos K que la línea y dice UNDER cuando el pitcher no poncha mucho", () => {
    const r = proyectarPonches({
      linea: 7,
      kPctPitcher: 18,
      whipPitcher: 1.35,
      ipPorSalida: 5.1,
      kPctRival: 19,
      ligaKPct: 22.5,
    });
    expect(r.kProyectados).toBeLessThan(7);
    expect(r.veredicto).toBe("UNDER");
    expect(r.confianza).toBeGreaterThan(0.5);
  });

  it("proyecta más K que la línea y dice OVER con un pitcher dominante", () => {
    const r = proyectarPonches({
      linea: 5.5,
      kPctPitcher: 33,
      whipPitcher: 0.98,
      ipPorSalida: 6.1,
      kPctRival: 26,
      ligaKPct: 22.5,
    });
    expect(r.kProyectados).toBeGreaterThan(5.5);
    expect(r.veredicto).toBe("OVER");
    expect(r.confianza).toBeGreaterThan(0.5);
  });

  it("las tres probabilidades suman 1", () => {
    const r = proyectarPonches({ linea: 6, kPctPitcher: 25, ipPorSalida: 5.2, kPctRival: 23 });
    expect(r.probOver + r.probUnder + r.probEmpate).toBeCloseTo(1, 6);
  });

  it("solo hay probabilidad de empate en líneas enteras", () => {
    const entera = proyectarPonches({ linea: 6, kPctPitcher: 25, ipPorSalida: 5.2 });
    const conMedio = proyectarPonches({ linea: 6.5, kPctPitcher: 25, ipPorSalida: 5.2 });
    expect(entera.probEmpate).toBeGreaterThan(0);
    expect(conMedio.probEmpate).toBe(0);
  });

  it("convierte la notación de innings de béisbol correctamente (6.2 = 6 y 2/3)", () => {
    // 6.2 IP en notación de béisbol son 6.667 innings reales, no 6.2.
    const r = proyectarPonches({ linea: 6, kPctPitcher: 25, whipPitcher: 1.2, ipPorSalida: 6.2 });
    // BF = 6.667 × (3 + 1.2) = 28.0
    expect(r.bateadoresEsperados).toBeCloseTo(28.0, 1);
  });

  it("más innings implica más K proyectados, con todo lo demás igual", () => {
    const corta = proyectarPonches({ linea: 6, kPctPitcher: 27, whipPitcher: 1.1, ipPorSalida: 4.0 });
    const larga = proyectarPonches({ linea: 6, kPctPitcher: 27, whipPitcher: 1.1, ipPorSalida: 7.0 });
    expect(larga.kProyectados).toBeGreaterThan(corta.kProyectados);
  });

  it("un rival que se poncha más sube la proyección", () => {
    const base = { linea: 6, kPctPitcher: 26, whipPitcher: 1.15, ipPorSalida: 5.2, ligaKPct: 22.5 };
    const rivalFacil = proyectarPonches({ ...base, kPctRival: 27 });
    const rivalDificil = proyectarPonches({ ...base, kPctRival: 17 });
    expect(rivalFacil.kProyectados).toBeGreaterThan(rivalDificil.kProyectados);
  });

  it("avisa y no inventa ventaja cuando no hay datos del pitcher", () => {
    const r = proyectarPonches({ linea: 6 });
    expect(r.supuestos.length).toBeGreaterThan(0);
    expect(r.advertencias.join(" ")).toContain("promedio de la liga");
  });

  it("registra qué datos reales usó, para poder auditar el número", () => {
    const r = proyectarPonches({
      linea: 6.5,
      kPctPitcher: 28,
      whipPitcher: 1.05,
      ipPorSalida: 6.0,
      kPctRival: 24,
      ligaKPct: 22.4,
    });
    expect(r.entradasUsadas).toHaveLength(5);
    expect(r.supuestos).toHaveLength(0);
  });

  it("no da veredicto cuando la línea cae justo en el centro", () => {
    // Buscamos una línea que quede casi exactamente en la mediana.
    const sonda = proyectarPonches({ linea: 6.5, kPctPitcher: 25, whipPitcher: 1.2, ipPorSalida: 5.2 });
    const lineaCentral = Math.round(sonda.kProyectados * 2) / 2;
    const r = proyectarPonches({
      linea: lineaCentral,
      kPctPitcher: 25,
      whipPitcher: 1.2,
      ipPorSalida: 5.2,
    });
    expect(r.confianza).toBeLessThan(0.75);
  });

  it("la confianza excluye el empate, así que nunca supera el 100%", () => {
    const r = proyectarPonches({ linea: 5, kPctPitcher: 34, whipPitcher: 0.95, ipPorSalida: 6.2 });
    expect(r.confianza).toBeLessThanOrEqual(1);
    expect(r.confianza).toBeGreaterThan(0);
  });
});
