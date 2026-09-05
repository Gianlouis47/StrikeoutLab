// Única implementación de Repositorio (StrikeoutLab es siempre-online).
// Ver la nota de diseño en repository.ts.

import { supabase } from "./supabase";
import type { ConsultaOpciones, FilaBase, Repositorio } from "./repository";

class SupabaseRepositorio implements Repositorio {
  async listar<T extends FilaBase>(tabla: string, opciones: ConsultaOpciones = {}): Promise<T[]> {
    let consulta = supabase.from(tabla).select(opciones.seleccionar ?? "*");

    if (opciones.filtro) {
      for (const [columna, valor] of Object.entries(opciones.filtro)) {
        consulta = consulta.eq(columna, valor as never);
      }
    }
    if (opciones.ordenarPor) {
      consulta = consulta.order(opciones.ordenarPor, { ascending: opciones.ascendente ?? true });
    }
    if (opciones.limite) {
      consulta = consulta.limit(opciones.limite);
    }

    const { data, error } = await consulta;
    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as T[];
  }

  async obtenerPorId<T extends FilaBase>(tabla: string, id: string): Promise<T | null> {
    const { data, error } = await supabase.from(tabla).select("*").eq("id", id).maybeSingle();
    if (error) throw new Error(error.message);
    return (data as T | null) ?? null;
  }

  async crear<T extends FilaBase>(tabla: string, datos: Record<string, unknown>): Promise<T> {
    const { data, error } = await supabase.from(tabla).insert(datos as never).select("*").single();
    if (error) throw new Error(error.message);
    return data as T;
  }

  async actualizar<T extends FilaBase>(tabla: string, id: string, cambios: Record<string, unknown>): Promise<T> {
    const { data, error } = await supabase
      .from(tabla)
      .update(cambios as never)
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return data as T;
  }

  async eliminar(tabla: string, id: string): Promise<void> {
    const { error } = await supabase.from(tabla).delete().eq("id", id);
    if (error) throw new Error(error.message);
  }

  async upsert<T extends FilaBase>(tabla: string, datos: Record<string, unknown>, conflicto: string): Promise<T> {
    const { data, error } = await supabase
      .from(tabla)
      .upsert(datos as never, { onConflict: conflicto })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return data as T;
  }

  async llamar<T>(funcion: string, argumentos: Record<string, unknown> = {}): Promise<T> {
    const { data, error } = await supabase.rpc(funcion, argumentos as never);
    if (error) throw new Error(error.message);
    return data as T;
  }
}

/** Instancia única para toda la app — las pantallas importan esto, nunca `supabase` directo. */
export const repositorio: Repositorio = new SupabaseRepositorio();
