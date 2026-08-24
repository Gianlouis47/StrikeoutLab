# 16 — MLB Physical Bankroll

> Ver `00_marco_transversal.md` para el marco obligatorio compartido.

## Propósito
Adaptar las matemáticas de los sindicatos cuantitativos a la realidad
operativa de apostar en bancas físicas dominicanas (Star Sport) manejando
un volumen de inversión estructurado (ej. 100 a 200 DOP).

## Regla de los 5 Minutos
En la banca física, el ticket es final y no se puede anular ni editar
después de 5 minutos, eliminando la opción de cash-out que existe en
medios digitales. El filtrado algorítmico, límites de pitcheos y escaneo
de lineups confirmados debe ser 100% perfecto antes de emitir los códigos
en caja.

## Estructura Híbrida Óptima
Para que una inversión de 100-200 DOP genere un retorno con valor real
justificable (800 a 6,000 DOP), se permite construir boletas que agrupen
estratégicamente la base pesada de Diamantes con los multiplicadores de
la zona Oro. Se asume una varianza milimétricamente controlada para
elevar el payout, pero manteniendo una regla innegociable: exclusión total
y absoluta de lanzadores catalogados como "Impurezas" (79% o menos).

---

Las columnas opcionales `stake` y `payout` de `picks.csv`, y
`resumen_economico()` en `src/calibration.py`, existen para auditar esta
regla contra la realidad: si el neto real después de 50-100 tickets no
sostiene el retorno "justificable" descrito arriba, eso es una señal del
sistema, no un error del código.
