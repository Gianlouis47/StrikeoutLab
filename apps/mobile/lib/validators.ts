// Validadores compartidos (patrón lib/validators/ de app-movil-base). Cada
// formulario valida con uno de estos esquemas antes de llamar al
// repositorio — nunca inserta datos sin validar.
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
  nivel: z.enum(["DIAMANTE", "ORO_ALTO", "ORO", "IMPUREZA"]),
  fuenteConfianza: z.enum(["CALCULADA", "JUICIO"]),
  motivo: z.string().nullable(),
});
export type PickNuevo = z.infer<typeof pickNuevoSchema>;

export const resultadoPickSchema = z.object({
  resultadoK: z.number().int("Los ponches deben ser un número entero").nonnegative("No puede ser negativo"),
});

export const equipoTeamKSchema = z.object({
  equipo: z.string().min(1, "Falta el equipo"),
  ventana: z.enum(["TEMPORADA", "ULTIMOS_14"]),
  k: z.number().int().nonnegative("K debe ser un entero >= 0"),
  pa: z.number().int().positive("PA debe ser un entero > 0"),
  fechaCorte: z.string().min(1),
});

export const confianzaParlaySchema = z
  .number({ error: "Confianza inválida" })
  .min(0, "Confianza debe ser 0-100")
  .max(1, "Confianza debe ser 0-100");
