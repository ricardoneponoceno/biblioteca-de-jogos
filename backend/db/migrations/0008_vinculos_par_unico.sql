-- 0008 — fecha uma lacuna da 0007: a UNIQUE (solicitante_id, destinatario_id, tipo)
-- só bloqueia duplicar a MESMA direção (A→B duas vezes). Nada no banco impedia
-- A→B e B→A coexistirem pro mesmo tipo — duas linhas espelhando a mesma relação,
-- contrariando o que o comentário do endpoint POST /vinculos já dizia ser a
-- intenção ("uma vez aceito, o vínculo é simétrico... não duplicar duas linhas").
-- Hoje o botão do frontend não deixa isso acontecer (quem já é amigo só vê
-- "Desfazer", não "Adicionar"), mas nada no schema impedia via API direta.
--
-- Fix: duas colunas geradas (par_menor_id/par_maior_id, sempre o par ordenado
-- pelo id, independente de quem pediu) substituem a UNIQUE antiga — agora o
-- banco garante no máximo um registro por par+tipo, em qualquer direção.
-- solicitante_id/destinatario_id continuam existindo do jeito que estão: ainda
-- importam pra saber quem convidou (estado 'pendente'), só não fazem mais parte
-- da constraint de unicidade.

ALTER TABLE vinculos
    ADD COLUMN par_menor_id  INTEGER GENERATED ALWAYS AS (LEAST(solicitante_id, destinatario_id)) STORED,
    ADD COLUMN par_maior_id  INTEGER GENERATED ALWAYS AS (GREATEST(solicitante_id, destinatario_id)) STORED;

ALTER TABLE vinculos DROP CONSTRAINT vinculos_solicitante_id_destinatario_id_tipo_key;
ALTER TABLE vinculos ADD CONSTRAINT vinculos_par_tipo_key UNIQUE (par_menor_id, par_maior_id, tipo);
