# 01 — MLB Master Framework

> Ver `00_marco_transversal.md` para el marco obligatorio compartido por
> las 16 skills. Esta skill es el núcleo jerárquico: ninguna otra puede
> emitir una recomendación que contradiga sus reglas de fuente, contexto,
> precio, validación y decisión.

## Flujo operativo
El análisis comienza con la captura de mercado —línea, cuota, book y
hora— y continúa con pitcher, rival, lineup confirmado, Statcast, contexto
de juego y comparación de precio. La salida debe separar hechos
observados, supuestos, cálculos y veredicto. Si falta una variable crítica,
la salida correcta es **No Bet** o una solicitud de verificación.

## Proyección
La proyección de K debe combinar base de temporada, ventana reciente,
matchup individual, innings y pitch count. El promedio general jamás es
predictor único. Se deben ponderar K%, Whiff%, CSW%, SwStr%, splits
RHB/LHB, SO% del rival, lineup, umpire, parque, clima y forma reciente.
Registrar qué variables elevan o reducen la proyección y evitar doble
conteo de señales correlacionadas.

## Edge, probabilidad y EV
Para una línea de ponches, calcular el edge como proyección menos línea
para Over y línea menos proyección para Under, especificando unidades.
Convertir cuota a probabilidad implícita según el formato disponible y,
cuando exista una probabilidad propia calibrada, calcular EV neto:
EV = p × ganancia neta − (1 − p) × stake. Ajustar por vig y comparar
precios entre books.

## Decisión
**Over** exige proyección y precio favorables; **Under** exige la
condición inversa; **No Bet** aplica cuando el edge es pequeño, el precio
es malo, el lineup no está confirmado, existe contradicción material o la
incertidumbre sobre innings domina el caso. La confianza debe reflejar
calidad de datos, estabilidad del rol, claridad del matchup y distancia
entre proyección y línea, no intuición.

## Salida obligatoria
| Campo | Requisito |
|---|---|
| Línea | Número y book; registrar si es entera o media |
| Proyección | K esperadas y supuestos de innings/pitcheos |
| Edge | Diferencia exacta y dirección |
| Factores | Pitcher, rival, lineup, SO rank, K%, Whiff%, umpire, clima, parque |
| Precio | Cuota, probabilidad implícita, vig/EV si procede |
| Veredicto | Over, Under o No Bet |
| Parlay | Fortaleza de cada pata y riesgos de correlación |

## Reglas de contradicción
MLB.com y datos oficiales prevalecen para identidad, estado y lineup;
Statcast prevalece para calidad de pitcheo y contacto; el book prevalece
para línea y cuota observadas. Fuentes secundarias descubren y contrastan,
pero no sustituyen la verificación primaria. Ante conflicto, no inventar:
registrar la discrepancia, buscar actualización y bloquear el pick si no
se resuelve.
