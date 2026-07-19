# 🎮 GameLib - Biblioteca de Jogos Pessoal

<div align="center">
  <img src="https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB" alt="React" />
  <img src="https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white" alt="Node.js" />
  <img src="https://img.shields.io/badge/Python-3776AB?style=for-the-badge&logo=python&logoColor=white" alt="Python" />
  <img src="https://img.shields.io/badge/PostgreSQL-316192?style=for-the-badge&logo=postgresql&logoColor=white" alt="PostgreSQL" />
  <img src="https://img.shields.io/badge/Docker-2CA5E0?style=for-the-badge&logo=docker&logoColor=white" alt="Docker" />
</div>

<br />

Uma aplicação Full-Stack desenvolvida para catalogar, gerenciar e exibir uma biblioteca pessoal de games. O sistema automatiza a busca de informações cruciais (como tempo de jogo, nota no Metacritic e capas) integrando-se a APIs externas e realizando web scraping seguro.

> **Acesse o projeto em produção:** [https://games.laricks.com.br](https://games.laricks.com.br)

---

## 📸 Demonstração

![Demonstração do Sistema - GIF](https://github.com/user-attachments/assets/ca8b5798-8d8e-43e5-9224-9f239ea12a78)

<div align="center">
  <table>
    <tr>
      <td align="center">
        <img src="https://github.com/user-attachments/assets/b83a586c-498c-43bb-ab4a-03e3bf1fac0b" height="400" />
        <br>
        Desktop View
      </td>
      <td align="center">
        <img src="https://github.com/user-attachments/assets/62c606b2-46ae-4c5d-a7b9-d144bcb1662d" height="400" />
        <br>
        Mobile View
      </td>
    </tr>
  </table>
</div>

---

## ✨ Funcionalidades

- **Catálogo Dinâmico:** Visualização em grid estilo "Poster", adaptável para Desktop e Mobile.
- **Automação de Dados (Scraping/APIs):** Ao digitar o nome do jogo, o sistema busca automaticamente:
  - Tempo médio de conclusão (via API customizada do *HowLongToBeat*).
  - Nota no Metacritic e data de lançamento (via *RAWG API*).
  - Capa do jogo em alta resolução.
- **Filtros Avançados:** Busca por título, plataforma, gêneros, tempo de gameplay ou nota do Metacritic.
- **Modo Administrador:** Ações de adicionar, editar e excluir jogos são ocultadas do público e liberadas apenas através de uma flag de autenticação em LocalStorage.
- **Responsividade Total:** Interface construída com TailwindCSS garantindo usabilidade em qualquer tamanho de tela.

---

## 🛠️ Tecnologias e Arquitetura

O projeto foi construído utilizando uma arquitetura baseada em microserviços orquestrados via Docker.

### Frontend
- **React.js** (via Babel standalone para simplicidade de deploy sem build complexo inicial).
- **Tailwind CSS** para estilização utilitária e responsiva.
- **Axios** para requisições HTTP.

### Backend (Core)
- **Node.js** com **Express**.
- **PostgreSQL** como banco de dados relacional (modelagem de relação N:N para gêneros).

### Microserviços de Dados (Python)
- **API HLTB:** Serviço construído com *Flask* e *BeautifulSoup* para extrair o tempo de jogo diretamente do site HowLongToBeat, burlando bloqueios comuns de Data Centers.
- **API RAWG:** Serviço de proxy para consumir a API pública do RAWG de forma segura, ocultando a chave da API do frontend.

### Infraestrutura & DevOps
- **Docker** & **Docker Compose** para conteinerização e orquestração de todos os 5 serviços.
- **Nginx** atuando como Reverse Proxy.
- **Certbot / Let's Encrypt** para geração e renovação automática de certificados SSL (HTTPS).
- Hospedado em uma instância **Oracle Cloud**.

---

## 🚀 Como Executar o Projeto Localmente

### Pré-requisitos
Certifique-se de ter o **Docker** e o **Docker Compose** instalados na sua máquina. <br>
Gerar sua chave da **API** do **RAWG** em: https://rawg.io/apidocs

### Passos

1. **Clone o repositório:**
   ```bash
   git clone https://github.com/ricardoneponoceno/biblioteca-de-jogos.git
   cd biblioteca-de-jogos
   ```

2. **Configure as Variáveis de Ambiente:**
   Na raiz do projeto, acesse a pasta `backend` e crie um arquivo `.env` baseado no `.env.example`:
   ```env
   PORT=3000
   DB_USER=admin
   DB_PASSWORD=admin
   DB_HOST=db
   DB_PORT=5432
   DB_NAME=gamelib_db
   CORS_ORIGIN=http://localhost:8081
   ```
   Acesse a pasta `api-rawg` e configure a sua chave da API do RAWG no arquivo `.env`:
   ```env
   RAWG_API_KEY=sua_chave_aqui
   ```

3. **Suba os contêineres com o Docker Compose:**
   ```bash
   docker compose up -d --build
   ```

4. **Aplique o schema do banco (migrations):**
   O banco sobe vazio — o schema é criado pelas migrations, não automaticamente. Rode:
   ```bash
   docker compose exec backend npm run migrate
   ```
   O comando é idempotente: aplica só o que ainda falta e pode ser rodado quantas vezes quiser. Sempre que houver uma migration nova (após um `git pull`, por exemplo), rode-o de novo.

5. **(Opcional) Popule dados de exemplo (seed):**
   Para um ambiente de desenvolvimento já com jogos e a lista de gêneros:
   ```bash
   docker compose exec backend npm run seed
   ```

6. **Acesse a aplicação:**
   Abra seu navegador em `http://localhost:8081`. 
   
   *Nota: Para habilitar os botões de edição/adição, acesse `http://localhost:8081?mode=admin` na primeira vez.*

---

## 🗄️ Estrutura do Banco de Dados

A base de dados foi modelada de forma normalizada para garantir integridade:

- Tabela `jogos`: Armazena os metadados principais (título, plataforma, capa, metacritic, etc).
- Tabela `generos`: Dicionário único de gêneros disponíveis.
- Tabela `jogo_generos`: Tabela pivô resolvendo o relacionamento Muitos-para-Muitos.

---

## 🤝 Contribuições

Contribuições, problemas e pedidos de funcionalidades são bem-vindos! Sinta-se à vontade para verificar a página de issues.

---

## 📝 Licença

Este projeto é [MIT](https://choosealicense.com/licenses/mit/) licenciado.
<br/>Feito com paixão para organizar o backlog de jogos! 🕹️
