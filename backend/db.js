require('dotenv').config();
const { Pool } = require('pg');

const isProduction = process.env.NODE_ENV === 'production';

// Cria o objeto de configuração inicial
const config = {
  // O SSL é necessário em produção (Render)
  ssl: isProduction ? { rejectUnauthorized: false } : false,
};

// Se a DATABASE_URL estiver definida (no Render ou no .env.local para scripts),
// usa-a. Esta tem prioridade.
if (process.env.DATABASE_URL) {
  config.connectionString = process.env.DATABASE_URL;
} else {
  // Caso contrário (no nosso ambiente Docker), usa as variáveis individuais
  // do ficheiro .env.
  config.user = process.env.DB_USER;
  config.host = process.env.DB_HOST;
  config.database = process.env.DB_DATABASE;
  config.password = process.env.DB_PASSWORD;
  config.port = process.env.DB_PORT;
}

const pool = new Pool(config);

module.exports = {
  query: (text, params) => pool.query(text, params),
};