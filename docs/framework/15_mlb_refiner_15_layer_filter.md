# 15 — MLB Refiner 15-Layer Filter

> Ver `00_marco_transversal.md` para el marco obligatorio compartido.

## Propósito
Estandarizar el escaneo de los abridores diarios a través de un embudo de
15 capas innegociables para separar el valor real (Diamantes y Oros) del
ruido del mercado (Impurezas).

## Capa 1: Integridad Física (El Brazo)
1. Stuff+ / Índice de Dominio: Capacidad real de ponchar por cuenta propia.
2. SwStr% (Abanicados): Eficiencia obligando al bateador a fallar el swing
   fuera de la zona.
3. Estabilidad de Velocidad: Ausencia de fatiga en entradas tardías.
4. Hard Hit % (Anti-Contacto): Capacidad de inducir contacto débil para
   alargar la salida.
5. Pitch Mix: Variedad de repertorio (mínimo dos pitcheos élite de
   ponche).

## Capa 2: Entorno y Escenario
6. The Leash (La Correa): Confianza del mánager para permitir 90-100+
   pitcheos.
7. Umpire Analysis: Identificación de árbitro detrás del plato con zona
   de strike amplia.
8. Park Factor: Estadio que suprima la ofensiva (vuelo de la bola).
9. Racha Actual: Momentum y consistencia de sus últimas dos salidas.
10. Zona de Bateo Rival: Cruce directo con la mano del lanzador y
    propensión al ponche de los nueve bateadores confirmados.

## Capa 3: Mercado y Valor (La Casa)
11. Línea Abierta vs. Real: Detección de precios inflados por el
    "Impuesto de Fama".
12. Public Bias: Hacia dónde está apostando el público recreativo.
13. Line Movement: Detección de fluctuaciones por "dinero inteligente"
    (Sharp).
14. Escudo del Medio Punto (.5): Protección matemática estricta para
    evitar empates (Push).
15. Valor Esperado (+EV): La probabilidad estadística real supera con
    creces la cuota impuesta.

---

Las 15 capas son criterio cualitativo de selección (qué lanzador estudiar
primero). Una vez que un pitcher pasa el embudo, su confianza final debe
registrarse en `picks.csv` como `fuente_confianza=JUICIO` — a menos que se
derive estrictamente de `tasa_superacion_linea()` sobre su historial real,
en cuyo caso es `CALCULADA`. La capa 14 (Escudo del `.5`) es exactamente
la distinción que `evaluar_pick()`/`tasa_superacion_linea()` modelan como
estado `EMPATE` para líneas enteras.
