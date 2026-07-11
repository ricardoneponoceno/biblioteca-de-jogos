-- 0007 — vinculos (amizade + vínculo familiar) + coluna bio em usuarios (#3, perfil).
--
-- Tabela genérica de vínculo entre pessoas, com um tipo discriminador:
--   amizade  → relação mútua; habilita ver a biblioteca do outro (comparação "em comum").
--   familiar → acesso físico compartilhado (Steam Family, casal, pai/filho); as posses de
--              um passam a aparecer na index do outro (leitura combinada).
-- Ciclo de vida: alguém pede (pendente), o outro aceita/recusa. A direção
-- (solicitante/destinatario) só importa no convite; uma vez aceito, o vínculo é simétrico.
-- Desenho completo na página "Perfil do usuário" da wiki.
--
-- O numero pula o 0006 de propósito: aquele é do importador (#4), numa branch paralela;
-- usar 0006 de novo colidiria quando as duas chegarem na main. Ver "Fases de implementação"
-- na wiki. Esta migration é o que a #3 implementa do vínculo; o efeito do tipo 'familiar'
-- na index é a Fase 3 da #1.

CREATE TABLE IF NOT EXISTS vinculos (
    id              SERIAL PRIMARY KEY,
    solicitante_id  INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    destinatario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    tipo            TEXT NOT NULL CHECK (tipo IN ('amizade', 'familiar')),
    status          TEXT NOT NULL DEFAULT 'pendente'
                      CHECK (status IN ('pendente', 'aceito', 'recusado')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved_at     TIMESTAMPTZ,
    UNIQUE (solicitante_id, destinatario_id, tipo),
    CHECK (solicitante_id <> destinatario_id)
);

-- Bio curta opcional, exibida no cabeçalho do perfil (editável só pelo dono).
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS bio TEXT;
