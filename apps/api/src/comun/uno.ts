/**
 * Toma la primera fila de un resultado que por construcción trae una.
 *
 * `noUncheckedIndexedAccess` obliga a comprobarlo, y está bien que obligue:
 * si un INSERT ... RETURNING no devolviera nada, queremos enterarnos aquí y
 * no tres líneas después con un error confuso.
 */
export function primeraFila<T>(filas: T[], contexto = 'la consulta'): T {
  const fila = filas[0];
  if (fila === undefined) {
    throw new Error(`${contexto} no devolvió ninguna fila`);
  }
  return fila;
}
