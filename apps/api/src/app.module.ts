import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { AccesoModule } from './acceso/acceso.module';
import { AuthGuard } from './auth/auth.guard';
import { AuthModule } from './auth/auth.module';
import { FiltroDeErrores } from './comun/errores';
import { DbModule } from './db/db.module';
import { EjerciciosModule } from './ejercicios/ejercicios.module';
import { InvitacionesModule } from './invitaciones/invitaciones.module';
import { RelacionesModule } from './relaciones/relaciones.module';
import { SaludController } from './salud.controller';

@Module({
  imports: [
    DbModule,
    AccesoModule,
    AuthModule,
    InvitacionesModule,
    RelacionesModule,
    EjerciciosModule,
  ],
  controllers: [SaludController],
  providers: [
    { provide: APP_FILTER, useClass: FiltroDeErrores },
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
})
export class AppModule {}
