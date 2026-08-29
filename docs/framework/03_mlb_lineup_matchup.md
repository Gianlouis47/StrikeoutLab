# 03 — MLB Lineup Matchup

> Ver `00_marco_transversal.md` para el marco obligatorio compartido.

## Propósito
Mapear pitcher → mano del pitcher → nueve bateadores → K%, Whiff% y
Contact% → K% combinado del lineup → ajuste de proyección.

## Procedimiento
Confirmar el lineup en MLB.com o fuente primaria. Para cada bateador
registrar posición, mano, K%, Whiff%, Contact%, rendimiento reciente y
vulnerabilidad al pitch mix relevante. Calcular una lectura agregada del
lineup ponderada por apariciones esperadas, sin tratar a los nueve puestos
como idénticos.

## Detectores
Marcar automáticamente: cinco o más bateadores con K% superior a 24%;
lineup particularmente ponchador; lineup de mucho contacto; y cambios
respecto al lineup proyectado. Un cambio de dos o más bateadores
relevantes, o la sustitución de un perfil extremo, exige recalcular la
proyección y revisar la línea.

## Control de calidad
No usar un ranking de equipo como sustituto del lineup real. Separar
splits por mano, identificar bateadores que no enfrentan bien el
repertorio del pitcher y documentar incertidumbre cuando el lineup aún no
está confirmado.
