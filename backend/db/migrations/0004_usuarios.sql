-- 0004 — usuários (Fase 1a da #1).
-- Login é por username, não email — o app não tem nenhuma infraestrutura de
-- envio de e-mail (sem verificação, sem "esqueci minha senha"), então email
-- não cumpriria papel nenhum além de identificador único de texto, que
-- username já cumpre. Username também é o mesmo campo que a #3 (Perfil
-- Público, rota /u/:username) ia precisar mais adiante — decidido usar já
-- aqui em vez de adicionar duas vezes.

CREATE TABLE IF NOT EXISTS usuarios (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    is_admin BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
