-- 0002 — catálogo: âncoras de identidade das fontes externas.
-- Adiciona rawg_id e hltb_id (nullable) a jogos. Quando presente, cada id de
-- fonte identifica um único jogo canônico — daí a unicidade parcial (só vale
-- para linhas em que o id não é NULL; os 327 jogos legados ficam todos NULL
-- e não conflitam entre si).
--
-- NÃO dropa o UNIQUE(titulo) ainda: isso está acoplado ao rework de identidade
-- no código (import.js usa ON CONFLICT (titulo); os endpoints POST/PUT /jogos
-- detectam duplicata pelo erro do UNIQUE) e vem numa migration posterior.

ALTER TABLE jogos ADD COLUMN IF NOT EXISTS rawg_id INTEGER;
ALTER TABLE jogos ADD COLUMN IF NOT EXISTS hltb_id INTEGER;

CREATE UNIQUE INDEX IF NOT EXISTS jogos_rawg_id_uniq ON jogos (rawg_id) WHERE rawg_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS jogos_hltb_id_uniq ON jogos (hltb_id) WHERE hltb_id IS NOT NULL;
