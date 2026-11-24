import { z } from 'zod';
import { bloqueDto } from '../programacion/bloques.dto';

export const plantillaDto = z.object({
  name: z.string().min(2).max(160),
  discipline: z.string().max(40).nullish(),
  scope: z.enum(['dia', 'semana', 'ciclo']).optional(),
  description: z.string().max(2000).nullish(),
  blocks: z.array(bloqueDto).max(60).optional(),
});

export const listadoPlantillasDto = z.object({
  discipline: z.string().max(40).optional(),
  scope: z.enum(['dia', 'semana', 'ciclo']).optional(),
});

export type PlantillaDto = z.infer<typeof plantillaDto>;
export type ListadoPlantillasDto = z.infer<typeof listadoPlantillasDto>;
