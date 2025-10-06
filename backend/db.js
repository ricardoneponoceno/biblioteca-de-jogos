// Importa as bibliotecas
require('dotenv').config({ path: './.env' });
const { Pool } = require('pg');

let pool;
const connectionConfig = {};

// Verifica se a DATABASE_URL existe (para produção no Render e scripts locais)
if (process.env.DATABASE_URL) {
  connectionConfig.connectionString = process.env.DATABASE_URL;
  // Apenas adiciona a configuração SSL se o URL não for localhost
  if (!process.env.DATABASE_URL.includes('localhost')) {
    connectionConfig.ssl = {
      rejectUnauthorized: false
    };
  }
} else {
  // Configuração para o Docker Compose (usando variáveis separadas)
  connectionConfig.user = process.env.DB_USER;
  connectionConfig.host = process.env.DB_HOST;
  connectionConfig.database = process.env.DB_DATABASE;
  connectionConfig.password = process.env.DB_PASSWORD;
  connectionConfig.port = process.env.DB_PORT;
}

pool = new Pool(connectionConfig);

// Exporta um objeto com os métodos query e getClient
module.exports = {
  query: (text, params) => pool.query(text, params),
  getClient: () => pool.connect(),
};

