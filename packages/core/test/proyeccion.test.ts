import { describe, expect, it } from "vitest";
import { evaluarParlay } from "../src/apuesta.js";
import type { Nivel } from "../src/calibration.js";
import {
  ESTABILIZACION,
  log5,
  nivelDesdeValorEsperado,
  proyectarPonches,
  regresarALaMedia,
} from "../src/proyeccion.js";

/**
 * Temporada completa: con esta muestra la regresión a la media casi no
 * mueve nada, así que los tests de comportamiento miden lo que quieren
 * medir y no el ajuste por muestra chica.
 */
const TEMPORADA_COMPLETA = { ipTotales: 170, salidas: 28 } as const;

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
      ...TEMPORADA_COMPLETA,
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
      ...TEMPORADA_COMPLETA,
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
    const r = proyectarPonches({ ...TEMPORADA_COMPLETA, linea: 6, kPctPitcher: 25, ipPorSalida: 5.2, kPctRival: 23 });
    expect(r.probOver + r.probUnder + r.probEmpate).toBeCloseTo(1, 6);
  });

  it("solo hay probabilidad de empate en líneas enteras", () => {
    const entera = proyectarPonches({ ...TEMPORADA_COMPLETA, linea: 6, kPctPitcher: 25, ipPorSalida: 5.2 });
    const conMedio = proyectarPonches({ ...TEMPORADA_COMPLETA, linea: 6.5, kPctPitcher: 25, ipPorSalida: 5.2 });
    expect(entera.probEmpate).toBeGreaterThan(0);
    expect(conMedio.probEmpate).toBe(0);
  });

  it("trata los innings por salida como decimal, no como notación de béisbol", () => {
    // ip_por_salida se guarda como IP totales / salidas (183.67 / 28 = 6.56),
    // así que 6.2 son 6.2 innings, no 6 y 2/3.
    const r = proyectarPonches({
      ...TEMPORADA_COMPLETA,
      linea: 6,
      kPctPitcher: 25,
      whipPitcher: 1.2,
      ipPorSalida: 6.2,
    });
    expect(r.ajustePorMuestra.ipPorSalidaCrudo).toBe(6.2);
    // Leerlo como notación de béisbol daría 6.667: el ajustado tiene que
    // quedar por debajo de 6.2, no por encima.
    expect(r.ajustePorMuestra.ipPorSalidaAjustado).toBeLessThan(6.2);
    // BF ≈ 6.02 × (3 + 1.2) ≈ 25, no los 28 de la lectura equivocada.
    expect(r.bateadoresEsperados).toBeLessThan(27);
  });

  it("más innings implica más K proyectados, con todo lo demás igual", () => {
    const corta = proyectarPonches({ ...TEMPORADA_COMPLETA, linea: 6, kPctPitcher: 27, whipPitcher: 1.1, ipPorSalida: 4.0 });
    const larga = proyectarPonches({ ...TEMPORADA_COMPLETA, linea: 6, kPctPitcher: 27, whipPitcher: 1.1, ipPorSalida: 7.0 });
    expect(larga.kProyectados).toBeGreaterThan(corta.kProyectados);
  });

  it("un rival que se poncha más sube la proyección", () => {
    const base = { ...TEMPORADA_COMPLETA, linea: 6, kPctPitcher: 26, whipPitcher: 1.15, ipPorSalida: 5.2, ligaKPct: 22.5 };
    const rivalFacil = proyectarPonches({ ...base, kPctRival: 27 });
    const rivalDificil = proyectarPonches({ ...base, kPctRival: 17 });
    expect(rivalFacil.kProyectados).toBeGreaterThan(rivalDificil.kProyectados);
  });

  it("avisa y no inventa ventaja cuando no hay datos del pitcher", () => {
    const r = proyectarPonches({ linea: 6 });
    expect(r.supuestos.length).toBeGreaterThan(0);
    expect(r.advertencias.join(" ")).toContain("promedio de liga");
  });

  it("registra qué datos reales usó, para poder auditar el número", () => {
    const r = proyectarPonches({
      ...TEMPORADA_COMPLETA,
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
    const sonda = proyectarPonches({ ...TEMPORADA_COMPLETA, linea: 6.5, kPctPitcher: 25, whipPitcher: 1.2, ipPorSalida: 5.2 });
    const lineaCentral = Math.round(sonda.kProyectados * 2) / 2;
    const r = proyectarPonches({
      ...TEMPORADA_COMPLETA,
      linea: lineaCentral,
      kPctPitcher: 25,
      whipPitcher: 1.2,
      ipPorSalida: 5.2,
    });
    expect(r.confianza).toBeLessThan(0.75);
  });

  it("la confianza excluye el empate, así que nunca supera el 100%", () => {
    const r = proyectarPonches({ ...TEMPORADA_COMPLETA, linea: 5, kPctPitcher: 34, whipPitcher: 0.95, ipPorSalida: 6.2 });
    expect(r.confianza).toBeLessThanOrEqual(1);
    expect(r.confianza).toBeGreaterThan(0);
  });
});

describe("regresarALaMedia", () => {
  it("sin muestra devuelve el ancla entera", () => {
    expect(regresarALaMedia(50, 0, 22, 70)).toBeCloseTo(22, 6);
  });

  it("con muestra enorme devuelve casi lo observado", () => {
    expect(regresarALaMedia(30, 100000, 22, 70)).toBeCloseTo(30, 1);
  });

  it("en la constante de estabilización queda justo a mitad de camino", () => {
    // Es la definición de la constante: con muestra = K, lo observado y el
    // ancla pesan igual.
    expect(regresarALaMedia(40, 70, 20, 70)).toBeCloseTo(30, 6);
  });

  it("nunca se sale del rango entre lo observado y el ancla", () => {
    for (const muestra of [0, 1, 17, 70, 400, 5000]) {
      const r = regresarALaMedia(45, muestra, 22, 70);
      expect(r).toBeGreaterThanOrEqual(22);
      expect(r).toBeLessThanOrEqual(45);
    }
  });
});

describe("proyectarPonches — regresión a la media", () => {
  /** El relevista real que rompía la calculadora: 1 K en 2 bateadores. */
  const MUESTRA_MINIMA = { ipTotales: 0.33, salidas: 1, esAbridor: false } as const;

  it("no se cree un 50% de K% sacado de dos bateadores", () => {
    const r = proyectarPonches({ ...MUESTRA_MINIMA, linea: 1.5, kPctPitcher: 50, whipPitcher: 3, ipPorSalida: 0.33, ligaKPct: 22.2 });
    expect(r.ajustePorMuestra.kPctCrudo).toBe(50);
    expect(r.ajustePorMuestra.kPctAjustado).toBeLessThan(24);
    expect(r.ajustePorMuestra.pesoDeLoObservado).toBeLessThan(0.05);
    expect(r.advertencias.join(" ")).toContain("Muestra chica");
  });

  it("a un abridor de temporada completa apenas le mueve el número", () => {
    const r = proyectarPonches({ ...TEMPORADA_COMPLETA, linea: 6.5, kPctPitcher: 30.9, whipPitcher: 0.95, ipPorSalida: 6.03, ligaKPct: 22.2 });
    expect(Math.abs(r.ajustePorMuestra.kPctAjustado - 30.9)).toBeLessThan(1.5);
    expect(r.ajustePorMuestra.pesoDeLoObservado).toBeGreaterThan(0.85);
  });

  it("cuanta más muestra, más se acerca el ajustado a lo observado", () => {
    const base = { linea: 6.5, kPctPitcher: 35, whipPitcher: 1.2, ipPorSalida: 5.5, ligaKPct: 22.2 };
    const ajustados = [5, 40, 120, 200].map(
      (ip) => proyectarPonches({ ...base, ipTotales: ip, salidas: 20 }).ajustePorMuestra.kPctAjustado,
    );
    for (let i = 1; i < ajustados.length; i++) {
      expect(ajustados[i]).toBeGreaterThan(ajustados[i - 1]!);
    }
    expect(ajustados.at(-1)!).toBeLessThan(35);
  });

  it("usa el whiff% como ancla en vez del promedio de liga cuando lo tiene", () => {
    // El caso real de Zach Eflin: una sola salida, 41.2% de K% que no se puede
    // creer, pero un whiff% de 35.3% que dice que sí es ponchador de verdad.
    const conWhiff = proyectarPonches({
      linea: 5.5, kPctPitcher: 41.2, ipTotales: 3.67, salidas: 1, whiffPctPitcher: 35.3, ligaKPct: 22.1,
    });
    const sinWhiff = proyectarPonches({
      linea: 5.5, kPctPitcher: 41.2, ipTotales: 3.67, salidas: 1, ligaKPct: 22.1,
    });
    expect(conWhiff.ajustePorMuestra.anclaUsada).toContain("whiff%");
    // Sin whiff% lo aplastamos contra el 22.1% de liga; con whiff% el ancla
    // sube a ~33% y el ajustado queda mucho más alto.
    expect(sinWhiff.ajustePorMuestra.kPctAjustado).toBeLessThan(28);
    expect(conWhiff.ajustePorMuestra.kPctAjustado).toBeGreaterThan(32);
  });

  it("cae al SwStr% cuando no hay whiff%, y a la liga cuando no hay ninguno", () => {
    const base = { linea: 6.5, kPctPitcher: 35, ipTotales: 8, salidas: 2, ligaKPct: 22.2 };
    expect(proyectarPonches({ ...base, whiffPctPitcher: 30, swstrPctPitcher: 15.2 })
      .ajustePorMuestra.anclaUsada).toContain("whiff%");
    expect(proyectarPonches({ ...base, swstrPctPitcher: 15.2 })
      .ajustePorMuestra.anclaUsada).toContain("SwStr%");
    expect(proyectarPonches(base).ajustePorMuestra.anclaUsada).toContain("promedio de liga");
  });

  it("sin K% observado la proyección sale entera del ancla", () => {
    const r = proyectarPonches({ linea: 6.5, ipTotales: 150, salidas: 25, ligaKPct: 22.2 });
    expect(r.ajustePorMuestra.kPctCrudo).toBeNull();
    expect(r.ajustePorMuestra.kPctAjustado).toBeCloseTo(22.2, 6);
    expect(r.ajustePorMuestra.pesoDeLoObservado).toBe(0);
  });

  it("el WHIP estabiliza más lento que el K%: mismo BF, menos peso", () => {
    // Con 200 BF el K% ya está casi decidido y el WHIP todavía a medias.
    expect(200 / (200 + ESTABILIZACION.kPct)).toBeGreaterThan(0.7);
    expect(200 / (200 + ESTABILIZACION.whip)).toBeLessThan(0.3);
  });

  it("el ancla de duración depende de si es abridor o relevista", () => {
    const abridor = proyectarPonches({ linea: 5.5, kPctPitcher: 25, ipTotales: 5, salidas: 1, esAbridor: true });
    const relevista = proyectarPonches({ linea: 5.5, kPctPitcher: 25, ipTotales: 5, salidas: 1, esAbridor: false });
    expect(abridor.ajustePorMuestra.ipPorSalidaAjustado).toBeGreaterThan(
      relevista.ajustePorMuestra.ipPorSalidaAjustado,
    );
  });
});

describe("nivel y veredicto no pueden contradecirse", () => {
  it("cada nivel corresponde a un solo veredicto", () => {
    // El bug que motivó esto: el nivel salía de bandas de confianza calibradas
    // al puntuador viejo (76-90%) mientras la calculadora nueva vive en 50-79%.
    // Medido sobre 120 abridores reales, 65 picks mostraban CONVIENE e
    // IMPUREZA juntos en la misma tarjeta.
    const esperado: Record<Nivel, string> = {
      IMPUREZA: "NO CONVIENE",
      ORO: "FLOJO",
      ORO_ALTO: "CONVIENE",
      DIAMANTE: "CONVIENE",
      DIAMANTE_ALTO: "CONVIENE",
    };
    for (let ev = -0.5; ev <= 1; ev += 0.01) {
      const nivel = nivelDesdeValorEsperado(ev);
      const veredicto = ev <= 1e-9 ? "NO CONVIENE" : ev <= 0.05 ? "FLOJO" : "CONVIENE";
      expect(esperado[nivel]).toBe(veredicto);
    }
  });

  it("el nivel sube con el valor esperado, nunca baja", () => {
    const orden: Nivel[] = ["IMPUREZA", "ORO", "ORO_ALTO", "DIAMANTE", "DIAMANTE_ALTO"];
    let previo = -1;
    for (let ev = -0.2; ev <= 0.6; ev += 0.01) {
      const indice = orden.indexOf(nivelDesdeValorEsperado(ev));
      expect(indice).toBeGreaterThanOrEqual(previo);
      previo = indice;
    }
  });
});

describe("proyectarPonches — calibración y cuota", () => {
  const SKUBAL = {
    linea: 6.5, kPctPitcher: 30.9, whipPitcher: 0.95, ipPorSalida: 6.03,
    ipTotales: 120.6, salidas: 20, whiffPctPitcher: 32.3, kPctRival: 24.9, ligaKPct: 22.1,
  } as const;

  it("sin factor de calibración la confianza no se toca", () => {
    const r = proyectarPonches(SKUBAL);
    expect(r.confianzaCalibrada).toBeCloseTo(r.confianza, 6);
  });

  it("con el factor sin historial, la confianza se comprime hacia el 50%", () => {
    const r = proyectarPonches({ ...SKUBAL, factorCalibracion: 0.35 });
    expect(r.confianzaCalibrada).toBeLessThan(r.confianza);
    expect(r.confianzaCalibrada).toBeCloseTo(0.5 + (r.confianza - 0.5) * 0.35, 6);
  });

  it("la apuesta simple usa el mismo estándar que el parlay", () => {
    // Este era el bug: el parlay comprimía por calibración y la apuesta simple
    // usaba el número crudo, así que el mismo pick daba CONVIENE solo y FLOJO
    // en combinada.
    const r = proyectarPonches({ ...SKUBAL, factorCalibracion: 0.35 });
    const comoEnElParlay = evaluarParlay([r.confianza], { factorCalibracion: 0.35 });
    expect(r.confianzaCalibrada).toBeCloseTo(comoEnElParlay.probabilidadesHonestas[0]!, 6);
  });

  it("en línea entera el empate no se cuenta dos veces", () => {
    const r = proyectarPonches({ ...SKUBAL, linea: 7, factorCalibracion: 0.35 });
    expect(r.probEmpate).toBeGreaterThan(0);
    // Las tres probabilidades de la apuesta tienen que sumar 1: si se pasara
    // la confianza condicional como si fuera incondicional, no sumarían.
    const suma = r.apuesta.probGanar + r.apuesta.probPerder + r.apuesta.probEmpate;
    expect(suma).toBeCloseTo(1, 9);
  });

  it("el nivel devuelto coincide con el veredicto de su propia apuesta", () => {
    for (const kPct of [15, 20, 25, 30, 35]) {
      for (const factor of [0.25, 0.35, 1]) {
        const r = proyectarPonches({ ...SKUBAL, kPctPitcher: kPct, factorCalibracion: factor });
        expect(r.nivel).toBe(nivelDesdeValorEsperado(r.apuesta.valorEsperado));
        if (r.apuesta.veredicto === "NO CONVIENE") expect(r.nivel).toBe("IMPUREZA");
        if (r.apuesta.veredicto === "CONVIENE") expect(r.nivel).not.toBe("IMPUREZA");
      }
    }
  });

  it("una cuota peor empeora el veredicto con la misma proyección", () => {
    const bueno = proyectarPonches({ ...SKUBAL, cuotaAmericana: -110 });
    const malo = proyectarPonches({ ...SKUBAL, cuotaAmericana: -200 });
    expect(bueno.kProyectados).toBeCloseTo(malo.kProyectados, 6);
    expect(bueno.apuesta.valorEsperado).toBeGreaterThan(malo.apuesta.valorEsperado);
  });

  it("avisa cuando la calibración movió el número de forma relevante", () => {
    const r = proyectarPonches({ ...SKUBAL, factorCalibracion: 0.35 });
    expect(r.advertencias.join(" ")).toContain("se juega como");
  });
});
