// Importa as bibliotecas
require('dotenv').config({ path: './.env' });
const express = require('express');
const cors = require('cors');
const db = require('./db');

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

app.post('/jogos', async (req, res) => {
  const { titulo, plataforma, lancamento, gameplay_minutos, metacritic, capa, generos } = req.body;
  if (!lancamento || lancamento === '') {
    return res.status(400).json({ error: "O campo 'Data de Lançamento' é obrigatório." });
  }

  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const insertGameQuery = `
      INSERT INTO jogos(titulo, plataforma, lancamento, gameplay_minutos, metacritic, capa) 
      VALUES($1, $2, $3, $4, $5, $6) 
      RETURNING *;
    `;
    const gameValues = [titulo, plataforma, lancamento, gameplay_minutos, metacritic, capa];
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
      return res.status(409).json({ error: `O jogo com o título "${titulo}" já existe.` });
    }
    res.status(500).json({ error: 'Erro ao adicionar o jogo.' });
  } finally {
    client.release();
  }
});

app.put('/jogos/:id', async (req, res) => {
  const { id } = req.params;
  const { titulo, plataforma, lancamento, gameplay_minutos, metacritic, capa, generos } = req.body;
  if (!lancamento || lancamento === '') {
    return res.status(400).json({ error: "O campo 'Data de Lançamento' é obrigatório." });
  }

  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    const updateGameQuery = `
      UPDATE jogos 
      SET titulo = $1, plataforma = $2, lancamento = $3, gameplay_minutos = $4, metacritic = $5, capa = $6 
      WHERE id = $7 
      RETURNING *;
    `;
    const gameValues = [titulo, plataforma, lancamento, gameplay_minutos, metacritic, capa, id];
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
      return res.status(409).json({ error: `O jogo com o título "${titulo}" já existe.` });
    }
    res.status(500).json({ error: 'Erro ao atualizar o jogo.' });
  } finally {
    client.release();
  }
});

app.delete('/jogos/:id', async (req, res) => {
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

app.listen(port, () => {
  console.log(`Servidor executando na porta ${port}`);
});
