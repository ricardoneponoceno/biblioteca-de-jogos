const fs = require('fs');

// Lê o URL do backend a partir da variável de ambiente do Vercel
const apiUrl = process.env.VITE_API_BASE_URL;

if (!apiUrl) {
  console.error('ERRO: A variável de ambiente VITE_API_BASE_URL não está definida!');
  process.exit(1);
}

// Cria o conteúdo do ficheiro config.js
const configContent = `
// Este ficheiro é gerado automaticamente durante o processo de build.
// Não o edite manualmente!

let API_BASE_URL = "${apiUrl}";
`;

// Escreve o ficheiro config.js dentro da pasta frontend
fs.writeFileSync('./frontend/config.js', configContent);
console.log('Ficheiro de configuração de produção (frontend/config.js) criado com sucesso!');