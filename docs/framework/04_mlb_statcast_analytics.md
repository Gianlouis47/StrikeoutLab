# 04 — MLB Statcast Analytics

> Ver `00_marco_transversal.md` para el marco obligatorio compartido.

## Fuente y función
Baseball Savant/Statcast alimenta el modelo; por sí sola no genera picks.
La skill traduce calidad de pitcheo y contacto en ajustes cuantitativos.

## Métricas
Revisar Whiff%, CSW%, SwStr%, Chase%, pitch mix, velocidad, movimiento,
xERA, xBA, xwOBA, Hard-Hit%, Barrel% y rendimiento reciente. Desglosar por
tipo de lanzamiento y por mano del bateador cuando el tamaño de muestra
sea suficiente.

## Aplicación
Un aumento sostenible de Whiff/CSW/SwStr y un pitch mix que ataca
debilidades del lineup puede elevar la proyección; pérdida de velocidad,
menor movimiento, aumento de contacto o calidad de contacto rival puede
reducirla. Distinguir señal estable de ruido de muestra pequeña y anotar
el periodo.

## Regla
Statcast modifica la proyección, pero debe integrarse con innings, lineup,
contexto y precio. Nunca emitir Over únicamente porque un pitcher tenga
una métrica atractiva.
