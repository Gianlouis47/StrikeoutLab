# 14 — MLB Refiner Granularity

> Ver `00_marco_transversal.md` para el marco obligatorio compartido.

## Propósito
Eliminar la subjetividad y el sesgo de volumen al construir parlays,
implementando un embudo de probabilidad estricto que clasifica las
jugadas de Star Sport antes de invertir un solo peso.

## Clasificación de Pureza
* **Diamante (90% - 99%):** Escudo absoluto. Supera todos los filtros,
  incluyendo protección matemática (el `.5`). Es la base inamovible de los
  tickets de mayor inversión.
* **Oro (80% - 89%):** Rentabilidad alta con un factor de riesgo menor
  (ej. línea entera sin `.5` o límite de pitcheos ligero). Se evalúa "con
  pinzas" y se combina para maximizar el multiplicador sin arruinar la
  matemática de la boleta.
* **Impurezas (79% o menos):** Trampas matemáticas. Lanzadores con fallas
  estructurales o exceso de varianza. Se descartan automáticamente y
  jamás entran al ticket; solo se estudian para entender el engaño del
  book.

## Mandato de Extracción (Cero Límites)
No forzar una cuota fija de selecciones (ej. "obligatorio 3 Diamantes" u
"obligatorio 3 Oros"). El tamaño del ticket lo dicta exclusivamente la
cantidad de valor puro que la refinería extraiga ese día. Si hay 6 jugadas
de alta pureza, se toman las 6; si hay 1, se toma 1. Prohibido agregar
relleno.

---

En StrikeoutLab estos tres niveles corresponden literalmente a la columna
`nivel` de `data/picks.csv` (`DIAMANTE`, `ORO_ALTO`, `ORO`, `IMPUREZA`).
`reporte_calibracion()` es lo que verifica, con resultados reales, si el
corte 90/80/79 sigue siendo el correcto o si debe recalibrarse.
