# Proveedores externos: qué dicen hoy sus términos

Los accesos y términos cambian. `CLAUDE.md` exige buscar la documentación
vigente antes de escribir código que dependa de un proveedor y anotarla aquí
con fecha. Cada entrada dice **cuándo se revisó** y qué hay que volver a
revisar antes de depender de ella.

## Relojes y actividades

Revisado en **noviembre de 2026**:

| Proveedor | Estado | Consecuencia para nosotros |
| --- | --- | --- |
| Garmin | No acepta solicitudes nuevas | Fuera del alcance hasta que reabra |
| COROS | Exige empresa registrada | Depende de que la empresa quede constituida |
| Strava | Pide suscripción de desarrollador y limita el uso de sus datos | Sus datos son **solo del atleta**: `activities.visibility` y `ai_excluded` (regla 5) |
| Suunto | La ruta más abierta | Primer adaptador a construir |

## Video de demostración por enlace

Revisado el **24 de noviembre de 2026**, en las políticas de YouTube para
desarrolladores y en los Términos del servicio de YouTube.

Lo que encontramos, y por qué cambió el diseño:

1. **No se puede cobrar por ver contenido en el reproductor incrustado de
   YouTube.** Las políticas para desarrolladores lo dicen de forma literal bajo
   "User Experience". PR-LAB le cobra al coach una mensualidad por la
   plataforma, así que incrustar el reproductor dentro de la aplicación de paga
   queda en terreno dudoso. No es una lectura obvia —el atleta no paga nada y
   lo que el coach paga es la programación y el seguimiento, no el video— pero
   no es una apuesta que valga la pena.
2. **No se puede modificar ni bloquear el comportamiento normal del
   reproductor**, lo que incluye los videos relacionados que aparecen al
   terminar y la rueda de ajustes. O sea que no podemos evitar que al atleta le
   salgan recomendaciones de YouTube al acabar la demostración.
3. **No se puede guardar copia del video.** Descargarlo a nuestro almacén para
   servirlo sin conexión no es una opción.
4. **Los enlaces deben abrirse en la aplicación de YouTube** cuando está
   instalada en el dispositivo, y si no, en el navegador del sistema.

**Decisión que sale de esto:** el enlace externo se guarda y se **abre fuera de
la aplicación**, en la app de YouTube o el navegador del sistema. No se
incrusta un reproductor dentro de una pantalla de paga y no se descarga nada.
El punto 4 no es una limitación, es exactamente lo que vamos a hacer.

El video alojado por nosotros —el que el coach graba y sube— no tiene ninguna
de estas restricciones: se incrusta en línea, se guarda en el teléfono y sirve
sin señal. Esa sigue siendo la forma buena; el enlace es el arranque y el
"encontré una buena demostración por ahí".

**Qué volver a revisar** antes de incrustar cualquier reproductor externo
dentro de la app: las políticas para desarrolladores de YouTube, por si el
punto 1 se aclara, y los términos de Vimeo, que tiene planes de paga donde
incrustar en un producto comercial sí está contemplado.

## Tiendas

Pendiente de revisar: Apple App Store y Google Play. Hay que hacerlo antes de
preparar el envío, no antes. Lo que ya se sabe que pedirán: eliminación de
cuenta desde la app, etiquetas de privacidad, y declaración de datos de salud.
