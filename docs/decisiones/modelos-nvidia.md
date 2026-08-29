# Qué modelo de NVIDIA usa cada cosa, y por qué

Medido contra el catálogo real de la cuenta el 2026-08-27 (84 modelos
disponibles), no contra documentación ni búsquedas web. Las mediciones se
hicieron desplegando una función de diagnóstico y llamándola de verdad.

## Visión (transcribir fotos)

| Modelo | Tiempo | Estado |
|---|---|---|
| `meta/llama-3.2-90b-vision-instruct` | 4.3 s | **Elegido** |
| `meta/llama-3.2-11b-vision-instruct` | 0.8 s | Respaldo |
| `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning` | 16.1 s | Descartado |

El omni es un modelo de *razonamiento*: "piensa" antes de responder, lo cual
para transcribir una imagen es puro desperdicio — tardaba 16 s en describir
un pixel, y en producción una foto real tardó casi 2 minutos. Además devolvió
`503 ResourceExhausted: Worker local total request limit reached (16/16)`,
o sea que también se satura.

El 90b es el equilibrio: bastante más preciso que el 11b y 4× más rápido que
el omni. El 11b queda como respaldo automático si el 90b se satura.

## Razonamiento con herramientas (el chat)

Probado dándole una herramienta real y midiendo si la llama bien:

| Modelo | Tiempo | ¿Llamó la herramienta? |
|---|---|---|
| `nvidia/nemotron-3-super-120b-a12b` | 1.6 s | Sí, argumentos correctos — **Elegido** |
| `minimaxai/minimax-m3` | 0.8 s | Sí — respaldo |
| `deepseek-ai/deepseek-v4-pro-0813` | 0.9 s | Sí — segundo respaldo |
| `moonshotai/kimi-k3` | 13 s | Sí, pero lento |
| `openai/gpt-oss-120b` | 66 s | Sí, demasiado lento |
| `nvidia/nemotron-3-ultra-550b-a55b` | 57 s | **No: error 500** |

### Por qué NO el Ultra 550B

Es el modelo más grande y responde bien a un chat simple (`200 OK`), pero al
pasarle `tools` devuelve `500 Internal Server Error` después de ~57 s. **Esa
era la causa del `502` que veía la app en producción** al pedir un análisis.

Un modelo que no puede llamar herramientas no sirve acá: todo el diseño
depende de que la IA invoque la calculadora en vez de inventar números.

### Modelos que no existen en esta cuenta (404)

- `meta/llama-3.1-405b-instruct` — lo usaba el código viejo; ya no está en el
  catálogo.
- `nvidia/llama-3.1-nemotron-ultra-253b-v1`
- `mistralai/mistral-large-2-instruct`
- `nvidia/nemotron-3.5-lightning-30b-a3b`

## Cómo cambiarlos sin tocar código

Ambas listas se leen de secrets de Supabase (Dashboard → Edge Functions →
Secrets), separadas por comas y en orden de preferencia:

- `NVIDIA_MODELOS_VISION`
- `NVIDIA_MODELOS_TEXTO`

Si el primero falla o está saturado, la función pasa sola al siguiente, así
que conviene dejar siempre al menos dos.

## Cómo volver a medir

La disponibilidad y la velocidad cambian. Para repetir la medición, desplegar
una función que llame a `https://integrate.api.nvidia.com/v1/models` con la
`NVIDIA_API_KEY` y después pruebe cada candidato con una herramienta de
juguete. Lo que importa no es que el modelo responda, sino que **devuelva
`tool_calls` con argumentos parseables**.
