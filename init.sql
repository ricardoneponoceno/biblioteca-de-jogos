-- Este script será executado automaticamente na primeira vez que o contêiner do banco de dados for iniciado.

CREATE TABLE IF NOT EXISTS jogos (
    id SERIAL PRIMARY KEY,
    titulo VARCHAR(255) NOT NULL UNIQUE, -- Adiciona a restrição UNIQUE
    plataforma VARCHAR(50) NOT NULL,
    lancamento DATE,
    gameplay_minutos INTEGER,
    metacritic INTEGER CHECK (metacritic >= 0 AND metacritic <= 100),
    capa TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
