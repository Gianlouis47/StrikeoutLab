// Las piezas que se repiten en todas las pantallas.
//
// La app nativa tenía components/ui.tsx con objetos de estilo de React
// Native. Acá el estilo vive en estilos.css y estos componentes son solo el
// marcado: existen para que un mensaje de error se escriba igual en las seis
// pantallas, no para envolver al CSS.

import type { ReactNode } from "react";

type Tono = "acento" | "exito" | "peligro" | "advertencia" | "neutral";

const BORDE: Record<Tono, string> = {
  acento: "color-mix(in srgb, var(--acento) 40%, transparent)",
  exito: "color-mix(in srgb, var(--exito) 40%, transparent)",
  peligro: "color-mix(in srgb, var(--peligro) 40%, transparent)",
  advertencia: "color-mix(in srgb, var(--advertencia) 40%, transparent)",
  neutral: "var(--borde)",
};

const CLASE: Record<Tono, string> = {
  acento: "acento",
  exito: "exito",
  peligro: "peligro",
  advertencia: "advertencia",
  neutral: "suave",
};

/** Encabezado de pantalla: el nombre y para qué sirve, en una línea cada uno. */
export function Encabezado({ titulo, bajada }: { titulo: string; bajada?: string }) {
  return (
    <div>
      <h1 className="titulo">{titulo}</h1>
      {bajada && <p className="subtitulo">{bajada}</p>}
    </div>
  );
}

export function Seccion({ children }: { children: ReactNode }) {
  return <h2 className="seccion">{children}</h2>;
}

/**
 * Un aviso. `aria-live` en los de error para que un lector de pantalla lo
 * anuncie: aparecen después de tocar un botón, y sin eso el usuario ciego se
 * queda esperando algo que ya pasó.
 */
export function Mensaje({ tono, children }: { tono: Tono; children: ReactNode }) {
  return (
    <div
      className={`mensaje ${CLASE[tono]}`}
      style={{ borderColor: BORDE[tono] }}
      aria-live={tono === "peligro" ? "assertive" : undefined}
    >
      {children}
    </div>
  );
}

export function Insignia({ tono = "neutral", children }: { tono?: Tono; children: ReactNode }) {
  return (
    <span className={`insignia ${CLASE[tono]}`} style={{ borderColor: BORDE[tono] }}>
      {children}
    </span>
  );
}

export function Metrica({ valor, etiqueta, tono = "neutral" }: { valor: string; etiqueta: string; tono?: Tono }) {
  return (
    <div className="metrica">
      <div className={`valor ${tono === "neutral" ? "" : CLASE[tono]}`}>{valor}</div>
      <div className="etiqueta">{etiqueta}</div>
    </div>
  );
}

/** Barra de proporción. Se recorta a 0-1 para que un dato raro no la desborde. */
export function Barra({ proporcion, tono = "acento" }: { proporcion: number; tono?: Tono }) {
  const ancho = Math.max(0, Math.min(1, Number.isFinite(proporcion) ? proporcion : 0));
  return (
    <div className={`progreso ${CLASE[tono]}`}>
      <i style={{ width: `${ancho * 100}%` }} />
    </div>
  );
}

/**
 * Qué hacer cuando no hay nada. Una lista vacía sin explicación se lee como
 * un error de la app; con una frase se lee como el estado que es.
 */
export function Vacio({
  titulo,
  descripcion,
  accion,
}: {
  titulo: string;
  descripcion: string;
  accion?: { texto: string; alTocar: () => void };
}) {
  return (
    <div className="vacio">
      <strong>{titulo}</strong>
      {descripcion}
      {accion && (
        <div style={{ marginTop: 14 }}>
          <button className="boton secundario" onClick={accion.alTocar}>
            {accion.texto}
          </button>
        </div>
      )}
    </div>
  );
}

/** Campo de texto con su etiqueta atada por id, no por proximidad visual. */
export function Campo({
  id,
  etiqueta,
  valor,
  alCambiar,
  ...resto
}: {
  id: string;
  etiqueta: string;
  valor: string;
  alCambiar: (v: string) => void;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "id" | "value" | "onChange">) {
  return (
    <div className="campo">
      <label htmlFor={id}>{etiqueta}</label>
      <input id={id} value={valor} onChange={(e) => alCambiar(e.target.value)} {...resto} />
    </div>
  );
}

/** Botón principal. Muestra la ruedita en su lugar y se bloquea mientras carga. */
export function Boton({
  children,
  alTocar,
  cargando = false,
  secundario = false,
  deshabilitado = false,
  tipo = "button",
}: {
  children: ReactNode;
  alTocar?: () => void;
  cargando?: boolean;
  secundario?: boolean;
  deshabilitado?: boolean;
  tipo?: "button" | "submit";
}) {
  return (
    <button
      type={tipo}
      className={`boton ${secundario ? "secundario" : ""}`}
      onClick={alTocar}
      disabled={cargando || deshabilitado}
    >
      {cargando ? <span className="cargando" /> : children}
    </button>
  );
}

/** 0.6190 -> "61.9%". Null se muestra como raya, no como "0%": son cosas distintas. */
export function pct(v: number | null | undefined, decimales = 1): string {
  if (v === null || v === undefined) return "—";
  const n = Number(v);
  const texto = (n * 100).toFixed(decimales);
  // Algo que pasa 1 de cada 600 veces no es "0%". El redondeo a cero convierte
  // un riesgo chico en ninguno, que es justo la clase de mentira cómoda que
  // esta app existe para no decir.
  if (n > 0 && parseFloat(texto) === 0) return `<${Math.pow(10, -decimales).toFixed(decimales)}%`;
  return `${texto}%`;
}

export function num(v: number | null | undefined, decimales = 2): string {
  if (v === null || v === undefined) return "—";
  return Number(v).toFixed(decimales);
}

/** "2026-08-27" -> "27 ago". La fecha entera no aporta dentro de una lista. */
export function fechaCorta(iso: string): string {
  const meses = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  const [, mes, dia] = iso.split("-");
  // Una fecha con otra forma ("hoy", "27/08", vacía) se devuelve tal cual en
  // vez de reventar: es texto que vino de la base, no una constante nuestra.
  if (mes === undefined || dia === undefined) return iso;
  const m = meses[parseInt(mes, 10) - 1];
  return m ? `${parseInt(dia, 10)} ${m}` : iso;
}
