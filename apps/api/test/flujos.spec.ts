/**
 * LOS FLUJOS DEL COACH, PROBADOS CONTRA LA API DE VERDAD.
 *
 * Esta suite existe para responder una pregunta concreta: «veo que el
 * prototipo no guarda; ¿cómo me aseguro de que cuando se programe la
 * plataforma los flujos sean los esperados?».
 *
 * La respuesta es este archivo. Cada prueba se llama como el flujo que el
 * coach ejecuta con el ratón, y lo recorre contra la API real y una base de
 * datos real: crea, guarda, vuelve a leer y comprueba que esté ahí. Si alguna
 * se rompe, la integración continua no deja pasar el cambio.
 *
 * Lo que estas pruebas SÍ garantizan: que el servidor guarda, devuelve y
 * autoriza lo que debe. Es la mitad que se puede garantizar sin navegador.
 *
 * Lo que NO garantizan: que el clic, el arrastre y el reordenamiento de la
 * pantalla llamen a estas rutas en el momento correcto. Eso se cierra en el
 * paso 3 con pruebas que manejan la interfaz de verdad, y la lista de flujos
 * a cubrir es justamente la lista de nombres de abajo.
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

describe('Flujos del coach', () => {
  let ctx: Contexto;
  let sentadilla: string;
  let pesoMuerto: string;

  beforeAll(async () => {
    ctx = await levantar();
    sentadilla = await ejercicioPublico(ctx);
    pesoMuerto = await ejercicioPublico(ctx, 'peso-muerto');
  });
  afterAll(async () => {
    await apagar(ctx);
  });
  beforeEach(async () => {
    await limpiar(ctx.pool);
  });

  const auth = (c: Cuenta) => ({ Authorization: `Bearer ${c.access}` });

  const bloqueFuerza = (ejercicios: string[]) => ({
    position: 0,
    block_type: 'fuerza',
    title: 'Fuerza',
    items: ejercicios.map((id, i) => ({
      position: i,
      exercise_id: id,
      prescription: { series: 5, reps: 5, carga_kg: 100, rpe: 8 },
    })),
  });

  // ===================================================================
  // El flujo exacto que la coach probó en el prototipo
  // ===================================================================

  it('toco el + de un día, agrego una sesión con bloques, y al volver a abrirla están ahí', async () => {
    const ana = await crearCoach(ctx, 'Ana');
    const diego = await crearAtletaDe(ctx, ana, 'Diego');

    // 1. El + del día: nace la sesión del día con sus bloques.
    const creada = await ctx
      .http()
      .post('/v1/assignments')
      .set(auth(ana))
      .send({
        athlete_id: diego.id,
        scheduled_date: '2026-12-01',
        title: 'Pierna del martes',
        discipline: 'fuerza',
        blocks: [
          { position: 0, block_type: 'calentamiento', title: 'Calentamiento',
            items: [{ position: 0, exercise_id: sentadilla, prescription: { series: 2, reps: 8 } }] },
          bloqueFuerza([sentadilla, pesoMuerto]),
          { position: 2, block_type: 'white_board', title: 'Aviso',
            body_text: 'Llega 15 minutos antes.' },
        ],
      })
      .expect(201);

    // 2. Se guardó de verdad: se vuelve a leer en otra petición.
    const leida = await ctx
      .http()
      .get(`/v1/assignments/${creada.body.id}`)
      .set(auth(ana))
      .expect(200);

    expect(leida.body.blocks).toHaveLength(3);
    expect(leida.body.blocks[1].items).toHaveLength(2);
    expect(leida.body.blocks[1].items[0].prescription.carga_kg).toBe(100);
    expect(leida.body.blocks[2].body_text).toContain('15 minutos');

    // 3. Y aparece en el día, que es lo que el coach ve en el calendario.
    const calendario = await ctx
      .http()
      .get(`/v1/athletes/${diego.id}/calendar?from=2026-12-01&to=2026-12-07`)
      .set(auth(ana))
      .expect(200);

    expect(calendario.body.data).toHaveLength(1);
    expect(calendario.body.data[0].scheduled_date).toBe('2026-12-01');
    expect(calendario.body.data[0].title).toBe('Pierna del martes');
  });

  it('agrego un bloque a una sesión que ya existe y no pierdo los que tenía', async () => {
    const ana = await crearCoach(ctx, 'Ana');
    const diego = await crearAtletaDe(ctx, ana, 'Diego');

    const a = await ctx
      .http()
      .post('/v1/assignments')
      .set(auth(ana))
      .send({
        athlete_id: diego.id,
        scheduled_date: '2026-12-02',
        title: 'Sesión',
        blocks: [bloqueFuerza([sentadilla])],
      })
      .expect(201);

    await ctx
      .http()
      .patch(`/v1/assignments/${a.body.id}`)
      .set(auth(ana))
      .send({
        blocks: [
          bloqueFuerza([sentadilla]),
          { position: 1, block_type: 'enfriamiento', title: 'Enfriamiento',
            items: [{ position: 0, exercise_id: sentadilla, prescription: { tiempo_s: 300 } }] },
        ],
      })
      .expect(200);

    const leida = await ctx
      .http()
      .get(`/v1/assignments/${a.body.id}`)
      .set(auth(ana))
      .expect(200);
    expect(leida.body.blocks).toHaveLength(2);
    expect(leida.body.blocks[0].items[0].prescription.series).toBe(5);
  });

  it('muevo una sesión de día y queda en el día nuevo, no en los dos', async () => {
    const ana = await crearCoach(ctx, 'Ana');
    const diego = await crearAtletaDe(ctx, ana, 'Diego');

    const a = await ctx
      .http()
      .post('/v1/assignments')
      .set(auth(ana))
      .send({
        athlete_id: diego.id,
        scheduled_date: '2026-12-03',
        title: 'Se mueve',
        blocks: [bloqueFuerza([sentadilla])],
      })
      .expect(201);

    await ctx
      .http()
      .patch(`/v1/assignments/${a.body.id}`)
      .set(auth(ana))
      .send({ scheduled_date: '2026-12-05' })
      .expect(200);

    const semana = await ctx
      .http()
      .get(`/v1/athletes/${diego.id}/calendar?from=2026-12-01&to=2026-12-07`)
      .set(auth(ana))
      .expect(200);

    expect(semana.body.data).toHaveLength(1);
    expect(semana.body.data[0].scheduled_date).toBe('2026-12-05');
  });

  it('quito una sesión del día y deja de aparecer en el calendario', async () => {
    const ana = await crearCoach(ctx, 'Ana');
    const diego = await crearAtletaDe(ctx, ana, 'Diego');

    const a = await ctx
      .http()
      .post('/v1/assignments')
      .set(auth(ana))
      .send({
        athlete_id: diego.id,
        scheduled_date: '2026-12-04',
        title: 'Se va',
        blocks: [bloqueFuerza([sentadilla])],
      })
      .expect(201);

    await ctx.http().delete(`/v1/assignments/${a.body.id}`).set(auth(ana)).expect(204);

    const semana = await ctx
      .http()
      .get(`/v1/athletes/${diego.id}/calendar?from=2026-12-01&to=2026-12-07`)
      .set(auth(ana))
      .expect(200);
    expect(semana.body.data).toHaveLength(0);

    // Archivada, no borrada (regla 4): ya no se puede abrir.
    await ctx.http().get(`/v1/assignments/${a.body.id}`).set(auth(ana)).expect(404);
  });

  it('guardo una plantilla con sus bloques y la vuelvo a abrir completa', async () => {
    const ana = await crearCoach(ctx, 'Ana');

    const creada = await ctx
      .http()
      .post('/v1/templates')
      .set(auth(ana))
      .send({
        name: 'Fuerza · Día A',
        discipline: 'fuerza',
        scope: 'dia',
        blocks: [bloqueFuerza([sentadilla, pesoMuerto])],
      })
      .expect(201);

    const leida = await ctx
      .http()
      .get(`/v1/templates/${creada.body.id}`)
      .set(auth(ana))
      .expect(200);

    expect(leida.body.name).toBe('Fuerza · Día A');
    expect(leida.body.blocks[0].items).toHaveLength(2);

    // Y aparece en su lista de plantillas.
    const lista = await ctx.http().get('/v1/templates').set(auth(ana)).expect(200);
    expect(lista.body.map((t: { name: string }) => t.name)).toContain('Fuerza · Día A');
  });

  // ===================================================================
  // El índice de bloques y ejercicios
  // ===================================================================

  it('los bloques salen etiquetados A, B, C y sus ejercicios A1, A2, B1', async () => {
    const ana = await crearCoach(ctx, 'Ana');
    const diego = await crearAtletaDe(ctx, ana, 'Diego');

    const a = await ctx
      .http()
      .post('/v1/assignments')
      .set(auth(ana))
      .send({
        athlete_id: diego.id,
        scheduled_date: '2026-12-06',
        title: 'Con índice',
        blocks: [
          { position: 0, block_type: 'calentamiento', title: 'Calentamiento',
            items: [
              { position: 0, exercise_id: sentadilla },
              { position: 1, exercise_id: pesoMuerto },
            ] },
          { position: 1, block_type: 'fuerza', title: 'Fuerza',
            items: [{ position: 0, exercise_id: sentadilla }] },
          { position: 2, block_type: 'enfriamiento', title: 'Enfriamiento',
            items: [{ position: 0, exercise_id: sentadilla }] },
        ],
      })
      .expect(201);

    expect(a.body.blocks.map((b: { label: string }) => b.label)).toEqual(['A', 'B', 'C']);
    expect(a.body.blocks[0].items.map((i: { label: string }) => i.label)).toEqual(['A1', 'A2']);
    expect(a.body.blocks[1].items[0].label).toBe('B1');
    expect(a.body.blocks[2].items[0].label).toBe('C1');
  });

  it('al reordenar los bloques las etiquetas se reasignan, no se arrastran', async () => {
    const ana = await crearCoach(ctx, 'Ana');
    const diego = await crearAtletaDe(ctx, ana, 'Diego');

    const a = await ctx
      .http()
      .post('/v1/assignments')
      .set(auth(ana))
      .send({
        athlete_id: diego.id,
        scheduled_date: '2026-12-07',
        title: 'Se reordena',
        blocks: [
          { position: 0, block_type: 'calentamiento', title: 'Primero era A',
            items: [{ position: 0, exercise_id: sentadilla }] },
          { position: 1, block_type: 'fuerza', title: 'Primero era B',
            items: [{ position: 0, exercise_id: pesoMuerto }] },
        ],
      })
      .expect(201);

    expect(a.body.blocks[0].title).toBe('Primero era A');
    expect(a.body.blocks[0].label).toBe('A');

    // El coach los invierte arrastrando.
    const invertida = await ctx
      .http()
      .patch(`/v1/assignments/${a.body.id}`)
      .set(auth(ana))
      .send({
        blocks: [
          { position: 0, block_type: 'fuerza', title: 'Primero era B',
            items: [{ position: 0, exercise_id: pesoMuerto }] },
          { position: 1, block_type: 'calentamiento', title: 'Primero era A',
            items: [{ position: 0, exercise_id: sentadilla }] },
        ],
      })
      .expect(200);

    // La letra sigue a la posición, no al bloque: el que subió ahora es A.
    expect(invertida.body.blocks[0].title).toBe('Primero era B');
    expect(invertida.body.blocks[0].label).toBe('A');
    expect(invertida.body.blocks[0].items[0].label).toBe('A1');
    expect(invertida.body.blocks[1].title).toBe('Primero era A');
    expect(invertida.body.blocks[1].label).toBe('B');
  });

  it('las plantillas también traen el índice', async () => {
    const ana = await crearCoach(ctx, 'Ana');
    const t = await ctx
      .http()
      .post('/v1/templates')
      .set(auth(ana))
      .send({
        name: 'Con índice',
        discipline: 'fuerza',
        blocks: [
          { position: 0, block_type: 'calentamiento',
            items: [{ position: 0, exercise_id: sentadilla }] },
          { position: 1, block_type: 'fuerza',
            items: [
              { position: 0, exercise_id: sentadilla },
              { position: 1, exercise_id: pesoMuerto },
            ] },
        ],
      })
      .expect(201);

    expect(t.body.blocks.map((b: { label: string }) => b.label)).toEqual(['A', 'B']);
    expect(t.body.blocks[1].items.map((i: { label: string }) => i.label)).toEqual(['B1', 'B2']);
  });
});
