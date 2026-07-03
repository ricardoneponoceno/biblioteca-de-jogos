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
// Hash "de mentira" pra comparar quando o email não existe — sem isso, bcrypt.compare()
// só roda quando o usuário é encontrado, e login com email inexistente responde muito
// mais rápido que senha errada (mesma mensagem de erro, tempo de resposta diferente:
// um atacante consegue enumerar emails cadastrados só medindo o tempo).
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
  const { email, password } = req.body;
  // typeof antes de qualquer uso: um array (ex: password: ["a","b","c","d","e","f"])
  // tem .length e passaria na checagem de tamanho, quebrando só lá no bcrypt.
  if (typeof email !== 'string' || typeof password !== 'string' || !email || !password) {
    return res.status(400).json({ error: 'Email e senha são obrigatórios.' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'A senha precisa ter pelo menos 6 caracteres.' });
  }
  try {
    const password_hash = await bcrypt.hash(password, 10);
    const result = await db.query(
      'INSERT INTO usuarios(email, password_hash) VALUES ($1, $2) RETURNING id, email, is_admin',
      [email.trim().toLowerCase(), password_hash]
    );
    const usuario = result.rows[0];
    res.status(201).json({ token: assinarToken(usuario) });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Esse email já está cadastrado.' });
    }
    console.error('Erro ao registrar usuário:', err);
    res.status(500).json({ error: 'Erro ao registrar usuário.' });
  }
});

app.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (typeof email !== 'string' || typeof password !== 'string' || !email || !password) {
    return res.status(400).json({ error: 'Email e senha são obrigatórios.' });
  }
  try {
    const result = await db.query('SELECT id, email, password_hash, is_admin FROM usuarios WHERE email = $1', [email.trim().toLowerCase()]);
    const usuario = result.rows[0];
    // Roda bcrypt.compare() sempre, mesmo sem usuário (contra o DUMMY_HASH) — o tempo de
    // resposta fica igual nos dois casos, sem vazar quais emails estão cadastrados.
    const senhaValida = await bcrypt.compare(password, usuario ? usuario.password_hash : DUMMY_HASH);
    // Mensagem genérica de propósito — não indica se o email existe ou se a senha está errada.
    if (!usuario || !senhaValida) {
      return res.status(401).json({ error: 'Email ou senha inválidos.' });
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

app.post('/jogos', autenticar, apenasAdmin, async (req, res) => {
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

// Handler de erro genérico — sem isso, exceções não tratadas por uma rota (ex: payload
// maior que o limite do body-parser) caem na página de erro padrão do Express, que
// devolve stack trace e caminho de arquivo em HTML. Precisa dos 4 parâmetros (err, req,
// res, next) pra o Express reconhecer como error handler, mesmo sem usar "next".
app.use((err, req, res, next) => {
  console.error('Erro não tratado:', err);
  res.status(err.status || 500).json({ error: 'Erro interno do servidor.' });
});

app.listen(port, () => {
  console.log(`Servidor executando na porta ${port}`);
});
