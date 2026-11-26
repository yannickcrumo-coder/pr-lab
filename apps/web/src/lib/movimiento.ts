/**
 * Reducir movimiento. No es un extra: es la diferencia entre una web que se
 * siente cuidada y una que le provoca mareo a alguien con trastorno vestibular.
 *
 * Tres reglas en este proyecto:
 *
 *  1. La preferencia del sistema gana por omisión. Si el sistema operativo
 *     pide menos movimiento, no hay animación de entrada, ni paralaje, ni
 *     scroll suave. Nunca hay que pedirle a nadie que lo configure.
 *  2. El contenido NUNCA depende de la animación para verse. El CSS deja todo
 *     visible y la animación lo oculta para revelarlo; al revés, un error de
 *     script dejaría la página en blanco.
 *  3. Lo que se queda incluso con movimiento reducido: los cambios de estado
 *     que dan retroalimentación —un botón que responde al toque, un campo que
 *     marca error— con transiciones de 150 ms o menos. Quitar eso no ayuda a
 *     nadie; lo que molesta es el movimiento grande y no solicitado.
 */

export type Preferencia = 'reducido' | 'completo';

const CONSULTA = '(prefers-reduced-motion: reduce)';

/** Lo que el sistema pide ahora mismo. */
export function preferenciaDelSistema(): Preferencia {
  if (typeof window === 'undefined' || !window.matchMedia) return 'reducido';
  return window.matchMedia(CONSULTA).matches ? 'reducido' : 'completo';
}

/**
 * Avisa cuando la preferencia cambia en caliente: alguien puede prenderla en
 * mitad de la visita, y la página tiene que obedecer sin recargar.
 */
export function alCambiarPreferencia(fn: (p: Preferencia) => void): () => void {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {};
  const mq = window.matchMedia(CONSULTA);
  const manejar = () => fn(mq.matches ? 'reducido' : 'completo');
  mq.addEventListener('change', manejar);
  return () => mq.removeEventListener('change', manejar);
}

export const quiereMenosMovimiento = (): boolean =>
  preferenciaDelSistema() === 'reducido';
