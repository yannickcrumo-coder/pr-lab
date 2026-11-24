import { z } from 'zod';
import { bloqueDto } from '../programacion/bloques.dto';

/** Fecha local del atleta, sin hora: la hora la decide él al entrenar. */
const fechaLocal = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'formato AAAA-MM-DD')
  .refine((v) => !Number.isNaN(Date.parse(`${v}T00:00:00Z`)), 'fecha inexistente');

export const asignacionDto = z.object({
  athlete_id: z.string().uuid(),
  scheduled_date: fechaLocal,
  title: z.string().min(2).max(160),
  discipline: z.string().max(40).nullish(),
  cycle_id: z.string().uuid().nullish(),
  template_id: z.string().uuid().nullish(),
  blocks: z.array(bloqueDto).max(30).optional(),
});

export const asignacionParcheDto = z
  .object({
    title: z.string().min(2).max(160).optional(),
    discipline: z.string().max(40).nullish(),
    scheduled_date: fechaLocal.optional(),
    coach_note: z.string().max(2000).nullish(),
    blocks: z.array(bloqueDto).max(30).optional(),
  })
  .refine((o) => Object.keys(o).length > 0, 'nada que cambiar');

export const loteDto = z.object({
  assignment_ids: z.array(z.string().uuid()).min(1).max(200),
});

export const rangoDto = z.object({
  from: fechaLocal,
  to: fechaLocal,
}).refine((r) => r.from <= r.to, 'el rango está invertido');

export type AsignacionDto = z.infer<typeof asignacionDto>;
export type AsignacionParcheDto = z.infer<typeof asignacionParcheDto>;
export type LoteDto = z.infer<typeof loteDto>;
export type RangoDto = z.infer<typeof rangoDto>;
