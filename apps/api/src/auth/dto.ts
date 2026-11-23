import { z } from 'zod';

/** Mínimo 10 caracteres y nada de reglas raras de símbolos. */
export const contrasena = z
  .string()
  .min(10, 'al menos 10 caracteres')
  .max(200)
  .refine((v) => !/^(.)\1+$/.test(v), 'demasiado simple');

export const registroDto = z.object({
  email: z.string().email().max(254),
  password: contrasena,
  full_name: z.string().min(2).max(120),
  timezone: z.string().max(64).optional(),
  invitation_code: z.string().min(4).max(16).optional(),
});

export const accesoDto = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(200),
});

export const refrescoDto = z.object({
  refresh_token: z.string().min(10).max(500),
});

export const preferenciasDto = z.object({
  full_name: z.string().min(2).max(120).optional(),
  locale: z.string().max(10).optional(),
  timezone: z.string().max(64).optional(),
  units_weight: z.enum(['kg', 'lb']).optional(),
  units_distance: z.enum(['km', 'mi']).optional(),
});

export const invitacionDto = z.object({
  email: z.string().email().max(254).nullish(),
  athlete_name: z.string().min(2).max(120).nullish(),
});

export const aceptarInvitacionDto = z.object({
  code: z.string().min(4).max(16),
});

export type RegistroDto = z.infer<typeof registroDto>;
export type AccesoDto = z.infer<typeof accesoDto>;
export type RefrescoDto = z.infer<typeof refrescoDto>;
export type PreferenciasDto = z.infer<typeof preferenciasDto>;
export type InvitacionDto = z.infer<typeof invitacionDto>;
export type AceptarInvitacionDto = z.infer<typeof aceptarInvitacionDto>;
