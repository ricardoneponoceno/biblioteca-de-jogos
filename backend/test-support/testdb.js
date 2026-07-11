// Apoio de teste — banco descartável isolado do dev.
//
// Os testes NUNCA rodam contra o banco de desenvolvimento (`gamelib_db`): cada
// run recria um banco próprio (`gamelib_test`) do zero e aplica as migrations
// nele. Reaproveita as mesmas credenciais/host que o app já usa (via .env +
// env do Docker), só troca o nome do banco — nada de credencial hardcoded.
//
// Fica em test-support/ (e não em test/) de propósito: o runner do Node trata
// qualquer .js dentro de test/ como arquivo de teste, e este é só um helper.

require('dotenv').config({ path: './.env' });
const { Pool } = require('pg');
const { execFileSync } = require('child_process');
const path = require('path');

const TEST_DB = 'gamelib_test';

// Conexão base: o mesmo usuário/host/porta do app, sem fixar o banco (cada uso
// escolhe: 'postgres' pra administrar, TEST_DB pra rodar os testes).
function baseConfig() {
  return {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
  };
}

// Recria o banco de teste do zero e aplica todas as migrations nele.
async function resetTestDatabase() {
  // Conecta no banco de manutenção 'postgres' pra poder dropar/criar o de teste
  // (não dá pra dropar um banco no qual você está conectado).
  const admin = new Pool({ ...baseConfig(), database: 'postgres' });
  try {
    // Derruba conexões penduradas no banco de teste antes de dropar.
    await admin.query(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity
       WHERE datname = $1 AND pid <> pg_backend_pid()`,
      [TEST_DB]
    );
    await admin.query(`DROP DATABASE IF EXISTS ${TEST_DB}`);
    await admin.query(`CREATE DATABASE ${TEST_DB}`);
  } finally {
    await admin.end();
  }

  // Aplica as migrations chamando o runner real (migrate.js), só apontando o
  // DB_DATABASE pro banco de teste. O dotenv do db.js não sobrescreve env já
  // setado, então essa troca vence sem tocar no .env.
  execFileSync('node', ['migrate.js'], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, DB_DATABASE: TEST_DB },
    stdio: 'pipe',
  });
}

// Pool conectado ao banco de teste, pras asserções.
function testPool() {
  return new Pool({ ...baseConfig(), database: TEST_DB });
}

module.exports = { resetTestDatabase, testPool, TEST_DB };
