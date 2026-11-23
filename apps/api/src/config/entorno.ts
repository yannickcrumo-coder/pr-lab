/**
 * Variables de entorno, validadas al arrancar.
 * Si falta una, la aplicación no levanta: mejor fallar en el despliegue que
 * a medias cuando alguien intente iniciar sesión.
 */
import { z } from 'zod';

const esquema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1, 'falta DATABASE_URL'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET debe tener al menos 32 caracteres'),
  JWT_ACCESS_TTL: z.coerce.number().int().positive().default(900),
  JWT_REFRESH_TTL: z.coerce.number().int().positive().default(2592000),
  INVITACION_TTL_DIAS: z.coerce.number().int().positive().default(30),
  MAX_INTENTOS_ACCESO: z.coerce.number().int().positive().default(10),
  VENTANA_INTENTOS_MIN: z.coerce.number().int().positive().default(15),
});

export type Entorno = z.infer<typeof esquema>;

export function cargarEntorno(fuente: NodeJS.ProcessEnv = process.env): Entorno {
  const r = esquema.safeParse(fuente);
  if (!r.success) {
    const detalle = r.error.issues
      .map((i) => `  ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Configuración inválida:\n${detalle}`);
  }
  return r.data;
}

export const ENTORNO = Symbol('ENTORNO');
