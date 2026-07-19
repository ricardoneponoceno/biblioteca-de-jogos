// Seed de vínculos — cria um segundo usuário de dev ("ricardo") e uma amizade
// aceita entre ele e o "marcelo" (criado no seed-plataformas), só pra ter um
// par de exemplo pra testar o perfil e a comparação "em comum" localmente.
// Idempotente (ON CONFLICT DO NOTHING). Sem efeito em produção — roda só via
// `npm run seed` no próprio ambiente. Depende do seed-plataformas ter rodado
// antes (é ele que cria o "marcelo").

const bcrypt = require('bcryptjs');
const db = require('./db');

const PARCEIRO_USERNAME = 'ricardo';
const PARCEIRO_SENHA = 'dev123456';

async function seedVinculos() {
  const marcelo = await db.query("SELECT id FROM usuarios WHERE username = 'marcelo'");
  if (marcelo.rowCount === 0) {
    console.log("Vínculos: usuário 'marcelo' não existe — rode o seed de plataformas antes. Pulando.");
    return;
  }
  const marceloId = marcelo.rows[0].id;

  const password_hash = await bcrypt.hash(PARCEIRO_SENHA, 10);
  const parceiro = await db.query(
    `INSERT INTO usuarios (username, password_hash) VALUES ($1, $2)
     ON CONFLICT (username) DO UPDATE SET username = EXCLUDED.username
     RETURNING id`,
    [PARCEIRO_USERNAME, password_hash]
  );
  const parceiroId = parceiro.rows[0].id;

  const res = await db.query(
    `INSERT INTO vinculos (solicitante_id, destinatario_id, tipo, status, resolved_at)
     VALUES ($1, $2, 'amizade', 'aceito', now())
     ON CONFLICT (solicitante_id, destinatario_id, tipo) DO NOTHING`,
    [marceloId, parceiroId]
  );
  console.log(
    `Vínculos (amizade marcelo↔${PARCEIRO_USERNAME} / ${PARCEIRO_SENHA}): ${res.rowCount} inserido(s).`
  );
}

seedVinculos()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Erro ao popular vínculos:', err);
    process.exit(1);
  });
