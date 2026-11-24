import { z } from 'zod';

export const metrica = z.enum([
  'reps',
  'carga',
  'tiempo',
  'distancia',
  'calorias',
  'rondas',
  'altura',
  'rpe',
]);

/**
 * Un enlace de video tiene que ser https y de un proveedor que sepamos abrir.
 * No es paranoia: el campo se muestra al atleta, y aceptar cualquier cosa es
 * dejar que un coach pegue un `javascript:` o un enlace a un archivo que la
 * app intente reproducir y falle sin explicación.
 */
export const enlaceVideo = z
  .string()
  .url()
  .max(2048)
  .refine((v) => v.startsWith('https://'), 'solo https')
  .refine((v) => {
    try {
      const host = new URL(v).hostname.replace(/^www\./, '');
      return [
        'youtube.com',
        'm.youtube.com',
        'youtu.be',
        'vimeo.com',
        'player.vimeo.com',
        'drive.google.com',
        'instagram.com',
      ].includes(host);
    } catch {
      return false;
    }
  }, 'proveedor no reconocido');

const camposEjercicio = {
  name_es: z.string().min(2).max(120),
  metrics: z.array(metrica).min(1).max(8),
  disciplines: z.array(z.string().max(40)).max(10).optional(),
  pattern: z.string().max(40).optional(),
  primary_muscles: z.array(z.string().max(40)).max(10).optional(),
  equipment: z.array(z.string().max(40)).max(10).optional(),
  level: z.enum(['principiante', 'intermedio', 'avanzado']).optional(),
  cue_es: z.string().max(2000).optional(),
  video_media_id: z.string().uuid().optional(),
  video_url: enlaceVideo.optional(),
  unilateral: z.boolean().optional(),
  tracks_one_rep_max: z.boolean().optional(),
};

export const ejercicioDto = z.object({
  ...camposEjercicio,
  duplicate_of: z.string().uuid().optional(),
});

/** Al editar todo es opcional, pero algo tiene que venir. */
export const ejercicioParcheDto = z
  .object({
    ...camposEjercicio,
    name_es: camposEjercicio.name_es.optional(),
    metrics: camposEjercicio.metrics.optional(),
    cue_es: z.string().max(2000).nullish(),
    pattern: z.string().max(40).nullish(),
    video_media_id: z.string().uuid().nullish(),
    video_url: enlaceVideo.nullish(),
  })
  .refine((o) => Object.keys(o).length > 0, 'nada que cambiar');

export const busquedaDto = z.object({
  q: z.string().max(120).optional(),
  discipline: z.string().max(40).optional(),
  equipment: z.string().max(40).optional(),
  pattern: z.string().max(40).optional(),
  mine: z
    .union([z.boolean(), z.enum(['true', 'false'])])
    .transform((v) => v === true || v === 'true')
    .optional(),
  cursor: z.string().max(32).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export type EjercicioDto = z.infer<typeof ejercicioDto>;
export type EjercicioParcheDto = z.infer<typeof ejercicioParcheDto>;
export type BusquedaDto = z.infer<typeof busquedaDto>;
