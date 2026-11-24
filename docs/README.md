# Documentos del proyecto

Los documentos vivos están en claude.ai y son la fuente de verdad. Se editan y
comentan ahí; aquí solo queda el índice para no duplicar y que no se desincronicen.

| Documento | Qué contiene |
| --- | --- |
| PRD – APP-FitnessControl | Alcance, requisitos por módulo, esfuerzo, presupuesto y roadmap |
| Arquitectura de PR-LAB | Qué corre dónde, capacidad y cuándo separar cada pieza |
| Diseño PR-LAB | Flujos críticos y arquitectura de información de las dos superficies |
| Guión de prueba con coaches y atletas | Cómo validar los prototipos antes de programarlos |

Las decisiones ya tomadas están resumidas en `CLAUDE.md`, en la raíz. Si una
decisión cambia, se actualiza ahí además de en el documento.

## Lo que sí vive en el repositorio

- `db/README.md` — las diez decisiones del esquema y lo que falta.
- `api/openapi.yaml` — el contrato, fuente de los tipos del cliente.
- `design/` — tokens y prototipos navegables, que se abren en cualquier navegador.
- `docs/proveedores-verificado.md` — qué dicen hoy los términos de cada proveedor
  externo, con la fecha en que se revisó.

## Pendiente de verificar

Los accesos de los proveedores de relojes y las políticas de las tiendas cambian.
Cuando se confirme alguno, anótalo aquí con la fecha y el enlace.

| Proveedor | Estado (nov 2026) | Confirmado el |
| --- | --- | --- |
| Suunto | Cloud API gratuita para empresas socias; la ruta más abierta | — |
| COROS | Partner API; exige empresa registrada y base de usuarios | — |
| Strava | Requiere suscripción de desarrollador; sus datos son solo del atleta | — |
| Garmin | No acepta solicitudes nuevas desde la primavera de 2026 | — |
