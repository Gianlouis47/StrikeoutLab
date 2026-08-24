# 05 — MLB Market EV

> Ver `00_marco_transversal.md` para el marco obligatorio compartido.

## Pregunta central
La pregunta no es "¿creo que ocurrirá?", sino "¿tiene valor al precio
actual?".

## Cálculos
Registrar línea, cuota, book, timestamp y formato de cuota. Calcular
probabilidad implícita, retirar vig cuando haya precios de ambos lados,
estimar probabilidad propia y calcular edge y EV. Comparar el mismo
mercado entre sportsbooks; distinguir mejor número de mejor precio y
registrar movimiento de línea/cuota.

## Movimiento
Analizar steam move y Reverse Line Movement junto con precio, tickets,
dinero cuando esté disponible, liquidez y contexto. Ningún movimiento
demuestra por sí solo dinero profesional.

## Salida
| Elemento | Registro |
|---|---|
| Mercado | Pitcher, K, Over/Under, línea |
| Precio | Cuota actual, apertura y mejor alternativa |
| Probabilidad | Implícita, estimada y sin vig si procede |
| Edge/EV | Fórmula, resultado y sensibilidad |
| Decisión | Apostar, esperar mejor número o No Bet |
