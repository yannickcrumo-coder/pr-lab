import { z } from 'zod';

/**
 * La prescripción es `jsonb` a propósito: una serie de fuerza, un AMRAP y un
 * bloque de intervalos no comparten campos. Aquí se valida la forma de lo que
 * sí conocemos y se deja pasar el resto, en lugar de rechazar un campo nuevo
 * que la web del coach todavía no sabe que existe.
 *
 * Unidades: el servidor guarda kilogramos, metros y segundos. Si llega
 * `carga_lb` o `distancia_mi` es error del cliente, no algo que convertir
 * aquí — convertir en dos lugares es cómo se pierden los datos.
 */
export const prescripcion = z
  .object({
    series: z.number().int().min(1).max(99).optional(),
    reps: z.number().int().min(1).max(999).optional(),
    reps_min: z.number().int().min(1).max(999).optional(),
    reps_max: z.number().int().min(1).max(999).optional(),
    carga_kg: z.number().min(0).max(1000).optional(),
    porcentaje_1rm: z.number().min(1).max(200).optional(),
    rpe: z.number().min(1).max(10).optional(),
    rir: z.number().int().min(0).max(10).optional(),
    tiempo_s: z.number().int().min(1).max(86_400).optional(),
    distancia_m: z.number().min(1).max(500_000).optional(),
    calorias: z.number().int().min(1).max(10_000).optional(),
    rondas: z.number().int().min(1).max(99).optional(),
    altura_cm: z.number().min(1).max(300).optional(),
    tempo: z
      .string()
      .regex(/^[0-9x]{3,4}$/i, 'formato de tempo, por ejemplo 30x1')
      .optional(),
    descanso_s: z.number().int().min(0).max(3600).optional(),
    cada_s: z.number().int().min(1).max(3600).optional(),
    texto: z.string().max(500).optional(),
  })
  .passthrough()
  .refine(
    (p) => p.reps_min === undefined || p.reps_max === undefined || p.reps_min <= p.reps_max,
    'el rango de repeticiones está invertido',
  );

export const itemBloqueDto = z.object({
  position: z.number().int().min(0).max(199),
  exercise_id: z.string().uuid(),
  prescription: prescripcion.optional(),
  notes: z.string().max(1000).nullish(),
  superset_key: z.string().max(16).nullish(),
});

export const bloqueDto = z.object({
  position: z.number().int().min(0).max(99),
  block_type: z.string().min(2).max(40),
  title: z.string().max(160).nullish(),
  /** Solo para `white_board`. El atleta lo ve tal cual. */
  body_text: z.string().max(10_000).nullish(),
  wod_format: z.string().max(40).nullish(),
  config: z.record(z.unknown()).optional(),
  items: z.array(itemBloqueDto).max(60).optional(),
  /** Para plantillas de semana o ciclo: 0 = primer día. */
  day_offset: z.number().int().min(0).max(365).optional(),
});

export type ItemBloqueDto = z.infer<typeof itemBloqueDto>;
export type BloqueDto = z.infer<typeof bloqueDto>;
