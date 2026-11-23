import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { cargarEntorno } from './config/entorno';

async function arrancar(): Promise<void> {
  const env = cargarEntorno();
  const app = await NestFactory.create(AppModule, { bufferLogs: false });
  app.setGlobalPrefix('v1', { exclude: ['salud'] });
  app.enableShutdownHooks();
  await app.listen(env.PORT, '0.0.0.0');
  new Logger('PR-LAB').log(`API escuchando en el puerto ${env.PORT} (${env.NODE_ENV})`);
}

void arrancar();
