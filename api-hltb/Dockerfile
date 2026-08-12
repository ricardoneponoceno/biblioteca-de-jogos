# Usar uma imagem oficial do Python como base
FROM python:3.11-slim

# Definir o diretório de trabalho dentro do contentor
WORKDIR /app

# Copiar o arquivo de dependências
COPY requirements.txt .

# Instalar as dependências
RUN pip install --no-cache-dir -r requirements.txt

# Copiar o resto do código da aplicação
COPY . .

# Expor a porta que a aplicação irá usar (o Gunicorn usa a 8000 por default)
EXPOSE 8000

# Comando para iniciar a aplicação com o Gunicorn
# Substitua "api:app" se o seu arquivo ou instância Flask tiverem nomes diferentes
#
# Sem --workers o Gunicorn sobe 1 worker sync, e o proxy atende uma requisição
# por vez: uma busca lenta no HowLongToBeat segura a fila inteira. Como o
# trabalho aqui é esperar rede, não CPU, threads resolvem melhor que processos —
# com --threads o Gunicorn já troca sozinho para o worker gthread.
#
# O --timeout 30 é só rede de segurança: o limite real é o UPSTREAM_TIMEOUT de
# 15s da aplicação, que devolve um 504 limpo em vez de deixar o Gunicorn matar o
# worker e derrubar junto as outras requisições que ele estivesse atendendo.
CMD ["gunicorn", "--bind", "0.0.0.0:8000", \
     "--workers", "2", "--threads", "4", "--timeout", "30", \
     "api:app"]