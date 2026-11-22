# PR-LAB · base de datos y contrato de API

Esquema de PostgreSQL 16 y contrato OpenAPI de la Versión 1.

```
migrations/0001_init.sql            40 tablas, 85 índices
migrations/0002_seed_reference.sql  catálogo: 191 ejercicios y vocabularios
build/make_seed_sql.py              genera el seed desde pr-lab-seed/data
tests/smoke.sql                     13 pruebas de las reglas críticas
api/openapi.yaml                    37 rutas, 43 operaciones, 19 esquemas
```

## Cómo correrlo

```bash
createdb prlab
psql -d prlab -v ON_ERROR_STOP=1 -f migrations/0001_init.sql
psql -d prlab -v ON_ERROR_STOP=1 -f migrations/0002_seed_reference.sql
psql -d prlab -v ON_ERROR_STOP=1 -f tests/smoke.sql     # 13 pruebas
```

Probado contra PostgreSQL 16.15. Las tres órdenes corren sin error y las 13
pruebas pasan.

## Las diez decisiones que definen el esquema

### 1. La relación coach-atleta es el eje de todo

`coach_athlete` no es una tabla de apoyo: es de donde cuelga la autorización
entera. Cada asignación, hilo de chat y permiso de compartir pertenece a una
relación, no a un atleta.

Por eso un atleta puede tener varios coaches sin que ninguno vea lo del otro,
y por eso el conteo de atletas activos de un coach (la base del cobro) sale de
una sola consulta.

### 2. Asignar es copiar, no referenciar

Una asignación guarda sus propios `assignment_blocks` y `assignment_items`,
copiados de la plantilla al momento de asignar. Editar la plantilla después no
toca nada de lo ya asignado.

Es la decisión que más consultas ahorra y la que evita el peor error posible:
que a un atleta le cambie el entrenamiento que ya empezó. La prueba 5 lo
verifica.

### 3. Los ejercicios del coach viven en la misma tabla que el catálogo

Un ejercicio del catálogo tiene `is_public = true` y sin dueño; uno del coach
tiene `is_public = false` y su `owner_coach_id`. Un `CHECK` impide las
combinaciones imposibles, y dos índices únicos parciales permiten que un coach
tenga su propia "sentadilla trasera" sin chocar con la del catálogo.

Separarlos en dos tablas habría duplicado cada consulta de búsqueda,
prescripción e historial.

### 4. Nada se borra si cuelga histórico

Un ejercicio que ya se usó pasa a `status = 'archivado'`: desaparece del
buscador y el historial del atleta sigue resolviendo. Lo mismo con relaciones
y asignaciones. La prueba 13 lo verifica.

### 5. Idempotencia por `client_uuid`

Todo lo que el atleta registra lleva un identificador generado en su teléfono.
Es único por entrenamiento, así que reenviar la cola después de un corte de red
no puede duplicar una serie. La prueba 6 lo verifica.

### 6. Un cursor global para la sincronización

Una sola secuencia, `sync_seq_global`, alimenta la columna `sync_seq` de todas
las tablas que el dispositivo sincroniza. Un disparador la sube en cada
actualización.

Así `GET /sync/pull?since=N` es una consulta por índice, sin depender de relojes
que pueden ir desfasados entre el teléfono y el servidor.

### 7. La fecha de la sesión es local, los instantes son UTC

`scheduled_date` es un `date` en la zona del atleta, guardada junto a
`athlete_timezone`. `started_at` y `completed_at` son `timestamptz`.

Si no se separan, un atleta que viaja ve su lunes convertido en domingo.

### 8. Un `set_log` sirve para todo

Una serie de fuerza, un tramo de Hyrox y un intervalo de carrera son la misma
fila con columnas distintas llenas. Lo que cambia es qué pide la interfaz, y eso
lo decide `exercises.metrics`.

Lo que no se registra serie por serie (un White Board, un AMRAP, una simulación
completa) va a `block_logs`, con sus parciales en `splits`.

### 9. El White Board es un tipo de bloque, no una excepción

`block_types.kind` distingue `ejercicios` de `texto`. Un bloque de texto guarda
`body_text` y no tiene ítems. Una sesión puede ser solo White Boards, solo
bloques estructurados, o mezcla. La prueba 4 lo verifica.

### 10. La visibilidad de los datos de reloj está en el modelo

`activities.visibility` y `activities.ai_excluded` existen porque los términos
de Strava no permiten mostrar esos datos al coach ni usarlos en IA. La vista
`coach_visible_activities` aplica la regla de una vez: relación activa, más
consentimiento del atleta para esa fuente y ese coach, más visibilidad
compartible. La prueba 10 lo verifica.

## Multi-inquilino: por fila, no por base

Una sola base y un solo esquema. El aislamiento vive en la aplicación, que
filtra por la relación activa en cada consulta.

Una base por coach parece más segura pero multiplica migraciones y respaldos por
cada cliente nuevo, y hace imposible cualquier consulta agregada. La barrera real
contra que un coach vea datos de otro son los permisos del servidor y las
pruebas de acceso indebido, que son obligatorias por cada ruta nueva.

`0003_rls.sql` queda pendiente como segunda barrera opcional, con políticas a
nivel de fila.

## Arreglos contra tablas de unión

`disciplines`, `equipment`, `primary_muscles` y `metrics` son `text[]` con
índices GIN, no tablas de unión. Es más simple y las búsquedas por equipo o
músculo son rápidas.

El costo es que un arreglo no admite llave foránea, así que un disparador
(`validate_exercise_vocab`) valida contra los catálogos al insertar. La prueba 9
confirma que una disciplina inventada se rechaza.

## Qué falta

- **`0003_rls.sql`**, las políticas de seguridad a nivel de fila.
- **Particionar `set_logs`** por `completed_at`. No antes de unos 50 millones de
  filas, que con el uso previsto llega cerca del segundo año.
- **Recalcular `compliance_weekly`** desde un trabajo en cola, al terminar un
  entrenamiento y al publicar una sesión.
- **Detección de récords**: la lógica vive en la aplicación, al cerrar el
  entrenamiento.
- **Herramienta de migraciones.** Hoy son archivos SQL numerados. Al armar el
  repositorio hay que elegir entre Drizzle y Prisma y dejarlo asentado.
- **Cifrado de los tokens de proveedor.** Las columnas son `bytea`; el cifrado
  se hace en la aplicación con una llave del gestor de secretos, nunca en la
  base.

## Nota sobre el contrato

`api/openapi.yaml` describe la Versión 1 completa salvo cobros e IA, que son de
la Versión 2. Está validado: todas las referencias resuelven y cada operación
tiene resumen y respuestas.

Al armar el repositorio, de este archivo se genera el cliente de TypeScript para
la app y la web, para que no haya tipos escritos a mano en tres lugares.
