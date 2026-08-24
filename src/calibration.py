"""Auditoría de calibración para StrikeoutLab.

Este módulo es la razón de ser del proyecto: mide si las confianzas
asignadas a los picks (calculadas o de juicio) se sostienen contra los
resultados reales. Si después de suficientes picks la calibración muestra
que no se sostienen, ese es un resultado válido del sistema, no un fallo.
"""
from __future__ import annotations

import pandas as pd

BANDAS = [
    (0.70, 0.75, "70-74%"),
    (0.75, 0.80, "75-79%"),
    (0.80, 0.85, "80-84%"),
    (0.85, 0.90, "85-89%"),
    (0.90, 0.95, "90-94%"),
    (0.95, 1.01, "95-99%"),  # límite superior inclusivo de 1.0 (100%)
]

MUESTRA_MINIMA = 20

RESULTADOS_RESUELTOS = ("GANO", "PERDIO", "EMPATE")


def _banda_de(confianza: float) -> str | None:
    for lo, hi, etiqueta in BANDAS:
        if lo <= confianza < hi:
            return etiqueta
    return None


def _resumir_grupo(grupo: pd.DataFrame) -> dict:
    ganadas = int((grupo["resultado"] == "GANO").sum())
    perdidas = int((grupo["resultado"] == "PERDIO").sum())
    empates = int((grupo["resultado"] == "EMPATE").sum())
    decididas = ganadas + perdidas
    tasa_real = (ganadas / decididas) if decididas else None
    confianza_promedio = float(grupo["confianza"].mean())
    diferencia = (confianza_promedio - tasa_real) if tasa_real is not None else None

    return {
        "cantidad": len(grupo),
        "ganadas": ganadas,
        "perdidas": perdidas,
        "empates": empates,
        "confianza_promedio": confianza_promedio,
        "tasa_real": tasa_real,
        "diferencia": diferencia,
        "muestra_insuficiente": len(grupo) < MUESTRA_MINIMA,
    }


def reporte_calibracion(picks: pd.DataFrame) -> pd.DataFrame:
    """Agrupa los picks resueltos en bandas de confianza y compara la
    confianza promedio declarada contra la tasa real de acierto.

    Interpretación esperada: si una banda muestra tasa_real muy por debajo
    de confianza_promedio (diferencia positiva grande), el sistema está
    sobreconfiado en esa banda y las confianzas deben ajustarse a la baja.

    Los empates cuentan en 'cantidad' pero se excluyen del denominador de
    tasa_real (ganadas / (ganadas + perdidas)): un push no confirma ni
    refuta la confianza asignada.

    Cada banda se desglosa también por fuente_confianza (fila 'TODAS',
    'CALCULADA' y 'JUICIO'), porque mezclar ambas sin distinguirlas fue el
    error original que este proyecto corrige.

    Una banda con menos de 20 picks queda marcada
    muestra_insuficiente=True; no debe usarse para concluir que esa banda
    está sobre o subconfiada.
    """
    requeridas = {"resultado", "confianza", "fuente_confianza"}
    faltantes = requeridas - set(picks.columns)
    if faltantes:
        raise ValueError(f"picks no tiene las columnas requeridas: {faltantes}")

    resueltos = picks[picks["resultado"].isin(RESULTADOS_RESUELTOS)].copy()
    resueltos["banda"] = resueltos["confianza"].apply(_banda_de)
    resueltos = resueltos.dropna(subset=["banda"])

    filas = []
    for _, _, etiqueta in BANDAS:
        banda_df = resueltos[resueltos["banda"] == etiqueta]
        if banda_df.empty:
            continue

        filas.append({"banda": etiqueta, "fuente_confianza": "TODAS", **_resumir_grupo(banda_df)})

        for fuente in ("CALCULADA", "JUICIO"):
            sub_df = banda_df[banda_df["fuente_confianza"] == fuente]
            if sub_df.empty:
                continue
            filas.append({"banda": etiqueta, "fuente_confianza": fuente, **_resumir_grupo(sub_df)})

    columnas = [
        "banda", "fuente_confianza", "cantidad", "ganadas", "perdidas",
        "empates", "confianza_promedio", "tasa_real", "diferencia",
        "muestra_insuficiente",
    ]
    return pd.DataFrame(filas, columns=columnas)


def resumen_economico(picks: pd.DataFrame) -> dict:
    """Resultado económico real de los picks resueltos, sin adornos.

    El desglose 'por_nivel' reporta cantidad y resultados (GANO/PERDIO/
    EMPATE) por nivel de pureza (Diamante/Oro/etc.), no montos: una misma
    boleta física puede combinar patas de distinto nivel, así que repartir
    el stake/payout de esa boleta entre niveles sería arbitrario.

    Los montos totales (stake/payout) solo se calculan si picks.csv incluye
    esas columnas opcionales. Cuando varias patas comparten 'ticket_id' se
    asume que el stake/payout de la boleta física está registrado de forma
    idéntica en cada una de sus filas, así que se deduplica por ticket_id
    antes de sumar para no contar el monto de una misma boleta más de una
    vez. Filas sin ticket_id se tratan como apuestas sueltas.
    """
    resueltos = picks[picks["resultado"].isin(RESULTADOS_RESUELTOS)]

    resumen: dict = {"total_picks_resueltos": len(resueltos), "por_nivel": {}}

    for nivel, grupo in resueltos.groupby("nivel"):
        resumen["por_nivel"][nivel] = {
            "cantidad": len(grupo),
            "ganadas": int((grupo["resultado"] == "GANO").sum()),
            "perdidas": int((grupo["resultado"] == "PERDIO").sum()),
            "empates": int((grupo["resultado"] == "EMPATE").sum()),
        }

    tiene_columnas_dinero = "stake" in picks.columns and "payout" in picks.columns
    dinero = pd.DataFrame()
    if tiene_columnas_dinero:
        con_ticket = resueltos[resueltos["ticket_id"].notna()].drop_duplicates(
            subset=["ticket_id"]
        )
        sin_ticket = resueltos[resueltos["ticket_id"].isna()]
        dinero = pd.concat([con_ticket, sin_ticket])

    # Un hueco explícito es preferible a un número inventado: si no hay ni
    # una fila con stake/payout realmente registrado, reportar None en vez
    # de sumar puros NaN y mostrar un engañoso "0.00" que parecería un
    # resultado económico real.
    tiene_datos_reales = tiene_columnas_dinero and (
        dinero["stake"].notna().any() or dinero["payout"].notna().any()
    )

    if tiene_datos_reales:
        total_apostado = float(dinero["stake"].sum())
        total_cobrado = float(dinero["payout"].sum())

        resumen["total_apostado"] = total_apostado
        resumen["total_cobrado"] = total_cobrado
        resumen["neto"] = total_cobrado - total_apostado
    else:
        resumen["total_apostado"] = None
        resumen["total_cobrado"] = None
        resumen["neto"] = None
        if tiene_columnas_dinero:
            resumen["advertencia"] = (
                "Ningún pick resuelto tiene 'stake'/'payout' registrado; no "
                "se puede calcular el resultado económico en pesos."
            )
        else:
            resumen["advertencia"] = (
                "picks.csv no tiene columnas 'stake'/'payout'; no se puede "
                "calcular el resultado económico en pesos."
            )

    return resumen
