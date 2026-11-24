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

- **Catálogo Dinâmico & Biblioteca Familiar:** Visualização em grid estilo "Poster" com suporte a contas individuais, compartilhamento de biblioteca por vínculo familiar e comparação de jogos em comum entre amigos.
- **Tracker de Progresso estilo Yamtrack (Issue #5):** Registro individual por usuário contendo:
  - **Status:** `Em andamento`, `Planejando`, `Concluído`, `Pausado` e `Abandonado`.
  - **Avaliação e Tempo:** Nota de `0` a `10` (com casa decimal, exibida com `★` no topo direito do card), tempo jogado em horas/minutos (exibido no rodapé esquerdo), datas de início/término (data de conclusão exibida no topo esquerdo) e comentários.
  - **Suporte a Jogos Sem Posse:** Permite rastrear jogos jogados fora da coleção própria (ex.: consoles clássicos como *Master System*, *SNES*, *PS2*) escolhendo a plataforma real sem inflar o contador de posses da biblioteca.
- **Importação Steam:** Sincronização da biblioteca Steam via `SteamID64` com fila de revisão e reconciliação contra o catálogo canônico.
- **Automação de Dados (Scraping/APIs):** Ao digitar o nome do jogo, o sistema busca automaticamente:
  - Tempo médio de conclusão (via API customizada do *HowLongToBeat*).
  - Nota no Metacritic, data de lançamento e sugestão automática de gêneros (via *RAWG API*).
  - Capa do jogo em alta resolução.
- **Filtros Avançados:** Busca por título, plataforma, gêneros, status do tracker, jogos duplicados na família, tempo de gameplay ou nota do Metacritic.
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
   DB_DATABASE=gamelib_db
   CORS_ORIGIN=http://localhost:8081
   HLTB_API_URL=http://localhost:3002/howlongtobeat
   RAWG_API_URL=http://localhost:3003/rawg
   JWT_SECRET=troque_por_um_segredo_longo_e_aleatorio
   STEAM_API_KEY=
   ```
   Acesse a pasta `api-rawg` e configure a sua chave da API do RAWG e o CORS no arquivo `.env`:
   ```env
   RAWG_API_KEY=sua_chave_aqui
   CORS_ORIGIN=http://localhost:8081
   ```
   Acesse a pasta `api-hltb` e crie um arquivo `.env` com o CORS:
   ```env
   CORS_ORIGIN=http://localhost:8081
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

- Tabela `jogos`: Armazena os metadados principais do catálogo canônico (título, lançamento, capa, metacritic, `rawg_id`, `hltb_id`, etc).
- Tabela `generos` e `jogo_generos`: Dicionário único de gêneros e tabela pivô N:N.
- Tabela `usuarios` e `vinculos`: Contas autenticadas via JWT (`HS256`) e relações simétricas de amizade e família.
- Tabela `plataformas` e `posses`: Sistemas/lojas (36 plataformas entre lojas de PC e consoles clássicos/atuais) e vínculo de posse de cada usuário.
- Tabela `logs_jogo`: Registro individual de progresso estilo Yamtrack (`status`, `nota`, `progresso_minutos`, `data_inicio`, `data_termino`, `comentarios`, `plataforma_id`), desacoplado de `posses`.
- Tabelas `contas_plataforma` e `importacoes_pendentes`: Vínculo de conta externa (Steam) e staging de reconciliação de jogos importados.

---

## 🤝 Contribuições

Contribuições, problemas e pedidos de funcionalidades são bem-vindos! Sinta-se à vontade para verificar a página de issues.

---

## 📝 Licença

Este projeto é [MIT](https://choosealicense.com/licenses/mit/) licenciado.
<br/>Feito com paixão para organizar o backlog de jogos! 🕹️
