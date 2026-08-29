# 13 — MLB Learning Log

> Ver `00_marco_transversal.md` para el marco obligatorio compartido.

## Propósito
Convertir el sistema en una libreta viva y evolutiva. Cada aprendizaje
debe cambiar una práctica, una validación o una expectativa explícita.

## Plantilla de entrada
| Campo | Contenido |
|---|---|
| Fecha | YYYY-MM-DD |
| Descubrimiento | Qué se observó |
| Fuente | Captura, ticket, URL o dato |
| Regla nueva | Regla operativa derivada |
| Por qué importa | Impacto en proyección, precio o liquidación |
| Cambio al framework | Archivo, sección o flujo afectado |
| Estado | PROPUESTO / ACTIVO / RETIRADO |

## Ejemplo
**Fecha:** 2026-08-08. **Descubrimiento:** Star Sport utiliza códigos
específicos para sus pitchers. **Aplicación:** antes de construir un
ticket hay que verificar código + jugador + línea. **Estado:** ACTIVO.

## Gobernanza
No incorporar una regla con una sola observación ambigua como verdad
universal. Registrar evidencia, confirmar repeticiones y actualizar la
skill correspondiente cuando el aprendizaje sea suficientemente sólido.

## Picks IMPUREZA también se registran
Un pick en IMPUREZA (79% o menos) nunca es una recomendación de apuesta,
pero sí se guarda en `picks` con su `resultado_k` cuando el juego
termina — no para jugarlo, sino porque `reporteCalibracion()` necesita
esas bandas bajas resueltas para confirmar si el corte de 80% sigue
siendo el correcto o si debe recalibrarse.
