// Registrar salida: guardar el resultado real de un lanzador.
//
// Esto no es una apuesta, es un hecho: alimenta `game_logs`, que es de donde
// salen el historial de la pantalla del lanzador, el K% observado y el
// backtest. Un dato mal cargado acá ensucia todas las proyecciones futuras de
// ese lanzador, así que la foto solo transcribe y el usuario confirma.
//
// Los innings van en notación de béisbol: "6.2" es seis entradas y dos outs,
// o sea 6⅔, no 6.2. La base lo convierte con `ip_a_outs()`; acá se guarda tal
// como se escribe.

import { useState } from "react";
import { analizarFoto, comprimirImagen } from "../lib/chat";
import { repositorio } from "../lib/repositorio";
import { salidaNuevaSchema } from "../lib/validators";
import { Boton, Campo, Encabezado, Mensaje } from "../componentes/ui";

function vacio() {
  return {
    pitcher: "",
    fecha: new Date().toISOString().slice(0, 10),
    rival: "",
    ip: "",
    k: "",
    bb: "",
    pitcheos: "",
  };
}

export function RegistrarSalida() {
  const [form, setForm] = useState(vacio());
  const [vistaPrevia, setVistaPrevia] = useState<string | null>(null);
  const [leyendoFoto, setLeyendoFoto] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);

  function actualizar(campo: keyof ReturnType<typeof vacio>, valor: string) {
    setForm((prev) => ({ ...prev, [campo]: valor }));
  }

  async function leerFoto(archivo: File) {
    setError(null);
    setExito(null);
    setLeyendoFoto(true);
    try {
      const { base64, mimeType } = await comprimirImagen(archivo);
      setVistaPrevia(`data:${mimeType};base64,${base64}`);
      const { datosExtraidos } = await analizarFoto({ imagenBase64: base64, mimeType });

      if (datosExtraidos.tipo_detectado !== "boxscore") {
        setError(
          `La IA leyó esta imagen como "${datosExtraidos.tipo_detectado}", no como boxscore. Revisá los campos igual — puede haber sacado algo útil — pero probablemente falten datos.`,
        );
      }

      // `?? prev` en cada campo: si la foto no trae el rival, se conserva lo
      // que ya estaba escrito en vez de borrarlo.
      setForm((prev) => ({
        pitcher: datosExtraidos.pitcher ?? prev.pitcher,
        fecha: datosExtraidos.fecha ?? prev.fecha,
        rival: datosExtraidos.rival ?? prev.rival,
        ip: datosExtraidos.ip !== null ? String(datosExtraidos.ip) : prev.ip,
        k: datosExtraidos.k !== null ? String(datosExtraidos.k) : prev.k,
        bb: datosExtraidos.bb !== null ? String(datosExtraidos.bb) : prev.bb,
        pitcheos: datosExtraidos.pitcheos !== null ? String(datosExtraidos.pitcheos) : prev.pitcheos,
      }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLeyendoFoto(false);
    }
  }

  async function guardar() {
    setError(null);
    setExito(null);

    const validacion = salidaNuevaSchema.safeParse({
      pitcher: form.pitcher.trim(),
      fecha: form.fecha.trim(),
      rival: form.rival.trim().toUpperCase(),
      ip: parseFloat(form.ip.replace(",", ".")),
      k: parseInt(form.k, 10),
      bb: parseInt(form.bb, 10),
      pitcheos: form.pitcheos.trim() ? parseInt(form.pitcheos, 10) : null,
    });
    if (!validacion.success) {
      setError(validacion.error.issues[0]?.message ?? "Datos inválidos.");
      return;
    }

    setGuardando(true);
    try {
      const d = validacion.data;
      // El rival se guarda como venga: el trigger `game_logs_rival_canonico`
      // lo normaliza en la base (AZ → ARI, CWS → CHW). Traducirlo también acá
      // sería una segunda tabla de alias que algún día va a discrepar.
      await repositorio.crear("game_logs", {
        pitcher: d.pitcher,
        fecha: d.fecha,
        rival: d.rival,
        ip: d.ip,
        k: d.k,
        bb: d.bb,
        pitcheos: d.pitcheos,
      });
      setExito(`Salida de ${d.pitcher} guardada — ya cuenta para su historial real.`);
      setForm(vacio());
      setVistaPrevia(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="contenido">
      <Encabezado
        titulo="Registrar salida"
        bajada="El resultado real de un lanzador al terminar su juego. Esto alimenta el historial, no los picks."
      />

      {/* Un solo input para las dos cosas: `capture` le pide la cámara al
          celular y en la compu abre el explorador de archivos. Dos botones
          separados no tienen sentido en web. */}
      <label className="boton" style={{ display: "grid", placeItems: "center", cursor: "pointer" }}>
        {leyendoFoto ? <span className="cargando" /> : "📷 Foto del boxscore"}
        <input
          type="file"
          accept="image/*"
          capture="environment"
          style={{ display: "none" }}
          disabled={leyendoFoto}
          onChange={(e) => {
            const archivo = e.target.files?.[0];
            // Se limpia el input para que elegir la MISMA foto otra vez vuelva
            // a disparar onChange.
            e.target.value = "";
            if (archivo) void leerFoto(archivo);
          }}
        />
      </label>

      {vistaPrevia && (
        <img
          src={vistaPrevia}
          alt="Boxscore que se está leyendo"
          style={{ width: "100%", maxHeight: 200, objectFit: "contain", borderRadius: 12 }}
        />
      )}

      <div className="tarjeta">
        <Campo
          id="rs-pitcher"
          etiqueta="Lanzador"
          valor={form.pitcher}
          alCambiar={(v) => actualizar("pitcher", v)}
          placeholder="Nombre completo"
          autoComplete="off"
        />
        <Campo
          id="rs-fecha"
          etiqueta="Fecha (AAAA-MM-DD)"
          valor={form.fecha}
          alCambiar={(v) => actualizar("fecha", v)}
        />
        <Campo
          id="rs-rival"
          etiqueta="Rival"
          valor={form.rival}
          alCambiar={(v) => actualizar("rival", v)}
          placeholder="NYY"
          autoCapitalize="characters"
        />
        <div style={{ display: "flex", gap: 8 }}>
          <Campo
            id="rs-ip"
            etiqueta="IP (6.2 = 6⅔)"
            valor={form.ip}
            alCambiar={(v) => actualizar("ip", v)}
            inputMode="decimal"
          />
          <Campo
            id="rs-k"
            etiqueta="K (ponches)"
            valor={form.k}
            alCambiar={(v) => actualizar("k", v)}
            inputMode="numeric"
          />
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Campo
            id="rs-bb"
            etiqueta="BB (boletos)"
            valor={form.bb}
            alCambiar={(v) => actualizar("bb", v)}
            inputMode="numeric"
          />
          <Campo
            id="rs-pitcheos"
            etiqueta="Pitcheos (opcional)"
            valor={form.pitcheos}
            alCambiar={(v) => actualizar("pitcheos", v)}
            inputMode="numeric"
          />
        </div>

        {error && <Mensaje tono="peligro">{error}</Mensaje>}
        {exito && <Mensaje tono="exito">{exito}</Mensaje>}

        <Boton alTocar={() => void guardar()} cargando={guardando}>
          Guardar salida
        </Boton>
      </div>

      <p className="suave" style={{ margin: 0 }}>
        Si la foto no trae todos los datos, o los lee mal, corregilos antes de guardar. La IA solo transcribe: vos
        confirmás.
      </p>
    </div>
  );
}
