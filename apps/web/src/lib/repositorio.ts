// Acceso a datos. Mismo contrato que apps/mobile/lib/repository.ts.
//
// Las pantallas nunca llaman a supabase.from() directo, solo a esto. Es el
// único archivo fuera de lib/supabase.ts autorizado a tocar el cliente.
//
// `llamar` es el importante: ahí vive el cálculo de verdad. La Poisson, el
// log5, la regresión a la media y la calibración están en Postgres, no acá.
// Es el MISMO código que usa la IA desde la Edge Function, así que la
// pantalla y el chat no se pueden contradecir. Reimplementarlo en TypeScript
// sería garantizar que algún día den números distintos para el mismo
// lanzador, y ahí el usuario no tiene forma de saber a cuál creerle.

import { supabase } from "./supabase";

export interface OpcionesConsulta {
  filtro?: Record<string, string | number | boolean | null>;
  ordenarPor?: string;
  ascendente?: boolean;
  limite?: number;
  seleccionar?: string;
}

export const repositorio = {
  async listar<T>(tabla: string, opciones: OpcionesConsulta = {}): Promise<T[]> {
    let consulta = supabase.from(tabla).select(opciones.seleccionar ?? "*");

    if (opciones.filtro) {
      for (const [columna, valor] of Object.entries(opciones.filtro)) {
        consulta = consulta.eq(columna, valor as never);
      }
    }
    if (opciones.ordenarPor) {
      consulta = consulta.order(opciones.ordenarPor, { ascending: opciones.ascendente ?? true });
    }
    if (opciones.limite) consulta = consulta.limit(opciones.limite);

    const { data, error } = await consulta;
    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as T[];
  },

  async crear<T>(tabla: string, datos: Record<string, unknown>): Promise<T> {
    const { data, error } = await supabase.from(tabla).insert(datos as never).select("*").single();
    if (error) throw new Error(error.message);
    return data as T;
  },

  async actualizar<T>(tabla: string, id: string, cambios: Record<string, unknown>): Promise<T> {
    const { data, error } = await supabase
      .from(tabla)
      .update(cambios as never)
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return data as T;
  },

  /** Llama a una función de Postgres (RPC). Ver la nota de arriba. */
  async llamar<T>(funcion: string, argumentos: Record<string, unknown> = {}): Promise<T> {
    const { data, error } = await supabase.rpc(funcion, argumentos as never);
    if (error) throw new Error(error.message);
    return data as T;
  },
};
