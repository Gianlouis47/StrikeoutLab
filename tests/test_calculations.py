import pytest

from src.calculations import (
    comparar_rivales,
    detectar_correlacion_mismo_juego,
    evaluar_pick,
    ip_a_decimal,
    k_rate,
    pitcheos_por_entrada,
    probabilidad_parlay,
    tasa_superacion_linea,
)


class TestIpADecimal:
    def test_un_out(self):
        assert ip_a_decimal(5.1) == pytest.approx(5 + 1 / 3)

    def test_dos_outs(self):
        assert ip_a_decimal(5.2) == pytest.approx(5 + 2 / 3)

    def test_entrada_completa(self):
        assert ip_a_decimal(6.0) == 6.0

    def test_decimal_invalido_lanza_error(self):
        with pytest.raises(ValueError):
            ip_a_decimal(5.3)


class TestPitcheosPorEntrada:
    def test_calcula_correctamente(self):
        salidas = [
            {"ip": 6.0, "pitcheos": 90},
            {"ip": 5.1, "pitcheos": 80},
        ]
        esperado = (90 + 80) / (6.0 + (5 + 1 / 3))
        assert pitcheos_por_entrada(salidas) == pytest.approx(esperado)

    def test_falta_pitcheos_retorna_none(self):
        salidas = [
            {"ip": 6.0, "pitcheos": 90},
            {"ip": 5.1, "pitcheos": None},
        ]
        assert pitcheos_por_entrada(salidas) is None

    def test_lista_vacia_retorna_none(self):
        assert pitcheos_por_entrada([]) is None


class TestTasaSuperacionLinea:
    """Los seis casos obligatorios: OVER/UNDER x línea .5/entera x
    gana/pierde/empata."""

    def _tasa(self, k, linea, pick):
        return tasa_superacion_linea([{"k": k}], linea, pick)

    def test_over_media_gana(self):
        r = self._tasa(6, 5.5, "OVER")
        assert r["ganadas"] == 1 and r["perdidas"] == 0 and r["empates"] == 0

    def test_over_media_pierde(self):
        r = self._tasa(5, 5.5, "OVER")
        assert r["ganadas"] == 0 and r["perdidas"] == 1 and r["empates"] == 0

    def test_under_media_gana(self):
        r = self._tasa(5, 5.5, "UNDER")
        assert r["ganadas"] == 1 and r["perdidas"] == 0 and r["empates"] == 0

    def test_under_media_pierde(self):
        r = self._tasa(6, 5.5, "UNDER")
        assert r["ganadas"] == 0 and r["perdidas"] == 1 and r["empates"] == 0

    def test_over_entera_empata(self):
        r = self._tasa(5, 5.0, "OVER")
        assert r["empates"] == 1 and r["ganadas"] == 0 and r["perdidas"] == 0

    def test_under_entera_empata(self):
        r = self._tasa(5, 5.0, "UNDER")
        assert r["empates"] == 1 and r["ganadas"] == 0 and r["perdidas"] == 0

    def test_over_entera_gana_y_pierde(self):
        assert self._tasa(6, 5.0, "OVER")["ganadas"] == 1
        assert self._tasa(4, 5.0, "OVER")["perdidas"] == 1

    def test_under_entera_gana_y_pierde(self):
        assert self._tasa(4, 5.0, "UNDER")["ganadas"] == 1
        assert self._tasa(6, 5.0, "UNDER")["perdidas"] == 1

    def test_advierte_muestra_menor_a_cinco(self):
        salidas = [{"k": 6}, {"k": 5}, {"k": 7}, {"k": 4}]
        r = tasa_superacion_linea(salidas, 5.5, "OVER")
        assert r["total"] == 4
        assert r["advertencia"] is not None

    def test_no_advierte_con_cinco_o_mas(self):
        salidas = [{"k": 6}] * 5
        r = tasa_superacion_linea(salidas, 5.5, "OVER")
        assert r["advertencia"] is None

    def test_tasa_no_es_confianza_a_ojo(self):
        # Caso documentado en la especificación: 3 de 5 salidas ganan (60%),
        # no 82-84% asignado "a ojo".
        salidas = [{"k": 6}, {"k": 6}, {"k": 6}, {"k": 4}, {"k": 5}]
        r = tasa_superacion_linea(salidas, 5.5, "OVER")
        assert r["tasa"] == pytest.approx(0.6)


class TestKRateYCompararRivales:
    def test_k_rate_simple(self):
        assert k_rate(136, 488) == pytest.approx(136 / 488)

    def test_equipo_con_mas_k_totales_puede_tener_menor_tasa(self):
        # Caso real que ya produjo un error: 136/488 (~27.87%) tiene MENOR
        # tasa que 132/443 (~29.80%), aunque 136 > 132 en total.
        equipos = [
            {"equipo": "AAA", "k": 136, "pa": 488},
            {"equipo": "BBB", "k": 132, "pa": 443},
        ]
        ranking = comparar_rivales(equipos)
        assert ranking[0]["equipo"] == "BBB"
        assert ranking[1]["equipo"] == "AAA"
        assert ranking[0]["k_rate"] > ranking[1]["k_rate"]


class TestProbabilidadParlay:
    def test_cuatro_patas_no_es_la_confianza_individual(self):
        resultado = probabilidad_parlay([0.85, 0.85, 0.85, 0.85])
        assert resultado == pytest.approx(0.85**4, rel=1e-6)
        assert resultado == pytest.approx(0.52200625, rel=1e-3)
        assert resultado != pytest.approx(0.85)

    def test_lista_vacia_lanza_error(self):
        with pytest.raises(ValueError):
            probabilidad_parlay([])

    def test_confianza_fuera_de_rango_lanza_error(self):
        with pytest.raises(ValueError):
            probabilidad_parlay([0.5, 1.5])


class TestDetectarCorrelacionMismoJuego:
    def test_detecta_dos_abridores_del_mismo_juego(self):
        patas = [
            {"fecha": "2026-08-24", "equipo": "NYY", "rival": "BOS"},
            {"fecha": "2026-08-24", "equipo": "BOS", "rival": "NYY"},
        ]
        advertencias = detectar_correlacion_mismo_juego(patas)
        assert len(advertencias) == 1

    def test_no_advierte_juegos_distintos(self):
        patas = [
            {"fecha": "2026-08-24", "equipo": "NYY", "rival": "BOS"},
            {"fecha": "2026-08-24", "equipo": "LAD", "rival": "SFG"},
        ]
        assert detectar_correlacion_mismo_juego(patas) == []


class TestEvaluarPick:
    def test_empate_en_linea_entera_no_es_perdio(self):
        assert evaluar_pick(5, 5.0, "OVER") == "EMPATE"
        assert evaluar_pick(5, 5.0, "UNDER") == "EMPATE"

    def test_gana_y_pierde_linea_media(self):
        assert evaluar_pick(6, 5.5, "OVER") == "GANO"
        assert evaluar_pick(5, 5.5, "OVER") == "PERDIO"
        assert evaluar_pick(5, 5.5, "UNDER") == "GANO"
        assert evaluar_pick(6, 5.5, "UNDER") == "PERDIO"

    def test_pick_invalido_lanza_error(self):
        with pytest.raises(ValueError):
            evaluar_pick(5, 5.5, "OVAR")
