-- 0004 — El video del ejercicio puede ser alojado o un enlace externo.
--
-- Por qué las dos formas, y para siempre, no como paso temporal:
--
--   video_media_id  video nuestro, en el almacén de objetos. Es el único que
--                   se puede guardar en el teléfono y servir sin señal, que es
--                   justo donde el atleta lo necesita.
--   video_url       enlace a internet (YouTube, Vimeo, el blog de alguien).
--                   Resuelve el arranque, cuando el coach todavía no graba, y
--                   se queda después para "encontré una buena demostración".
--                   NO funciona sin conexión y el cliente debe decirlo.
--
-- Los dos pueden ser nulos: un ejercicio con buenas indicaciones escritas no
-- necesita video. Si hay los dos, manda el alojado, porque sirve sin señal.
--
-- Términos de los proveedores (revisados el 24 de noviembre de 2026): las
-- políticas de YouTube prohíben cobrar por ver contenido en su reproductor
-- incrustado y prohíben guardar copias de su video. Por eso aquí solo vive la
-- dirección: el enlace se abre en la aplicación de YouTube o en el navegador
-- del sistema, nunca se incrusta dentro de una pantalla de pago ni se descarga
-- a nuestro almacén. Está anotado en docs/.

ALTER TABLE exercises
  ADD COLUMN video_url text;

-- Solo https: un enlace sin cifrar en una app de salud no pasa revisión de
-- tienda, y http:// en una WebView de iOS se bloquea de todos modos.
ALTER TABLE exercises
  ADD CONSTRAINT exercises_video_url_https
  CHECK (video_url IS NULL OR video_url ~ '^https://[^[:space:]]+$');

COMMENT ON COLUMN exercises.video_url IS
  'Enlace externo a la demostración. Se abre fuera de la app; no sirve sin conexión.';
COMMENT ON COLUMN exercises.video_media_id IS
  'Video nuestro en el almacén de objetos. Es el que se puede guardar para usar sin señal.';

-- Para que el cliente pueda pedir "ejercicios con alguna demostración" sin
-- recorrer la tabla entera.
CREATE INDEX exercises_con_video
  ON exercises (is_public, status)
  WHERE video_media_id IS NOT NULL OR video_url IS NOT NULL;
