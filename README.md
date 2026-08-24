# StrikeoutLab

Herramienta de cálculo determinista para análisis de props de ponches
(strikeouts) de lanzadores MLB, usada en apuestas en banca física
dominicana (Star Sport, Lajara Sport).

**El sistema calcula, no adivina.** No predice ponches ni genera
confianzas por sí solo — reporta lo que pasó en salidas anteriores, y
audita si las confianzas asignadas (por un humano o por un modelo de
lenguaje) se sostienen contra los resultados reales. Si después de 50-100
picks la calibración muestra que las confianzas no se sostienen, ese es un
resultado válido del sistema, no un fallo del código.

El problema que resuelve: este análisis se ha hecho a mano/mentalmente y
ha producido errores aritméticos repetidos y verificados — confianzas
asignadas a ojo (82-84%) cuando el conteo real de salidas daba 60%;
comparar totales de ponches entre equipos en vez de tasas; no calcular la
probabilidad combinada real de un parlay antes de apostar. StrikeoutLab
elimina esos tres errores por construcción.

## Estructura

```
src/
  calculations.py   # funciones puras: tasas, reglas de empate, parlay, etc.
  calibration.py    # auditoría de calibración y resumen económico
  cli.py            # interfaz de línea de comandos sobre data/*.csv
tests/
  test_calculations.py
  test_calibration.py
data/
  picks.csv         # un registro por pick emitido (ver "Modelo de datos")
  game_logs.csv     # historial real de salidas de cada lanzador
  team_k.csv        # ponches/PA por equipo, por ventana de tiempo
docs/framework/
  00-16...          # el criterio cualitativo (sharp/sindicato) que produce
                     # las confianzas de tipo JUICIO; ver nota abajo
```

## Instalación

```bash
pip install -r requirements.txt
```

Requiere Python 3.11+ (usa `list[dict]`, `float | None`, etc.).

## Uso

Todos los comandos leen y escriben los CSV en `data/`; se pueden abrir y
editar a mano en cualquier momento.

```bash
# Registrar un pick nuevo (queda con resultado pendiente)
python -m src.cli pick-add \
  --fecha 2026-08-24 --codigo 025 --pitcher "Gerrit Cole" \
  --equipo NYY --rival BOS --linea 5.5 --pick OVER \
  --confianza 0.82 --nivel ORO --fuente-confianza CALCULADA

# Registrar el resultado real cuando termine el juego
python -m src.cli resultado-set --pitcher "Gerrit Cole" --fecha 2026-08-24 --k 6

# Tasa real de superación de línea, usando el historial en game_logs.csv
python -m src.cli tasa --pitcher "Gerrit Cole" --linea 5.5 --pick OVER --n 10

# Pitcheos por entrada (None si falta el dato en alguna salida)
python -m src.cli pitcheos --pitcher "Gerrit Cole" --n 5

# Ranking de rivales por TASA de ponches, nunca por total
python -m src.cli rivales --ventana TEMPORADA

# Probabilidad combinada de un parlay (asume independencia)
python -m src.cli parlay --confianzas 0.85,0.9,0.83,0.88

# Igual, pero verificando si dos patas son del mismo juego
python -m src.cli parlay --confianzas 0.85,0.8 \
  --patas "2026-08-24:NYY:BOS,2026-08-24:BOS:NYY"

# Auditoría: ¿las confianzas declaradas se sostienen contra resultados reales?
python -m src.cli calibracion

# Resultado económico real (requiere columnas opcionales stake/payout)
python -m src.cli economico
```

## Modelo de datos

### `data/picks.csv`
El archivo más importante del sistema. Un registro por pick emitido.

| Columna | Tipo | Descripción |
|---|---|---|
| `fecha` | date | Fecha del juego |
| `codigo` | string | Código de la banca (ej. "025") |
| `pitcher` | string | Nombre del lanzador |
| `equipo` | string | Equipo del lanzador (abreviatura 3 letras) |
| `rival` | string | Equipo rival (abreviatura 3 letras) |
| `linea` | float | Línea de ponches (ej. 5.5, 7.0) |
| `pick` | enum | `OVER` o `UNDER` |
| `confianza` | float | Probabilidad asignada, 0.0-1.0 |
| `nivel` | enum | `DIAMANTE`, `ORO_ALTO`, `ORO`, `IMPUREZA` |
| `fuente_confianza` | enum | `CALCULADA` o `JUICIO` — ver nota abajo |
| `resultado_k` | int, nullable | Ponches reales; vacío hasta que termine el juego |
| `resultado` | enum, nullable | `GANO`, `PERDIO`, `EMPATE` — derivado, nunca a mano |
| `ticket_id` | string, nullable | Agrupa picks del mismo ticket físico |
| `stake` | float, nullable | Opcional: DOP apostado (ver `resumen_economico`) |
| `payout` | float, nullable | Opcional: DOP cobrado si ganó/empató |

**`fuente_confianza` es el campo más importante del archivo.** El error
más grave del sistema anterior fue mezclar confianzas calculadas con
confianzas inventadas sin distinguirlas. `CALCULADA` significa que salió
de `tasa_superacion_linea()`. `JUICIO` significa que un humano o un
modelo de lenguaje la estimó (siguiendo el criterio en `docs/framework/`).
El reporte de calibración siempre separa ambas categorías.

Un resultado exactamente igual a una línea entera es `EMPATE`, nunca
`GANO` ni `PERDIO` — en este consorcio se paga con un recorte de
30-40% en vez de anular el ticket, así que colapsar el estado perdería
información real.

`stake`/`payout` son opcionales: si una boleta física agrupa varias patas
bajo el mismo `ticket_id`, se asume que el monto está repetido de forma
idéntica en cada fila de ese ticket (`resumen_economico` deduplica antes
de sumar).

### `data/game_logs.csv`

| Columna | Tipo | Descripción |
|---|---|---|
| `pitcher` | string | Nombre del lanzador |
| `fecha` | date | Fecha de la salida |
| `rival` | string | Rival de esa salida |
| `ip` | float | Entradas en notación de béisbol (5.1 = 5 y 1 out) |
| `k` | int | Ponches |
| `bb` | int | Bases por bola |
| `pitcheos` | int, nullable | Total de pitcheos; frecuentemente no disponible |

`ip` se guarda en notación de béisbol tal como aparece en el boxscore
(5.1, 5.2, 6.0), **no** en decimal — `ip_a_decimal()` hace esa conversión
donde se necesita.

### `data/team_k.csv`

| Columna | Tipo | Descripción |
|---|---|---|
| `equipo` | string | Abreviatura 3 letras |
| `ventana` | enum | `TEMPORADA` o `ULTIMOS_14` |
| `k` | int | Ponches totales |
| `pa` | int | Apariciones al plato |
| `fecha_corte` | date | Cuándo se tomó el dato |

Los tres archivos empiezan solo con encabezados: StrikeoutLab nunca viene
con datos de ejemplo inventados — cargar datos reales es responsabilidad
de quien lo usa.

## Reglas de negocio

- **Líneas enteras y empates.** Un resultado igual a una línea entera es
  `EMPATE`, un estado propio, nunca colapsado en `GANO` ni `PERDIO`.
- **Muestra mínima.** `tasa_superacion_linea` con menos de 5 salidas
  incluye una advertencia en su retorno: el margen de error es demasiado
  grande para confiar en el porcentaje.
- **Datos faltantes.** Nunca se estima, promedia ni rellena. Si falta el
  conteo de pitcheos, `pitcheos_por_entrada` retorna `None`. Un hueco
  explícito es preferible a un número inventado — el mismo principio
  aplica en `resumen_economico`, que advierte en vez de reportar "0.00"
  cuando nadie registró `stake`/`payout`.
- **Independencia en parlays.** `probabilidad_parlay` asume independencia
  entre patas (documentado en su docstring). `detectar_correlacion_mismo_juego`
  es una función aparte que marca cuándo dos patas vienen del mismo juego
  (ej. los dos abridores) y por lo tanto no son eventos independientes.

## Qué NO hace este sistema

- No predice ponches — reporta lo que pasó en salidas anteriores.
- No genera confianzas por sí solo — un humano o un modelo las asigna; el
  sistema solo las registra y las audita después.
- No garantiza ganancias. Las casas cobran comisión en cada línea y esa
  ventaja se multiplica en parlays.

## `docs/framework/`

Son 16 documentos de referencia (no código) que describen el criterio
**cualitativo** — sharp/sindicato, específico de Star Sport — que un
analista humano o un LLM sigue para llegar a un veredicto Over/Under/No
Bet y una confianza `JUICIO`. `docs/framework/00_marco_transversal.md`
contiene el marco compartido por los 16; cada archivo numerado agrega su
enfoque específico (props de pitcher, matchup de lineup, Statcast,
mercado/EV, sharp action, códigos y reglas de Star Sport, bankroll físico,
etc.). StrikeoutLab es la "calculadora" que mantiene honesto ese criterio,
registrando cada confianza y midiendo si se sostiene contra resultados
reales.

## Tests

```bash
pytest
```

Cubren, entre otros: los tres casos de conversión de `ip_a_decimal` (y el
`ValueError` de `5.3`); los seis casos de `tasa_superacion_linea`
(OVER/UNDER × línea .5/entera × gana/pierde/empata); el caso real donde un
equipo con más ponches totales (136/488) tiene *menor* tasa que otro con
menos (132/443); que 4 patas de 0.85 en un parlay den ≈0.52 y no 0.85; y
que un empate en línea entera retorne `EMPATE`, no `PERDIO`.

## Nota sobre el nombre del repositorio

Este proyecto está pensado para vivir en un repositorio llamado
**StrikeoutLab**. Repositorio actual: `gianlouis47/newrepo` — GitHub
permite renombrarlo sin romper enlaces existentes desde
**Settings → General → Repository name**; esa acción no está automatizada
aquí porque afecta al repositorio en sí, no solo a su contenido.
