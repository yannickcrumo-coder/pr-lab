# PR-LAB — contexto del proyecto

Plataforma de coaching tipo TrueCoach: **web para el coach** (programa, da
seguimiento, chatea) y **app móvil para el atleta** (ve su plan en solo lectura,
registra, ve su progreso, conecta su reloj).

Idioma del código y de la documentación: **español (es-MX)**. Nombres de
tablas, columnas y rutas en español cuando describen el dominio; los términos
técnicos quedan en inglés.

## Decisiones ya tomadas — no las revivas sin motivo

| Tema | Decisión |
| --- | --- |
| Cliente de la Versión 1 | Coaches independientes. Gimnasios en la Versión 3 |
| Cobro | Mensual al coach: cubre plataforma y 20 atletas; desde el 21, paquetes de 50. Se construye en la Versión 2 |
| Disciplinas | Fuerza, CrossFit, Hyrox, correr, ciclismo, triatlón |
| Varios coaches | Un atleta puede tener varios, y no se ven entre sí |
| IA | Pública (proveedor externo) en la Versión 2. En la Versión 1 solo queda el espacio, apagado por bandera |
| Idioma | Español en la Versión 1, inglés en la Versión 2. Nada de texto incrustado en imágenes |
| App del coach | Versión 2. En la Versión 1 el coach usa la web adaptada a celular |
| Reservas de clases | Versión 3, junto con gimnasios |
| Arquitectura | Monolito modular, un repositorio, tres procesos: `api`, `worker`, `chat` |
| Base de datos | PostgreSQL gestionado, **siempre separada** del servidor de aplicación |
| Multi-inquilino | Por fila, filtrando por la relación coach-atleta. Nunca una base por cliente |

## Las cinco reglas que no se rompen

1. **Asignar es copiar, no apuntar.** Una sesión guarda su propia copia de la
   prescripción. Editar la plantilla después no toca lo ya asignado.
2. **Todo registro del atleta lleva `client_uuid`** generado en su teléfono.
   Reenviar la cola tras un corte de red nunca duplica.
3. **La autorización se valida en el servidor, por relación activa.** Cada ruta
   nueva necesita su prueba de acceso indebido: un coach intentando leer al
   atleta de otro coach debe fallar.
4. **Nada se borra si cuelga histórico.** Se archiva.
5. **Los datos de Strava son solo del atleta.** El coach no los ve y la IA no
   los usa; lo exigen sus términos. Está en el modelo: `activities.visibility`
   y `ai_excluded`.

## Estructura

```
apps/api        NestJS — la API, el worker y el chat salen de aquí
apps/web        Next.js — la web del coach
apps/mobile     Expo — la app del atleta
packages/types  tipos y esquemas Zod compartidos
db/             migraciones SQL, catálogo semilla y pruebas
api/            contrato OpenAPI, fuente de los tipos del cliente
design/         tokens y prototipos navegables
docs/           dónde viven los documentos vivos
```

## Cómo trabajar aquí

- **Un módulo nunca consulta las tablas de otro.** Se hablan por su interfaz
  pública. Es lo que permite extraer uno a su propio servicio más adelante.
- **La API no guarda estado en memoria.** La sesión vive en el token y en
  Redis, para poder sumar instancias sin pensarlo.
- **Migraciones con expandir y contraer:** agregar, migrar datos, cambiar el
  código y solo en un despliegue posterior quitar lo viejo.
- **Un módulo no está terminado sin pruebas ejecutadas.** Si el entorno no
  permite correrlas, dilo y deja el comando exacto.
- **Unidades:** el servidor guarda kilogramos, metros y segundos. Convertir a
  libras o millas es del cliente.
- **Fechas:** la fecha de una sesión es la fecha local del atleta, guardada
  junto a su zona horaria. Los instantes van en UTC.

## Verificar antes de afirmar

Los accesos y términos de los proveedores de relojes cambian, y las políticas de
App Store y Google Play también. Antes de escribir código que dependa de uno,
busca su documentación vigente y anótala con fecha en `docs/`.

Estado verificado en noviembre de 2026: Garmin no acepta solicitudes nuevas;
COROS exige empresa registrada; Strava pide suscripción de desarrollador y
limita el uso de sus datos; Suunto es la ruta más abierta.
