// Fase 3 do #1 (fechada depois do #3): GET /biblioteca (a própria index) passa a
// incluir também as posses de quem tem vínculo familiar aceito comigo — mesmo
// padrão de "biblioteca efetiva" que o #3 já usa no perfil, mas aqui a origem
// DEVE aparecer (dono_username), ao contrário do perfil que a esconde de
// propósito. TDD: escrito antes do endpoint mudar.

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

test('GET /biblioteca sem vínculo familiar mostra só as posses próprias', async () => {
  const eu = await app.criarUsuario('bib1');
  const steam = await app.criarPlataforma('Steam-bib-1');
  const jogo = await app.criarJogo('Jogo Próprio 1');
  await app.criarPosse(eu.id, jogo, steam);

  const res = await get('/biblioteca', { token: eu.token });
  assert.equal(res.status, 200);
  const lista = await res.json();
  assert.equal(lista.length, 1);
  assert.equal(lista[0].titulo, 'Jogo Próprio 1');
  assert.equal(lista[0].origem_username, null);
});

test('GET /biblioteca inclui as posses de quem tem vínculo familiar aceito', async () => {
  const eu = await app.criarUsuario('bib2');
  const familiar = await app.criarUsuario('bib2-familiar');
  const steam = await app.criarPlataforma('Steam-bib-2');
  const jogoDoFamiliar = await app.criarJogo('Jogo Só Do Familiar 2');
  await app.criarPosse(familiar.id, jogoDoFamiliar, steam);
  await app.criarVinculoAceito(eu.id, familiar.id, 'familiar');

  const res = await get('/biblioteca', { token: eu.token });
  const lista = await res.json();
  const item = lista.find((j) => j.titulo === 'Jogo Só Do Familiar 2');
  assert.ok(item, 'jogo do familiar deveria aparecer na minha index');
  assert.equal(item.origem_username, familiar.username);
});

test('GET /biblioteca não inclui posses de quem NÃO tem vínculo familiar (só amizade, por exemplo)', async () => {
  const eu = await app.criarUsuario('bib3');
  const amigo = await app.criarUsuario('bib3-amigo');
  const steam = await app.criarPlataforma('Steam-bib-3');
  const jogoDoAmigo = await app.criarJogo('Jogo Só Do Amigo 3');
  await app.criarPosse(amigo.id, jogoDoAmigo, steam);
  await app.criarVinculoAceito(eu.id, amigo.id, 'amizade');

  const res = await get('/biblioteca', { token: eu.token });
  const lista = await res.json();
  assert.ok(!lista.some((j) => j.titulo === 'Jogo Só Do Amigo 3'));
});

test('GET /biblioteca: quando eu e o familiar temos o mesmo jogo+plataforma, aparece uma vez só e prefere a minha posse (editável)', async () => {
  const eu = await app.criarUsuario('bib4');
  const familiar = await app.criarUsuario('bib4-familiar');
  const steam = await app.criarPlataforma('Steam-bib-4');
  const jogo = await app.criarJogo('Jogo Compartilhado 4');
  const minhaPosse = await app.criarPosse(eu.id, jogo, steam);
  await app.criarPosse(familiar.id, jogo, steam);
  await app.criarVinculoAceito(eu.id, familiar.id, 'familiar');

  const res = await get('/biblioteca', { token: eu.token });
  const lista = await res.json();
  const ocorrencias = lista.filter((j) => j.titulo === 'Jogo Compartilhado 4');
  assert.equal(ocorrencias.length, 1);
  assert.equal(ocorrencias[0].posse_id, minhaPosse.id);
  assert.equal(ocorrencias[0].origem_username, null);
});

test('GET /biblioteca: vínculo familiar pendente (ainda não aceito) não traz as posses do outro', async () => {
  const eu = await app.criarUsuario('bib5');
  const outro = await app.criarUsuario('bib5-outro');
  const steam = await app.criarPlataforma('Steam-bib-5');
  const jogoDoOutro = await app.criarJogo('Jogo Pendente 5');
  await app.criarPosse(outro.id, jogoDoOutro, steam);
  await app.pool.query(
    'INSERT INTO vinculos (solicitante_id, destinatario_id, tipo) VALUES ($1, $2, $3)',
    [eu.id, outro.id, 'familiar']
  ); // status default é 'pendente', não aceito

  const res = await get('/biblioteca', { token: eu.token });
  const lista = await res.json();
  assert.ok(!lista.some((j) => j.titulo === 'Jogo Pendente 5'));
});
