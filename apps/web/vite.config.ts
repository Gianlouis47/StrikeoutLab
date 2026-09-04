// Vite + el plugin de PWA.
//
// Por qué Vite y no Next.js, teniendo Vercel del otro lado: esta app no
// tiene nada de servidor. Todo lo que hace es llamar a Supabase desde el
// navegador — la calculadora vive en Postgres y la IA en una Edge Function.
// Next.js estaría peleando contra su propio modelo (todo marcado "use
// client") para no ganar nada. Vercel publica un sitio estático de Vite sin
// configuración igual que un Next.
//
// LO DE LA PWA
//
// El "instalar" que aparece arriba a la derecha en el navegador no es magia
// ni una tienda: el navegador lo ofrece cuando el sitio cumple tres cosas.
//
//   1. Un manifest con nombre, colores e íconos (mínimo 192 y 512 px).
//   2. Un service worker registrado.
//   3. HTTPS — Vercel lo da solo.
//
// Con eso, el ícono queda en la pantalla de inicio y la app abre sin la
// barra del navegador. No pasa por ninguna tienda ni hay que firmar nada.

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // Se actualiza sola: cuando publicás una versión nueva, el service
      // worker la toma sin que nadie tenga que reinstalar nada. Es la
      // diferencia más grande con el APK — allá había que recompilar y
      // volver a instalar para ver un cambio.
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg", "apple-touch-icon.png"],
      manifest: {
        name: "StrikeoutLab",
        short_name: "StrikeoutLab",
        description: "Análisis determinista de props de ponches de MLB.",
        lang: "es",
        start_url: "/",
        display: "standalone",
        orientation: "portrait",
        background_color: "#0b0e13",
        theme_color: "#0b0e13",
        icons: [
          { src: "/icono-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icono-512.png", sizes: "512x512", type: "image/png" },
          {
            // `maskable` es el que Android recorta a la forma del sistema
            // (círculo, cuadrado redondeado). Sin uno maskable, Android
            // mete el ícono adentro de un cuadrado blanco y queda feo.
            src: "/icono-512-maskable.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        // Los datos NO se cachean: una proyección vieja es peor que ninguna.
        // Se cachea solo el armazón de la app para que abra rápido.
        navigateFallbackDenylist: [/^\/api/],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/[a-z0-9]+\.supabase\.co\/.*/i,
            handler: "NetworkOnly",
          },
        ],
      },
    }),
  ],
  server: { host: true, port: 5173 },
});
