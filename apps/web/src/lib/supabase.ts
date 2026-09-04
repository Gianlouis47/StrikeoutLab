// El cliente de Supabase.
//
// Casi idéntico al de la app nativa. Tres diferencias, y las tres son a
// favor de la web:
//
//   1. No hace falta el polyfill de URL (`react-native-url-polyfill`): el
//      navegador ya trae URL de fábrica. En React Native no existía y sin el
//      polyfill el cliente reventaba al armar cualquier pedido.
//   2. La sesión se guarda en localStorage, que es el default — no hay que
//      pasarle AsyncStorage ni instalarlo.
//   3. `detectSessionInUrl` va en true: en web el login por link de correo
//      vuelve con el token en la URL y hay que leerlo. En el celular no
//      existía esa vuelta.

import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const clave = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!url || !clave) {
  throw new Error(
    "Faltan VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY. " +
      "Copiá .env.example a .env con los valores de tu proyecto, y en Vercel " +
      "cargalas en Settings → Environment Variables con esos mismos nombres.",
  );
}

export const supabase = createClient(url, clave, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
});
