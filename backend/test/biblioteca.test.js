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

// --- #20: consolidar jogo repetido entre quem tem vínculo familiar ---
//
// A regra: um jogo aparece uma vez por plataforma que EU possuo; se eu não
// tenho nenhuma posse dele, aparece uma vez só. Todo card carrega `donos` com
// todas as posses daquele jogo entre os membros efetivos.

test('GET /biblioteca: mesmo jogo em plataformas DIFERENTES por pessoa vira um card só (era o buraco da #20)', async () => {
  const eu = await app.criarUsuario('bib20a');
  const familiar = await app.criarUsuario('bib20a-familiar');
  const steam = await app.criarPlataforma('Steam-bib-20a');
  const gog = await app.criarPlataforma('GOG-bib-20a');
  const jogo = await app.criarJogo('Jogo Nas Duas Lojas 20a');
  const minhaPosse = await app.criarPosse(eu.id, jogo, steam);
  await app.criarPosse(familiar.id, jogo, gog);
  await app.criarVinculoAceito(eu.id, familiar.id, 'familiar');

  const lista = await (await get('/biblioteca', { token: eu.token })).json();

  // Antes da #20 isso devolvia 2 cards, sem nenhum sinal de ser o mesmo jogo.
  assert.equal(lista.length, 1);
  assert.equal(lista[0].posse_id, minhaPosse.id, 'o card tem que ser a MINHA posse, pra continuar editável');
  assert.equal(lista[0].plataforma_nome, 'Steam-bib-20a');

  const donos = lista[0].donos;
  assert.equal(donos.length, 2);
  assert.deepEqual(
    donos.map((d) => d.plataforma_nome).sort(),
    ['GOG-bib-20a', 'Steam-bib-20a'],
    'o selo precisa das duas plataformas, não só da minha'
  );
  assert.equal(donos[0].usuario_id, eu.id, 'eu venho primeiro no array');
});

test('GET /biblioteca: as MINHAS duas plataformas continuam dois cards, cada um com sua posse', async () => {
  const eu = await app.criarUsuario('bib20b');
  const steam = await app.criarPlataforma('Steam-bib-20b');
  const gog = await app.criarPlataforma('GOG-bib-20b');
  const jogo = await app.criarJogo('Jogo Meu Em Duas 20b');
  const posseSteam = await app.criarPosse(eu.id, jogo, steam);
  const posseGog = await app.criarPosse(eu.id, jogo, gog);

  const lista = await (await get('/biblioteca', { token: eu.token })).json();

  // Consolidar por jogo_id puro juntaria as duas e o botão de excluir não
  // saberia qual posse remover. Duas posses minhas = dois cards.
  assert.equal(lista.length, 2);
  assert.deepEqual(lista.map((j) => j.posse_id).sort(), [posseSteam.id, posseGog.id].sort());

  // Sutileza que o filtro da #21 depende: são 2 posses, mas UMA pessoa só —
  // isso não é "duplicado na família".
  for (const card of lista) {
    assert.equal(card.donos.length, 2, 'as duas posses aparecem em donos');
    assert.equal(new Set(card.donos.map((d) => d.usuario_id)).size, 1, 'mas é uma pessoa só');
  }
});

test('GET /biblioteca: jogo que só o familiar tem, em duas plataformas, aparece uma vez só', async () => {
  const eu = await app.criarUsuario('bib20c');
  const familiar = await app.criarUsuario('bib20c-familiar');
  const steam = await app.criarPlataforma('Steam-bib-20c');
  const gog = await app.criarPlataforma('GOG-bib-20c');
  const jogo = await app.criarJogo('Jogo Só Dele Em Duas 20c');
  await app.criarPosse(familiar.id, jogo, steam);
  await app.criarPosse(familiar.id, jogo, gog);
  await app.criarVinculoAceito(eu.id, familiar.id, 'familiar');

  const lista = await (await get('/biblioteca', { token: eu.token })).json();

  assert.equal(lista.length, 1);
  assert.equal(lista[0].origem_username, 'bib20c-familiar', 'não é meu, então continua marcado como dele');
  assert.equal(lista[0].donos.length, 2);
  assert.equal(new Set(lista[0].donos.map((d) => d.usuario_id)).size, 1);
});

test('GET /biblioteca: jogo só meu traz donos com um item só (sem selo)', async () => {
  const eu = await app.criarUsuario('bib20d');
  const steam = await app.criarPlataforma('Steam-bib-20d');
  const jogo = await app.criarJogo('Jogo Só Meu 20d');
  const posse = await app.criarPosse(eu.id, jogo, steam);

  const lista = await (await get('/biblioteca', { token: eu.token })).json();

  assert.equal(lista.length, 1);
  assert.equal(lista[0].donos.length, 1);
  assert.equal(lista[0].donos[0].usuario_id, eu.id);
  assert.equal(lista[0].donos[0].posse_id, posse.id);
});

test('GET /biblioteca: donos não vaza posse de quem não é membro efetivo', async () => {
  const eu = await app.criarUsuario('bib20e');
  const estranho = await app.criarUsuario('bib20e-estranho');
  const amigo = await app.criarUsuario('bib20e-amigo');
  const steam = await app.criarPlataforma('Steam-bib-20e');
  const jogo = await app.criarJogo('Jogo Que Muita Gente Tem 20e');
  await app.criarPosse(eu.id, jogo, steam);
  await app.criarPosse(estranho.id, jogo, steam);
  await app.criarPosse(amigo.id, jogo, steam);
  // Amizade NÃO conta pra biblioteca efetiva — só vínculo familiar.
  await app.criarVinculoAceito(eu.id, amigo.id, 'amizade');

  const lista = await (await get('/biblioteca', { token: eu.token })).json();

  assert.equal(lista.length, 1);
  assert.equal(lista[0].donos.length, 1, 'só eu — nem o estranho nem o amigo entram');
  assert.equal(lista[0].donos[0].usuario_id, eu.id);
});
