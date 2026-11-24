// Issue #5: Log individual por jogo estilo Yamtrack — testes de PUT/DELETE
// /logs-jogo/:jogo_id, integração com GET /biblioteca (posses próprias,
// familiares e jogos sem posse como Master System) e GET /usuarios/:username/biblioteca
// sem inflar contadores.jogos do perfil.

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startTestApp, authedFetch } = require('../test-support/testapp');

let app;

before(async () => {
  app = await startTestApp();
});

after(async () => {
  await app.close();
});

const get = (path, opts) => authedFetch(app.baseUrl, path, { method: 'GET', ...opts });
const put = (path, opts) => authedFetch(app.baseUrl, path, { method: 'PUT', ...opts });
const del = (path, opts) => authedFetch(app.baseUrl, path, { method: 'DELETE', ...opts });

test('PUT e DELETE /logs-jogo/:jogo_id exigem autenticação (401)', async () => {
  const resPut = await put('/logs-jogo/1', { body: { status: 'planejando' } });
  assert.equal(resPut.status, 401);

  const resDel = await del('/logs-jogo/1');
  assert.equal(resDel.status, 401);
});

test('PUT /logs-jogo/:jogo_id valida status, nota (0-10) e progresso_minutos', async () => {
  const eu = await app.criarUsuario('log_val1');
  const jogo = await app.criarJogo('Jogo Validação Log');

  // status inválido
  const rStatus = await put(`/logs-jogo/${jogo}`, {
    token: eu.token,
    body: { status: 'zerado_invalido' },
  });
  assert.equal(rStatus.status, 400);

  // nota fora de 0..10
  const rNota = await put(`/logs-jogo/${jogo}`, {
    token: eu.token,
    body: { status: 'concluido', nota: 10.5 },
  });
  assert.equal(rNota.status, 400);

  // progresso_minutos negativo
  const rProg = await put(`/logs-jogo/${jogo}`, {
    token: eu.token,
    body: { status: 'em_andamento', progresso_minutos: -15 },
  });
  assert.equal(rProg.status, 400);
});

test('PUT /logs-jogo/:jogo_id faz upsert do log em jogo com posse própria e reflete em GET /biblioteca', async () => {
  const eu = await app.criarUsuario('log_own1');
  const steam = await app.criarPlataforma('Steam-log-1');
  const jogo = await app.criarJogo('Chrono Trigger');
  await app.criarPosse(eu.id, jogo, steam);

  // Cria log inicial
  const res1 = await put(`/logs-jogo/${jogo}`, {
    token: eu.token,
    body: {
      status: 'em_andamento',
      nota: 9.5,
      progresso_minutos: 750,
      data_inicio: '2026-11-01',
      comentarios: 'JRPG incrível',
    },
  });
  assert.equal(res1.status, 200);
  const log1 = await res1.json();
  assert.equal(log1.status, 'em_andamento');
  assert.equal(log1.nota, 9.5);
  assert.equal(log1.progresso_minutos, 750);

  // Atualiza (upsert) para concluído
  const res2 = await put(`/logs-jogo/${jogo}`, {
    token: eu.token,
    body: {
      status: 'concluido',
      nota: 10,
      progresso_minutos: 1420,
      data_inicio: '2026-11-01',
      data_termino: '2026-11-20',
      comentarios: 'Obra-prima absoluta!',
    },
  });
  assert.equal(res2.status, 200);

  // Verifica em GET /biblioteca
  const bibRes = await get('/biblioteca', { token: eu.token });
  assert.equal(bibRes.status, 200);
  const lista = await bibRes.json();
  assert.equal(lista.length, 1);
  assert.equal(lista[0].sem_posse, false);
  assert.equal(lista[0].log_status, 'concluido');
  assert.equal(lista[0].log_nota, 10);
  assert.equal(lista[0].log_progresso_minutos, 1420);
  assert.equal(lista[0].log_comentarios, 'Obra-prima absoluta!');
  assert.ok(String(lista[0].log_data_termino).startsWith('2026-11-20'));
});

test('Jogo sem posse (ex: Master System) registrado em logs_jogo aparece em GET /biblioteca com sem_posse=true e não infla o contador de posses do perfil', async () => {
  const eu = await app.criarUsuario('log_noposse1');
  const masterSystem = await app.criarPlataforma('Master System');
  const alexKidd = await app.criarJogo('Alex Kidd in Miracle World');

  const putRes = await put(`/logs-jogo/${alexKidd}`, {
    token: eu.token,
    body: {
      status: 'planejando',
      plataforma_id: masterSystem,
      comentarios: 'Jogar no fim de semana',
    },
  });
  assert.equal(putRes.status, 200);

  // Aparece em GET /biblioteca com sem_posse = true e plataforma Master System
  const bibRes = await get('/biblioteca', { token: eu.token });
  const lista = await bibRes.json();
  assert.equal(lista.length, 1);
  assert.equal(lista[0].titulo, 'Alex Kidd in Miracle World');
  assert.equal(lista[0].sem_posse, true);
  assert.equal(lista[0].posse_id, null);
  assert.equal(lista[0].plataforma_nome, 'Master System');
  assert.equal(lista[0].log_status, 'planejando');
  assert.deepEqual(lista[0].donos, []);

  // Contador de jogos do perfil continua 0 (não infla com jogos sem posse)
  const perfilRes = await get(`/usuarios/${eu.username}/perfil`, { token: eu.token });
  const perfil = await perfilRes.json();
  assert.equal(perfil.contadores.jogos, 0);

  // Aparece na listagem de biblioteca do perfil com sem_posse=true e log_status
  const bibPerfilRes = await get(`/usuarios/${eu.username}/biblioteca`, { token: eu.token });
  const bibPerfil = await bibPerfilRes.json();
  assert.equal(bibPerfil.length, 1);
  assert.equal(bibPerfil[0].titulo, 'Alex Kidd in Miracle World');
  assert.equal(bibPerfil[0].plataforma_nome, 'Master System');
  assert.equal(bibPerfil[0].log_status, 'planejando');
  assert.equal(bibPerfil[0].sem_posse, true);

  // DELETE /logs-jogo/:jogo_id remove o registro sem posse
  const delRes = await del(`/logs-jogo/${alexKidd}`, { token: eu.token });
  assert.equal(delRes.status, 204);

  const bibAfter = await (await get('/biblioteca', { token: eu.token })).json();
  assert.equal(bibAfter.length, 0);
});

test('Usuário pode registrar seu próprio log em jogo emprestado de familiar sem duplicar card', async () => {
  const eu = await app.criarUsuario('log_fam_eu');
  const familiar = await app.criarUsuario('log_fam_outro');
  const switchPlat = await app.criarPlataforma('Switch-log-fam');
  const zelda = await app.criarJogo('Zelda Tears of the Kingdom');

  await app.criarPosse(familiar.id, zelda, switchPlat);
  await app.criarVinculoAceito(eu.id, familiar.id, 'familiar');

  await put(`/logs-jogo/${zelda}`, {
    token: eu.token,
    body: {
      status: 'pausado',
      nota: 8.8,
      progresso_minutos: 1800,
    },
  });

  const lista = await (await get('/biblioteca', { token: eu.token })).json();
  assert.equal(lista.length, 1, 'não deve duplicar o card do familiar com a linha do UNION sem_posse');
  assert.equal(lista[0].origem_username, familiar.username);
  assert.equal(lista[0].sem_posse, false);
  assert.equal(lista[0].log_status, 'pausado');
  assert.equal(lista[0].log_nota, 8.8);
  assert.equal(lista[0].log_progresso_minutos, 1800);
});
