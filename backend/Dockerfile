# Use uma imagem oficial do Node.js como base.
FROM node:18-alpine

# Crie e defina o diretório de trabalho dentro do contêiner
WORKDIR /usr/src/app

# Copie os arquivos de definição de pacotes primeiro para aproveitar o cache do Docker
COPY backend/package*.json ./

# Instale as dependências da aplicação
RUN npm install

# Copie o restante do código-fonte do backend para o diretório de trabalho
# A sintaxe "backend/." copia o CONTEÚDO da pasta, não a pasta em si.
COPY backend/. .

# Exponha a porta em que o servidor Node.js roda
EXPOSE 3000

# O comando para iniciar a aplicação quando o contêiner for executado
CMD [ "node", "index.js" ]
