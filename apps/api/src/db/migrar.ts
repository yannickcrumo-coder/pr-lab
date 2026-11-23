/**
 * Corredor de migraciones.
 *
 * Aplica en orden los .sql de db/migrations que todavía no se hayan aplicado,
 * cada uno dentro de su propia transacción, y registra su huella. Si el
 * contenido de una migración ya aplicada cambió, aborta: significa que alguien
 * editó historia en vez de agregar una migración nueva.
 */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from 'pg';

const CARPETA = join(__dirname, '..', '..', '..', '..', 'db', 'migrations');

function huella(texto: string): string {
  return createHash('sha256').update(texto).digest('hex');
}

export async function migrar(urlBase = process.env.DATABASE_URL): Promise<string[]> {
  if (!urlBase) throw new Error('falta DATABASE_URL');
  const cliente = new Client({ connectionString: urlBase });
  await cliente.connect();
  const aplicadas: string[] = [];

  try {
    await cliente.query(`
      CREATE TABLE IF NOT EXISTS migraciones_aplicadas (
        nombre      text PRIMARY KEY,
        huella      text NOT NULL,
        aplicada_en timestamptz NOT NULL DEFAULT now()
      )`);

    const previas = new Map<string, string>(
      (await cliente.query<{ nombre: string; huella: string }>(
        'SELECT nombre, huella FROM migraciones_aplicadas',
      )).rows.map((r) => [r.nombre, r.huella]),
    );

    const archivos = readdirSync(CARPETA).filter((f) => f.endsWith('.sql')).sort();

    for (const nombre of archivos) {
      const sql = readFileSync(join(CARPETA, nombre), 'utf8');
      const h = huella(sql);
      const previa = previas.get(nombre);

      if (previa) {
        if (previa !== h) {
          throw new Error(
            `La migración ${nombre} ya se aplicó pero su contenido cambió. ` +
              'No edites migraciones aplicadas: agrega una nueva.',
          );
        }
        continue;
      }

      await cliente.query('BEGIN');
      try {
        await cliente.query(sql);
        await cliente.query(
          'INSERT INTO migraciones_aplicadas (nombre, huella) VALUES ($1, $2)',
          [nombre, h],
        );
        await cliente.query('COMMIT');
        aplicadas.push(nombre);
      } catch (e) {
        await cliente.query('ROLLBACK');
        throw new Error(`Falló la migración ${nombre}: ${(e as Error).message}`);
      }
    }
  } finally {
    await cliente.end();
  }

  return aplicadas;
}

if (require.main === module) {
  migrar()
    .then((n) => {
      console.log(n.length ? `Aplicadas: ${n.join(', ')}` : 'Nada que aplicar.');
      process.exit(0);
    })
    .catch((e) => {
      console.error(e.message);
      process.exit(1);
    });
}
