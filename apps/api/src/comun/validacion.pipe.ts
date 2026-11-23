/** Valida el cuerpo de la petición con Zod y devuelve errores por campo. */
import { ArgumentMetadata, Injectable, PipeTransform } from '@nestjs/common';
import { ZodSchema } from 'zod';
import { Errores } from './errores';

@Injectable()
export class ValidacionZod<T> implements PipeTransform<unknown, T> {
  constructor(private readonly esquema: ZodSchema<T>) {}

  transform(valor: unknown, _meta: ArgumentMetadata): T {
    const r = this.esquema.safeParse(valor);
    if (r.success) return r.data;
    throw Errores.noProcesable(
      r.error.issues.map((i) => ({
        field: i.path.join('.') || '(raíz)',
        code: i.code,
      })),
    );
  }
}
