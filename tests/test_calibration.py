import pandas as pd
import pytest

from src.calibration import reporte_calibracion, resumen_economico


def _pick(confianza, resultado, fuente="CALCULADA", nivel="ORO"):
    return {
        "confianza": confianza,
        "resultado": resultado,
        "fuente_confianza": fuente,
        "nivel": nivel,
    }


class TestReporteCalibracion:
    def test_separa_calculada_de_juicio_y_excluye_empates_de_la_tasa(self):
        filas = []
        # Banda 80-84%: 15 CALCULADA (10 GANO, 4 PERDIO, 1 EMPATE)
        filas += [_pick(0.82, "GANO", "CALCULADA") for _ in range(10)]
        filas += [_pick(0.82, "PERDIO", "CALCULADA") for _ in range(4)]
        filas += [_pick(0.82, "EMPATE", "CALCULADA") for _ in range(1)]
        # Banda 80-84%: 10 JUICIO (3 GANO, 7 PERDIO)
        filas += [_pick(0.83, "GANO", "JUICIO") for _ in range(3)]
        filas += [_pick(0.83, "PERDIO", "JUICIO") for _ in range(7)]

        picks = pd.DataFrame(filas)
        reporte = reporte_calibracion(picks)

        todas = reporte[
            (reporte["banda"] == "80-84%") & (reporte["fuente_confianza"] == "TODAS")
        ].iloc[0]
        assert todas["cantidad"] == 25
        assert todas["ganadas"] == 13
        assert todas["perdidas"] == 11
        assert todas["empates"] == 1
        # tasa_real excluye el empate del denominador: 13 / (13 + 11)
        assert todas["tasa_real"] == pytest.approx(13 / 24)
        assert not todas["muestra_insuficiente"]

        calculada = reporte[
            (reporte["banda"] == "80-84%") & (reporte["fuente_confianza"] == "CALCULADA")
        ].iloc[0]
        assert calculada["cantidad"] == 15
        assert calculada["tasa_real"] == pytest.approx(10 / 14)
        assert calculada["muestra_insuficiente"]  # 15 < 20

        juicio = reporte[
            (reporte["banda"] == "80-84%") & (reporte["fuente_confianza"] == "JUICIO")
        ].iloc[0]
        assert juicio["cantidad"] == 10
        assert juicio["tasa_real"] == pytest.approx(3 / 10)
        assert juicio["muestra_insuficiente"]

    def test_muestra_insuficiente_en_banda_chica(self):
        filas = (
            [_pick(0.92, "GANO") for _ in range(2)]
            + [_pick(0.93, "PERDIO") for _ in range(1)]
        )
        picks = pd.DataFrame(filas)
        reporte = reporte_calibracion(picks)
        fila = reporte[
            (reporte["banda"] == "90-94%") & (reporte["fuente_confianza"] == "TODAS")
        ].iloc[0]
        assert fila["cantidad"] == 3
        assert fila["muestra_insuficiente"]

    def test_picks_no_resueltos_se_excluyen(self):
        filas = [_pick(0.82, "GANO"), _pick(0.82, None)]
        picks = pd.DataFrame(filas)
        reporte = reporte_calibracion(picks)
        fila = reporte[
            (reporte["banda"] == "80-84%") & (reporte["fuente_confianza"] == "TODAS")
        ].iloc[0]
        assert fila["cantidad"] == 1

    def test_reporte_vacio_sin_picks_resueltos(self):
        picks = pd.DataFrame([_pick(0.82, None)])
        reporte = reporte_calibracion(picks)
        assert reporte.empty


class TestResumenEconomico:
    def test_desglosa_por_nivel_sin_repartir_dinero_de_boleta_mixta(self):
        filas = [
            {"resultado": "GANO", "nivel": "DIAMANTE", "ticket_id": "T1", "stake": 150.0, "payout": 900.0},
            {"resultado": "GANO", "nivel": "ORO", "ticket_id": "T1", "stake": 150.0, "payout": 900.0},
            {"resultado": "PERDIO", "nivel": "ORO", "ticket_id": "T2", "stake": 100.0, "payout": 0.0},
        ]
        picks = pd.DataFrame(filas)
        resumen = resumen_economico(picks)

        assert resumen["total_picks_resueltos"] == 3
        # T1 se deduplica: el stake/payout de la boleta no se cuenta dos veces
        assert resumen["total_apostado"] == pytest.approx(250.0)
        assert resumen["total_cobrado"] == pytest.approx(900.0)
        assert resumen["neto"] == pytest.approx(650.0)

        assert resumen["por_nivel"]["DIAMANTE"]["cantidad"] == 1
        assert resumen["por_nivel"]["ORO"]["cantidad"] == 2
        assert resumen["por_nivel"]["ORO"]["ganadas"] == 1
        assert resumen["por_nivel"]["ORO"]["perdidas"] == 1

    def test_sin_columnas_de_dinero_advierte_en_vez_de_inventar(self):
        picks = pd.DataFrame([{"resultado": "GANO", "nivel": "ORO"}])
        resumen = resumen_economico(picks)
        assert resumen["total_apostado"] is None
        assert "advertencia" in resumen

    def test_columnas_de_dinero_presentes_pero_vacias_no_reporta_cero_falso(self):
        # Las columnas existen pero nadie registró stake/payout todavía:
        # debe advertir, no mostrar un 0.00 que parecería un resultado real.
        picks = pd.DataFrame(
            [{"resultado": "GANO", "nivel": "ORO", "ticket_id": None, "stake": None, "payout": None}]
        )
        resumen = resumen_economico(picks)
        assert resumen["total_apostado"] is None
        assert "advertencia" in resumen
