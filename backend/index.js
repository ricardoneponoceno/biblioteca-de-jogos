// Importa as bibliotecas
require('dotenv').config({ path: './.env' });
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('./db');

const JWT_SECRET = process.env.JWT_SECRET;
// Falha cedo, no boot, em vez de subir "saudável" e só quebrar na primeira
// requisição de auth — sem o segredo, assinar/verificar token é impossível.
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET não definido — configure a variável de ambiente antes de iniciar o servidor.');
}
const JWT_EXPIRES_IN = '30d';
// Hash "de mentira" pra comparar quando o username não existe — sem isso, bcrypt.compare()
// só roda quando o usuário é encontrado, e login com username inexistente responde muito
// mais rápido que senha errada (mesma mensagem de erro, tempo de resposta diferente:
// um atacante consegue enumerar usernames cadastrados só medindo o tempo).
const DUMMY_HASH = bcrypt.hashSync('senha-de-mentira-so-pra-gastar-tempo-de-cpu', 10);

const app = express();
const port = process.env.PORT || 3000;

// --- Configuração de CORS Dinâmica ---
const allowedOrigins = process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : [];

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Não permitido pela política de CORS'));
    }
  },
  // Sem isso, o navegador não deixa o JS ler o header X-New-Token da resposta —
  // CORS só expõe um conjunto pequeno de headers "seguros" por padrão.
  exposedHeaders: ['X-New-Token'],
};

app.use(cors(corsOptions));
app.use(express.json());

// --- ROTAS ---

app.get('/', (req, res) => {
  res.send('API da Biblioteca de Jogos está a funcionar!');
});

app.get('/config', (req, res) => {
  res.json({
    hltbApiUrl: process.env.HLTB_API_URL,
    rawgApiUrl: process.env.RAWG_API_URL,
  });
});

function assinarToken(usuario) {
  return jwt.sign({ usuario_id: usuario.id, is_admin: usuario.is_admin }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN, algorithm: 'HS256' });
}

const QUINZE_DIAS_EM_SEGUNDOS = 15 * 24 * 60 * 60;

// Exige um JWT válido no header Authorization: Bearer <token>. Renovação deslizante:
// se faltar menos de 15 dias pra expirar, devolve um token novo no header X-New-Token
// (o frontend precisa checar esse header em toda resposta e substituir o token guardado).
function autenticar(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Não autenticado.' });
  }
  const token = authHeader.slice('Bearer '.length);
  try {
    // algorithms explícito: não deixa o verify aceitar nada além de HS256
    // (defesa contra algorithm confusion caso um dia se use chave assimétrica).
    const payload = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
    // is_admin do token é só dica de UI (o frontend decodifica pra mostrar/esconder
    // botões); a autorização de verdade é o apenasAdmin, que relê is_admin do banco.
    req.usuario = { id: payload.usuario_id, is_admin: payload.is_admin };

    const segundosRestantes = payload.exp - Math.floor(Date.now() / 1000);
    if (segundosRestantes < QUINZE_DIAS_EM_SEGUNDOS) {
      res.setHeader('X-New-Token', assinarToken(req.usuario));
    }

    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token inválido ou expirado.' });
  }
}

// Exige que o usuário autenticado (já validado por autenticar()) seja admin. Usado nas
// rotas que editam o catálogo canônico de jogos — não confundir com o uso normal do app
// (gerenciar a própria biblioteca), que não exige is_admin nenhum.
// Relê is_admin do banco em vez de confiar no claim do token: senão uma demoção
// (is_admin -> false no banco) nunca teria efeito, porque o token antigo — e cada
// token renovado a partir dele — continuaria dizendo is_admin: true pra sempre.
async function apenasAdmin(req, res, next) {
  try {
    const result = await db.query('SELECT is_admin FROM usuarios WHERE id = $1', [req.usuario.id]);
    const usuario = result.rows[0];
    if (!usuario || !usuario.is_admin) {
      return res.status(403).json({ error: 'Apenas administradores podem realizar esta ação.' });
    }
    next();
  } catch (err) {
    console.error('Erro ao verificar permissão de admin:', err);
    res.status(500).json({ error: 'Erro ao verificar permissão.' });
  }
}

app.post('/registro', async (req, res) => {
  const { username, password } = req.body;
  // typeof antes de qualquer uso: um array (ex: password: ["a","b","c","d","e","f"])
  // tem .length e passaria na checagem de tamanho, quebrando só lá no bcrypt.
  if (typeof username !== 'string' || typeof password !== 'string' || !username || !password) {
    return res.status(400).json({ error: 'Username e senha são obrigatórios.' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'A senha precisa ter pelo menos 6 caracteres.' });
  }
  try {
    const password_hash = await bcrypt.hash(password, 10);
    const result = await db.query(
      'INSERT INTO usuarios(username, password_hash) VALUES ($1, $2) RETURNING id, username, is_admin',
      [username.trim().toLowerCase(), password_hash]
    );
    const usuario = result.rows[0];
    res.status(201).json({ token: assinarToken(usuario) });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Esse username já está cadastrado.' });
    }
    console.error('Erro ao registrar usuário:', err);
    res.status(500).json({ error: 'Erro ao registrar usuário.' });
  }
});

app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (typeof username !== 'string' || typeof password !== 'string' || !username || !password) {
    return res.status(400).json({ error: 'Username e senha são obrigatórios.' });
  }
  try {
    const result = await db.query('SELECT id, username, password_hash, is_admin FROM usuarios WHERE username = $1', [username.trim().toLowerCase()]);
    const usuario = result.rows[0];
    // Roda bcrypt.compare() sempre, mesmo sem usuário (contra o DUMMY_HASH) — o tempo de
    // resposta fica igual nos dois casos, sem vazar quais usernames estão cadastrados.
    const senhaValida = await bcrypt.compare(password, usuario ? usuario.password_hash : DUMMY_HASH);
    // Mensagem genérica de propósito — não indica se o username existe ou se a senha está errada.
    if (!usuario || !senhaValida) {
      return res.status(401).json({ error: 'Username ou senha inválidos.' });
    }
    res.status(200).json({ token: assinarToken(usuario) });
  } catch (err) {
    console.error('Erro ao fazer login:', err);
    res.status(500).json({ error: 'Erro ao fazer login.' });
  }
});

app.get('/generos', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM generos ORDER BY name ASC');
    res.status(200).json(result.rows);
  } catch (err) {
    console.error("Erro ao procurar géneros:", err);
    res.status(500).send({ error: 'Erro ao procurar os géneros.' });
  }
});

app.get('/jogos', async (req, res) => {
    const { titulo, plataforma, genero, gameplay_min, gameplay_max, metacritic_min, metacritic_max } = req.query;
    let query = `
      SELECT 
        j.*, 
        (SELECT array_agg(g.name) FROM generos g JOIN jogo_generos jg ON g.id = jg.genero_id WHERE jg.game_id = j.id) as generos
      FROM jogos j
    `;
    const whereClauses = [];
    const values = [];
    let paramIndex = 1;

    if (titulo) {
        whereClauses.push(`j.titulo ILIKE $${paramIndex++}`);
        values.push(`%${titulo}%`);
    }
    if (plataforma) {
        whereClauses.push(`j.plataforma = $${paramIndex++}`);
        values.push(plataforma);
    }
    if (gameplay_min) {
        whereClauses.push(`j.gameplay_minutos >= $${paramIndex++}`);
        values.push(gameplay_min);
    }
    if (gameplay_max) {
        whereClauses.push(`j.gameplay_minutos <= $${paramIndex++}`);
        values.push(gameplay_max);
    }
    if (metacritic_min) {
        whereClauses.push(`j.metacritic >= $${paramIndex++}`);
        values.push(metacritic_min);
    }
    if (metacritic_max) {
        whereClauses.push(`j.metacritic <= $${paramIndex++}`);
        values.push(metacritic_max);
    }
    if (genero) {
        query += ` JOIN jogo_generos jg_filter ON j.id = jg_filter.game_id JOIN generos g_filter ON jg_filter.genero_id = g_filter.id`;
        whereClauses.push(`g_filter.name = $${paramIndex++}`);
        values.push(genero);
    }

    if (whereClauses.length > 0) {
        query += ` WHERE ${whereClauses.join(' AND ')}`;
    }
    
    query += ` GROUP BY j.id ORDER BY j.titulo ASC`;

    try {
        const [filteredResult, totalResult] = await Promise.all([
            db.query(query, values),
            db.query('SELECT COUNT(*) FROM jogos')
        ]);
        res.status(200).json({
            filteredGames: filteredResult.rows,
            totalGames: parseInt(totalResult.rows[0].count, 10)
        });
    } catch (err) {
        console.error("Erro ao procurar jogos:", err);
        res.status(500).json({ error: 'Erro ao procurar os jogos no banco de dados.' });
    }
});

// Fase 2g: cadastrar jogo novo abre pra qualquer logado (sem apenasAdmin) —
// quem precisa do jogo cadastrado é quem vai tê-lo na biblioteca, não o admin.
// Editar/excluir jogo já existente (PUT/DELETE abaixo) continuam apenasAdmin:
// mexem em dado que outras pessoas já possuem, risco maior que só criar linha nova.
// Lacuna aceita conscientemente: sem fila de moderação ainda, o cadastro fica
// visível a todo mundo sem revisão — ok pros 3 usuários conhecidos hoje.
app.post('/jogos', autenticar, async (req, res) => {
  const { titulo, plataforma, lancamento, gameplay_minutos, metacritic, capa, generos, rawg_id, hltb_id } = req.body;
  if (!lancamento || lancamento === '') {
    return res.status(400).json({ error: "O campo 'Data de Lançamento' é obrigatório." });
  }

  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const insertGameQuery = `
      INSERT INTO jogos(titulo, plataforma, lancamento, gameplay_minutos, metacritic, capa, rawg_id, hltb_id)
      VALUES($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *;
    `;
    const gameValues = [titulo, plataforma, lancamento, gameplay_minutos, metacritic, capa, rawg_id ?? null, hltb_id ?? null];
    const newGameResult = await client.query(insertGameQuery, gameValues);
    const newGame = newGameResult.rows[0];

    if (generos && generos.length > 0) {
      const insertGenresQuery = 'INSERT INTO jogo_generos(game_id, genero_id) VALUES ' + generos.map((_, i) => `($${2*i + 1}, $${2*i + 2})`).join(',');
      const genreValues = generos.flatMap(generoId => [newGame.id, generoId]);
      await client.query(insertGenresQuery, genreValues);
    }

    await client.query('COMMIT');
    res.status(201).json(newGame);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error("Erro ao adicionar jogo:", err);
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Esse jogo já está no catálogo (mesmo id de RAWG ou HowLongToBeat).' });
    }
    res.status(500).json({ error: 'Erro ao adicionar o jogo.' });
  } finally {
    client.release();
  }
});

app.put('/jogos/:id', autenticar, apenasAdmin, async (req, res) => {
  const { id } = req.params;
  const { titulo, plataforma, lancamento, gameplay_minutos, metacritic, capa, generos, rawg_id, hltb_id } = req.body;
  if (!lancamento || lancamento === '') {
    return res.status(400).json({ error: "O campo 'Data de Lançamento' é obrigatório." });
  }

  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    const updateGameQuery = `
      UPDATE jogos
      SET titulo = $1, plataforma = $2, lancamento = $3, gameplay_minutos = $4, metacritic = $5, capa = $6, rawg_id = $7, hltb_id = $8
      WHERE id = $9
      RETURNING *;
    `;
    const gameValues = [titulo, plataforma, lancamento, gameplay_minutos, metacritic, capa, rawg_id ?? null, hltb_id ?? null, id];
    const updatedGameResult = await client.query(updateGameQuery, gameValues);
    
    if (updatedGameResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Jogo não encontrado.' });
    }
    
    await client.query('DELETE FROM jogo_generos WHERE game_id = $1', [id]);
    if (generos && generos.length > 0) {
      const insertGenresQuery = 'INSERT INTO jogo_generos(game_id, genero_id) VALUES ' + generos.map((_, i) => `($${2*i + 1}, $${2*i + 2})`).join(',');
      const genreValues = generos.flatMap(generoId => [id, generoId]);
      await client.query(insertGenresQuery, genreValues);
    }
    
    await client.query('COMMIT');
    res.status(200).json(updatedGameResult.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error("Erro ao atualizar jogo:", err);
     if (err.code === '23505') {
      return res.status(409).json({ error: 'Esse jogo já está no catálogo (mesmo id de RAWG ou HowLongToBeat).' });
    }
    res.status(500).json({ error: 'Erro ao atualizar o jogo.' });
  } finally {
    client.release();
  }
});

app.delete('/jogos/:id', autenticar, apenasAdmin, async (req, res) => {
    const { id } = req.params;
    const client = await db.getClient();
    try {
        await client.query('BEGIN');
        await client.query('DELETE FROM jogo_generos WHERE game_id = $1', [id]);
        const result = await client.query('DELETE FROM jogos WHERE id = $1', [id]);
        await client.query('COMMIT');

        if (result.rowCount > 0) {
            res.status(204).send();
        } else {
            res.status(404).json({ error: 'Jogo não encontrado.' });
        }
    } catch (err) {
        await client.query('ROLLBACK');
        console.error("Erro ao deletar jogo:", err);
        res.status(500).json({ error: 'Erro ao deletar o jogo.' });
    } finally {
        client.release();
    }
});

// --- Biblioteca pessoal (posses) — Fase 2b da #1 ---

app.get('/plataformas', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM plataformas ORDER BY nome ASC');
    res.status(200).json(result.rows);
  } catch (err) {
    console.error('Erro ao procurar plataformas:', err);
    res.status(500).json({ error: 'Erro ao procurar as plataformas.' });
  }
});

// Sem apenasAdmin: gerir a própria biblioteca é ação de qualquer usuário logado.
app.post('/posses', autenticar, async (req, res) => {
  const { jogo_id, plataforma_id, data_aquisicao } = req.body;
  if (!jogo_id || !plataforma_id) {
    return res.status(400).json({ error: 'jogo_id e plataforma_id são obrigatórios.' });
  }
  try {
    const result = await db.query(
      'INSERT INTO posses (usuario_id, jogo_id, plataforma_id, data_aquisicao) VALUES ($1, $2, $3, $4) RETURNING *',
      [req.usuario.id, jogo_id, plataforma_id, data_aquisicao || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Você já tem esse jogo cadastrado nessa plataforma.' });
    }
    if (err.code === '23503') {
      return res.status(400).json({ error: 'Jogo ou plataforma inexistente.' });
    }
    console.error('Erro ao criar posse:', err);
    res.status(500).json({ error: 'Erro ao adicionar o jogo à biblioteca.' });
  }
});

app.delete('/posses/:id', autenticar, async (req, res) => {
  const { id } = req.params;
  try {
    const result = await db.query('DELETE FROM posses WHERE id = $1 AND usuario_id = $2', [id, req.usuario.id]);
    if (result.rowCount > 0) {
      return res.status(204).send();
    }
    // O delete acima não diferencia "não existe" de "existe mas não é seu" — só
    // consulta de novo (sem o filtro de dono) pra decidir entre 404 e 403.
    const existe = await db.query('SELECT id FROM posses WHERE id = $1', [id]);
    if (existe.rows.length === 0) {
      return res.status(404).json({ error: 'Posse não encontrada.' });
    }
    return res.status(403).json({ error: 'Você só pode remover posses da sua própria biblioteca.' });
  } catch (err) {
    console.error('Erro ao deletar posse:', err);
    res.status(500).json({ error: 'Erro ao remover o jogo da biblioteca.' });
  }
});

// Consulta central da Fase 2c — sem a parte de amizade/co-posse (Fase 3), só
// WHERE p.usuario_id = :eu. GET /jogos permanece intacto, servindo de busca
// do catálogo pro autocomplete de "adicionar à biblioteca" (Fase 2d).
app.get('/biblioteca', autenticar, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT
         p.id AS posse_id,
         p.data_aquisicao,
         p.created_at AS posse_created_at,
         pl.id AS plataforma_id,
         pl.nome AS plataforma_nome,
         j.id AS jogo_id,
         j.titulo,
         j.lancamento,
         j.gameplay_minutos,
         j.metacritic,
         j.capa,
         j.plataforma,
         j.rawg_id,
         j.hltb_id,
         (SELECT array_agg(g.name) FROM generos g JOIN jogo_generos jg ON g.id = jg.genero_id WHERE jg.game_id = j.id) AS generos
       FROM posses p
       JOIN jogos j ON j.id = p.jogo_id
       JOIN plataformas pl ON pl.id = p.plataforma_id
       WHERE p.usuario_id = $1
       ORDER BY j.titulo ASC`,
      [req.usuario.id]
    );
    res.status(200).json(result.rows);
  } catch (err) {
    console.error('Erro ao procurar biblioteca:', err);
    res.status(500).json({ error: 'Erro ao procurar a biblioteca.' });
  }
});

// --- Vínculos entre pessoas (amizade / familiar) — Fase 3b da #3 ---
// Máquina de estados: alguém pede (pendente), o outro aceita/recusa. Convite
// reverso pendente (B já pediu pra A, A pede pra B) vira aceite em vez de um
// segundo registro. Direção só importa no convite — uma vez aceito, o vínculo
// é simétrico (os dois lados enxergam igual). Desenho completo na wiki
// ("Perfil do usuário").

const TIPOS_VINCULO = ['amizade', 'familiar'];

app.post('/vinculos', autenticar, async (req, res) => {
  const { destinatario_id, tipo } = req.body;
  if (!destinatario_id || !TIPOS_VINCULO.includes(tipo)) {
    return res.status(400).json({ error: 'destinatario_id e tipo (amizade|familiar) são obrigatórios.' });
  }
  if (destinatario_id === req.usuario.id) {
    return res.status(400).json({ error: 'Não é possível criar um vínculo consigo mesmo.' });
  }
  try {
    // Convite reverso: se a outra pessoa já tem um pedido pendente pra mim
    // (mesmo tipo), pedir de volta aceita o dela em vez de criar um segundo
    // registro — evita duas linhas espelhadas representando a mesma relação.
    const reverso = await db.query(
      `SELECT * FROM vinculos
       WHERE solicitante_id = $1 AND destinatario_id = $2 AND tipo = $3 AND status = 'pendente'`,
      [destinatario_id, req.usuario.id, tipo]
    );
    if (reverso.rows.length > 0) {
      const aceito = await db.query(
        `UPDATE vinculos SET status = 'aceito', resolved_at = now() WHERE id = $1 RETURNING *`,
        [reverso.rows[0].id]
      );
      return res.status(200).json(aceito.rows[0]);
    }

    // Já existe um registro nessa direção exata? A UNIQUE (solicitante,
    // destinatario, tipo) não distingue por status — sem esta checagem, um
    // pedido recusado uma vez ficaria bloqueado (23505) pra sempre nessa
    // direção, mesmo a pessoa querendo tentar de novo.
    const existente = await db.query(
      `SELECT * FROM vinculos WHERE solicitante_id = $1 AND destinatario_id = $2 AND tipo = $3`,
      [req.usuario.id, destinatario_id, tipo]
    );
    if (existente.rows.length > 0) {
      const atual = existente.rows[0];
      if (atual.status !== 'recusado') {
        return res.status(409).json({ error: 'Já existe um pedido desse tipo entre vocês.' });
      }
      // Recusado antes: pedir de novo reabre o mesmo registro em vez de criar
      // um segundo (a UNIQUE não permitiria de qualquer forma).
      const reaberto = await db.query(
        `UPDATE vinculos SET status = 'pendente', created_at = now(), resolved_at = NULL WHERE id = $1 RETURNING *`,
        [atual.id]
      );
      return res.status(201).json(reaberto.rows[0]);
    }

    const result = await db.query(
      `INSERT INTO vinculos (solicitante_id, destinatario_id, tipo) VALUES ($1, $2, $3) RETURNING *`,
      [req.usuario.id, destinatario_id, tipo]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Já existe um pedido desse tipo entre vocês.' });
    }
    if (err.code === '23503') {
      return res.status(400).json({ error: 'Usuário destinatário inexistente.' });
    }
    if (err.code === '23514') {
      return res.status(400).json({ error: 'Vínculo inválido.' });
    }
    console.error('Erro ao criar vínculo:', err);
    res.status(500).json({ error: 'Erro ao criar o vínculo.' });
  }
});

// Aceitar/recusar (só o destinatário) ou cancelar um pedido próprio (só o
// solicitante) — cancelar é só "recusar" visto do outro lado; não existe um
// status separado de "cancelado" (o CHECK da 0007 só permite pendente/
// aceito/recusado, de propósito, pra não multiplicar estado sem necessidade).
app.patch('/vinculos/:id', autenticar, async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  if (!['aceito', 'recusado'].includes(status)) {
    return res.status(400).json({ error: "status deve ser 'aceito' ou 'recusado'." });
  }
  try {
    const existente = await db.query('SELECT * FROM vinculos WHERE id = $1', [id]);
    if (existente.rows.length === 0) {
      return res.status(404).json({ error: 'Vínculo não encontrado.' });
    }
    const vinculo = existente.rows[0];
    if (vinculo.status !== 'pendente') {
      return res.status(409).json({ error: 'Este vínculo já foi resolvido.' });
    }

    const souDestinatario = vinculo.destinatario_id === req.usuario.id;
    const souSolicitante = vinculo.solicitante_id === req.usuario.id;
    if (status === 'aceito' && !souDestinatario) {
      return res.status(403).json({ error: 'Só o destinatário pode aceitar o pedido.' });
    }
    if (status === 'recusado' && !souDestinatario && !souSolicitante) {
      return res.status(403).json({ error: 'Você não faz parte deste vínculo.' });
    }

    const result = await db.query(
      `UPDATE vinculos SET status = $1, resolved_at = now() WHERE id = $2 RETURNING *`,
      [status, id]
    );
    res.status(200).json(result.rows[0]);
  } catch (err) {
    console.error('Erro ao atualizar vínculo:', err);
    res.status(500).json({ error: 'Erro ao atualizar o vínculo.' });
  }
});

// Desfazer um vínculo já aceito (qualquer um dos dois lados) — "desamizar" ou
// desfazer o vínculo familiar. Um pedido ainda pendente se cancela via PATCH,
// não aqui (ver comentário acima).
app.delete('/vinculos/:id', autenticar, async (req, res) => {
  const { id } = req.params;
  try {
    const existente = await db.query('SELECT * FROM vinculos WHERE id = $1', [id]);
    if (existente.rows.length === 0) {
      return res.status(404).json({ error: 'Vínculo não encontrado.' });
    }
    const vinculo = existente.rows[0];
    if (vinculo.solicitante_id !== req.usuario.id && vinculo.destinatario_id !== req.usuario.id) {
      return res.status(403).json({ error: 'Você não faz parte deste vínculo.' });
    }
    if (vinculo.status !== 'aceito') {
      return res
        .status(400)
        .json({ error: 'Só é possível desfazer um vínculo aceito — peça pra cancelar/recusar via PATCH.' });
    }
    await db.query('DELETE FROM vinculos WHERE id = $1', [id]);
    res.status(204).send();
  } catch (err) {
    console.error('Erro ao desfazer vínculo:', err);
    res.status(500).json({ error: 'Erro ao desfazer o vínculo.' });
  }
});

app.get('/vinculos/pendentes', autenticar, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT v.*, u.username AS solicitante_username
       FROM vinculos v
       JOIN usuarios u ON u.id = v.solicitante_id
       WHERE v.destinatario_id = $1 AND v.status = 'pendente'
       ORDER BY v.created_at ASC`,
      [req.usuario.id]
    );
    res.status(200).json(result.rows);
  } catch (err) {
    console.error('Erro ao buscar vínculos pendentes:', err);
    res.status(500).json({ error: 'Erro ao buscar solicitações pendentes.' });
  }
});

// --- Perfil do usuário — Fase 3b-ii da #3 ---
// GET /usuarios/:username/perfil: cabeçalho (username, bio, contadores).
// GET /usuarios/:username/biblioteca: biblioteca EFETIVA da pessoa (posses
// próprias + as que entram por vínculo familiar aceito), sem revelar de qual
// conta cada jogo veio — só a plataforma (ver "Testes" na wiki: não-vazamento
// de origem é o ponto que mais importa aqui). ?em_comum=true recorta pra
// interseção com a minha biblioteca efetiva, exigindo amizade aceita.

app.get('/usuarios/:username/perfil', autenticar, async (req, res) => {
  const { username } = req.params;
  try {
    const usuarioResult = await db.query('SELECT id, username, bio FROM usuarios WHERE username = $1', [username]);
    if (usuarioResult.rows.length === 0) {
      return res.status(404).json({ error: 'Usuário não encontrado.' });
    }
    const dono = usuarioResult.rows[0];

    // Relação entre QUEM ESTÁ VENDO (req.usuario.id) e o dono do perfil — é o
    // que o frontend precisa pra desenhar o botão de ação ("Adicionar amigo"
    // vs. "Solicitação enviada" vs. "Aceitar", conforme quem foi o
    // solicitante). Addendum achado ao desenhar a 3c: sem isso o perfil não
    // dava pra saber o estado do vínculo com quem está olhando.
    const VINCULO_COM_VISITANTE_SQL = `
      SELECT id, status, solicitante_id, destinatario_id FROM vinculos
      WHERE tipo = $3
        AND ((solicitante_id = $1 AND destinatario_id = $2) OR (solicitante_id = $2 AND destinatario_id = $1))
      ORDER BY (status <> 'recusado') DESC, created_at DESC
      LIMIT 1
    `;

    const [jogos, amigos, familia, vinculoAmizade, vinculoFamiliar] = await Promise.all([
      db.query('SELECT count(*)::int AS n FROM posses WHERE usuario_id = $1', [dono.id]),
      db.query(
        `SELECT count(*)::int AS n FROM vinculos
         WHERE tipo = 'amizade' AND status = 'aceito' AND (solicitante_id = $1 OR destinatario_id = $1)`,
        [dono.id]
      ),
      db.query(
        `SELECT count(*)::int AS n FROM vinculos
         WHERE tipo = 'familiar' AND status = 'aceito' AND (solicitante_id = $1 OR destinatario_id = $1)`,
        [dono.id]
      ),
      db.query(VINCULO_COM_VISITANTE_SQL, [req.usuario.id, dono.id, 'amizade']),
      db.query(VINCULO_COM_VISITANTE_SQL, [req.usuario.id, dono.id, 'familiar']),
    ]);

    res.status(200).json({
      id: dono.id, // precisa vazar (não é sensível) — é o destinatario_id que POST /vinculos exige
      username: dono.username,
      bio: dono.bio,
      contadores: { jogos: jogos.rows[0].n, amigos: amigos.rows[0].n, familia: familia.rows[0].n },
      vinculo_amizade: vinculoAmizade.rows[0] || null,
      vinculo_familiar: vinculoFamiliar.rows[0] || null,
    });
  } catch (err) {
    console.error('Erro ao buscar perfil:', err);
    res.status(500).json({ error: 'Erro ao buscar o perfil.' });
  }
});

// "Membros" cuja posse conta pra biblioteca efetiva do usuário no parâmetro
// $N: a própria pessoa, mais quem tem vínculo familiar aceito com ela
// (simétrico — não importa quem foi o solicitante do convite). Parametrizado
// por índice porque a consulta de ?em_comum precisa da mesma lógica duas
// vezes (dono do perfil e quem está pedindo), com placeholders diferentes.
const membrosEfetivaSql = (paramIndex) => `
  SELECT $${paramIndex}::int AS usuario_id
  UNION
  SELECT CASE WHEN v.solicitante_id = $${paramIndex} THEN v.destinatario_id ELSE v.solicitante_id END
  FROM vinculos v
  WHERE v.tipo = 'familiar' AND v.status = 'aceito' AND $${paramIndex} IN (v.solicitante_id, v.destinatario_id)
`;

// Colunas selecionadas de propósito: só jogo + plataforma, nunca usuario_id
// nem posse_id — é o que garante que a origem (própria vs. familiar) não
// vaza pra quem está vendo o perfil de outra pessoa.
const COLUNAS_JOGO_SQL = `
  j.id AS jogo_id, j.titulo, j.lancamento, j.gameplay_minutos, j.metacritic, j.capa,
  pl.id AS plataforma_id, pl.nome AS plataforma_nome,
  (SELECT array_agg(g.name) FROM generos g JOIN jogo_generos jg ON g.id = jg.genero_id WHERE jg.game_id = j.id) AS generos
`;

app.get('/usuarios/:username/biblioteca', autenticar, async (req, res) => {
  const { username } = req.params;
  const emComum = req.query.em_comum === 'true';
  try {
    const usuarioResult = await db.query('SELECT id FROM usuarios WHERE username = $1', [username]);
    if (usuarioResult.rows.length === 0) {
      return res.status(404).json({ error: 'Usuário não encontrado.' });
    }
    const donoId = usuarioResult.rows[0].id;

    if (emComum) {
      const amizade = await db.query(
        `SELECT 1 FROM vinculos
         WHERE tipo = 'amizade' AND status = 'aceito'
           AND ((solicitante_id = $1 AND destinatario_id = $2) OR (solicitante_id = $2 AND destinatario_id = $1))`,
        [req.usuario.id, donoId]
      );
      if (amizade.rows.length === 0) {
        return res.status(403).json({ error: 'É preciso ser amigo pra ver os jogos em comum.' });
      }

      const result = await db.query(
        `WITH membros_dono AS (${membrosEfetivaSql(1)}),
              membros_eu AS (${membrosEfetivaSql(2)}),
              biblioteca_dono AS (
                SELECT DISTINCT p.jogo_id, p.plataforma_id FROM posses p
                JOIN membros_dono m ON m.usuario_id = p.usuario_id
              ),
              biblioteca_eu AS (
                SELECT DISTINCT p.jogo_id, p.plataforma_id FROM posses p
                JOIN membros_eu m ON m.usuario_id = p.usuario_id
              )
         SELECT ${COLUNAS_JOGO_SQL}
         FROM biblioteca_dono bd
         JOIN biblioteca_eu be ON be.jogo_id = bd.jogo_id AND be.plataforma_id = bd.plataforma_id
         JOIN jogos j ON j.id = bd.jogo_id
         JOIN plataformas pl ON pl.id = bd.plataforma_id
         ORDER BY j.titulo ASC`,
        [donoId, req.usuario.id]
      );
      return res.status(200).json(result.rows);
    }

    const result = await db.query(
      `WITH membros AS (${membrosEfetivaSql(1)})
       SELECT DISTINCT ${COLUNAS_JOGO_SQL}
       FROM posses p
       JOIN membros m ON m.usuario_id = p.usuario_id
       JOIN jogos j ON j.id = p.jogo_id
       JOIN plataformas pl ON pl.id = p.plataforma_id
       ORDER BY j.titulo ASC`,
      [donoId]
    );
    res.status(200).json(result.rows);
  } catch (err) {
    console.error('Erro ao buscar biblioteca do perfil:', err);
    res.status(500).json({ error: 'Erro ao buscar a biblioteca.' });
  }
});

// Handler de erro genérico — sem isso, exceções não tratadas por uma rota (ex: payload
// maior que o limite do body-parser) caem na página de erro padrão do Express, que
// devolve stack trace e caminho de arquivo em HTML. Precisa dos 4 parâmetros (err, req,
// res, next) pra o Express reconhecer como error handler, mesmo sem usar "next".
app.use((err, req, res, next) => {
  console.error('Erro não tratado:', err);
  res.status(err.status || 500).json({ error: 'Erro interno do servidor.' });
});

// Guardado atrás de require.main pra o módulo ser importável em teste sem
// subir um servidor de verdade (o teste sobe o próprio listener, se precisar).
if (require.main === module) {
  app.listen(port, () => {
    console.log(`Servidor executando na porta ${port}`);
  });
}

module.exports = app;
