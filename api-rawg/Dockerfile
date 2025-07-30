# Usar uma imagem oficial do Python como base
FROM python:3.11-slim

# Definir o diretório de trabalho dentro do contentor
WORKDIR /app

# Copiar o ficheiro de dependências
COPY requirements.txt .

# Instalar as dependências
RUN pip install --no-cache-dir -r requirements.txt

# Copiar o resto do código da aplicação
COPY . .

# Expor a porta que a aplicação irá usar (o Gunicorn usa a 8000 por defeito)
EXPOSE 8000

# Comando para iniciar a aplicação com o Gunicorn
# Substitua "api:app" se o seu ficheiro ou instância Flask tiverem nomes diferentes
CMD ["gunicorn", "--bind", "0.0.0.0:8000", "api_rawg:app"]