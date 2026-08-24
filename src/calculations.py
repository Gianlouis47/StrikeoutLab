"""Funciones de cálculo puras para StrikeoutLab.

Toda función en este módulo es determinista (mismo input -> mismo output)
y no tiene efectos secundarios: no lee ni escribe archivos. El CLI y los
demás módulos son responsables de la entrada/salida; aquí solo hay
aritmética verificable.
"""
from __future__ import annotations

PICKS_VALIDOS = ("OVER", "UNDER")


def ip_a_decimal(ip: float) -> float:
    """Convierte innings pitcheados en notación de béisbol a decimal real.

    La notación de béisbol usa el decimal para representar outs, no
    fracciones de diez: 5.1 significa 5 entradas y 1 out (5 y 1/3), 5.2
    significa 5 entradas y 2 outs (5 y 2/3). 6.0 es exactamente 6 entradas.

    Ejemplos: 5.1 -> 5.3333..., 5.2 -> 5.6667..., 6.0 -> 6.0.

    Lanza ValueError si la parte decimal no es .0, .1 o .2, porque esos son
    los únicos valores posibles (un inning solo tiene 3 outs).
    """
    entero = int(ip)
    # Redondear evita que errores de punto flotante (5.2 - 5 = 0.19999...)
    # hagan fallar la comparación exacta contra 0.1 / 0.2.
    resto = round(ip - entero, 1)
    if resto == 0.0:
        return float(entero)
    if resto == 0.1:
        return entero + 1 / 3
    if resto == 0.2:
        return entero + 2 / 3
    raise ValueError(
        f"IP inválido: {ip}. La parte decimal debe ser .0, .1 o .2 "
        "(notación de innings: outs, no décimas)."
    )


def pitcheos_por_entrada(salidas: list[dict]) -> float | None:
    """Pitcheos totales / entradas totales (decimal) de las salidas dadas.

    Cada salida es un dict con al menos 'ip' y 'pitcheos'. Si a cualquier
    salida le falta el conteo de pitcheos, retorna None: nunca se estima ni
    se promedia con datos parciales.
    """
    if not salidas:
        return None

    total_pitcheos = 0
    total_entradas = 0.0
    for salida in salidas:
        pitcheos = salida.get("pitcheos")
        if pitcheos is None:
            return None
        total_pitcheos += pitcheos
        total_entradas += ip_a_decimal(salida["ip"])

    if total_entradas == 0:
        return None

    return total_pitcheos / total_entradas


def _validar_pick(pick: str) -> str:
    pick = pick.upper()
    if pick not in PICKS_VALIDOS:
        raise ValueError(f"pick debe ser OVER o UNDER, recibido: {pick!r}")
    return pick


def _evaluar(k: int, linea: float, pick: str) -> str:
    """Regla de negocio compartida por evaluar_pick y tasa_superacion_linea.

    Línea con .5 (media): nunca hay empate, K entero jamás cae en la línea.
    Línea entera: K == línea es EMPATE, no GANO ni PERDIO. En este
    consorcio un empate en línea entera se paga con recorte, pero sigue
    siendo un estado distinto de ganar o perder y nunca debe colapsarse en
    ninguno de los dos.
    """
    pick = _validar_pick(pick)

    if linea == int(linea) and k == linea:
        return "EMPATE"

    if pick == "OVER":
        return "GANO" if k > linea else "PERDIO"
    return "GANO" if k < linea else "PERDIO"


def evaluar_pick(resultado_k: int, linea: float, pick: str) -> str:
    """Retorna GANO, PERDIO o EMPATE para un resultado real ya conocido."""
    return _evaluar(resultado_k, linea, pick)


def tasa_superacion_linea(salidas: list[dict], linea: float, pick: str) -> dict:
    """Cuenta cuántas de las salidas dadas habrían ganado el pick indicado.

    'salidas' es una lista de dicts con al menos la clave 'k' (ponches de
    esa salida). Aplica las mismas reglas que evaluar_pick a cada salida.

    Retorna:
        {
            "ganadas": int,
            "perdidas": int,
            "empates": int,
            "total": int,
            "tasa": float,     # ganadas / total; 0.0 si total == 0
            "advertencia": str | None,
        }

    La tasa se calcula como ganadas / total (incluyendo empates en el
    denominador), para no inflar el porcentaje ignorando resultados
    incómodos. Con menos de 5 salidas, 'advertencia' explica que la muestra
    es demasiado chica para ser confiable.
    """
    _validar_pick(pick)

    ganadas = perdidas = empates = 0
    for salida in salidas:
        resultado = _evaluar(salida["k"], linea, pick)
        if resultado == "GANO":
            ganadas += 1
        elif resultado == "PERDIO":
            perdidas += 1
        else:
            empates += 1

    total = len(salidas)
    tasa = ganadas / total if total else 0.0

    advertencia = None
    if total < 5:
        advertencia = (
            f"Muestra insuficiente: {total} salida(s). Una tasa calculada "
            "sobre menos de 5 salidas tiene un margen de error demasiado "
            "grande para asignarle una confianza."
        )

    return {
        "ganadas": ganadas,
        "perdidas": perdidas,
        "empates": empates,
        "total": total,
        "tasa": tasa,
        "advertencia": advertencia,
    }


def k_rate(k: int, pa: int) -> float:
    """K / PA. Existe como función explícita para que nadie compare K totales
    crudos entre equipos con distinto volumen de apariciones al plato.
    """
    if pa == 0:
        raise ValueError("pa no puede ser 0")
    return k / pa


def comparar_rivales(equipos: list[dict]) -> list[dict]:
    """Ordena equipos por k_rate descendente, nunca por K total.

    Cada dict de entrada debe tener 'equipo', 'k' y 'pa'. Retorna una copia
    de cada dict con la clave adicional 'k_rate', ordenada de mayor a menor
    tasa de ponches.
    """
    resultado = []
    for equipo in equipos:
        fila = dict(equipo)
        fila["k_rate"] = k_rate(equipo["k"], equipo["pa"])
        resultado.append(fila)
    resultado.sort(key=lambda fila: fila["k_rate"], reverse=True)
    return resultado


def probabilidad_parlay(confianzas: list[float]) -> float:
    """Producto de las confianzas de todas las patas de un parlay.

    Asume independencia entre patas: esto es una simplificación. Dos
    lanzadores del mismo juego (o el mismo bullpen, el mismo lineup rival,
    etc.) no son eventos estadísticamente independientes, así que el
    resultado puede sobre o subestimar la probabilidad combinada real.
    Usar detectar_correlacion_mismo_juego para marcar ese caso antes de
    confiar en este número.
    """
    if not confianzas:
        raise ValueError("confianzas no puede estar vacío")

    producto = 1.0
    for confianza in confianzas:
        if not 0.0 <= confianza <= 1.0:
            raise ValueError(f"confianza fuera de rango [0,1]: {confianza}")
        producto *= confianza
    return producto


def detectar_correlacion_mismo_juego(patas: list[dict]) -> list[str]:
    """Marca patas de un parlay que pertenecen al mismo enfrentamiento.

    Cada pata debe tener 'fecha', 'equipo' y 'rival'. Dos patas con la
    misma fecha y el mismo par de equipos (en cualquier orden) vienen del
    mismo juego y por lo tanto no son independientes para efectos de
    probabilidad_parlay. Retorna una lista de advertencias (vacía si no hay
    correlación detectada).
    """
    advertencias = []
    vistos: dict[tuple, int] = {}
    for i, pata in enumerate(patas):
        juego = (pata["fecha"], frozenset((pata["equipo"], pata["rival"])))
        if juego in vistos:
            j = vistos[juego]
            advertencias.append(
                f"Patas {j} y {i} son del mismo juego "
                f"({pata['equipo']} vs {pata['rival']} el {pata['fecha']}): "
                "no son eventos independientes; probabilidad_parlay puede "
                "estar sobre o subestimando la probabilidad real combinada."
            )
        else:
            vistos[juego] = i
    return advertencias
