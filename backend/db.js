// Importa a biblioteca dotenv para carregar as variáveis de ambiente
require('dotenv').config();

// Importa a classe Pool da biblioteca pg
const { Pool } = require('pg');

// Cria uma nova instância do Pool com as configurações do banco de dados
// As variáveis são lidas do arquivo .env
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_DATABASE,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

// Exporta um objeto com um método query que utiliza o pool
module.exports = {
  query: (text, params) => pool.query(text, params),
};