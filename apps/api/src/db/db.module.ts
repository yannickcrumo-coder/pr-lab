import { Global, Inject, Module, OnModuleDestroy } from '@nestjs/common';
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { cargarEntorno, ENTORNO, Entorno } from '../config/entorno';
import { esquemaCompleto } from './completo';

export const DB = Symbol('DB');
export type Db = NodePgDatabase<typeof esquemaCompleto>;
export const POOL = Symbol('POOL');

@Global()
@Module({
  providers: [
    { provide: ENTORNO, useFactory: (): Entorno => cargarEntorno() },
    {
      provide: POOL,
      inject: [ENTORNO],
      useFactory: (env: Entorno) =>
        new Pool({
          connectionString: env.DATABASE_URL,
          max: 10,
          idleTimeoutMillis: 30_000,
        }),
    },
    {
      provide: DB,
      inject: [POOL],
      useFactory: (pool: Pool): Db => drizzle(pool, { schema: esquemaCompleto }),
    },
  ],
  exports: [DB, POOL, ENTORNO],
})
export class DbModule implements OnModuleDestroy {
  constructor(@Inject(POOL) private readonly pool: Pool) {}

  /** Cierra el pool al apagar: sin esto las pruebas dejan conexiones abiertas. */
  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}
