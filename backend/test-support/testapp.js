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
