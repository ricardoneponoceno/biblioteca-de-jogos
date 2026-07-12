// Fase 3b-0 da #3: confirma que o index.js virou um módulo importável — export
// do app, sem subir servidor sozinho ao importar (require.main === module
// guarda o listen()). Isso é o que destrava testar os endpoints (3b-i/3b-ii)
// sem precisar do servidor real rodando.

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { resetTestDatabase, TEST_DB } = require('../test-support/testdb');

let app;
let server;
let baseUrl;

before(async () => {
  await resetTestDatabase();
  // Aponta o app pro banco de teste antes de importá-lo — db.js lê o env na
  // hora do require e monta o Pool então.
  process.env.DB_DATABASE = TEST_DB;
  app = require('../index');

  server = app.listen(0); // porta efêmera, escolhida pelo SO
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

test('o módulo exporta o app do Express (função com .listen)', () => {
  assert.equal(typeof app, 'function');
  assert.equal(typeof app.listen, 'function');
});

test('o app importado responde de ponta a ponta (rotas + middleware + db)', async () => {
  const res = await fetch(`${baseUrl}/biblioteca`);
  assert.equal(res.status, 401); // sem token — prova que autenticar() está no ar
});
