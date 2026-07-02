-- 0003 — catálogo: titulo deixa de ser único.
-- Remakes e reboots legitimamente têm o mesmo título (ex: God of War 2005 vs
-- 2018). A identidade de duplicata passa a ser rawg_id/hltb_id (unique parcial,
-- migration 0002). Título repetido com ids diferentes (ou ausentes) é entrada
-- distinta de propósito.

ALTER TABLE jogos DROP CONSTRAINT IF EXISTS jogos_titulo_key;
