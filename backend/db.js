// Importa a biblioteca dotenv para carregar as variáveis de ambiente
require('dotenv').config();

// Importa a classe Pool da biblioteca pg
const { Pool } = require('pg');

// Cria uma nova instância do Pool usando a connection string
// Isto funciona tanto localmente (se tiver um .env) como em produção (Render)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // A linha abaixo é frequentemente necessária para ligar a bases de dados em produção
  // como as do Render, que usam ligações seguras (SSL).
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

// Exporta um objeto com um método query que utiliza o pool
module.exports = {
  query: (text, params) => pool.query(text, params),
};