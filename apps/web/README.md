# StrikeoutLab — app web (PWA)

La misma app, en el navegador. Se instala en el celular con ícono propio y sin
pasar por ninguna tienda.

## Por qué se dejó la app nativa

Diez días de trabajo y el problema nunca estuvo en la lógica: estuvo en la
capa nativa. El teclado que tapaba el campo (tres intentos, Android 15 dejó de
achicar la ventana), el APK que había que recompilar para ver cualquier
cambio, las versiones de Reanimated peleadas con las de Expo. Nada de eso
existe acá.

Y lo más importante: **una app web se puede probar sin un teléfono**. Todos
los bugs de la app nativa que el usuario reportó —el teclado, las fotos que no
se guardaban, la pestaña que se borraba— eran cosas que solo se veían en el
dispositivo, y por eso se daban por arregladas sin estarlo. En web se abre con
un navegador headless y se mira. El primer bug de esta versión (las filas de
chips salían aplastadas a una raya de dos píxeles) se encontró así, en la
primera captura, no leyendo el código.

## Las pantallas

Abajo, las tres de todos los días. En **Más**, las de revisar y corregir.

| Pantalla | Qué hace |
|---|---|
| **Análisis** | El chat. Foto del ticket, pregunta suelta, la IA busca y calcula. |
| **Lanzador** | La probabilidad calculada arriba, el historial con filtros y gráfico abajo. |
| **Historial** | Los picks jugados. Acá se anota cuántos ponches sacó cada uno. |
| **Calibración** | Cuánto declaraste contra cuánto ganaste, banda por banda. |
| **Parlay** | La escalera de 1 a 12 patas y dónde conviene cortar. |
| **Rivales** | Qué tanto se poncha bateando cada equipo. |
| **Pick manual** | Cargar una apuesta a mano, con la proyección al lado. |
| **Salida manual** | Anotar el resultado real de un juego (alimenta el historial). |

Las cinco de "Más" se bajan recién al entrar (`React.lazy`): el arranque pesa
147 kB comprimidos y después lo sirve el service worker desde el teléfono.

Las pestañas se esconden con `display: none` en vez de desmontarse, así no se
pierde lo que estabas escribiendo al cambiar de pestaña.

## Lo que NO cambió

Toda la parte que importa:

- **La calculadora**, en Postgres: `proyectar_ponches`, `historial_lanzador`,
  `backtest_ponches`, `evaluar_parlay`, `calibracion_real`.
- **Los datos**: 3.658 salidas reales de 224 abridores, 825 lanzadores, los
  splits por mano de los 30 equipos.
- **La Edge Function `chat`** entera, con sus 13 herramientas.
- **`packages/core`** con sus 117 tests.

A Postgres le da igual si lo llama un celular o un navegador. Lo único que se
reescribió fueron las pantallas.

## Correrla

```bash
npm install
cp apps/web/.env.example apps/web/.env   # y poné la clave real
npm run web                              # http://localhost:5173
```

## Publicarla en Vercel

Ya está publicada y atada al repo: cada push a `master` la despliega sola.

No hay variables de entorno que cargar a mano. `apps/web/.env.production` está
versionado (con una excepción explícita en `.gitignore`) y trae la URL y la
clave **publishable** de Supabase, que están diseñadas para ir en el navegador
y ya viajan dentro del bundle que descarga cualquiera que abra la app. Lo que
protege los datos no es esconder esa clave, es el RLS — ver más abajo. La
`service_role` key no está ahí ni va a estar: esa sí pasa por encima del RLS y
vive solo en las variables de la Edge Function.

Para levantar el proyecto de cero en otra cuenta de Vercel: importar el repo y
listo. `vercel.json` en la raíz ya tiene el comando de build, el directorio de
salida, el rewrite a `index.html` y el `Cache-Control` de `sw.js`. Lo único que
hay que tocar a mano es **desactivar Vercel Authentication** (Settings →
Deployment Protection), o el sitio pide login de Vercel para abrirse y no se
puede instalar en un teléfono.

## Quién puede entrar

Estar registrado en Supabase **no alcanza**. Hay una lista blanca
(`usuarios_permitidos`) y las políticas de RLS de las siete tablas de datos
exigen estar en ella; a esa tabla no se puede escribir desde el cliente, así
que nadie se agrega solo. Un registrado que no esté en la lista ve **0 filas** y
no puede escribir nada.

Para dar de alta a alguien, desde el editor SQL de Supabase:

```sql
insert into usuarios_permitidos (user_id, nota)
select id, 'para qué' from auth.users where email = 'correo@ejemplo.com';
```

## Instalarla en el celular

Abrir la URL de Vercel en Chrome (Android) o Safari (iPhone):

- **Android:** aparece solo un cartel de "Instalar", o desde el menú ⋮ →
  "Agregar a pantalla de inicio".
- **iPhone:** botón de compartir → "Agregar a pantalla de inicio".

Queda con ícono propio y abre sin la barra del navegador. Cuando se publica
una versión nueva, el service worker la toma solo — no hay que reinstalar
nada, que es la otra diferencia grande con el APK.

## Qué está probado y qué no

Probado en un Chromium de verdad a 390×844, con los datos reales de la base
interceptados en la red (el proxy de este contenedor bloquea `supabase.co`
también para el navegador, así que los datos se traen aparte y se sirven a
mano):

- Las nueve pantallas dibujan; **cero errores de consola**.
- Las escrituras salen bien: al anotar un resultado se manda solo
  `{resultado_k}` — quién ganó lo decide la base, no el navegador — y el pick
  manual guarda la confianza **calibrada** (0.53), no la cruda (0.59).
- El estado sobrevive al cambio de pestaña: se elige un lanzador, se va a
  Historial, se vuelve, y la pantalla quedó igual.
- El build emite `manifest.webmanifest` y `sw.js`.

**No** está probada la conexión viva a Supabase desde el navegador: login
real, chat real y proyección real contra la base hay que probarlos una vez
desplegado en Vercel.
