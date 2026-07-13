// Fase 3b-i da #3: a máquina de estados do vínculo (POST/PATCH/DELETE
// /vinculos, GET /vinculos/pendentes). Casos escritos a partir da seção
// "Testes" da proposta técnica (wiki, Perfil do usuário). TDD: este arquivo
// existiu antes dos endpoints — rodar contra o index.js sem eles dá 404 em
// tudo (rota inexistente), não os status esperados.

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

const post = (path, opts) => authedFetch(app.baseUrl, path, { method: 'POST', ...opts });
const patch = (path, opts) => authedFetch(app.baseUrl, path, { method: 'PATCH', ...opts });
const del = (path, opts) => authedFetch(app.baseUrl, path, { method: 'DELETE', ...opts });
const get = (path, opts) => authedFetch(app.baseUrl, path, { method: 'GET', ...opts });

test('POST /vinculos sem token -> 401', async () => {
  const res = await post('/vinculos', { body: { destinatario_id: 1, tipo: 'amizade' } });
  assert.equal(res.status, 401);
});

test('POST /vinculos cria pedido pendente', async () => {
  const a = await app.criarUsuario('a1');
  const b = await app.criarUsuario('b1');
  const res = await post('/vinculos', { token: a.token, body: { destinatario_id: b.id, tipo: 'amizade' } });
  assert.equal(res.status, 201);
  const body = await res.json();
  assert.equal(body.status, 'pendente');
  assert.equal(body.solicitante_id, a.id);
  assert.equal(body.destinatario_id, b.id);
  assert.equal(body.tipo, 'amizade');
});

test('POST /vinculos pra si mesmo -> 400', async () => {
  const a = await app.criarUsuario('a2');
  const res = await post('/vinculos', { token: a.token, body: { destinatario_id: a.id, tipo: 'amizade' } });
  assert.equal(res.status, 400);
});

test('POST /vinculos duplicado (mesmo par + tipo, ainda pendente) -> 409', async () => {
  const a = await app.criarUsuario('a3');
  const b = await app.criarUsuario('b3');
  const primeiro = await post('/vinculos', { token: a.token, body: { destinatario_id: b.id, tipo: 'amizade' } });
  assert.equal(primeiro.status, 201);
  const segundo = await post('/vinculos', { token: a.token, body: { destinatario_id: b.id, tipo: 'amizade' } });
  assert.equal(segundo.status, 409);
});

test('POST /vinculos depois de recusado reabre o mesmo pedido (não fica 409 pra sempre)', async () => {
  const a = await app.criarUsuario('a3b');
  const b = await app.criarUsuario('b3b');
  const criado = await (await post('/vinculos', { token: a.token, body: { destinatario_id: b.id, tipo: 'amizade' } })).json();
  await patch(`/vinculos/${criado.id}`, { token: b.token, body: { status: 'recusado' } });

  const retry = await post('/vinculos', { token: a.token, body: { destinatario_id: b.id, tipo: 'amizade' } });
  assert.equal(retry.status, 201);
  const body = await retry.json();
  assert.equal(body.id, criado.id); // reabre o mesmo registro, não cria um novo
  assert.equal(body.status, 'pendente');

  const r = await app.pool.query(
    'SELECT count(*)::int AS n FROM vinculos WHERE solicitante_id = $1 AND destinatario_id = $2',
    [a.id, b.id]
  );
  assert.equal(r.rows[0].n, 1);
});

test('convite reverso pendente vira aceite, não cria 2º registro', async () => {
  const a = await app.criarUsuario('a4');
  const b = await app.criarUsuario('b4');
  // B pediu amizade pra A primeiro (pendente).
  const primeiro = await post('/vinculos', { token: b.token, body: { destinatario_id: a.id, tipo: 'amizade' } });
  assert.equal(primeiro.status, 201);
  // A pede amizade pra B, na direção oposta — deve aceitar o pedido do B.
  const segundo = await post('/vinculos', { token: a.token, body: { destinatario_id: b.id, tipo: 'amizade' } });
  assert.equal(segundo.status, 200);
  const body = await segundo.json();
  assert.equal(body.status, 'aceito');
  assert.equal(body.solicitante_id, b.id); // continua sendo o registro original do B
  assert.equal(body.destinatario_id, a.id);

  const r = await app.pool.query(
    'SELECT count(*)::int AS n FROM vinculos WHERE (solicitante_id = $1 AND destinatario_id = $2) OR (solicitante_id = $2 AND destinatario_id = $1)',
    [a.id, b.id]
  );
  assert.equal(r.rows[0].n, 1);
});

// Lacuna fechada pela migration 0008: antes, só a UNIQUE (solicitante,
// destinatario, tipo) existia — pedir na direção oposta de uma amizade já
// ACEITA não caía em nenhum dos desvios acima (o "reverso" só cobre pendente)
// e criava um segundo registro pro mesmo par. Agora o par é único no banco,
// então o endpoint precisa devolver 409 nessa hora, não 500.
test('POST /vinculos na direção oposta de uma amizade já aceita -> 409, não cria 2º registro', async () => {
  const a = await app.criarUsuario('a4b');
  const b = await app.criarUsuario('b4b');
  const criado = await (await post('/vinculos', { token: a.token, body: { destinatario_id: b.id, tipo: 'amizade' } })).json();
  await patch(`/vinculos/${criado.id}`, { token: b.token, body: { status: 'aceito' } });

  const invertido = await post('/vinculos', { token: b.token, body: { destinatario_id: a.id, tipo: 'amizade' } });
  assert.equal(invertido.status, 409);

  const r = await app.pool.query(
    'SELECT count(*)::int AS n FROM vinculos WHERE (solicitante_id = $1 AND destinatario_id = $2) OR (solicitante_id = $2 AND destinatario_id = $1)',
    [a.id, b.id]
  );
  assert.equal(r.rows[0].n, 1);
});

test('POST /vinculos depois de recusado na direção oposta reabre o mesmo registro, com solicitante atualizado', async () => {
  const a = await app.criarUsuario('a4c');
  const b = await app.criarUsuario('b4c');
  const criado = await (await post('/vinculos', { token: a.token, body: { destinatario_id: b.id, tipo: 'amizade' } })).json();
  await patch(`/vinculos/${criado.id}`, { token: b.token, body: { status: 'recusado' } });

  // Dessa vez é B quem pede pra A (direção oposta da tentativa original).
  const retry = await post('/vinculos', { token: b.token, body: { destinatario_id: a.id, tipo: 'amizade' } });
  assert.equal(retry.status, 201);
  const body = await retry.json();
  assert.equal(body.id, criado.id); // reabre o mesmo registro, não cria um novo
  assert.equal(body.status, 'pendente');
  assert.equal(body.solicitante_id, b.id);
  assert.equal(body.destinatario_id, a.id);

  const r = await app.pool.query(
    'SELECT count(*)::int AS n FROM vinculos WHERE (solicitante_id = $1 AND destinatario_id = $2) OR (solicitante_id = $2 AND destinatario_id = $1)',
    [a.id, b.id]
  );
  assert.equal(r.rows[0].n, 1);
});

test('PATCH aceitar: só o destinatário pode (solicitante tentando -> 403)', async () => {
  const a = await app.criarUsuario('a5');
  const b = await app.criarUsuario('b5');
  const criado = await (await post('/vinculos', { token: a.token, body: { destinatario_id: b.id, tipo: 'amizade' } })).json();
  const res = await patch(`/vinculos/${criado.id}`, { token: a.token, body: { status: 'aceito' } });
  assert.equal(res.status, 403);
});

test('PATCH aceitar pelo destinatário -> 200, status aceito', async () => {
  const a = await app.criarUsuario('a6');
  const b = await app.criarUsuario('b6');
  const criado = await (await post('/vinculos', { token: a.token, body: { destinatario_id: b.id, tipo: 'amizade' } })).json();
  const res = await patch(`/vinculos/${criado.id}`, { token: b.token, body: { status: 'aceito' } });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.status, 'aceito');
});

test('PATCH recusar pelo destinatário -> status recusado', async () => {
  const a = await app.criarUsuario('a7');
  const b = await app.criarUsuario('b7');
  const criado = await (await post('/vinculos', { token: a.token, body: { destinatario_id: b.id, tipo: 'amizade' } })).json();
  const res = await patch(`/vinculos/${criado.id}`, { token: b.token, body: { status: 'recusado' } });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.status, 'recusado');
});

test('PATCH cancelar (recusado) pelo solicitante -> 200; por terceiro -> 403', async () => {
  const a = await app.criarUsuario('a8');
  const b = await app.criarUsuario('b8');
  const c = await app.criarUsuario('c8');
  const criado = await (await post('/vinculos', { token: a.token, body: { destinatario_id: b.id, tipo: 'amizade' } })).json();

  const terceiro = await patch(`/vinculos/${criado.id}`, { token: c.token, body: { status: 'recusado' } });
  assert.equal(terceiro.status, 403);

  const cancelado = await patch(`/vinculos/${criado.id}`, { token: a.token, body: { status: 'recusado' } });
  assert.equal(cancelado.status, 200);
});

test('DELETE desfaz vínculo aceito, por qualquer um dos dois lados', async () => {
  const a = await app.criarUsuario('a9');
  const b = await app.criarUsuario('b9');
  const criado = await (await post('/vinculos', { token: a.token, body: { destinatario_id: b.id, tipo: 'amizade' } })).json();
  await patch(`/vinculos/${criado.id}`, { token: b.token, body: { status: 'aceito' } });

  const res = await del(`/vinculos/${criado.id}`, { token: a.token });
  assert.equal(res.status, 204);
});

test('DELETE por quem não faz parte do vínculo -> 403', async () => {
  const a = await app.criarUsuario('a10');
  const b = await app.criarUsuario('b10');
  const c = await app.criarUsuario('c10');
  const criado = await (await post('/vinculos', { token: a.token, body: { destinatario_id: b.id, tipo: 'amizade' } })).json();
  await patch(`/vinculos/${criado.id}`, { token: b.token, body: { status: 'aceito' } });

  const res = await del(`/vinculos/${criado.id}`, { token: c.token });
  assert.equal(res.status, 403);
});

test('DELETE em vínculo ainda pendente (não aceito) -> 400', async () => {
  const a = await app.criarUsuario('a11');
  const b = await app.criarUsuario('b11');
  const criado = await (await post('/vinculos', { token: a.token, body: { destinatario_id: b.id, tipo: 'amizade' } })).json();

  const res = await del(`/vinculos/${criado.id}`, { token: a.token });
  assert.equal(res.status, 400);
});

test('GET /vinculos/pendentes devolve só onde sou destinatário e status pendente', async () => {
  const a = await app.criarUsuario('a12');
  const b = await app.criarUsuario('b12');
  const c = await app.criarUsuario('c12');
  // C pede amizade pra A (fica pendente, deve aparecer).
  await post('/vinculos', { token: c.token, body: { destinatario_id: a.id, tipo: 'amizade' } });
  // A pede amizade pra B (A é solicitante, não deve aparecer na lista de A).
  await post('/vinculos', { token: a.token, body: { destinatario_id: b.id, tipo: 'amizade' } });

  const res = await get('/vinculos/pendentes', { token: a.token });
  assert.equal(res.status, 200);
  const lista = await res.json();
  assert.equal(lista.length, 1);
  assert.equal(lista[0].solicitante_id, c.id);
  assert.equal(lista[0].destinatario_id, a.id);
});
