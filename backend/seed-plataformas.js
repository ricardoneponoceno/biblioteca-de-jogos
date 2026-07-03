// Seed das plataformas — popula a tabela `plataformas` com a lista canônica
// usada nos formulários de posse (Fase 2a da #1). Idempotente (ON CONFLICT
// (nome) DO NOTHING): rodar de novo não duplica.
//
// Também cria um usuário de dev ("Marcelo") com duas posses de exemplo, só
// pra dar um ponto de partida pra testar a biblioteca pessoal localmente —
// não tem efeito nenhum em produção (script roda só quando alguém chama
// `npm run seed` no próprio ambiente).

const bcrypt = require('bcryptjs');
const db = require('./db');

const PLATAFORMAS = [
  'Steam', 'Epic', 'GOG', 'Nintendo Switch', 'PlayStation', 'Xbox', 'Mídia física',
];

const DEV_USER_EMAIL = 'marcelo@dev.local';
const DEV_USER_SENHA = 'dev123456';

async function seedPlataformas() {
  let inserted = 0;
  for (const nome of PLATAFORMAS) {
    const res = await db.query(
      'INSERT INTO plataformas (nome) VALUES ($1) ON CONFLICT (nome) DO NOTHING',
      [nome]
    );
    inserted += res.rowCount;
  }
  console.log(`Plataformas: ${inserted} inserida(s), ${PLATAFORMAS.length - inserted} já existente(s).`);
}

async function seedPossesDev() {
  const password_hash = await bcrypt.hash(DEV_USER_SENHA, 10);
  const userResult = await db.query(
    `INSERT INTO usuarios (email, password_hash) VALUES ($1, $2)
     ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email
     RETURNING id`,
    [DEV_USER_EMAIL, password_hash]
  );
  const usuarioId = userResult.rows[0].id;

  const steamResult = await db.query("SELECT id FROM plataformas WHERE nome = 'Steam'");
  const plataformaId = steamResult.rows[0].id;

  const jogosResult = await db.query('SELECT id FROM jogos ORDER BY id LIMIT 2');
  let inserted = 0;
  for (const { id: jogoId } of jogosResult.rows) {
    const res = await db.query(
      `INSERT INTO posses (usuario_id, jogo_id, plataforma_id)
       VALUES ($1, $2, $3) ON CONFLICT (usuario_id, jogo_id, plataforma_id) DO NOTHING`,
      [usuarioId, jogoId, plataformaId]
    );
    inserted += res.rowCount;
  }
  console.log(`Posses de exemplo (${DEV_USER_EMAIL} / ${DEV_USER_SENHA}): ${inserted} inserida(s).`);
}

seedPlataformas()
  .then(() => seedPossesDev())
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Erro ao popular plataformas/posses:', err);
    process.exit(1);
  });
