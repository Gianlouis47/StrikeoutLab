// La pantalla principal: le tirás una foto o le escribís, y ella hace todo.
//
// Lo que en la app nativa costó tres intentos y no quedó nunca bien —que el
// teclado no tape el campo de escribir— acá directamente no existe como
// problema. El navegador achica el área visible cuando sale el teclado y el
// layout se acomoda solo. Ni una línea de código.

import { useEffect, useRef, useState } from "react";
import { chat, comprimirImagen, type MensajeChat } from "../lib/chat";
import { TextoRico } from "../componentes/TextoRico";

interface Burbuja {
  rol: "usuario" | "asistente";
  texto: string;
  /** Data URL, solo para mostrarla en pantalla. */
  vistaPrevia?: string;
}

const CLAVE_GUARDADO = "strikeoutlab.conversacion.v1";
const TOPE_BURBUJAS = 80;

/** Lo guardado se lee una sola vez, al montar. */
function leerGuardado(): { burbujas: Burbuja[]; borrador: string } {
  try {
    const crudo = localStorage.getItem(CLAVE_GUARDADO);
    if (!crudo) return { burbujas: [], borrador: "" };
    const datos = JSON.parse(crudo) as { burbujas?: Burbuja[]; borrador?: string };
    return { burbujas: datos.burbujas ?? [], borrador: datos.borrador ?? "" };
  } catch {
    // Un localStorage corrupto o bloqueado (modo incógnito con cookies
    // apagadas) no puede tumbar la app: se arranca vacío.
    return { burbujas: [], borrador: "" };
  }
}

export function Chat() {
  const guardado = useRef(leerGuardado()).current;
  const [burbujas, setBurbujas] = useState<Burbuja[]>(guardado.burbujas);
  const [texto, setTexto] = useState(guardado.borrador);
  const [imagen, setImagen] = useState<{ base64: string; mimeType: string; vistaPrevia: string } | null>(null);
  const [pensando, setPensando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const finRef = useRef<HTMLDivElement>(null);
  const archivoRef = useRef<HTMLInputElement>(null);
  const areaRef = useRef<HTMLTextAreaElement>(null);

  // Se guarda lo escrito aunque no se haya mandado. En la app nativa esto era
  // el bug de "cambio de pestaña y se borra todo"; acá también hace falta,
  // porque en el celular el navegador descarga pestañas viejas de memoria.
  useEffect(() => {
    try {
      localStorage.setItem(
        CLAVE_GUARDADO,
        JSON.stringify({ burbujas: burbujas.slice(-TOPE_BURBUJAS), borrador: texto }),
      );
    } catch {
      /* Sin espacio o bloqueado: no vale la pena molestar por esto. */
    }
  }, [burbujas, texto]);

  useEffect(() => {
    finRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [burbujas, pensando]);

  async function elegirArchivo(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0];
    e.target.value = ""; // permite volver a elegir la misma foto
    if (!archivo) return;
    setError(null);
    try {
      const { base64, mimeType } = await comprimirImagen(archivo);
      setImagen({ base64, mimeType, vistaPrevia: `data:${mimeType};base64,${base64}` });
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function enviar() {
    const mensaje = texto.trim();
    if ((!mensaje && !imagen) || pensando) return;

    const mia: Burbuja = {
      rol: "usuario",
      texto: mensaje,
      ...(imagen ? { vistaPrevia: imagen.vistaPrevia } : {}),
    };
    const historial = [...burbujas, mia];

    setBurbujas(historial);
    setTexto("");
    const adjunta = imagen;
    setImagen(null);
    setPensando(true);
    setError(null);

    // Se manda la conversación entera para que tenga contexto, pero las fotos
    // viejas NO: cada imagen son cientos de KB en base64 y la Edge Function
    // ya transcribió su texto en su momento. Reenviarlas todas haría que cada
    // mensaje pese más que el anterior hasta que deje de andar.
    const paraEnviar: MensajeChat[] = historial.map((b, i) => ({
      rol: b.rol,
      texto: b.texto,
      ...(i === historial.length - 1 && adjunta
        ? { imagenBase64: adjunta.base64, mimeType: adjunta.mimeType }
        : {}),
    }));

    try {
      const r = await chat(paraEnviar);
      setBurbujas((prev) => [...prev, { rol: "asistente", texto: r.respuesta }]);
    } catch (err) {
      setError((err as Error).message);
    }
    setPensando(false);
  }

  function alTeclear(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Enter manda, Shift+Enter hace salto de línea — como cualquier chat.
    // En el celular el teclado muestra "enviar" y esto lo respeta.
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void enviar();
    }
  }

  return (
    <div className="chat">
      <div className="burbujas">
        {burbujas.length === 0 && (
          <div className="vacio">
            <strong>Tirale una foto del ticket o escribile</strong>
            Lee la foto, busca las estadísticas, calcula y te dice si conviene al -130.
            <br />
            <br />
            Ejemplo: <em>&ldquo;Skubal 6.5 contra ARI, ¿conviene?&rdquo;</em>
          </div>
        )}

        {burbujas.map((b, i) => (
          <div key={i} className={`burbuja ${b.rol}`}>
            {b.rol === "asistente" ? <TextoRico texto={b.texto} /> : b.texto}
            {b.vistaPrevia && <img className="adjunta" src={b.vistaPrevia} alt="Foto que mandaste" />}
          </div>
        ))}

        {pensando && (
          <div className="burbuja asistente" style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span className="cargando" />
            <span className="suave">Leyendo y calculando…</span>
          </div>
        )}

        {error && (
          <div className="mensaje peligro" style={{ borderColor: "var(--peligro)" }}>
            {error}
          </div>
        )}

        <div ref={finRef} />
      </div>

      {imagen && (
        <div style={{ padding: "0 12px" }}>
          <div className="fila">
            <img className="adjunta" src={imagen.vistaPrevia} alt="Foto lista para mandar" />
            <button className="chip" onClick={() => setImagen(null)}>
              Quitar
            </button>
          </div>
        </div>
      )}

      <div className="escribir">
        {/* `capture="environment"` hace que en el celular abra la cámara
            trasera directo en vez de la galería. Es lo único que hacía falta
            para reemplazar expo-image-picker entero. */}
        <input
          ref={archivoRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={elegirArchivo}
          hidden
        />
        <button
          className="redondo"
          onClick={() => archivoRef.current?.click()}
          disabled={pensando}
          aria-label="Adjuntar una foto"
          title="Adjuntar una foto"
        >
          📷
        </button>

        <textarea
          ref={areaRef}
          value={texto}
          onChange={(e) => {
            setTexto(e.target.value);
            // Crece con el contenido hasta el tope del CSS.
            const el = e.target;
            el.style.height = "auto";
            el.style.height = `${el.scrollHeight}px`;
          }}
          onKeyDown={alTeclear}
          rows={1}
          placeholder="Escribile o mandale una foto…"
          aria-label="Mensaje"
        />

        <button
          className="redondo enviar"
          onClick={() => void enviar()}
          disabled={pensando || (!texto.trim() && !imagen)}
          aria-label="Enviar"
          title="Enviar"
        >
          {pensando ? <span className="cargando" /> : "➤"}
        </button>
      </div>
    </div>
  );
}
