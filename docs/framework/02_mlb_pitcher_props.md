# 02 — MLB Pitcher Props

> Ver `00_marco_transversal.md` para el marco obligatorio compartido.

## Alcance
Analiza exclusivamente props de ponches de pitchers abridores o roles
claramente definidos. El objetivo es proyectar K distribuyendo el riesgo
entre habilidad, matchup y oportunidad.

## Variables mínimas
Registrar K%, K/9, Whiff%, CSW%, SwStr%, K% de los últimos 30 días,
últimas 3–5 aperturas, innings por salida, pitch count, tendencia de
velocidad y arsenal, splits RHB/LHB, lineup confirmado, K% de cada bateador
y SO/SO% del rival. La ventana reciente informa forma, pero no debe
reemplazar una base estable sin explicar el cambio.

## Modelo operativo
Construir una base de K por inning y ajustarla por la mezcla de manos del
lineup, K% individual, Whiff/contacto, calidad del repertorio contra cada
bateador y expectativa de innings. Aplicar un techo por pitch count y una
penalización cuando exista riesgo de opener, regreso de lesión, descanso
limitado, blowout o bullpen disponible. Documentar cada ajuste y evitar
sumar dos veces la misma señal.

## Rival y lineup
El ranking SO/SO% 15–30 favorece Over K y 1–14 favorece Under K, pero solo
como punto de partida. Cruzar con los nueve bateadores reales: mano, K%,
Whiff%, Contact%, orden, sustituciones probables y ausencia de un bateador
clave.

## Veredicto
No convertir una media histórica en pick. Comparar la proyección
contextual con la línea y el precio; después emitir Over, Under o No Bet
con edge y razón principal.
