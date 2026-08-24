"""CLI de StrikeoutLab.

Capa fina de entrada/salida sobre los archivos CSV en data/ y las funciones
puras de calculations.py y calibration.py. El CLI nunca decide reglas de
negocio por sí mismo: solo lee, valida forma, llama a las funciones y
escribe.
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

import pandas as pd

from src.calculations import (
    PICKS_VALIDOS,
    comparar_rivales,
    detectar_correlacion_mismo_juego,
    evaluar_pick,
    pitcheos_por_entrada,
    probabilidad_parlay,
    tasa_superacion_linea,
)
from src.calibration import reporte_calibracion, resumen_economico

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
PICKS_CSV = DATA_DIR / "picks.csv"
GAME_LOGS_CSV = DATA_DIR / "game_logs.csv"
TEAM_K_CSV = DATA_DIR / "team_k.csv"

NIVELES_VALIDOS = ("DIAMANTE", "ORO_ALTO", "ORO", "IMPUREZA")
FUENTES_VALIDAS = ("CALCULADA", "JUICIO")


def _leer_picks() -> pd.DataFrame:
    # Declarar explícitamente el dtype de las columnas que pueden estar
    # vacías en todas las filas (típico en un picks.csv nuevo): sin esto,
    # pandas las infiere como float64 y luego falla al intentar escribir un
    # string (ej. "GANO") en resultado-set.
    return pd.read_csv(
        PICKS_CSV,
        dtype={
            "codigo": str,
            "ticket_id": str,
            "pick": str,
            "nivel": str,
            "fuente_confianza": str,
            "resultado": str,
            "resultado_k": "Int64",
        },
    )


def _escribir_picks(df: pd.DataFrame) -> None:
    df.to_csv(PICKS_CSV, index=False)


def _leer_game_logs() -> pd.DataFrame:
    return pd.read_csv(GAME_LOGS_CSV)


def _leer_team_k() -> pd.DataFrame:
    return pd.read_csv(TEAM_K_CSV)


def cmd_pick_add(args: argparse.Namespace) -> None:
    if args.pick.upper() not in PICKS_VALIDOS:
        sys.exit(f"error: pick debe ser {PICKS_VALIDOS}, recibido {args.pick!r}")
    if args.nivel.upper() not in NIVELES_VALIDOS:
        sys.exit(f"error: nivel debe ser uno de {NIVELES_VALIDOS}")
    if args.fuente_confianza.upper() not in FUENTES_VALIDAS:
        sys.exit(f"error: fuente_confianza debe ser uno de {FUENTES_VALIDAS}")
    if not 0.0 <= args.confianza <= 1.0:
        sys.exit("error: confianza debe estar entre 0.0 y 1.0")

    picks = _leer_picks()
    nueva = {
        "fecha": args.fecha,
        "codigo": args.codigo,
        "pitcher": args.pitcher,
        "equipo": args.equipo,
        "rival": args.rival,
        "linea": args.linea,
        "pick": args.pick.upper(),
        "confianza": args.confianza,
        "nivel": args.nivel.upper(),
        "fuente_confianza": args.fuente_confianza.upper(),
        "resultado_k": pd.NA,
        "resultado": pd.NA,
        "ticket_id": args.ticket_id,
        "stake": args.stake,
        "payout": pd.NA,
    }
    picks = pd.concat([picks, pd.DataFrame([nueva])], ignore_index=True)
    _escribir_picks(picks)
    print(f"Pick agregado: {args.pitcher} {args.pick.upper()} {args.linea} ({args.fecha})")


def cmd_resultado_set(args: argparse.Namespace) -> None:
    picks = _leer_picks()
    mascara = (
        (picks["pitcher"] == args.pitcher)
        & (picks["fecha"] == args.fecha)
        & picks["resultado_k"].isna()
    )
    if args.linea is not None:
        mascara &= picks["linea"] == args.linea
    if args.pick is not None:
        mascara &= picks["pick"] == args.pick.upper()

    indices = picks[mascara].index
    if len(indices) == 0:
        sys.exit("No se encontraron picks pendientes que coincidan con esos filtros.")
    if len(indices) > 1 and (args.linea is None or args.pick is None):
        sys.exit(
            f"Hay {len(indices)} picks pendientes que coinciden; agrega "
            "--linea y --pick para desambiguar."
        )

    for idx in indices:
        linea = picks.at[idx, "linea"]
        pick = picks.at[idx, "pick"]
        resultado = evaluar_pick(args.k, linea, pick)
        picks.at[idx, "resultado_k"] = args.k
        picks.at[idx, "resultado"] = resultado
        if args.payout is not None:
            picks.at[idx, "payout"] = args.payout
        print(f"{args.pitcher} {pick} {linea}: K={args.k} -> {resultado}")

    _escribir_picks(picks)


def cmd_tasa(args: argparse.Namespace) -> None:
    logs = _leer_game_logs()
    filtro = logs["pitcher"] == args.pitcher
    if args.rival:
        filtro &= logs["rival"] == args.rival
    salidas = logs[filtro].sort_values("fecha", ascending=False)
    if args.n:
        salidas = salidas.head(args.n)

    resultado = tasa_superacion_linea(
        salidas.to_dict("records"), args.linea, args.pick
    )
    print(f"{args.pitcher} — {args.pick.upper()} {args.linea}")
    print(
        f"  Ganadas: {resultado['ganadas']}  Perdidas: {resultado['perdidas']}  "
        f"Empates: {resultado['empates']}  Total: {resultado['total']}"
    )
    print(f"  Tasa: {resultado['tasa']:.3f}")
    if resultado["advertencia"]:
        print(f"  ADVERTENCIA: {resultado['advertencia']}")


def cmd_pitcheos(args: argparse.Namespace) -> None:
    logs = _leer_game_logs()
    salidas = logs[logs["pitcher"] == args.pitcher].sort_values("fecha", ascending=False)
    if args.n:
        salidas = salidas.head(args.n)

    registros = salidas.to_dict("records")
    for r in registros:
        if pd.isna(r.get("pitcheos")):
            r["pitcheos"] = None

    resultado = pitcheos_por_entrada(registros)
    if resultado is None:
        print(
            f"{args.pitcher}: no se puede calcular — falta el conteo de "
            "pitcheos en al menos una salida de la muestra."
        )
    else:
        print(f"{args.pitcher}: {resultado:.1f} pitcheos por entrada")


def cmd_rivales(args: argparse.Namespace) -> None:
    equipos = _leer_team_k()
    equipos = equipos[equipos["ventana"] == args.ventana]
    ranking = comparar_rivales(equipos.to_dict("records"))
    print(f"{'Equipo':<6} {'K':>6} {'PA':>6} {'K_rate':>8}")
    for fila in ranking:
        print(f"{fila['equipo']:<6} {fila['k']:>6} {fila['pa']:>6} {fila['k_rate']:>8.4f}")


def cmd_parlay(args: argparse.Namespace) -> None:
    confianzas = [float(c) for c in args.confianzas.split(",")]
    probabilidad = probabilidad_parlay(confianzas)
    print(f"Probabilidad combinada ({len(confianzas)} patas): {probabilidad:.4f}")

    if args.patas:
        patas = []
        for pata_str in args.patas.split(","):
            fecha, equipo, rival = pata_str.split(":")
            patas.append({"fecha": fecha, "equipo": equipo, "rival": rival})
        if len(patas) != len(confianzas):
            sys.exit("--patas debe tener la misma cantidad de elementos que --confianzas")
        for advertencia in detectar_correlacion_mismo_juego(patas):
            print(f"ADVERTENCIA: {advertencia}")
    else:
        print(
            "Nota: no se pasó --patas, no se pudo verificar si dos patas "
            "vienen del mismo juego (probabilidad_parlay siempre asume "
            "independencia)."
        )


def cmd_calibracion(args: argparse.Namespace) -> None:
    picks = _leer_picks()
    reporte = reporte_calibracion(picks)
    if reporte.empty:
        print("No hay picks resueltos suficientes para generar un reporte de calibración.")
        return
    print(reporte.to_string(index=False))


def cmd_economico(args: argparse.Namespace) -> None:
    picks = _leer_picks()
    resumen = resumen_economico(picks)
    print(f"Picks resueltos: {resumen['total_picks_resueltos']}")
    if resumen["total_apostado"] is not None:
        print(f"Total apostado: {resumen['total_apostado']:.2f}")
        print(f"Total cobrado:  {resumen['total_cobrado']:.2f}")
        print(f"Neto:           {resumen['neto']:.2f}")
    else:
        print(f"ADVERTENCIA: {resumen['advertencia']}")
    print("Por nivel:")
    for nivel, datos in resumen["por_nivel"].items():
        print(
            f"  {nivel:<10} cantidad={datos['cantidad']:<4} "
            f"ganadas={datos['ganadas']:<4} perdidas={datos['perdidas']:<4} "
            f"empates={datos['empates']}"
        )


def construir_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="strikeoutlab", description=__doc__)
    sub = parser.add_subparsers(dest="comando", required=True)

    p = sub.add_parser("pick-add", help="Registra un nuevo pick en picks.csv")
    p.add_argument("--fecha", required=True)
    p.add_argument("--codigo", required=True)
    p.add_argument("--pitcher", required=True)
    p.add_argument("--equipo", required=True)
    p.add_argument("--rival", required=True)
    p.add_argument("--linea", required=True, type=float)
    p.add_argument("--pick", required=True)
    p.add_argument("--confianza", required=True, type=float)
    p.add_argument("--nivel", required=True)
    p.add_argument("--fuente-confianza", required=True, dest="fuente_confianza")
    p.add_argument("--ticket-id", default=None, dest="ticket_id")
    p.add_argument("--stake", type=float, default=None)
    p.set_defaults(func=cmd_pick_add)

    p = sub.add_parser("resultado-set", help="Registra el resultado real de un pick pendiente")
    p.add_argument("--pitcher", required=True)
    p.add_argument("--fecha", required=True)
    p.add_argument("--k", required=True, type=int)
    p.add_argument("--linea", type=float, default=None)
    p.add_argument("--pick", default=None)
    p.add_argument("--payout", type=float, default=None)
    p.set_defaults(func=cmd_resultado_set)

    p = sub.add_parser("tasa", help="Tasa de superación de línea usando el historial real")
    p.add_argument("--pitcher", required=True)
    p.add_argument("--linea", required=True, type=float)
    p.add_argument("--pick", required=True)
    p.add_argument("--n", type=int, default=None, help="Usar solo las últimas N salidas")
    p.add_argument("--rival", default=None, help="Filtrar solo salidas contra este rival")
    p.set_defaults(func=cmd_tasa)

    p = sub.add_parser("pitcheos", help="Pitcheos por entrada de un lanzador")
    p.add_argument("--pitcher", required=True)
    p.add_argument("--n", type=int, default=None)
    p.set_defaults(func=cmd_pitcheos)

    p = sub.add_parser("rivales", help="Ranking de equipos por tasa de ponches (no total)")
    p.add_argument("--ventana", required=True, choices=("TEMPORADA", "ULTIMOS_14"))
    p.set_defaults(func=cmd_rivales)

    p = sub.add_parser("parlay", help="Probabilidad combinada de un parlay")
    p.add_argument("--confianzas", required=True, help="Lista separada por comas, ej. 0.85,0.9")
    p.add_argument(
        "--patas",
        default=None,
        help="Opcional: fecha:equipo:rival por pata, separadas por comas, "
        "en el mismo orden que --confianzas, para detectar patas del mismo juego",
    )
    p.set_defaults(func=cmd_parlay)

    p = sub.add_parser("calibracion", help="Reporte de calibración de confianzas vs resultados reales")
    p.set_defaults(func=cmd_calibracion)

    p = sub.add_parser("economico", help="Resumen económico real de los picks resueltos")
    p.set_defaults(func=cmd_economico)

    return parser


def main(argv: list[str] | None = None) -> None:
    parser = construir_parser()
    args = parser.parse_args(argv)
    args.func(args)


if __name__ == "__main__":
    main()
