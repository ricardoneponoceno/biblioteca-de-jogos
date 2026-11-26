-- 0011 — Imagem de exibição (avatar_url) na tabela usuarios (Issue #34).
-- Armazena URL externa (https://...) ou Data URL compacta (256x256 WebP/JPEG
-- gerada via Canvas no navegador, ~15-30 KB). Quando NULL, o frontend exibe o
-- fallback colorido determinístico com a inicial do username.

ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS avatar_url TEXT;
