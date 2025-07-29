// Importa as bibliotecas
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const db = require('./db');

// Inicializa a aplicação express
const app = express();
const port = process.env.PORT || 3000;

// --- Configuração de CORS Dinâmica para Múltiplas Origens ---
const allowedOrigins = process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : [];

if (allowedOrigins.length === 0) {
  console.error("ERRO: A variável de ambiente CORS_ORIGIN não está definida.");
}

const corsOptions = {
  origin: (origin, callback) => {
    // Permite pedidos sem origem (ex: Postman, apps móveis)
    if (!origin) return callback(null, true);
    // Se a origem do pedido estiver na nossa lista de permitidos, permite-o
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Não permitido pela política de CORS'));
    }
  }
};
app.use(cors(corsOptions));


// Middlewares
app.use(express.json());

// --- PONTO DE CONFIGURAÇÃO PARA O FRONTEND ---
app.get('/config', (req, res) => {
  res.json({
    hltbApiUrl: process.env.HLTB_API_URL,
    rawgApiUrl: process.env.RAWG_API_URL,
  });
});


// Rota principal (teste)
app.get('/', (req, res) => {
  res.send('API da Biblioteca de Jogos está a funcionar!');
});

// --- ROTAS DO CRUD PARA JOGOS (sem alterações) ---
app.get('/jogos', async (req, res) => {
  try {
    const { plataforma, titulo, gameplay_min, gameplay_max, metacritic_min, metacritic_max } = req.query;
    let filterQuery = 'SELECT * FROM jogos';
    const conditions = [];
    const values = [];
    let paramIndex = 1;

    if (titulo) {
      conditions.push(`titulo ILIKE $${paramIndex++}`);
      values.push(`%${titulo}%`);
    }
    if (plataforma) {
      conditions.push(`plataforma ILIKE $${paramIndex++}`);
      values.push(`%${plataforma}%`);
    }
    if (gameplay_min) {
        conditions.push(`gameplay_minutos >= $${paramIndex++}`);
        values.push(parseInt(gameplay_min));
    }
    if (gameplay_max) {
        conditions.push(`gameplay_minutos <= $${paramIndex++}`);
        values.push(parseInt(gameplay_max));
    }
    if (metacritic_min) {
      conditions.push(`metacritic >= $${paramIndex++}`);
      values.push(parseInt(metacritic_min));
    }
     if (metacritic_max) {
      conditions.push(`metacritic <= $${paramIndex++}`);
      values.push(parseInt(metacritic_max));
    }

    if (conditions.length > 0) {
      filterQuery += ' WHERE ' + conditions.join(' AND ');
    }
    filterQuery += ' ORDER BY titulo ASC';
    
    const filteredResult = await db.query(filterQuery, values);
    const totalCountResult = await db.query('SELECT COUNT(*) FROM jogos');
    const totalGames = parseInt(totalCountResult.rows[0].count, 10);

    res.status(200).json({
      filteredGames: filteredResult.rows,
      totalGames: totalGames
    });

  } catch (err) {
    console.error(err);
    res.status(500).send('Erro ao procurar os jogos na base de dados.');
  }
});

app.post('/jogos', async (req, res) => {
  const { titulo, plataforma, lancamento, gameplay_minutos, metacritic, capa } = req.body;
  if (!titulo || !plataforma) {
    return res.status(400).json({ error: 'Título e plataforma são campos obrigatórios.' });
  }
  const query = `
    INSERT INTO jogos(titulo, plataforma, lancamento, gameplay_minutos, metacritic, capa)
    VALUES($1, $2, $3, $4, $5, $6)
    RETURNING *;
  `;
  const values = [titulo, plataforma, lancamento || null, gameplay_minutos, metacritic, capa];
  try {
    const result = await db.query(query, values);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    if (err.code === '23505') {
      return res.status(409).json({ error: `Já existe um jogo com o título "${titulo}" na sua biblioteca.` });
    }
    if (err.code === '22007') {
        return res.status(400).json({ error: 'O formato da data de lançamento é inválido.' });
    }
    res.status(500).send('Erro ao adicionar o novo jogo.');
  }
});

app.put('/jogos/:id', async (req, res) => {
  const { id } = req.params;
  const { titulo, plataforma, lancamento, gameplay_minutos, metacritic, capa } = req.body;
  if (!titulo || !plataforma) {
    return res.status(400).json({ error: 'Título e plataforma são campos obrigatórios.' });
  }
  const query = `
    UPDATE jogos 
    SET titulo = $1, plataforma = $2, lancamento = $3, gameplay_minutos = $4, metacritic = $5, capa = $6
    WHERE id = $7
    RETURNING *;
  `;
  const values = [titulo, plataforma, lancamento || null, gameplay_minutos, metacritic, capa, id];
  try {
    const result = await db.query(query, values);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Jogo não encontrado.' });
    }
    res.status(200).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    if (err.code === '23505') {
      return res.status(409).json({ error: `Já existe um jogo com o título "${titulo}" na sua biblioteca.` });
    }
    if (err.code === '22007') {
        return res.status(400).json({ error: 'O formato da data de lançamento é inválido.' });
    }
    res.status(500).send('Erro ao atualizar o jogo.');
  }
});

app.delete('/jogos/:id', async (req, res) => {
  const { id } = req.params;
  const query = 'DELETE FROM jogos WHERE id = $1;';
  try {
    const result = await db.query(query, [id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Jogo não encontrado.' });
    }
    res.status(204).send(); 
  } catch (err) {
    console.error(err);
    res.status(500).send('Erro ao eliminar o jogo.');
  }
});

// Inicia o servidor para escutar na porta definida
app.listen(port, () => {
  console.log(`Servidor a correr na porta ${port}`);
});
