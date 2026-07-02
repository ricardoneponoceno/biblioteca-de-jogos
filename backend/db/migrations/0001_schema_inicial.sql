-- 0001 — schema inicial
-- Formaliza as tabelas que já existem em produção (jogos, generos, jogo_generos).
-- Idempotente (CREATE TABLE IF NOT EXISTS): rodar contra um banco que já tem
-- essas tabelas é no-op — só serve pra registrar o baseline na schema_migrations.

CREATE TABLE IF NOT EXISTS jogos (
    id SERIAL PRIMARY KEY,
    titulo VARCHAR(255) NOT NULL UNIQUE,
    plataforma VARCHAR(50) NOT NULL,
    lancamento DATE,
    gameplay_minutos INTEGER,
    metacritic INTEGER CHECK (metacritic >= 0 AND metacritic <= 100),
    capa TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS generos (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS jogo_generos (
    game_id INTEGER NOT NULL REFERENCES jogos(id) ON DELETE CASCADE,
    genero_id INTEGER NOT NULL REFERENCES generos(id) ON DELETE CASCADE,
    PRIMARY KEY (game_id, genero_id)
);
