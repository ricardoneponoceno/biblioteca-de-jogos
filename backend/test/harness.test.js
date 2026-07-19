// Smoke test do harness: confirma que o banco de teste é recriado, as migrations
// aplicam, e ele está isolado do banco de dev. Não testa feature nenhuma —
// serve pra garantir que a infra de teste funciona antes de escrever o resto.

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { resetTestDatabase, testPool, TEST_DB } = require('../test-support/testdb');

let pool;

before(async () => {
  await resetTestDatabase();
  pool = testPool();
});

after(async () => {
  if (pool) await pool.end();
});

test('roda contra o banco de teste, não o de dev', async () => {
  const r = await pool.query('SELECT current_database() AS db');
  assert.equal(r.rows[0].db, TEST_DB);
});

test('as migrations foram aplicadas (usuarios existe)', async () => {
  const r = await pool.query("SELECT to_regclass('public.usuarios') AS t");
  assert.equal(r.rows[0].t, 'usuarios');
});
