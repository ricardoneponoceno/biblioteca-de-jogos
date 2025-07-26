// Importa as bibliotecas
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const db = require('./db'); // Nosso módulo de conexão com o banco

// Inicializa a aplicação express
const app = express();
const port = process.env.PORT || 3000; // Usa a porta do .env ou 3000

// Middlewares
app.use(cors()); // Habilita o CORS para todas as rotas
app.use(express.json()); // Habilita o parsing de JSON no corpo das requisições

// Rota principal (teste)
app.get('/', (req, res) => {
  res.send('API da Biblioteca de Jogos está funcionando!');
});

// --- ROTAS DO CRUD PARA JOGOS ---

// ROTA GET: Listar todos os jogos (Read) com filtros
app.get('/jogos', async (req, res) => {
  try {
    const { plataforma, titulo, gameplay_min, gameplay_max, metacritic_min, metacritic_max } = req.query;

    let query = 'SELECT * FROM jogos';
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
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY titulo ASC';

    const result = await db.query(query, values);
    res.status(200).json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).send('Erro ao buscar os jogos no banco de dados.');
  }
});

// ROTA POST: Adicionar um novo jogo (Create)
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
  const values = [titulo, plataforma, lancamento, gameplay_minutos, metacritic, capa];

  try {
    const result = await db.query(query, values);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).send('Erro ao adicionar o novo jogo.');
  }
});

// ROTA PUT: Atualizar um jogo existente (Update)
app.put('/jogos/:id', async (req, res) => {
  const { id } = req.params; // Pega o ID da URL
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
  const values = [titulo, plataforma, lancamento, gameplay_minutos, metacritic, capa, id];

  try {
    const result = await db.query(query, values);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Jogo não encontrado.' });
    }
    res.status(200).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).send('Erro ao atualizar o jogo.');
  }
});

// ROTA DELETE: Deletar um jogo (Delete)
app.delete('/jogos/:id', async (req, res) => {
  const { id } = req.params; // Pega o ID da URL

  const query = 'DELETE FROM jogos WHERE id = $1;';
  
  try {
    const result = await db.query(query, [id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Jogo não encontrado.' });
    }
    // 204 significa "No Content", uma resposta padrão para delete bem-sucedido
    res.status(204).send(); 
  } catch (err) {
    console.error(err);
    res.status(500).send('Erro ao deletar o jogo.');
  }
});


// Inicia o servidor para escutar na porta definida
app.listen(port, () => {
  console.log(`Servidor rodando na porta ${port}`);
});
