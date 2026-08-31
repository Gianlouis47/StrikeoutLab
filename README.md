# StrikeoutLab

App móvil personal + backend en la nube para análisis de props de ponches
(strikeouts) de lanzadores MLB, usada en apuestas en banca física
dominicana (Star Sport, Lajara Sport).

**El sistema calcula, no adivina.** No predice ponches ni genera
confianzas por sí solo — reporta lo que pasó en salidas anteriores, y
audita si las confianzas asignadas (por vos o por la IA) se sostienen
contra los resultados reales. Si después de 50-100 picks la calibración
muestra que las confianzas no se sostienen, ese es un resultado válido del
sistema, no un fallo del código.

El problema que resuelve: este análisis se ha hecho a mano/mentalmente y
ha producido errores aritméticos repetidos y verificados — confianzas
asignadas a ojo (82-84%) cuando el conteo real de salidas daba 60%;
comparar totales de ponches entre equipos en vez de tasas; no calcular la
probabilidad combinada real de un parlay antes de apostar. StrikeoutLab
elimina esos tres errores por construcción.

## Arquitectura

```
packages/core/       # Lógica pura (TypeScript): tasas, reglas de empate,
                      # calibración, parlay. Sin IO. 117 tests (vitest).
supabase/
  migrations/         # Registro de los cambios de esquema (la base manda)
  functions/
    chat/             # Edge Function principal: la IA lee fotos y texto,
                      # llama a la calculadora de Postgres y responde
    analizar-pitcher/ # Edge Function: tasa CALCULADA real + opinión JUICIO
                      # de la IA, informada por tu historial de calibración
    analizar-foto/    # Edge Function: lee un ticket/captura con visión IA
apps/mobile/          # App Expo (React Native + TypeScript), solo para vos
docs/framework/       # Criterio cualitativo (sharp/sindicato) que sigue la
                      # IA — el "manual" detrás de fuente_confianza=JUICIO
```

**Por qué Supabase y no Neon:** se evaluó Neon, pero el entorno donde se
construyó este proyecto tenía bloqueado por política de red todo el
dominio `neon.tech`. Supabase sí es alcanzable y ya estaba conectado a la
cuenta, así que es el backend real (Postgres administrado, con Auth,
Storage y Edge Functions incluidos).

**Proyecto Supabase:** `strikeoutlab` (`xuebtkafypivqygyqgcv`, región
`us-east-1`), plan gratuito.

## Modelo de datos (Postgres)

Mismas tablas que el diseño original en CSV, ahora con las reglas de
negocio críticas aplicadas *en la base de datos*, no solo en el código:

- **`picks`** — un registro por pick. `resultado` (`GANO`/`PERDIO`/`EMPATE`)
  se deriva automáticamente por un trigger a partir de `resultado_k`,
  `linea` y `pick` — **nunca se puede escribir a mano, ni por error**. Un
  empate en línea entera nunca colapsa en `GANO` ni `PERDIO`.
- **`game_logs`** — historial real de salidas de cada lanzador (`ip` en
  notación de béisbol: 5.1 = 5 entradas y 1 out).
- **`team_k`** — ponches/PA por equipo y ventana (`TEMPORADA` /
  `ULTIMOS_14`), para comparar por tasa y no por total.
- **`learning_log`** — la bitácora de aprendizaje del framework (antes un
  archivo markdown), ahora una tabla viva.
- **`analisis_fotos`** — lo que la IA de visión extrae de cada foto
  analizada (reservado para cuando se conecte Storage; hoy la Edge
  Function solo devuelve el JSON extraído, no lo persiste todavía).

RLS está activo en las cinco tablas: solo una sesión autenticada de
Supabase Auth puede leer o escribir. El `publishable key` va empacado en
la app (es público por diseño); la protección real es esa.

## La IA y el "aprendizaje"

`analizar-pitcher` no reentrena ningún modelo. En cada llamada:

1. Calcula la tasa real (`CALCULADA`) sobre el historial en `game_logs`.
2. Lee tu historial real de calibración (`reporteCalibracion` sobre tus
   picks `JUICIO` ya resueltos) y se lo pasa a la IA como contexto: *"en
   la banda 80-84% has acertado 55% de las veces"*.
3. Le pide a NVIDIA NIM (modelo configurable, ver abajo) un veredicto
   `JUICIO`, obligado a ajustar su confianza según ese historial real.

Eso es el "aprendizaje": evidencia real inyectada en el contexto de cada
llamada, no un modelo que cambia sus pesos. La API key de NVIDIA vive
únicamente como secret de Supabase (Edge Function) — nunca en la app.

## Configuración

### 1. Instalar dependencias y correr los tests de `packages/core`

```bash
npm install
npm test    # 117 tests, lógica pura de cálculo y calibración
npm run build --workspace packages/core
```

### 2. Secret de NVIDIA (obligatorio para que la IA responda)

Necesitás una API key de [build.nvidia.com](https://build.nvidia.com) (ya
tenés acceso a sus 80+ modelos gratis). Configurala como secret de las
Edge Functions — **nunca la pegues en el código ni en la app**:

- Dashboard de Supabase → tu proyecto → Edge Functions → Secrets → agregar
  `NVIDIA_API_KEY`.
- O con la CLI de Supabase (desde tu computadora):
  `supabase secrets set NVIDIA_API_KEY=tu_key --project-ref xuebtkafypivqygyqgcv`

Opcional: `NVIDIA_MODEL_TEXTO` (default `meta/llama-3.3-70b-instruct`) y
`NVIDIA_MODEL_VISION` (default `meta/llama-3.2-90b-vision-instruct`) si
querés usar otros modelos del catálogo de NVIDIA.

### 3. Crear tu cuenta (la app es de un solo usuario)

Abrí la app y usá "No tengo cuenta todavía" para crear tu usuario con
email/contraseña (Supabase Auth). Si tu proyecto pide confirmación por
correo, revisá tu email antes de entrar.

### 4. Correr la app móvil

```bash
cd apps/mobile
cp .env.example .env   # ya viene con la URL/publishable key del proyecto
npm install
npx expo start
```

Escaneá el QR con la app **Expo Go** (Android/iOS) desde tu teléfono.
Nota: `expo-image-picker` se instaló con `npm install` en vez de
`npx expo install` porque el entorno donde se construyó esto tenía
bloqueado `api.expo.dev`; si Expo Go se queja de una versión
incompatible, corré `npx expo install expo-image-picker` vos mismo desde
tu computadora (sin esa restricción) para que ajuste la versión exacta.

### 3. Generar el APK instalable

Para tener la app en el teléfono sin depender de que el servidor de
desarrollo esté corriendo, `eas.json` ya trae el perfil `apk` con las
variables de Supabase adentro, así que no hay nada que configurar:

```bash
cd apps/mobile
npm run apk
```

Si el build sale raro después de cambiar dependencias, `npm run apk:limpio`
hace lo mismo con `--clear-cache` (tarda bastante más, usalo solo si hace
falta).

**Ojo con el nombre del paquete.** El binario se llama `eas` pero vive en
el paquete `eas-cli`, así que `npx eas build` falla con
`could not determine executable to run`. Los scripts de arriba usan
`eas-cli`, que es el nombre correcto. Si preferís el comando suelto,
instalalo global una vez y te ahorrás la espera de `npx` en cada build:

```bash
npm install -g eas-cli
eas build --platform android --profile apk
```

La primera vez pide login de Expo (`eas login`) y ofrece crear las
credenciales de firma de Android — aceptá, es automático. El build corre
en los servidores de Expo (10-20 minutos) y termina dando un link para
bajar el APK al teléfono.

## Pantallas de la app

La idea es que casi todo pase en **Análisis**: vos entregás la información
y la IA hace el resto. Las demás quedan detrás del botón **Más**, para
cuando querés meter mano a algo puntual.

Principales:

- **Análisis** (el chat) — mandás una foto o escribís, y la IA lee, busca
  los datos, llama a la calculadora, evalúa contra la cuota y te devuelve
  el pick armado con un botón para guardarlo. Cierra siempre con una
  sugerencia o una pregunta.
- **Historial** — picks recientes; tocá uno pendiente para registrar los
  K reales — el `resultado` lo deriva la base de datos, no se escribe a
  mano. Cada resultado que cargás mejora la calibración.
- **Calibración** — confianza declarada vs. tasa real de acierto, por
  banda, y resumen económico.

Detrás de **Más**:

- **Pick manual** — el formulario, para cargar algo a mano. Muestra la
  proyección y el veredicto CONVIENE / FLOJO / NO CONVIENE.
- **Parlay** — la escalera de 1 a 12 patas: probabilidad, valor esperado,
  con cuánto terminás y riesgo de fundirte, con la fila óptima resaltada.
- **Rivales** — ranking de equipos por tasa de ponches, nunca por total.
- **Foto** y **Salida** — atajos viejos que sobreviven por comodidad; lo
  normal es hacerlos desde Análisis.

## Reglas de negocio (sin cambios respecto al diseño original)

- Un resultado igual a una línea entera es `EMPATE`, un estado propio,
  nunca colapsado en `GANO` ni `PERDIO` — aplicado por trigger en Postgres.
- Con menos de 5 salidas, `tasaSuperacionLinea` avisa que la muestra es
  insuficiente. Con menos de 20 picks en una banda de confianza,
  `reporteCalibracion` marca `muestraInsuficiente: true`.
- Nunca se estima ni se rellena un dato faltante — un hueco explícito es
  preferible a un número inventado (incluyendo el resumen económico:
  avisa en vez de mostrar un "0.00" falso cuando no hay stake/payout
  registrado).
- `probabilidadParlay` asume independencia entre patas (documentado en su
  código); `detectarCorrelacionMismoJuego` marca cuándo dos patas vienen
  del mismo enfrentamiento.

## Qué NO hace este sistema

- No predice ponches — reporta lo que pasó, y audita si las confianzas
  (tuyas o de la IA) se sostienen.
- No genera confianzas "de la nada" sin poder auditarlas después —
  `fuente_confianza` (`CALCULADA` vs `JUICIO`) siempre queda registrado.
- No garantiza ganancias. Las casas cobran comisión en cada línea, y esa
  ventaja se multiplica en parlays.

## `docs/framework/`

16 documentos de referencia (no código): el criterio cualitativo
sharp/sindicato, específico de Star Sport, que la IA sigue para llegar a
un veredicto y una confianza `JUICIO`. `00_marco_transversal.md` es el
marco compartido; cada archivo numerado agrega su enfoque (props de
pitcher, matchup de lineup, Statcast, mercado/EV, sharp action, códigos y
reglas de Star Sport, bankroll físico, etc.).

## Nota sobre el nombre del repositorio

Este proyecto está pensado para vivir en un repositorio llamado
**StrikeoutLab**. Repositorio actual: `gianlouis47/newrepo` — GitHub
permite renombrarlo sin romper enlaces existentes desde **Settings →
General → Repository name**; esa acción no está automatizada aquí porque
afecta al repositorio en sí, no solo a su contenido.
