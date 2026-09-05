// Interfaz de acceso a datos — patrón "Repositorio" de
// app-movil-base/_core/lib/data/repository.ts (gianlouis47/app-movil-base):
// las pantallas nunca llaman a supabase.from() directo, solo a este
// contrato. supabase-repository.ts es el único archivo fuera de
// lib/supabase.ts autorizado a importar "@supabase/supabase-js".
//
// A diferencia de la plantilla, StrikeoutLab no tiene modo offline-first
// (es una app personal, siempre conectada) — se omiten `modo` y los
// métodos de sincronización a propósito, para no cargar superficie sin
// usar (Sección 5 de la Guía Técnica Definitiva: "no optimizar
// prematuramente").

export type Filtro = Record<string, string | number | boolean | null>;

export interface ConsultaOpciones {
  filtro?: Filtro;
  ordenarPor?: string;
  ascendente?: boolean;
  limite?: number;
  /** Columnas a seleccionar, sintaxis de supabase-js (ej. 'id, nombre'). */
  seleccionar?: string;
}

export interface FilaBase {
  id: string;
}

export interface Repositorio {
  listar<T extends FilaBase>(tabla: string, opciones?: ConsultaOpciones): Promise<T[]>;
  obtenerPorId<T extends FilaBase>(tabla: string, id: string): Promise<T | null>;
  crear<T extends FilaBase>(tabla: string, datos: Record<string, unknown>): Promise<T>;
  actualizar<T extends FilaBase>(tabla: string, id: string, cambios: Record<string, unknown>): Promise<T>;
  eliminar(tabla: string, id: string): Promise<void>;
  /** Extensión propia de StrikeoutLab (no está en la plantilla): inserta o
   * reemplaza por una restricción unique que no es `id` (ej. team_k
   * equipo+ventana+fecha_corte). `conflicto` es la lista de columnas de esa
   * restricción, sintaxis de supabase-js `onConflict`. */
  upsert<T extends FilaBase>(tabla: string, datos: Record<string, unknown>, conflicto: string): Promise<T>;

  /**
   * Llama a una función de la base (RPC).
   *
   * Acá vive el cálculo de verdad — la Poisson, el log5, la regresión a la
   * media, la calibración. Está en Postgres y no en el teléfono a propósito:
   * es el mismo código que usa la IA desde la Edge Function, así que la
   * pantalla y el chat no pueden darle números distintos al mismo lanzador.
   * Duplicarlo en TypeScript sería garantizar que algún día se contradigan.
   */
  llamar<T>(funcion: string, argumentos?: Record<string, unknown>): Promise<T>;
}
