-- 0006 — importador por plataforma (Fase 4a da #4).
-- jogos não muda nada de propósito: o catálogo compartilhado fica limpo,
-- sem entrada nenhuma visível até uma decisão humana confirmar (ver proposta
-- na wiki, "Por que não em jogos direto").

CREATE TABLE IF NOT EXISTS contas_plataforma (
    id SERIAL PRIMARY KEY,
    usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
    plataforma_id INTEGER NOT NULL REFERENCES plataformas(id),
    identificador_externo VARCHAR(64) NOT NULL,
    ultima_sincronizacao TIMESTAMPTZ,
    UNIQUE (usuario_id, plataforma_id)
);

-- Staging, pensada pra ser efêmera — some ao resolver, ou é limpa
-- periodicamente se ninguém revisar. Por isso não é ela quem garante a
-- idempotência de longo prazo (ver posses.identificador_externo, abaixo).
CREATE TABLE IF NOT EXISTS importacoes_pendentes (
    id SERIAL PRIMARY KEY,
    usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    plataforma_id INTEGER NOT NULL REFERENCES plataformas(id),
    identificador_externo VARCHAR(64) NOT NULL,
    titulo VARCHAR(255) NOT NULL,
    capa TEXT,
    jogo_id INTEGER REFERENCES jogos(id),
    resolvido_em TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE (usuario_id, plataforma_id, titulo)
);

-- Só preenchido quando a posse nasce de uma importação — manual continua NULL.
-- Sobrevive à limpeza de importacoes_pendentes; é o que permite uma
-- sincronização futura saber "já resolvi isso" mesmo sem o histórico da
-- staging table.
ALTER TABLE posses ADD COLUMN IF NOT EXISTS identificador_externo VARCHAR(64);
