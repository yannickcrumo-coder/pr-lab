import { Controller, Get, Inject } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { Publica } from './comun/decoradores';
import { DB, Db } from './db/db.module';

@Controller()
export class SaludController {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** Lo que consulta el balanceador para saber si esta instancia sirve. */
  @Publica()
  @Get('salud')
  async salud() {
    await this.db.execute(sql`select 1`);
    return { estado: 'ok', hora: new Date().toISOString() };
  }
}
