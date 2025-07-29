// Script para importar dados de um arquivo CSV para o banco de dados PostgreSQL

require('dotenv').config({ path: './.env.local' });
const fs = require('fs');
const { parse } = require('csv-parse');
const db = require('./db'); // Reutiliza nossa conexão com o banco

const csvFilePath = './jogos.csv';

// Função para processar o tempo de jogo (ex: "12h" -> 720)
const parseGameplay = (gameplayStr) => {
  if (!gameplayStr || !gameplayStr.includes('h')) {
    return null;
  }
  const horas = parseInt(gameplayStr.replace('h', ''), 10);
  return isNaN(horas) ? null : horas * 60;
};

// Função para formatar a data (ex: "14/05/2019" -> "2019-05-14")
const parseDate = (dateStr) => {
  if (!dateStr) {
    return null;
  }
  const parts = dateStr.split('/');
  if (parts.length !== 3) {
    return null;
  }
  // Formato: AAAA-MM-DD
  return `${parts[2]}-${parts[1]}-${parts[0]}`;
};

// Função para converter o Metacritic de forma segura
const parseMetacritic = (metacriticStr) => {
    if (!metacriticStr) return null;
    const num = parseInt(metacriticStr.trim(), 10);
    return isNaN(num) ? null : num;
}

const processFile = async () => {
  const records = [];
  const parser = fs.createReadStream(csvFilePath)
    .pipe(parse({
      delimiter: ',',
      from_line: 2 // Começa a ler da segunda linha para ignorar o cabeçalho
    }));

  console.log('Iniciando a leitura do arquivo CSV...');

  for await (const record of parser) {
    records.push(record);
  }

  console.log(`Leitura concluída. ${records.length} jogos encontrados.`);
  console.log('Iniciando a importação para o banco de dados...');

  for (const record of records) {
    const [titulo, plataforma, lancamento, gameplay, metacritic, capa] = record;

    if (!titulo || !plataforma) {
      console.warn('Registro ignorado por falta de título ou plataforma:', record);
      continue;
    }

    const query = `
      INSERT INTO jogos(titulo, plataforma, lancamento, gameplay_minutos, metacritic, capa)
      VALUES($1, $2, $3, $4, $5, $6)
      ON CONFLICT (titulo) DO NOTHING; 
    `;
    
    const values = [
      titulo.trim(),
      plataforma.trim(),
      parseDate(lancamento),
      parseGameplay(gameplay),
      parseMetacritic(metacritic), // CORREÇÃO: Usa a nova função segura
      capa ? capa.trim() : null
    ];

    try {
      await db.query(query, values);
      console.log(`- Jogo importado: ${titulo}`);
    } catch (err) {
      console.error(`Erro ao importar o jogo "${titulo}":`, err.message);
    }
  }

  console.log('\nImportação concluída com sucesso!');
};

processFile().catch(err => {
  console.error('Ocorreu um erro fatal durante o processo:', err);
});