/**
 * Las etiquetas de un bloque y de sus ejercicios: A, B, C y A1, A2, A3.
 *
 * Se CALCULAN de la posición, nunca se guardan. Es la decisión que importa
 * aquí: el coach sube y baja bloques arrastrándolos, y una letra guardada en
 * la base se desincroniza en el primer reordenamiento. Guardada habría que
 * reescribir todas las filas en cada movimiento, y bastaría una escritura
 * perdida para que la sesión tuviera dos bloques B.
 *
 * Calculada no puede estar mal: la posición ya es la fuente de verdad del
 * orden, y la letra es solo su forma legible.
 *
 * Más allá de la Z sigue AA, AB, AC. Una sesión con 27 bloques no existe en la
 * práctica, pero una etiqueta vacía o repetida sí rompería la pantalla.
 */
export function letraDeBloque(indice: number): string {
  if (!Number.isInteger(indice) || indice < 0) return '?';
  let n = indice;
  let letra = '';
  do {
    letra = String.fromCharCode(65 + (n % 26)) + letra;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return letra;
}

/** La etiqueta de un ejercicio dentro de su bloque: A1, A2, B1. */
export function etiquetaDeItem(indiceBloque: number, indiceItem: number): string {
  return `${letraDeBloque(indiceBloque)}${indiceItem + 1}`;
}
