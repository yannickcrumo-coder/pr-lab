# PR-LAB

Plataforma de coaching deportivo. **Web para el coach**, que programa y da
seguimiento. **App móvil para el atleta**, que ve su plan, registra lo que hizo
y conecta su reloj.

Disciplinas: fuerza, CrossFit, Hyrox, correr, ciclismo y triatlón.

Estado: **diseño validado, base de datos lista, sin código de aplicación todavía.**

## Qué hay aquí hoy

| Carpeta | Contenido |
| --- | --- |
| `db/` | Esquema de PostgreSQL 16 (40 tablas), catálogo de 191 ejercicios y 13 pruebas |
| `api/` | Contrato OpenAPI: 37 rutas, 43 operaciones |
| `design/` | Tokens de diseño y dos prototipos navegables |
| `docs/` | Índice de los documentos vivos |
| `apps/`, `packages/` | Estructura del monorepo, todavía vacía |

`CLAUDE.md`, en la raíz, resume las decisiones tomadas y las reglas que no se
rompen. Léelo antes de escribir código.

## Arrancar en tu máquina

Necesitas Node 20 o superior, pnpm, Python 3.12 y PostgreSQL 16.

```bash
cp .env.example .env            # llena los valores; .env nunca se sube

# base de datos
createdb prlab
psql -d prlab -v ON_ERROR_STOP=1 -f db/migrations/0001_init.sql
psql -d prlab -v ON_ERROR_STOP=1 -f db/migrations/0002_seed_reference.sql
psql -d prlab -v ON_ERROR_STOP=1 -f db/tests/smoke.sql    # 13 pruebas

# contrato de API
pip install pyyaml
python3 api/validate.py
```

Si prefieres no instalar PostgreSQL:

```bash
docker run -d --name prlab-pg -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=prlab -p 5432:5432 postgres:16
```

## Ver los prototipos

`design/app-atleta.html` y `design/web-coach.html` se abren en cualquier
navegador, sin servidor y sin internet. Son de media fidelidad y con interacción
real: se puede registrar una serie, correr el cronómetro de descanso, arrastrar
una plantilla al calendario y escribir un White Board.

## Lo que sigue

1. Fundaciones de `apps/api`: autenticación, relaciones coach-atleta y sus
   pruebas de acceso indebido.
2. Biblioteca de ejercicios y Program Builder, punta a punta.
3. Registro sin conexión en `apps/mobile`, la parte delicada.

## Integración continua

Cada cambio corre, en GitHub Actions: las migraciones contra PostgreSQL 16 real,
las 13 pruebas del esquema, la reconstrucción del catálogo para confirmar que lo
versionado coincide con lo generado, la validación del contrato de API, y una
revisión de que no se haya subido ninguna credencial.
