import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Pool } from 'pg';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { migrar } from '../src/db/migrar';

export interface Contexto {
  app: INestApplication;
  pool: Pool;
  http: () => ReturnType<typeof request>;
}

/** Tablas que cada prueba deja limpias. El catálogo no se toca. */
const TABLAS = [
  'sesiones',
  'intentos_acceso',
  'invitations',
  'coach_athlete',
  'coach_profiles',
  'athlete_profiles',
  'audit_log',
  'users',
];

export async function levantar(): Promise<Contexto> {
  process.env.JWT_SECRET ??= 'secreto-de-pruebas-con-mas-de-32-caracteres';
  process.env.NODE_ENV = 'test';

  await migrar(process.env.DATABASE_URL);

  const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = modulo.createNestApplication();
  app.setGlobalPrefix('v1', { exclude: ['salud'] });
  await app.init();

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  return {
    app,
    pool,
    http: () => request(app.getHttpServer()),
  };
}

export async function limpiar(pool: Pool): Promise<void> {
  await pool.query(`TRUNCATE ${TABLAS.join(', ')} RESTART IDENTITY CASCADE`);
}

export async function apagar(ctx: Contexto): Promise<void> {
  await ctx.app.close();
  await ctx.pool.end();
}

let n = 0;
export const correoUnico = (prefijo = 'u'): string => `${prefijo}${++n}.${Date.now()}@prlab.test`;

export interface Cuenta {
  id: string;
  email: string;
  access: string;
  refresh: string;
}

/** Crea un coach con su cuenta lista para usar. */
export async function crearCoach(ctx: Contexto, nombre = 'Coach de prueba'): Promise<Cuenta> {
  const email = correoUnico('coach');
  const r = await ctx
    .http()
    .post('/v1/auth/register')
    .send({ email, password: 'contrasena-larga-123', full_name: nombre })
    .expect(201);
  return {
    id: r.body.user.id,
    email,
    access: r.body.access_token,
    refresh: r.body.refresh_token,
  };
}

/** Crea un atleta aceptando la invitación de un coach. */
export async function crearAtletaDe(
  ctx: Contexto,
  coach: Cuenta,
  nombre = 'Atleta de prueba',
): Promise<Cuenta> {
  const inv = await ctx
    .http()
    .post('/v1/invitations')
    .set('Authorization', `Bearer ${coach.access}`)
    .send({ athlete_name: nombre })
    .expect(201);

  const email = correoUnico('atleta');
  const r = await ctx
    .http()
    .post('/v1/auth/register')
    .send({
      email,
      password: 'contrasena-larga-123',
      full_name: nombre,
      invitation_code: inv.body.code,
    })
    .expect(201);

  return {
    id: r.body.user.id,
    email,
    access: r.body.access_token,
    refresh: r.body.refresh_token,
  };
}
