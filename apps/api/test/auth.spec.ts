import {
  apagar,
  Contexto,
  correoUnico,
  crearAtletaDe,
  crearCoach,
  levantar,
  limpiar,
} from './ayudas';

describe('Autenticación', () => {
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

  // ------------------------------------------------------------- registro
  it('quien se registra sin código queda como coach', async () => {
    const r = await ctx
      .http()
      .post('/v1/auth/register')
      .send({ email: correoUnico(), password: 'contrasena-larga-123', full_name: 'Ana Rivera' })
      .expect(201);

    expect(r.body.user.is_coach).toBe(true);
    expect(r.body.user.is_athlete).toBe(false);
    expect(r.body.access_token).toBeDefined();
    expect(r.body.user).not.toHaveProperty('password_hash');
  });

  it('quien se registra con código queda como atleta de ese coach', async () => {
    const ana = await crearCoach(ctx);
    const diego = await crearAtletaDe(ctx, ana);

    const yo = await ctx
      .http()
      .get('/v1/me')
      .set({ Authorization: `Bearer ${diego.access}` })
      .expect(200);

    expect(yo.body.is_athlete).toBe(true);
    expect(yo.body.is_coach).toBe(false);

    const { rows } = await ctx.pool.query(
      'SELECT status FROM coach_athlete WHERE coach_user_id = $1 AND athlete_user_id = $2',
      [ana.id, diego.id],
    );
    expect(rows[0].status).toBe('activa');
  });

  it('el mismo correo no se registra dos veces', async () => {
    const email = correoUnico();
    const cuerpo = { email, password: 'contrasena-larga-123', full_name: 'Ana' };
    await ctx.http().post('/v1/auth/register').send(cuerpo).expect(201);
    const r = await ctx.http().post('/v1/auth/register').send(cuerpo).expect(409);
    expect(r.body.code).toBe('email_ya_registrado');
  });

  it('una contraseña corta se rechaza con el campo señalado', async () => {
    const r = await ctx
      .http()
      .post('/v1/auth/register')
      .send({ email: correoUnico(), password: 'corta', full_name: 'Ana' })
      .expect(422);

    expect(r.body.code).toBe('datos_invalidos');
    expect(r.body.errors.some((e: { field: string }) => e.field === 'password')).toBe(true);
  });

  it('un código inventado no crea cuenta', async () => {
    const r = await ctx
      .http()
      .post('/v1/auth/register')
      .send({
        email: correoUnico(),
        password: 'contrasena-larga-123',
        full_name: 'Nadie',
        invitation_code: 'ZZZZZZ',
      })
      .expect(404);

    expect(r.body.code).toBe('invitacion_invalida');
    const { rows } = await ctx.pool.query('SELECT count(*)::int AS n FROM users');
    expect(rows[0].n).toBe(0);
  });

  // --------------------------------------------------------------- acceso
  it('inicia sesión con la contraseña correcta', async () => {
    const ana = await crearCoach(ctx);
    const r = await ctx
      .http()
      .post('/v1/auth/login')
      .send({ email: ana.email, password: 'contrasena-larga-123' })
      .expect(200);
    expect(r.body.user.id).toBe(ana.id);
  });

  it('con la contraseña equivocada no dice si el correo existe', async () => {
    const ana = await crearCoach(ctx);

    const malaContrasena = await ctx
      .http()
      .post('/v1/auth/login')
      .send({ email: ana.email, password: 'otra-cosa-larga-123' })
      .expect(401);

    const correoInexistente = await ctx
      .http()
      .post('/v1/auth/login')
      .send({ email: 'no.existe@prlab.test', password: 'otra-cosa-larga-123' })
      .expect(401);

    expect(malaContrasena.body.code).toBe('credenciales_invalidas');
    expect(correoInexistente.body.code).toBe('credenciales_invalidas');
  });

  it('frena la fuerza bruta tras varios intentos fallidos', async () => {
    const ana = await crearCoach(ctx);
    for (let i = 0; i < 10; i++) {
      await ctx
        .http()
        .post('/v1/auth/login')
        .send({ email: ana.email, password: `equivocada-${i}` })
        .expect(401);
    }
    const r = await ctx
      .http()
      .post('/v1/auth/login')
      .send({ email: ana.email, password: 'contrasena-larga-123' })
      .expect(429);
    expect(r.body.code).toBe('demasiados_intentos');
  });

  // -------------------------------------------------------------- refresco
  it('el token de refresco rota: el anterior deja de servir', async () => {
    const ana = await crearCoach(ctx);

    const primero = await ctx
      .http()
      .post('/v1/auth/refresh')
      .send({ refresh_token: ana.refresh })
      .expect(200);

    expect(primero.body.refresh_token).not.toBe(ana.refresh);

    const segundo = await ctx
      .http()
      .post('/v1/auth/refresh')
      .send({ refresh_token: primero.body.refresh_token })
      .expect(200);
    expect(segundo.body.access_token).toBeDefined();
  });

  it('reusar un token de refresco viejo cierra toda la sesión', async () => {
    const ana = await crearCoach(ctx);
    const rotado = await ctx
      .http()
      .post('/v1/auth/refresh')
      .send({ refresh_token: ana.refresh })
      .expect(200);

    // Alguien se robó el token viejo y lo intenta usar.
    const robo = await ctx
      .http()
      .post('/v1/auth/refresh')
      .send({ refresh_token: ana.refresh })
      .expect(401);
    expect(robo.body.code).toBe('refresco_reusado');

    // Y el token legítimo también deja de servir: hay que volver a entrar.
    await ctx
      .http()
      .post('/v1/auth/refresh')
      .send({ refresh_token: rotado.body.refresh_token })
      .expect(401);
  });

  it('cerrar sesión invalida el token de refresco', async () => {
    const ana = await crearCoach(ctx);
    await ctx.http().post('/v1/auth/logout').send({ refresh_token: ana.refresh }).expect(204);
    await ctx.http().post('/v1/auth/refresh').send({ refresh_token: ana.refresh }).expect(401);
  });

  it('el token de refresco nunca se guarda en claro', async () => {
    const ana = await crearCoach(ctx);
    const { rows } = await ctx.pool.query('SELECT token_hash FROM sesiones WHERE user_id = $1', [
      ana.id,
    ]);
    expect(rows[0].token_hash).not.toBe(ana.refresh);
    expect(rows[0].token_hash).toHaveLength(64);
  });

  // ---------------------------------------------------------------- perfil
  it('cambia mis preferencias', async () => {
    const ana = await crearCoach(ctx);
    const r = await ctx
      .http()
      .patch('/v1/me')
      .set({ Authorization: `Bearer ${ana.access}` })
      .send({ units_weight: 'lb', timezone: 'America/Tijuana' })
      .expect(200);

    expect(r.body.units_weight).toBe('lb');
    expect(r.body.timezone).toBe('America/Tijuana');
  });
});
