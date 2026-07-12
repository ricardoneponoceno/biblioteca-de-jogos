// Fase 3b-ii da #3: leitura do perfil — GET /usuarios/:username/perfil (cabeçalho
// + contadores) e GET /usuarios/:username/biblioteca (biblioteca efetiva, sem
// revelar origem; ?em_comum=true). Casos da seção "Testes" da proposta técnica
// (wiki, Perfil do usuário). TDD: escrito antes dos endpoints.

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

test('GET /usuarios/:username/perfil sem token -> 401', async () => {
  const res = await get('/usuarios/ninguem/perfil');
  assert.equal(res.status, 401);
});

test('GET /usuarios/:username/biblioteca sem token -> 401', async () => {
  const res = await get('/usuarios/ninguem/biblioteca');
  assert.equal(res.status, 401);
});

test('GET /usuarios/:username/perfil de username inexistente -> 404', async () => {
  const eu = await app.criarUsuario('eu1');
  const res = await get('/usuarios/nao-existe/perfil', { token: eu.token });
  assert.equal(res.status, 404);
});

test('contadores (jogos/amigos/familia) batem com o estado real', async () => {
  const eu = await app.criarUsuario('eu2');
  const dono = await app.criarUsuario('dono2');
  const amigo = await app.criarUsuario('amigo2');
  const familiar = await app.criarUsuario('familiar2');
  const steam = await app.criarPlataforma('Steam-perfil-2');
  const j1 = await app.criarJogo('Jogo A2');
  const j2 = await app.criarJogo('Jogo B2');
  await app.criarPosse(dono.id, j1, steam);
  await app.criarPosse(dono.id, j2, steam);
  await app.criarVinculoAceito(dono.id, amigo.id, 'amizade');
  await app.criarVinculoAceito(dono.id, familiar.id, 'familiar');

  const res = await get(`/usuarios/${dono.username}/perfil`, { token: eu.token });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.username, dono.username);
  assert.deepEqual(body.contadores, { jogos: 2, amigos: 1, familia: 1 });
});

test('biblioteca do perfil não revela de qual conta cada jogo veio (só a plataforma)', async () => {
  const eu = await app.criarUsuario('eu3');
  const dono = await app.criarUsuario('dono3');
  const steam = await app.criarPlataforma('Steam-perfil-3');
  const jogo = await app.criarJogo('Jogo C3');
  await app.criarPosse(dono.id, jogo, steam);

  const res = await get(`/usuarios/${dono.username}/biblioteca`, { token: eu.token });
  assert.equal(res.status, 200);
  const lista = await res.json();
  assert.equal(lista.length, 1);
  const item = lista[0];
  assert.equal(item.plataforma_nome, 'Steam-perfil-3');
  for (const chave of Object.keys(item)) {
    assert.doesNotMatch(chave.toLowerCase(), /usuario|dono|origem|posse_id/);
  }
});

test('biblioteca efetiva inclui as posses de quem tem vínculo familiar aceito', async () => {
  const eu = await app.criarUsuario('eu4');
  const dono = await app.criarUsuario('dono4');
  const familiar = await app.criarUsuario('familiar4');
  const steam = await app.criarPlataforma('Steam-perfil-4');
  const jogoDoFamiliar = await app.criarJogo('Jogo Só Do Familiar 4');
  await app.criarPosse(familiar.id, jogoDoFamiliar, steam); // dono não possui isso diretamente
  await app.criarVinculoAceito(dono.id, familiar.id, 'familiar');

  const res = await get(`/usuarios/${dono.username}/biblioteca`, { token: eu.token });
  const lista = await res.json();
  assert.ok(lista.some((j) => j.titulo === 'Jogo Só Do Familiar 4'));
});

test('biblioteca efetiva não duplica quando dono e familiar têm o mesmo jogo+plataforma', async () => {
  const eu = await app.criarUsuario('eu5');
  const dono = await app.criarUsuario('dono5');
  const familiar = await app.criarUsuario('familiar5');
  const steam = await app.criarPlataforma('Steam-perfil-5');
  const jogo = await app.criarJogo('Jogo Compartilhado 5');
  await app.criarPosse(dono.id, jogo, steam);
  await app.criarPosse(familiar.id, jogo, steam); // mesmo jogo, mesma plataforma
  await app.criarVinculoAceito(dono.id, familiar.id, 'familiar');

  const res = await get(`/usuarios/${dono.username}/biblioteca`, { token: eu.token });
  const lista = await res.json();
  const ocorrencias = lista.filter((j) => j.titulo === 'Jogo Compartilhado 5');
  assert.equal(ocorrencias.length, 1);
});

test('?em_comum=true sem amizade -> 403', async () => {
  const eu = await app.criarUsuario('eu6');
  const dono = await app.criarUsuario('dono6');
  const res = await get(`/usuarios/${dono.username}/biblioteca?em_comum=true`, { token: eu.token });
  assert.equal(res.status, 403);
});

test('?em_comum=true com amizade cruza certo por (jogo, plataforma), considerando a biblioteca efetiva dos dois lados', async () => {
  const eu = await app.criarUsuario('eu7');
  const dono = await app.criarUsuario('dono7');
  const meuFamiliar = await app.criarUsuario('meuFamiliar7');
  await app.criarVinculoAceito(eu.id, dono.id, 'amizade');
  await app.criarVinculoAceito(eu.id, meuFamiliar.id, 'familiar');

  const steam = await app.criarPlataforma('Steam-perfil-7');
  const epic = await app.criarPlataforma('Epic-perfil-7');
  const emComum = await app.criarJogo('Jogo Em Comum 7');
  const soDono = await app.criarJogo('Jogo Só Do Dono 7');
  const plataformaDiferente = await app.criarJogo('Jogo Plataforma Diferente 7');

  // "emComum" é jogável pelos dois: eu tenho via MEU familiar, dono tem direto.
  await app.criarPosse(meuFamiliar.id, emComum, steam);
  await app.criarPosse(dono.id, emComum, steam);
  // "soDono" só o dono tem — não deve aparecer.
  await app.criarPosse(dono.id, soDono, steam);
  // mesma pessoa (dono) tem o jogo, mas em plataforma diferente da minha — não bate.
  await app.criarPosse(dono.id, plataformaDiferente, epic);
  await app.criarPosse(eu.id, plataformaDiferente, steam);

  const res = await get(`/usuarios/${dono.username}/biblioteca?em_comum=true`, { token: eu.token });
  assert.equal(res.status, 200);
  const lista = await res.json();
  const titulos = lista.map((j) => j.titulo).sort();
  assert.deepEqual(titulos, ['Jogo Em Comum 7']);
});
