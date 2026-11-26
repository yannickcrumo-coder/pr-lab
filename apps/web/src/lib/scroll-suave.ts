/**
 * Lenis conectado a ScrollTrigger, y apagado cuando se pide menos movimiento.
 *
 * Por qué hace falta conectarlos a mano: Lenis deja de usar el scroll nativo y
 * mueve el contenido él mismo. ScrollTrigger, que escucha el scroll nativo,
 * deja de enterarse y las animaciones se disparan en el lugar equivocado o se
 * quedan trabadas. Hay que decirle a ScrollTrigger que se actualice en cada
 * cuadro de Lenis, y mover Lenis con el reloj de GSAP para que los dos corran
 * en el mismo cuadro en lugar de pelearse por él.
 *
 * DÓNDE SÍ Y DÓNDE NO, en este proyecto:
 *
 *   Portada pública  → sí. Es una página que se lee de corrido y el scroll
 *                      suave es parte de que se sienta cuidada.
 *   Web del coach    → NO. Es una herramienta que se usa veinte veces al día,
 *                      con calendario y listas largas. Secuestrar el scroll
 *                      nativo ahí hace que la herramienta se sienta más lenta,
 *                      pelea con las teclas de página y con la rueda del ratón
 *                      en una columna con su propio desplazamiento, y rompe el
 *                      arrastre de una sesión de un día a otro.
 *   App del atleta   → NO. Es nativa y el scroll del sistema es sagrado en un
 *                      celular.
 */
import type Lenis from 'lenis';

type Gsap = typeof import('gsap')['gsap'];
type ScrollTriggerTipo = typeof import('gsap/ScrollTrigger')['ScrollTrigger'];

export interface ScrollSuave {
  lenis: Lenis | null;
  destruir: () => void;
}

const VACIO: ScrollSuave = { lenis: null, destruir: () => {} };

/**
 * Enciende el scroll suave y lo amarra a ScrollTrigger.
 * Devuelve siempre algo que se puede destruir, encendido o no, para que quien
 * lo llame no tenga que preguntar.
 */
export async function iniciarScrollSuave(opciones?: {
  reducido?: boolean;
}): Promise<ScrollSuave> {
  if (typeof window === 'undefined') return VACIO;

  // La preferencia del sistema manda, salvo que quien llama ya la resolvió.
  const reducido =
    opciones?.reducido ?? window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reducido) return VACIO;

  const [{ default: LenisCtor }, { gsap }, { ScrollTrigger }] = await Promise.all([
    import('lenis'),
    import('gsap'),
    import('gsap/ScrollTrigger'),
  ]);

  gsap.registerPlugin(ScrollTrigger);
  return amarrar(new LenisCtor({ duration: 1.05, smoothWheel: true }), gsap, ScrollTrigger);
}

function amarrar(lenis: Lenis, gsap: Gsap, ScrollTrigger: ScrollTriggerTipo): ScrollSuave {
  // 1 · Cada cuadro de Lenis, ScrollTrigger se entera.
  const alScroll = () => ScrollTrigger.update();
  lenis.on('scroll', alScroll);

  // 2 · Lenis avanza con el reloj de GSAP, no con su propio requestAnimationFrame.
  //     Dos relojes en paralelo producen un temblor de un cuadro.
  const avanzar = (tiempo: number) => lenis.raf(tiempo * 1000);
  gsap.ticker.add(avanzar);

  // 3 · Sin suavizado de retraso: ante un tirón, GSAP lo compensa de golpe y
  //     el scroll salta. Más vale perder un cuadro que dar un brinco.
  gsap.ticker.lagSmoothing(0);

  // 4 · ScrollTrigger le pregunta a Lenis por la posición, no al documento.
  ScrollTrigger.scrollerProxy(document.documentElement, {
    scrollTop(valor) {
      if (typeof valor === 'number') lenis.scrollTo(valor, { immediate: true });
      return lenis.scroll;
    },
    getBoundingClientRect: () => ({
      top: 0,
      left: 0,
      width: window.innerWidth,
      height: window.innerHeight,
    }),
  });
  ScrollTrigger.refresh();

  return {
    lenis,
    destruir() {
      lenis.off('scroll', alScroll);
      gsap.ticker.remove(avanzar);
      gsap.ticker.lagSmoothing(500, 33);
      lenis.destroy();
      ScrollTrigger.getAll().forEach((t) => t.kill());
      ScrollTrigger.refresh();
    },
  };
}
