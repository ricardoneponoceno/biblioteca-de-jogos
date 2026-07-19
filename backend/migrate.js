// Runner de migration simples.
// Aplica, em ordem, os arquivos .sql de db/migrations/ que ainda não foram aplicados,
// registrando cada um na tabela schema_migrations. Idempotente: rodar de novo só
// aplica o que falta. Reutiliza a conexão de db.js (que já resolve DATABASE_URL vs.
// variáveis do Docker, SSL e carrega o .env) — sem dotenv próprio.

const fs = require('fs');
const path = require('path');
const db = require('./db');

const migrationsDir = path.join(__dirname, 'db', 'migrations');

async function migrate() {
  const client = await db.getClient();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    const applied = new Set(
      (await client.query('SELECT filename FROM schema_migrations')).rows.map((r) => r.filename)
    );

    const files = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    let count = 0;
    for (const file of files) {
      if (applied.has(file)) continue;

      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      console.log(`Aplicando ${file}...`);
      try {
        // DDL + registro na mesma transação: se a migration falha, nada fica pela metade.
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
        await client.query('COMMIT');
        count++;
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(`Falha na migration ${file}: ${err.message}`);
      }
    }

    console.log(count === 0 ? 'Nenhuma migration pendente.' : `${count} migration(s) aplicada(s).`);
  } finally {
    client.release();
  }
}

migrate()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
