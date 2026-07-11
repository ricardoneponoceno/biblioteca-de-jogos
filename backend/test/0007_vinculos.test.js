// Testes de schema da migration 0007 (vinculos + coluna bio) — Fase 3a da #3.
// Rede de segurança no nível do banco: garante que as constraints que o backend
// vai confiar (unicidade, tipos/status válidos, sem auto-vínculo, cascade)
// existem de fato. Não testa endpoint — isso é a 3b.

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { resetTestDatabase, runMigrations, testPool } = require('../test-support/testdb');

let pool;
let userA, userB, userC;

before(async () => {
  await resetTestDatabase();
  pool = testPool();
  const criarUsuario = async (username) =>
    (
      await pool.query(
        "INSERT INTO usuarios (username, password_hash) VALUES ($1, 'x') RETURNING id",
        [username]
      )
    ).rows[0].id;
  userA = await criarUsuario('a');
  userB = await criarUsuario('b');
  userC = await criarUsuario('c');
});

after(async () => {
  if (pool) await pool.end();
});

const inserirVinculo = (solicitante, destinatario, tipo, status) =>
  status === undefined
    ? pool.query(
        'INSERT INTO vinculos (solicitante_id, destinatario_id, tipo) VALUES ($1, $2, $3)',
        [solicitante, destinatario, tipo]
      )
    : pool.query(
        'INSERT INTO vinculos (solicitante_id, destinatario_id, tipo, status) VALUES ($1, $2, $3, $4)',
        [solicitante, destinatario, tipo, status]
      );

test('a tabela vinculos existe', async () => {
  const r = await pool.query("SELECT to_regclass('public.vinculos') AS t");
  assert.equal(r.rows[0].t, 'vinculos');
});

test('usuarios ganhou a coluna bio', async () => {
  const r = await pool.query(
    "SELECT column_name FROM information_schema.columns WHERE table_name = 'usuarios' AND column_name = 'bio'"
  );
  assert.equal(r.rowCount, 1);
});

test('rodar as migrations de novo é idempotente (0007 registrada uma vez)', async () => {
  await assert.doesNotReject(async () => runMigrations());
  const r = await pool.query(
    "SELECT count(*)::int AS n FROM schema_migrations WHERE filename = '0007_vinculos.sql'"
  );
  assert.equal(r.rows[0].n, 1);
});

test('status default é pendente', async () => {
  const r = await pool.query(
    "INSERT INTO vinculos (solicitante_id, destinatario_id, tipo) VALUES ($1, $2, 'amizade') RETURNING status",
    [userA, userB]
  );
  assert.equal(r.rows[0].status, 'pendente');
});

test('UNIQUE (solicitante, destinatario, tipo) barra duplicata', async () => {
  await inserirVinculo(userB, userA, 'amizade');
  await assert.rejects(inserirVinculo(userB, userA, 'amizade'), /duplicate key|unique/i);
});

test('o mesmo par pode ter amizade e vínculo familiar (tipos diferentes)', async () => {
  await inserirVinculo(userA, userC, 'amizade');
  await assert.doesNotReject(inserirVinculo(userA, userC, 'familiar'));
});

test('CHECK de tipo rejeita valor fora de {amizade, familiar}', async () => {
  await assert.rejects(inserirVinculo(userB, userC, 'namoro'), /check constraint|violates/i);
});

test('CHECK de status rejeita valor fora de {pendente, aceito, recusado}', async () => {
  await assert.rejects(
    inserirVinculo(userC, userB, 'amizade', 'talvez'),
    /check constraint|violates/i
  );
});

test('CHECK impede vínculo consigo mesmo', async () => {
  await assert.rejects(inserirVinculo(userA, userA, 'amizade'), /check constraint|violates/i);
});

test('ON DELETE CASCADE: apagar usuário apaga os vínculos dele', async () => {
  const descartavel = (
    await pool.query(
      "INSERT INTO usuarios (username, password_hash) VALUES ('descartavel', 'x') RETURNING id"
    )
  ).rows[0].id;
  await inserirVinculo(descartavel, userB, 'amizade');
  await pool.query('DELETE FROM usuarios WHERE id = $1', [descartavel]);
  const r = await pool.query(
    'SELECT count(*)::int AS n FROM vinculos WHERE solicitante_id = $1 OR destinatario_id = $1',
    [descartavel]
  );
  assert.equal(r.rows[0].n, 0);
});
