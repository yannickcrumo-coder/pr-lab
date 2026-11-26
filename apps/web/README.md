# apps/web — la web del coach y la portada

Next.js. Hoy solo está la configuración: la aplicación se construye en el
paso 3 del plan de ejecución.

## Instalar

Las dependencias ya están declaradas en `package.json`, pero **no están
instaladas**: el entorno donde se escribió esto no tiene salida a los
registros de paquetes. Desde la raíz del repositorio:

```bash
pnpm install          # o npm install, desde apps/web
```

Eso trae GSAP 3 con todos sus plugins —ScrollTrigger incluido— y Lenis.

## Las skills oficiales de GSAP

GreenSock publica skills de agente que enseñan a usar GSAP bien. Son MIT y
cubren el núcleo, las líneas de tiempo, ScrollTrigger, los plugins, React y
rendimiento:

```bash
npx skills add https://github.com/greensock/gsap-skills
```

En Claude Code hay además una ruta por el mercado de extensiones, que **se
corre en el cliente**, no desde aquí:

```
/plugin marketplace add greensock/gsap-skills
```

## React Bits

No se instala como dependencia: copia el código del componente a este
proyecto. Cada componente viene en cuatro sabores — JS o TS, CSS o Tailwind:

```bash
npx shadcn@latest add @react-bits/SplitText-TS-TW
# o
npx jsrepo@latest add https://reactbits.dev/r/SplitText-TS-TW
```

**Antes de copiar cualquiera, lee su licencia.** React Bits es MIT más Commons
Clause, no MIT a secas; el detalle y qué permite está en
`docs/proveedores-verificado.md`. Su catálogo de paga es aparte.

Para piezas de página completas, 21st.dev sirve igual: se copia el código, no
se instala.

## Las dos reglas de movimiento de este proyecto

**1 · El contenido nunca depende de la animación.** El CSS deja todo visible y
la animación oculta para revelar. Al revés, una falla de script o de red deja
la página en blanco. Es el error más común de este estilo de página y
`design/verifica-portada.js` lo comprueba.

**2 · Scroll suave solo en la portada.** `src/lib/scroll-suave.ts` explica por
qué: la web del coach es una herramienta que se usa veinte veces al día, con
calendario y listas largas, y secuestrar el scroll nativo ahí pelea con las
teclas de página, con las columnas que tienen su propio desplazamiento y con
el arrastre de una sesión de un día a otro.

Reducir movimiento se respeta en los dos casos, con la preferencia del sistema
por omisión: `src/lib/movimiento.ts`.

## Cómo verlo hoy

El prototipo navegable de la portada es `design/portada.html` y se abre solo en
cualquier navegador; trae GSAP y Lenis desde un CDN. Y
`node design/verifica-portada.js` comprueba las tres rutas sin navegador.
