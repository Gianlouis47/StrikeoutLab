# 12 — MLB Source Validator

> Ver `00_marco_transversal.md` para el marco obligatorio compartido.

## Checklist obligatorio
Antes de una conclusión responder: ¿pitcher correcto? ¿rival correcto?
¿lineup correcto? ¿línea correcta? ¿cuota correcta? ¿fuente actual?
¿estadística actual? ¿mercado y reglas de Star Sport confirmados?

## Vigencia del abridor probable
Un "abridor probable" encontrado por búsqueda web **no es definitivo**
hasta que se confirma lo más cerca posible de la hora del primer
pitcheo. Las rotaciones cambian por lesión, doble cartelera, descanso
extra o decisión de último momento — un preview de la noche anterior o
de esa misma tarde puede ya estar desactualizado cuando el partido
arranca. Un pick construido sobre un abridor que después no lanzó no es
un fallo de proyección de K: es un fallo de identidad que invalida el
pick completo, y no se nota hasta comparar contra el boxscore final
(caso real: 25/ago/2026, 5 de 14 picks de esa noche quedaron sin poder
resolverse por este motivo exacto). Re-verificar el abridor con la
fuente más reciente disponible antes de guardar un pick como definitivo.

## Jerarquía
MLB.com prevalece para identidad, pitchers probables, lineups y datos
oficiales; Statcast para métricas de calidad; Star Sport para código,
línea, cuota y reglas observadas; fuentes secundarias para descubrimiento
y contraste. Guardar timestamp y URL o evidencia cuando sea posible.

## Contradicciones
> No inventar. Investigar y resolver la contradicción.

Si la discrepancia persiste, exponerla claramente y emitir No Bet o
detener el ticket. Nunca mezclar una línea de un book con la cuota de otro
ni un lineup proyectado con una conclusión presentada como confirmada.
