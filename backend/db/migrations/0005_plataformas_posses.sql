-- 0005 — plataformas + posses (Fase 2a da #1).
-- Aditiva: não mexe em jogos.plataforma (coluna antiga fica intacta até o
-- backfill + cleanup, fases 2e/2f). Schema enxuto de propósito: mídia
-- física/digital e conta de origem ficam fora por ora (base atual é 100%
-- Epic) — ver "Dimensões além de plataforma" na proposta.

CREATE TABLE IF NOT EXISTS plataformas (
    id SERIAL PRIMARY KEY,
    nome VARCHAR(50) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS posses (
    id SERIAL PRIMARY KEY,
    usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    jogo_id INTEGER NOT NULL REFERENCES jogos(id) ON DELETE CASCADE,
    plataforma_id INTEGER NOT NULL REFERENCES plataformas(id),
    data_aquisicao DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (usuario_id, jogo_id, plataforma_id)
);
