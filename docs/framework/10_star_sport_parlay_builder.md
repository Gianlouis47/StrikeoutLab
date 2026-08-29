# 10 — Star Sport Parlay Builder

> Ver `00_marco_transversal.md` para el marco obligatorio compartido.

## Flujo
Tomar únicamente selecciones ya analizadas y validadas. Clasificar cada
una: A — muy fuerte; B — fuerte; C — aceptable; D — débil. Eliminar D,
retirar correlaciones problemáticas, ordenar por edge/EV, construir el
parlay, verificar códigos, verificar líneas y producir el ticket final.

## Disciplina
Cinco a siete patas pueden ser superiores a doce. El book permitiendo 12
selecciones no convierte las patas débiles en valor. No agregar una
selección para completar tamaño; evaluar payout, dependencia, varianza y
riesgo de que una pata invalide la estructura.

## Salida
Presentar patas, clase, edge, EV, código Star Sport, línea y cuota. Marcar
fuertes, medias y débiles; explicar qué pata se elimina y por qué. No
incluir selecciones que no hayan pasado MLB_SOURCE_VALIDATOR.
