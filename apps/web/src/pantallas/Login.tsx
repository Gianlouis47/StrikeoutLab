import { useState } from "react";
import { supabase } from "../lib/supabase";

export function Login() {
  const [correo, setCorreo] = useState("");
  const [clave, setClave] = useState("");
  const [cargando, setCargando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setAviso(null);
    if (!correo || !clave) {
      setAviso("Poné el correo y la contraseña.");
      return;
    }
    setCargando(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: correo.trim(),
      password: clave,
    });
    setCargando(false);
    if (error) {
      setAviso(
        error.message.toLowerCase().includes("invalid login credentials")
          ? "Correo o contraseña incorrectos."
          : error.message,
      );
    }
    // Si salió bien no hace falta hacer nada: onAuthStateChange en App.tsx
    // ve la sesión nueva y cambia la pantalla solo.
  }

  return (
    <div
      className="contenido"
      style={{ justifyContent: "center", alignItems: "center", height: "100%" }}
    >
      {/* form de verdad, no un div con un botón: así el navegador ofrece el
          gestor de contraseñas y el teclado del celular muestra "ir". */}
      <form className="tarjeta" style={{ width: "100%", maxWidth: 360 }} onSubmit={entrar}>
        <h1 className="titulo" style={{ fontSize: 20, justifyContent: "center" }}>
          StrikeoutLab
        </h1>

        <div className="campo">
          <label htmlFor="correo">Correo</label>
          <input
            id="correo"
            type="email"
            value={correo}
            onChange={(e) => setCorreo(e.target.value)}
            autoComplete="email"
            autoCapitalize="none"
          />
        </div>

        <div className="campo">
          <label htmlFor="clave">Contraseña</label>
          <input
            id="clave"
            type="password"
            value={clave}
            onChange={(e) => setClave(e.target.value)}
            autoComplete="current-password"
          />
        </div>

        {aviso && (
          <p className="peligro" style={{ fontSize: 13, margin: 0 }} aria-live="assertive">
            {aviso}
          </p>
        )}

        <button className="boton" type="submit" disabled={cargando} style={{ marginTop: 8 }}>
          {cargando ? <span className="cargando" /> : "Entrar"}
        </button>
      </form>
    </div>
  );
}
