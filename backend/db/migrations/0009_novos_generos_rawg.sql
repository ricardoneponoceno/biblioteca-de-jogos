-- 0009 — novos gêneros para cobrir mapeamento 1:1 com a RAWG (Issue #13)
-- Idempotente (ON CONFLICT (name) DO NOTHING).

INSERT INTO generos (name) VALUES
  ('Arcade'),
  ('Cartas'),
  ('Casual'),
  ('Indie'),
  ('Tabuleiro')
ON CONFLICT (name) DO NOTHING;
