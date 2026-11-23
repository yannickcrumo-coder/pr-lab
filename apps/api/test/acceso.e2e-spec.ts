/**
 * Pruebas de acceso indebido.
 *
 * Son la regla 3 de CLAUDE.md llevada a código: un coach no alcanza al atleta
 * de otro coach, y un atleta no alcanza a nadie más que a sí mismo. Cada ruta
 * nueva que toque datos de un atleta suma su caso aquí.
 */
import { apagar, Contexto, crearAtletaDe, crearCoach, Cuenta, levantar, limpiar } from './ayudas';

describe('Acceso entre coaches y atletas', () => {
  let ctx: Contexto;

  beforeAll(async () => {
    ctx = await levantar();
  });
  afterAll(async () => {
    await apagar(ctx);
  });
  beforeEach(async () => {
    await limpiar(ctx.pool);
  });

  const auth = (c: Cuenta) => ({ Authorization: `Bearer ${c.access}` });

  it('un coach ve a sus atletas y solo a los suyos', async () => {
    const ana = await crearCoach(ctx, 'Ana');
    const luis = await crearCoach(ctx, 'Luis');
    const diego = await crearAtletaDe(ctx, ana, 'Diego');
    await crearAtletaDe(ctx, luis, 'Sofía');

    const r = await ctx.http().get('/v1/athletes').set(auth(ana)).expect(200);

    expect(r.body.data).toHaveLength(1);
    expect(r.body.data[0].id).toBe(diego.id);
    expect(r.body.counts).toEqual({ activos: 1, invitados: 0, incluidos: 20 });
  });

  it('un coach NO puede abrir la ficha del atleta de otro coach', async () => {
    const ana = await crearCoach(ctx, 'Ana');
    const luis = await crearCoach(ctx, 'Luis');
    const sofia = await crearAtletaDe(ctx, luis, 'Sofía');

    const r = await ctx.http().get(`/v1/athletes/${sofia.id}`).set(auth(ana)).expect(403);

    expect(r.body.code).toBe('sin_relacion_activa');
    expect(r.headers['content-type']).toContain('application/problem+json');
  });

  it('un coach NO puede archivar la relación de otro coach', async () => {
    const ana = await crearCoach(ctx, 'Ana');
    const luis = await crearCoach(ctx, 'Luis');
    const sofia = await crearAtletaDe(ctx, luis, 'Sofía');

    await ctx.http().delete(`/v1/athletes/${sofia.id}`).set(auth(ana)).expect(403);

    // La relación de Luis sigue intacta.
    await ctx.http().get(`/v1/athletes/${sofia.id}`).set(auth(luis)).expect(200);
  });

  it('un atleta NO puede usar las rutas de coach', async () => {
    const ana = await crearCoach(ctx, 'Ana');
    const diego = await crearAtletaDe(ctx, ana, 'Diego');

    const r = await ctx.http().get('/v1/athletes').set(auth(diego)).expect(403);
    expect(r.body.code).toBe('no_es_coach');
  });

  it('un atleta NO puede abrir la ficha de otro atleta', async () => {
    const ana = await crearCoach(ctx, 'Ana');
    const diego = await crearAtletaDe(ctx, ana, 'Diego');
    const mariana = await crearAtletaDe(ctx, ana, 'Mariana');

    const r = await ctx.http().get(`/v1/athletes/${mariana.id}`).set(auth(diego)).expect(403);
    expect(r.body.code).toBe('sin_relacion_activa');
  });

  it('un atleta con dos coaches: cada uno lo ve, y no ve al otro', async () => {
    const ana = await crearCoach(ctx, 'Ana');
    const luis = await crearCoach(ctx, 'Luis');
    const diego = await crearAtletaDe(ctx, ana, 'Diego');

    // Diego acepta además la invitación de Luis.
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

    const porAna = await ctx.http().get(`/v1/athletes/${diego.id}`).set(auth(ana)).expect(200);
    const porLuis = await ctx.http().get(`/v1/athletes/${diego.id}`).set(auth(luis)).expect(200);

    // Cada coach trabaja contra SU relación, no contra la del otro.
    expect(porAna.body.relationship_id).not.toBe(porLuis.body.relationship_id);

    const coaches = await ctx.http().get('/v1/coaches').set(auth(diego)).expect(200);
    expect(coaches.body.data).toHaveLength(2);
  });

  it('archivar corta el acceso del coach, sin borrar nada', async () => {
    const ana = await crearCoach(ctx, 'Ana');
    const diego = await crearAtletaDe(ctx, ana, 'Diego');

    await ctx.http().delete(`/v1/athletes/${diego.id}`).set(auth(ana)).expect(204);
    await ctx.http().get(`/v1/athletes/${diego.id}`).set(auth(ana)).expect(403);

    const { rows } = await ctx.pool.query(
      "SELECT status FROM coach_athlete WHERE athlete_user_id = $1",
      [diego.id],
    );
    expect(rows[0].status).toBe('archivada');
  });

  it('sin token no se entra a ningún lado', async () => {
    const r = await ctx.http().get('/v1/athletes').expect(401);
    expect(r.body.code).toBe('falta_token');
  });

  it('con un token inventado tampoco', async () => {
    const r = await ctx
      .http()
      .get('/v1/athletes')
      .set({ Authorization: 'Bearer esto.no.es.un.token' })
      .expect(401);
    expect(r.body.code).toBe('token_invalido');
  });

  it('la ruta de salud sí es pública', async () => {
    const r = await ctx.http().get('/salud').expect(200);
    expect(r.body.estado).toBe('ok');
  });
});
