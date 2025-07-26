# Use uma imagem Nginx leve como base
FROM nginx:1.23-alpine

# Copie todo o conteúdo da pasta frontend para a pasta padrão do Nginx
COPY frontend/. /usr/share/nginx/html/

# Copie nosso arquivo de configuração personalizado do Nginx para o local correto
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf

# Exponha a porta 80, que é a porta padrão do Nginx
EXPOSE 80

# O comando para iniciar o Nginx
CMD ["nginx", "-g", "daemon off;"]
