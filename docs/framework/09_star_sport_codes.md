# 09 — Star Sport Codes

> Ver `00_marco_transversal.md` para el marco obligatorio compartido.

## Base de datos
| Código | Pitcher | Mercado | Línea | Fecha | Estado | Evidencia |
|---|---|---|---:|---|---|---|
| — | — | — | — | — | Pendiente | Requiere captura o fuente actual |

## Reglas
Nunca asumir que un código sigue perteneciendo al mismo jugador.
Verificarlo con captura nueva o catálogo vigente de Star Sport. Registrar
cambios y conservar historial en lugar de sobrescribir silenciosamente. Un
código sin evidencia actual no puede entrar al ticket final.

## Validación previa
Comprobar código + jugador + mercado + línea + cuota + fecha. Si alguno no
coincide con el ticket, detener la construcción y corregir.
