/**
 * Pruebas del paso 2: biblioteca, plantillas y asignaciones.
 *
 * La prueba que más importa de todo el archivo es la primera: **editar la
 * plantilla no toca lo ya asignado**. Es la regla 1 de CLAUDE.md, y si se
 * rompiera, el histórico del atleta empezaría a mentir sin que nadie se dé
 * cuenta hasta meses después.
 */
import {
  apagar,
  Contexto,
  crearAtletaDe,
  crearCoach,
  Cuenta,
  ejercicioPublico,
  levantar,
  limpiar,
} from './ayudas';

describe('Programación', () => {
  let ctx: Contexto;
  let sentadilla: string;

  beforeAll(async () => {
    ctx = await levantar();
    sentadilla = await ejercicioPublico(ctx);
  });
  afterAll(async () => {
    await apagar(ctx);
  });
  beforeEach(async () => {
    await limpiar(ctx.pool);
  });

  const auth = (c: Cuenta) => ({ Authorization: `Bearer ${c.access}` });

  const plantillaDeFuerza = (ejercicioId: string, series: number) => ({
    name: 'Fuerza — día de pierna',
    discipline: 'fuerza',
    scope: 'dia' as const,
    blocks: [
      {
        position: 0,
        block_type: 'fuerza',
        title: 'Sentadilla',
        items: [
          {
            position: 0,
            exercise_id: ejercicioId,
            prescription: { series, reps: 5, carga_kg: 100, rpe: 8, descanso_s: 180 },
          },
        ],
      },
    ],
  });

  // ============================================================== la regla 1

  it('editar la plantilla NO cambia lo ya asignado', async () => {
    const ana = await crearCoach(ctx, 'Ana');
    const diego = await crearAtletaDe(ctx, ana, 'Diego');

    // 1. El coach arma una plantilla con 5 series.
    const plantilla = await ctx
      .http()
      .post('/v1/templates')
      .set(auth(ana))
      .send(plantillaDeFuerza(sentadilla, 5))
      .expect(201);

    // 2. La asigna a un día.
    const asignacion = await ctx
      .http()
      .post('/v1/assignments')
      .set(auth(ana))
      .send({
        athlete_id: diego.id,
        scheduled_date: '2026-12-01',
        title: 'Pierna del martes',
        template_id: plantilla.body.id,
      })
      .expect(201);

    expect(asignacion.body.blocks[0].items[0].prescription.series).toBe(5);

    // 3. Cambia la plantilla a 8 series.
    await ctx
      .http()
      .put(`/v1/templates/${plantilla.body.id}`)
      .set(auth(ana))
      .send(plantillaDeFuerza(sentadilla, 8))
      .expect(200);

    // 4. Lo asignado sigue diciendo 5. Esto es lo que no se puede romper.
    const despues = await ctx
      .http()
      .get(`/v1/assignments/${asignacion.body.id}`)
      .set(auth(ana))
      .expect(200);

    expect(despues.body.blocks[0].items[0].prescription.series).toBe(5);
    // Y la plantilla sí cambió, para que la prueba no pase por no haber hecho nada.
    const plantillaAhora = await ctx
      .http()
      .get(`/v1/templates/${plantilla.body.id}`)
      .set(auth(ana))
      .expect(200);
    expect(plantillaAhora.body.blocks[0].items[0].prescription.series).toBe(8);
  });

  it('editar la asignación no toca la plantilla', async () => {
    const ana = await crearCoach(ctx, 'Ana');
    const diego = await crearAtletaDe(ctx, ana, 'Diego');

    const plantilla = await ctx
      .http()
      .post('/v1/templates')
      .set(auth(ana))
      .send(plantillaDeFuerza(sentadilla, 5))
      .expect(201);

    const asignacion = await ctx
      .http()
      .post('/v1/assignments')
      .set(auth(ana))
      .send({
        athlete_id: diego.id,
        scheduled_date: '2026-12-02',
        title: 'Pierna',
        template_id: plantilla.body.id,
      })
      .expect(201);

    await ctx
      .http()
      .patch(`/v1/assignments/${asignacion.body.id}`)
      .set(auth(ana))
      .send({
        blocks: [
          {
            position: 0,
            block_type: 'fuerza',
            items: [
              { position: 0, exercise_id: sentadilla, prescription: { series: 3, reps: 10 } },
            ],
          },
        ],
      })
      .expect(200);

    const plantillaAhora = await ctx
      .http()
      .get(`/v1/templates/${plantilla.body.id}`)
      .set(auth(ana))
      .expect(200);
    expect(plantillaAhora.body.blocks[0].items[0].prescription.series).toBe(5);
  });

  // ============================================================== biblioteca

  it('el catálogo semilla se ve y se puede buscar', async () => {
    const ana = await crearCoach(ctx, 'Ana');
    const r = await ctx.http().get('/v1/exercises?q=sentadilla').set(auth(ana)).expect(200);
    expect(r.body.data.length).toBeGreaterThan(0);
    expect(r.body.data.every((e: { is_public: boolean }) => e.is_public)).toBe(true);
  });

  it('el coach crea su ejercicio con enlace de video y dice que no sirve sin conexión', async () => {
    const ana = await crearCoach(ctx, 'Ana');
    const r = await ctx
      .http()
      .post('/v1/exercises')
      .set(auth(ana))
      .send({
        name_es: 'Sled push a 50%',
        metrics: ['distancia', 'tiempo'],
        disciplines: ['hyrox'],
        video_url: 'https://www.youtube.com/watch?v=abc12345',
      })
      .expect(201);

    expect(r.body.video).toEqual({
      tipo: 'enlace',
      url: 'https://www.youtube.com/watch?v=abc12345',
      offline: false,
    });
    expect(r.body.is_public).toBe(false);
  });

  it('rechaza un enlace que no es https ni de un proveedor conocido', async () => {
    const ana = await crearCoach(ctx, 'Ana');
    await ctx
      .http()
      .post('/v1/exercises')
      .set(auth(ana))
      .send({ name_es: 'Raro', metrics: ['reps'], video_url: 'http://ejemplo.com/v.mp4' })
      .expect(422);
    await ctx
      .http()
      .post('/v1/exercises')
      .set(auth(ana))
      .send({ name_es: 'Raro', metrics: ['reps'], video_url: 'https://sitio-cualquiera.net/v.mp4' })
      .expect(422);
  });

  it('el catálogo público no se edita: se duplica', async () => {
    const ana = await crearCoach(ctx, 'Ana');
    await ctx
      .http()
      .patch(`/v1/exercises/${sentadilla}`)
      .set(auth(ana))
      .send({ name_es: 'Mi sentadilla' })
      .expect(403);

    const copia = await ctx
      .http()
      .post('/v1/exercises')
      .set(auth(ana))
      .send({ name_es: 'Sentadilla a cajón', metrics: ['reps', 'carga'], duplicate_of: sentadilla })
      .expect(201);
    expect(copia.body.is_mine).toBe(true);
    expect(copia.body.slug).not.toBe('sentadilla-trasera');
  });

  it('el atleta ve el ejercicio que inventó su coach', async () => {
    const ana = await crearCoach(ctx, 'Ana');
    const diego = await crearAtletaDe(ctx, ana, 'Diego');

    const propio = await ctx
      .http()
      .post('/v1/exercises')
      .set(auth(ana))
      .send({ name_es: 'Burpee sobre caja de Ana', metrics: ['reps'] })
      .expect(201);

    await ctx.http().get(`/v1/exercises/${propio.body.id}`).set(auth(diego)).expect(200);
  });

  // ======================================================= acceso indebido

  it('un coach NO puede meter en su plantilla el ejercicio privado de otro coach', async () => {
    const ana = await crearCoach(ctx, 'Ana');
    const luis = await crearCoach(ctx, 'Luis');

    const deAna = await ctx
      .http()
      .post('/v1/exercises')
      .set(auth(ana))
      .send({ name_es: 'Secreto de Ana', metrics: ['reps'] })
      .expect(201);

    // Si esto pasara, Luis leería el nombre y las indicaciones del ejercicio
    // de Ana a través de su propia plantilla.
    await ctx
      .http()
      .post('/v1/templates')
      .set(auth(luis))
      .send(plantillaDeFuerza(deAna.body.id, 5))
      .expect(422);
  });

  it('un coach NO ve ni edita la plantilla de otro coach', async () => {
    const ana = await crearCoach(ctx, 'Ana');
    const luis = await crearCoach(ctx, 'Luis');

    const plantilla = await ctx
      .http()
      .post('/v1/templates')
      .set(auth(ana))
      .send(plantillaDeFuerza(sentadilla, 5))
      .expect(201);

    await ctx.http().get(`/v1/templates/${plantilla.body.id}`).set(auth(luis)).expect(404);
    await ctx
      .http()
      .put(`/v1/templates/${plantilla.body.id}`)
      .set(auth(luis))
      .send(plantillaDeFuerza(sentadilla, 9))
      .expect(404);
    await ctx.http().delete(`/v1/templates/${plantilla.body.id}`).set(auth(luis)).expect(404);

    const mias = await ctx.http().get('/v1/templates').set(auth(luis)).expect(200);
    expect(mias.body).toHaveLength(0);
  });

  it('un coach NO puede programarle al atleta de otro coach', async () => {
    const ana = await crearCoach(ctx, 'Ana');
    const luis = await crearCoach(ctx, 'Luis');
    const diego = await crearAtletaDe(ctx, ana, 'Diego');

    await ctx
      .http()
      .post('/v1/assignments')
      .set(auth(luis))
      .send({ athlete_id: diego.id, scheduled_date: '2026-12-01', title: 'Colado' })
      .expect(403);
  });

  it('un coach NO ve ni edita la asignación de otro coach', async () => {
    const ana = await crearCoach(ctx, 'Ana');
    const luis = await crearCoach(ctx, 'Luis');
    const diego = await crearAtletaDe(ctx, ana, 'Diego');

    const asignacion = await ctx
      .http()
      .post('/v1/assignments')
      .set(auth(ana))
      .send({
        athlete_id: diego.id,
        scheduled_date: '2026-12-03',
        title: 'Pierna',
        blocks: plantillaDeFuerza(sentadilla, 5).blocks,
      })
      .expect(201);

    await ctx.http().get(`/v1/assignments/${asignacion.body.id}`).set(auth(luis)).expect(404);
    await ctx
      .http()
      .patch(`/v1/assignments/${asignacion.body.id}`)
      .set(auth(luis))
      .send({ title: 'Secuestrada' })
      .expect(404);
    await ctx
      .http()
      .post(`/v1/assignments/${asignacion.body.id}/publish`)
      .set(auth(luis))
      .expect(404);
    await ctx.http().delete(`/v1/assignments/${asignacion.body.id}`).set(auth(luis)).expect(404);
  });

  it('dos coaches del mismo atleta no ven las sesiones del otro', async () => {
    const ana = await crearCoach(ctx, 'Ana');
    const luis = await crearCoach(ctx, 'Luis');
    const diego = await crearAtletaDe(ctx, ana, 'Diego');

    // Luis invita al MISMO atleta: un atleta puede tener varios coaches.
    const inv = await ctx
      .http()
      .post('/v1/invitations')
      .set(auth(luis))
      .send({ athlete_name: 'Diego' })
      .expect(201);
    await ctx
      .http()
      .post('/v1/invitations/accept')
      .set(auth(diego))
      .send({ code: inv.body.code })
      .expect(200);

    const deAna = await ctx
      .http()
      .post('/v1/assignments')
      .set(auth(ana))
      .send({
        athlete_id: diego.id,
        scheduled_date: '2026-12-04',
        title: 'Fuerza con Ana',
        blocks: plantillaDeFuerza(sentadilla, 5).blocks,
      })
      .expect(201);
    await ctx.http().post(`/v1/assignments/${deAna.body.id}/publish`).set(auth(ana)).expect(200);

    // Luis no la ve, ni suelta ni en el calendario del atleta que comparten.
    await ctx.http().get(`/v1/assignments/${deAna.body.id}`).set(auth(luis)).expect(404);
    const calendarioDeLuis = await ctx
      .http()
      .get(`/v1/athletes/${diego.id}/calendar?from=2026-12-01&to=2026-12-31`)
      .set(auth(luis))
      .expect(200);
    expect(calendarioDeLuis.body.data).toHaveLength(0);

    // El atleta sí la ve: es su día, de cualquiera de sus coaches.
    const suCalendario = await ctx
      .http()
      .get(`/v1/athletes/${diego.id}/calendar?from=2026-12-01&to=2026-12-31`)
      .set(auth(diego))
      .expect(200);
    expect(suCalendario.body.data).toHaveLength(1);
  });

  // ========================================================= borrador y publicar

  it('el atleta no ve un borrador, y sí lo ve en cuanto se publica', async () => {
    const ana = await crearCoach(ctx, 'Ana');
    const diego = await crearAtletaDe(ctx, ana, 'Diego');

    const asignacion = await ctx
      .http()
      .post('/v1/assignments')
      .set(auth(ana))
      .send({
        athlete_id: diego.id,
        scheduled_date: '2026-12-05',
        title: 'Pierna',
        blocks: plantillaDeFuerza(sentadilla, 5).blocks,
      })
      .expect(201);

    expect(asignacion.body.status).toBe('borrador');
    await ctx.http().get(`/v1/assignments/${asignacion.body.id}`).set(auth(diego)).expect(404);

    const vacio = await ctx
      .http()
      .get(`/v1/athletes/${diego.id}/calendar?from=2026-12-01&to=2026-12-31`)
      .set(auth(diego))
      .expect(200);
    expect(vacio.body.data).toHaveLength(0);

    await ctx
      .http()
      .post(`/v1/assignments/${asignacion.body.id}/publish`)
      .set(auth(ana))
      .expect(200);

    const ahora = await ctx
      .http()
      .get(`/v1/assignments/${asignacion.body.id}`)
      .set(auth(diego))
      .expect(200);
    expect(ahora.body.status).toBe('publicada');
    expect(ahora.body.published_at).not.toBeNull();
  });

  it('publicar dos veces no es un error ni mueve la fecha de publicación', async () => {
    const ana = await crearCoach(ctx, 'Ana');
    const diego = await crearAtletaDe(ctx, ana, 'Diego');

    const a = await ctx
      .http()
      .post('/v1/assignments')
      .set(auth(ana))
      .send({
        athlete_id: diego.id,
        scheduled_date: '2026-12-06',
        title: 'Pierna',
        blocks: plantillaDeFuerza(sentadilla, 5).blocks,
      })
      .expect(201);

    const primera = await ctx
      .http()
      .post(`/v1/assignments/${a.body.id}/publish`)
      .set(auth(ana))
      .expect(200);
    const segunda = await ctx
      .http()
      .post(`/v1/assignments/${a.body.id}/publish`)
      .set(auth(ana))
      .expect(200);

    expect(segunda.body.published_at).toBe(primera.body.published_at);
  });

  it('una sesión vacía no se publica', async () => {
    const ana = await crearCoach(ctx, 'Ana');
    const diego = await crearAtletaDe(ctx, ana, 'Diego');

    const a = await ctx
      .http()
      .post('/v1/assignments')
      .set(auth(ana))
      .send({ athlete_id: diego.id, scheduled_date: '2026-12-07', title: 'Sin nada' })
      .expect(201);

    await ctx.http().post(`/v1/assignments/${a.body.id}/publish`).set(auth(ana)).expect(422);
  });

  it('publicar en lote dice cuáles salieron y cuál falló', async () => {
    const ana = await crearCoach(ctx, 'Ana');
    const diego = await crearAtletaDe(ctx, ana, 'Diego');

    const buena = await ctx
      .http()
      .post('/v1/assignments')
      .set(auth(ana))
      .send({
        athlete_id: diego.id,
        scheduled_date: '2026-12-08',
        title: 'Con bloques',
        blocks: plantillaDeFuerza(sentadilla, 5).blocks,
      })
      .expect(201);
    const vacia = await ctx
      .http()
      .post('/v1/assignments')
      .set(auth(ana))
      .send({ athlete_id: diego.id, scheduled_date: '2026-12-09', title: 'Vacía' })
      .expect(201);

    const r = await ctx
      .http()
      .post('/v1/assignments:publish-batch')
      .set(auth(ana))
      .send({ assignment_ids: [buena.body.id, vacia.body.id] })
      .expect(200);

    expect(r.body.published).toBe(1);
    expect(r.body.failed).toHaveLength(1);
    expect(r.body.failed[0].id).toBe(vacia.body.id);
  });

  // ============================================================= White Board

  it('el White Board guarda el texto del coach y no acepta ejercicios', async () => {
    const ana = await crearCoach(ctx, 'Ana');
    const diego = await crearAtletaDe(ctx, ana, 'Diego');

    const conPizarron = await ctx
      .http()
      .post('/v1/assignments')
      .set(auth(ana))
      .send({
        athlete_id: diego.id,
        scheduled_date: '2026-12-10',
        title: 'Open gym',
        blocks: [
          {
            position: 0,
            block_type: 'white_board',
            title: 'Aviso',
            body_text: 'Hoy medimos el 1RM. Llega 15 minutos antes y calienta por tu cuenta.',
          },
        ],
      })
      .expect(201);

    expect(conPizarron.body.blocks[0].body_text).toContain('1RM');
    expect(conPizarron.body.blocks[0].items).toHaveLength(0);

    // Un bloque de texto con ejercicios no tiene forma de dibujarse.
    await ctx
      .http()
      .post('/v1/assignments')
      .set(auth(ana))
      .send({
        athlete_id: diego.id,
        scheduled_date: '2026-12-11',
        title: 'Mal armado',
        blocks: [
          {
            position: 0,
            block_type: 'white_board',
            body_text: 'texto',
            items: [{ position: 0, exercise_id: sentadilla }],
          },
        ],
      })
      .expect(422);
  });

  it('un bloque de ejercicios sin ejercicios se rechaza', async () => {
    const ana = await crearCoach(ctx, 'Ana');
    const diego = await crearAtletaDe(ctx, ana, 'Diego');

    await ctx
      .http()
      .post('/v1/assignments')
      .set(auth(ana))
      .send({
        athlete_id: diego.id,
        scheduled_date: '2026-12-12',
        title: 'Bloque hueco',
        blocks: [{ position: 0, block_type: 'fuerza', title: 'Nada' }],
      })
      .expect(422);
  });

  it('el catálogo de tipos de bloque trae el White Board como bloque de texto', async () => {
    const ana = await crearCoach(ctx, 'Ana');
    const r = await ctx.http().get('/v1/catalog/blocks').set(auth(ana)).expect(200);

    const pizarron = r.body.block_types.find((t: { slug: string }) => t.slug === 'white_board');
    expect(pizarron).toBeDefined();
    expect(pizarron.kind).toBe('texto');
    expect(r.body.wod_formats.length).toBeGreaterThan(0);
  });
});
