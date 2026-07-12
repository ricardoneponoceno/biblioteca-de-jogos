// Apoio de teste — sobe o app real (index.js) numa porta efêmera contra o
// banco de teste, e sabe criar usuários com token válido pra bater nos
// endpoints autenticados. Reusado pela 3b-i (vínculos) e 3b-ii (perfil).

const jwt = require('jsonwebtoken');
const { resetTestDatabase, testPool, TEST_DB } = require('./testdb');

// Sobe o app numa porta efêmera contra um banco de teste do zero. Chame no
// before() de cada arquivo de teste; chame close() no after().
async function startTestApp() {
  await resetTestDatabase();
  process.env.DB_DATABASE = TEST_DB;
  delete require.cache[require.resolve('../index')]; // cada arquivo de teste roda em processo próprio, mas por clareza
  const app = require('../index');

  const server = app.listen(0);
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const pool = testPool();

  return {
    baseUrl,
    pool,
    async close() {
      await pool.end();
      await new Promise((resolve) => server.close(resolve));
    },
    // Cria um usuário direto no banco (sem passar pelo bcrypt de /registro,
    // que é lento e irrelevante pro que estes testes verificam) e devolve um
    // token no mesmo formato que assinarToken() gera no app.
    async criarUsuario(username) {
      const r = await pool.query(
        "INSERT INTO usuarios (username, password_hash) VALUES ($1, 'x') RETURNING id",
        [username]
      );
      const id = r.rows[0].id;
      const token = jwt.sign({ usuario_id: id, is_admin: false }, process.env.JWT_SECRET, {
        expiresIn: '30d',
        algorithm: 'HS256',
      });
      return { id, username, token };
    },
    // Fixtures pra 3b-ii (perfil/biblioteca) — `jogos.plataforma` é a coluna
    // legada NOT NULL (Fase 2f ainda não rodou), sem relação com a
    // `plataforma_id` real da posse; qualquer texto serve aqui.
    async criarJogo(titulo) {
      const r = await pool.query(
        "INSERT INTO jogos (titulo, plataforma) VALUES ($1, 'legado') RETURNING id",
        [titulo]
      );
      return r.rows[0].id;
    },
    async criarPlataforma(nome) {
      const r = await pool.query(
        'INSERT INTO plataformas (nome) VALUES ($1) ON CONFLICT (nome) DO UPDATE SET nome = EXCLUDED.nome RETURNING id',
        [nome]
      );
      return r.rows[0].id;
    },
    async criarPosse(usuarioId, jogoId, plataformaId) {
      await pool.query(
        'INSERT INTO posses (usuario_id, jogo_id, plataforma_id) VALUES ($1, $2, $3)',
        [usuarioId, jogoId, plataformaId]
      );
    },
    // Vínculo já aceito, direto no banco — os testes de máquina de estados
    // (3b-i) já cobrem o ciclo pedir/aceitar via endpoint; aqui só precisamos
    // do estado final.
    async criarVinculoAceito(aId, bId, tipo) {
      await pool.query(
        `INSERT INTO vinculos (solicitante_id, destinatario_id, tipo, status, resolved_at)
         VALUES ($1, $2, $3, 'aceito', now())`,
        [aId, bId, tipo]
      );
    },
  };
}

// Wrapper fino sobre fetch pra não repetir baseUrl/headers em todo teste.
function authedFetch(baseUrl, path, { method = 'GET', token, body } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  return fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

module.exports = { startTestApp, authedFetch };
