-- 0004 — usuários (Fase 1a da #1).
-- Schema enxuto de propósito: login é por email (decidido), username fica pra
-- uma futura issue de perfil individual — não é impeditivo adicionar depois.

CREATE TABLE IF NOT EXISTS usuarios (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    is_admin BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
