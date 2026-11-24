/**
 * El esquema completo que recibe Drizzle: autenticación más catálogo.
 *
 * Vive aparte para que `catalogo.ts` pueda importar de `esquema.ts` sin que
 * `esquema.ts` importe de vuelta. Un ciclo aquí funcionaría por accidente
 * — las referencias entre tablas son perezosas — y se rompería el día que
 * alguien agregue algo que se evalúe al cargar el módulo.
 */
import { catalogo } from './catalogo';
import { esquema } from './esquema';

export const esquemaCompleto = { ...esquema, ...catalogo };
