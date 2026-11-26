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
const post = (path, opts) => authedFetch(app.baseUrl, path, { method: 'POST', ...opts });
const patch = (path, opts) => authedFetch(app.baseUrl, path, { method: 'PATCH', ...opts });

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

// Addendum (achado ao desenhar o botão de ação da 3c): o perfil precisa dizer
// pra quem está vendo qual é a relação entre os dois — senão o frontend não
// sabe se mostra "Adicionar amigo", "Solicitação enviada" ou "Aceitar".

test('perfil sem nenhum vínculo: vinculo_amizade e vinculo_familiar vêm null', async () => {
  const eu = await app.criarUsuario('eu8');
  const dono = await app.criarUsuario('dono8');
  const res = await get(`/usuarios/${dono.username}/perfil`, { token: eu.token });
  const body = await res.json();
  assert.equal(body.id, dono.id); // POST /vinculos precisa desse id como destinatario_id
  assert.equal(body.vinculo_amizade, null);
  assert.equal(body.vinculo_familiar, null);
});

test('perfil reflete pedido pendente que EU enviei (solicitante sou eu)', async () => {
  const eu = await app.criarUsuario('eu9');
  const dono = await app.criarUsuario('dono9');
  await post('/vinculos', { token: eu.token, body: { destinatario_id: dono.id, tipo: 'amizade' } });

  const res = await get(`/usuarios/${dono.username}/perfil`, { token: eu.token });
  const body = await res.json();
  assert.equal(body.vinculo_amizade.status, 'pendente');
  assert.equal(body.vinculo_amizade.solicitante_id, eu.id);
});

test('perfil reflete pedido pendente que o DONO enviou pra mim', async () => {
  const eu = await app.criarUsuario('eu10');
  const dono = await app.criarUsuario('dono10');
  await post('/vinculos', { token: dono.token, body: { destinatario_id: eu.id, tipo: 'amizade' } });

  const res = await get(`/usuarios/${dono.username}/perfil`, { token: eu.token });
  const body = await res.json();
  assert.equal(body.vinculo_amizade.status, 'pendente');
  assert.equal(body.vinculo_amizade.solicitante_id, dono.id);
});

test('perfil reflete amizade aceita e vínculo familiar aceito, independentes', async () => {
  const eu = await app.criarUsuario('eu11');
  const dono = await app.criarUsuario('dono11');
  await app.criarVinculoAceito(eu.id, dono.id, 'amizade');

  const res = await get(`/usuarios/${dono.username}/perfil`, { token: eu.token });
  const body = await res.json();
  assert.equal(body.vinculo_amizade.status, 'aceito');
  assert.equal(body.vinculo_familiar, null);
});

// --- Issue #32: GET /usuarios/:username/vinculos ---

test('GET /usuarios/:username/vinculos sem token -> 401', async () => {
  const res = await get('/usuarios/ninguem/vinculos');
  assert.equal(res.status, 401);
});

test('GET /usuarios/:username/vinculos de username inexistente -> 404', async () => {
  const eu = await app.criarUsuario('eu12');
  const res = await get('/usuarios/nao-existe/vinculos', { token: eu.token });
  assert.equal(res.status, 404);
});

test('GET /usuarios/:username/vinculos lista apenas vínculos aceitos com total_jogos próprios e ordenados por username', async () => {
  const eu = await app.criarUsuario('eu13');
  const dono = await app.criarUsuario('dono13');
  const amigoZ = await app.criarUsuario('z_amigo13');
  const amigoA = await app.criarUsuario('a_amigo13');
  const familiarB = await app.criarUsuario('b_familiar13');
  const pendente = await app.criarUsuario('pendente13');

  const steam = await app.criarPlataforma('Steam-perfil-13');
  const j1 = await app.criarJogo('Jogo 1-13');
  const j2 = await app.criarJogo('Jogo 2-13');
  const j3 = await app.criarJogo('Jogo 3-13');

  // a_amigo13 tem 2 posses próprias; z_amigo13 tem 0; b_familiar13 tem 1
  await app.criarPosse(amigoA.id, j1, steam);
  await app.criarPosse(amigoA.id, j2, steam);
  await app.criarPosse(familiarB.id, j3, steam);
  // dono também tem 1 posse (não deve contaminar o total_jogos do familiarB)
  await app.criarPosse(dono.id, j1, steam);

  // Vínculos aceitos nos dois sentidos (dono como solicitante e como destinatário)
  await app.criarVinculoAceito(dono.id, amigoZ.id, 'amizade');
  await app.criarVinculoAceito(amigoA.id, dono.id, 'amizade');
  await app.criarVinculoAceito(familiarB.id, dono.id, 'familiar');

  // Vínculo pendente não deve entrar na listagem
  await post('/vinculos', { token: pendente.token, body: { destinatario_id: dono.id, tipo: 'amizade' } });

  const res = await get(`/usuarios/${dono.username}/vinculos`, { token: eu.token });
  assert.equal(res.status, 200);
  const body = await res.json();

  assert.deepEqual(body, {
    amigos: [
      { username: 'a_amigo13', avatar_url: null, total_jogos: 2 },
      { username: 'z_amigo13', avatar_url: null, total_jogos: 0 },
    ],
    familia: [
      { username: 'b_familiar13', avatar_url: null, total_jogos: 1 },
    ],
  });
});

// --- Issue #34: Imagem de exibição (avatar_url) e edição de bio ---

test('PATCH /perfil sem token -> 401 e GET /perfil/me sem token -> 401', async () => {
  const resPatch = await patch('/perfil', { body: { bio: 'teste' } });
  assert.equal(resPatch.status, 401);
  const resMe = await get('/perfil/me');
  assert.equal(resMe.status, 401);
});

test('PATCH /perfil valida payload vazio, URL inválida e bio longa demais', async () => {
  const eu = await app.criarUsuario('eu14');

  const resVazio = await patch('/perfil', { token: eu.token, body: {} });
  assert.equal(resVazio.status, 400);

  const resUrlInvalida = await patch('/perfil', {
    token: eu.token,
    body: { avatar_url: 'javascript:alert(1)' },
  });
  assert.equal(resUrlInvalida.status, 400);

  const resBioLonga = await patch('/perfil', {
    token: eu.token,
    body: { bio: 'a'.repeat(301) },
  });
  assert.equal(resBioLonga.status, 400);
});

test('PATCH /perfil atualiza avatar_url (URL e Data URL) e bio, refletindo em /perfil/me, /usuarios/:username/perfil, /vinculos e /vinculos/pendentes', async () => {
  const eu = await app.criarUsuario('eu15');
  const outro = await app.criarUsuario('outro15');
  await app.criarVinculoAceito(eu.id, outro.id, 'amizade');

  const dataUrlValida = 'data:image/webp;base64,UklGRh4AAABXRUJQVlA4TBEAAAAvAAAAAAfQ//73v/+BiOh/AAA=';

  const resUpdate = await patch('/perfil', {
    token: eu.token,
    body: { avatar_url: dataUrlValida, bio: 'Colecionador de RPGs cl\u00e1ssicos' },
  });
  assert.equal(resUpdate.status, 200);
  const atualizado = await resUpdate.json();
  assert.equal(atualizado.avatar_url, dataUrlValida);
  assert.equal(atualizado.bio, 'Colecionador de RPGs cl\u00e1ssicos');

  // Reflete em GET /perfil/me
  const resMe = await get('/perfil/me', { token: eu.token });
  assert.equal(resMe.status, 200);
  const meBody = await resMe.json();
  assert.equal(meBody.avatar_url, dataUrlValida);
  assert.equal(meBody.bio, 'Colecionador de RPGs cl\u00e1ssicos');

  // Reflete em GET /usuarios/:username/perfil
  const resPerfil = await get(`/usuarios/${eu.username}/perfil`, { token: outro.token });
  assert.equal(resPerfil.status, 200);
  const perfilBody = await resPerfil.json();
  assert.equal(perfilBody.avatar_url, dataUrlValida);
  assert.equal(perfilBody.bio, 'Colecionador de RPGs cl\u00e1ssicos');

  // Reflete em GET /usuarios/:username/vinculos
  const resVinculos = await get(`/usuarios/${outro.username}/vinculos`, { token: outro.token });
  assert.equal(resVinculos.status, 200);
  const vinculosBody = await resVinculos.json();
  assert.equal(vinculosBody.amigos.length, 1);
  assert.equal(vinculosBody.amigos[0].username, eu.username);
  assert.equal(vinculosBody.amigos[0].avatar_url, dataUrlValida);

  // Reflete em GET /vinculos/pendentes (solicitante_avatar_url)
  await post('/vinculos', { token: eu.token, body: { destinatario_id: outro.id, tipo: 'familiar' } });
  const resPendentes = await get('/vinculos/pendentes', { token: outro.token });
  assert.equal(resPendentes.status, 200);
  const pendentesBody = await resPendentes.json();
  assert.equal(pendentesBody.length, 1);
  assert.equal(pendentesBody[0].solicitante_username, eu.username);
  assert.equal(pendentesBody[0].solicitante_avatar_url, dataUrlValida);

  // Permite limpar avatar_url e bio passando null ou string vazia
  const resLimpar = await patch('/perfil', {
    token: eu.token,
    body: { avatar_url: null, bio: '' },
  });
  assert.equal(resLimpar.status, 200);
  const limpo = await resLimpar.json();
  assert.equal(limpo.avatar_url, null);
  assert.equal(limpo.bio, null);
});

