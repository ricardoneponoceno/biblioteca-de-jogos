-- 0010 — logs individuais por jogo estilo Yamtrack e expansão de plataformas (Issue #5).
--
-- 1. Popula a tabela `plataformas` com consoles clássicos, portáteis, atuais e lojas de PC
--    (idempotente via ON CONFLICT (nome) DO NOTHING) para que registros de progresso
--    possam referenciar o sistema real (ex: Master System, SNES, PS2) sem usar "Emulador".
--
-- 2. Cria a tabela `logs_jogo` desacoplada de `posses` (UNIQUE por usuario_id, jogo_id),
--    permitindo registrar progresso/status/nota/datas/comentários tanto em jogos próprios
--    quanto em jogos emprestados da família ou jogados sem posse na coleção.

INSERT INTO plataformas (nome) VALUES
  ('Steam'),
  ('Epic'),
  ('GOG'),
  ('EA App'),
  ('Ubisoft'),
  ('Amazon Games'),
  ('Mídia física'),
  ('Master System'),
  ('Mega Drive'),
  ('Sega Saturn'),
  ('Dreamcast'),
  ('Game Gear'),
  ('NES'),
  ('SNES'),
  ('Nintendo 64'),
  ('GameCube'),
  ('Wii'),
  ('Wii U'),
  ('Nintendo Switch'),
  ('Nintendo Switch 2'),
  ('Game Boy / GBC'),
  ('Game Boy Advance'),
  ('Nintendo DS'),
  ('Nintendo 3DS'),
  ('PlayStation'),
  ('PlayStation 2'),
  ('PlayStation 3'),
  ('PlayStation 4'),
  ('PlayStation 5'),
  ('PSP'),
  ('PS Vita'),
  ('Xbox'),
  ('Xbox 360'),
  ('Xbox One'),
  ('Xbox Series X/S'),
  ('Arcade')
ON CONFLICT (nome) DO NOTHING;

CREATE TABLE IF NOT EXISTS logs_jogo (
    id                SERIAL PRIMARY KEY,
    usuario_id        INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    jogo_id           INTEGER NOT NULL REFERENCES jogos(id) ON DELETE CASCADE,
    plataforma_id     INTEGER REFERENCES plataformas(id),
    status            TEXT NOT NULL
                        CHECK (status IN ('planejando', 'em_andamento', 'concluido', 'pausado', 'abandonado')),
    nota              NUMERIC(3,1)
                        CHECK (nota >= 0 AND nota <= 10),
    progresso_minutos INTEGER
                        CHECK (progresso_minutos >= 0),
    data_inicio       DATE,
    data_termino      DATE,
    comentarios       TEXT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (usuario_id, jogo_id)
);
