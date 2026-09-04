// Validadores compartidos. Cada formulario valida con uno de estos esquemas
// antes de llamar al repositorio — nunca se inserta nada sin validar.
//
// Son los mismos de apps/mobile/lib/validators.ts, a propósito: el que decide
// si un dato es válido tiene que ser uno solo, o el día que difieran la app
// vieja y la nueva van a aceptar cosas distintas en la misma tabla.

import { z } from "zod";

export const pickNuevoSchema = z.object({
  fecha: z.string().min(1, "Falta la fecha"),
  codigo: z.string().nullable(),
  pitcher: z.string().min(1, "Falta el nombre del pitcher"),
  equipo: z.string().min(1, "Falta el equipo"),
  rival: z.string().min(1, "Falta el rival"),
  linea: z.number().nonnegative("La línea debe ser un número válido"),
  pick: z.enum(["OVER", "UNDER"]),
  confianza: z.number().min(0, "Confianza debe ser 0-100").max(1, "Confianza debe ser 0-100"),
  nivel: z.enum(["DIAMANTE_ALTO", "DIAMANTE", "ORO_ALTO", "ORO", "IMPUREZA"]),
  fuenteConfianza: z.enum(["CALCULADA", "JUICIO"]),
  motivo: z.string().nullable(),
});
export type PickNuevo = z.infer<typeof pickNuevoSchema>;

export const resultadoPickSchema = z.object({
  resultadoK: z.number().int("Los ponches deben ser un número entero").nonnegative("No puede ser negativo"),
});

export const salidaNuevaSchema = z.object({
  pitcher: z.string().min(1, "Falta el nombre del pitcher"),
  fecha: z.string().min(1, "Falta la fecha"),
  rival: z.string().min(1, "Falta el rival"),
  ip: z.number().nonnegative("Los innings deben ser un número válido (ej. 6.2 para 6 y 2/3)"),
  k: z.number().int("Los ponches deben ser un número entero").nonnegative("No puede ser negativo"),
  bb: z.number().int("Las bases por bolas deben ser un número entero").nonnegative("No puede ser negativo"),
  pitcheos: z
    .number()
    .int("Los lanzamientos deben ser un número entero")
    .nonnegative("No puede ser negativo")
    .nullable(),
});
export type SalidaNueva = z.infer<typeof salidaNuevaSchema>;

export const equipoTeamKSchema = z.object({
  equipo: z.string().min(1, "Falta el equipo"),
  ventana: z.enum(["TEMPORADA", "ULTIMOS_14"]),
  k: z.number().int().nonnegative("K debe ser un entero >= 0"),
  pa: z.number().int().positive("PA debe ser un entero > 0"),
  fechaCorte: z.string().min(1),
});
