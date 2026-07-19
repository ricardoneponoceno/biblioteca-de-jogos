// Backfill de posses a partir do catálogo legado (jogos.plataforma, texto livre) — issue #15.
// Idempotente (ON CONFLICT DO NOTHING, respeita a UNIQUE (usuario_id, jogo_id, plataforma_id)
// de posses): rodar de novo não duplica. Diferente dos seed-*.js, este script é específico
// pra produção — depende de 'rickbr' e 'lariavas' já existirem (onboarding real feito), e
// recusa rodar sem os dois.
//
// Regra confirmada pelo Ricardo (issue #1, 2026-07-08; estendida pras demais plataformas em
// 2026-07-19): `EPIC <nome>` = só aquela pessoa tem o jogo; `EPIC` sem nome = os dois (cada um
// na própria conta Epic, sem biblioteca familiar nativa); qualquer outra plataforma = tudo pra
// ele, acesso da Larissa resolvido via vínculo familiar (não duplica posse fora do caso Epic).
// As três variantes de dono no texto legado (EPIC Ricardo/EPIC Larissa/EPIC, incluindo o typo
// "EPIC RIcardo") colapsam numa única plataforma canônica 'EPIC' — o dono passa a vir de
// usuario_id, não do nome da plataforma.
//
// Pré-requisito descoberto em produção: o volume do Postgres foi resetado durante a depuração
// do loop de restart do JWT_SECRET, apagando o catálogo legado (jogos/generos/jogo_generos)
// que esse backfill precisa. Por isso o script primeiro restaura esse catálogo a partir de um
// dump `.sql` local (não versionado — dado real de produção não sobe em PR, ver LEGADO_DUMP_PATH
// abaixo) antes de calcular as posses. Se o dump não existir e `jogos` já estiver populado (caso
// normal, sem reset), o passo de restauração é só pulado.
//
// Roda tudo numa única conexão dedicada (db.getClient(), não pool.query()): o dump zera o
// search_path da sessão (prática padrão do pg_dump), e um pool poderia devolver essa mesma
// conexão "suja" pra uma query posterior sem schema qualificado.

const fs = require('fs');
const path = require('path');
const db = require('./db');

const LEGADO_DUMP_PATH = process.argv[2] || path.join(__dirname, 'legado-jogos-generos.sql');

const DONO_UNICO = 'rickbr';
const DONO_FAMILIA = 'lariavas';

const PLATAFORMAS_CANONICAS = [
  'Amazon Games', 'EA App', 'EPIC', 'GOG', 'Nintendo 3ds',
  'Nintendo Switch', 'Nintendo Switch 2', 'Steam', 'Ubisoft',
];

function resolver(plataformaLegado) {
  const p = plataformaLegado.trim();
  if (/^epic ricardo$/i.test(p)) return { canonica: 'EPIC', donos: [DONO_UNICO] };
  if (/^epic larissa$/i.test(p)) return { canonica: 'EPIC', donos: [DONO_FAMILIA] };
  if (/^epic$/i.test(p)) return { canonica: 'EPIC', donos: [DONO_UNICO, DONO_FAMILIA] };
  return { canonica: p, donos: [DONO_UNICO] };
}

async function restaurarCatalogoLegado(client) {
  if (!fs.existsSync(LEGADO_DUMP_PATH)) {
    console.log(`Dump do catálogo legado não encontrado em ${LEGADO_DUMP_PATH} — pulando restauração.`);
    return;
  }
  // \restrict/\unrestrict são meta-comandos do psql (pg_dump recente), não SQL —
  // quebram se executados via driver. O resto do arquivo é INSERT idempotente
  // (ON CONFLICT DO NOTHING) + setval de sequência, seguro rodar mais de uma vez.
  const sql = fs
    .readFileSync(LEGADO_DUMP_PATH, 'utf8')
    .split('\n')
    .filter((linha) => !/^\\(restrict|unrestrict)\b/.test(linha))
    .join('\n');
  await client.query(sql);
  // O dump zera o search_path da sessão — repõe antes de seguir com queries sem
  // schema qualificado.
  await client.query('SET search_path TO public');
  const { rows } = await client.query('SELECT count(*) FROM jogos');
  console.log(`Catálogo legado restaurado de ${LEGADO_DUMP_PATH} — jogos na tabela agora: ${rows[0].count}.`);
}

async function backfill() {
  const client = await db.getClient();
  try {
    await restaurarCatalogoLegado(client);

    const usuarios = await client.query(
      'SELECT id, username FROM usuarios WHERE username = ANY($1)',
      [[DONO_UNICO, DONO_FAMILIA]]
    );
    if (usuarios.rowCount < 2) {
      throw new Error(
        `Backfill depende de '${DONO_UNICO}' e '${DONO_FAMILIA}' já existirem — rode só contra produção, depois do onboarding real.`
      );
    }
    const idPorUsername = Object.fromEntries(usuarios.rows.map((u) => [u.username, u.id]));

    let plataformasInseridas = 0;
    for (const nome of PLATAFORMAS_CANONICAS) {
      const res = await client.query(
        'INSERT INTO plataformas (nome) VALUES ($1) ON CONFLICT (nome) DO NOTHING',
        [nome]
      );
      plataformasInseridas += res.rowCount;
    }
    console.log(`Plataformas: ${plataformasInseridas} inserida(s).`);

    const plataformasRes = await client.query('SELECT id, nome FROM plataformas');
    const idPorPlataforma = Object.fromEntries(plataformasRes.rows.map((p) => [p.nome, p.id]));

    const jogos = await client.query('SELECT id, plataforma FROM jogos');

    let possesInseridas = 0;
    let jogosSemPlataformaMapeada = 0;
    for (const jogo of jogos.rows) {
      const { canonica, donos } = resolver(jogo.plataforma);
      const plataformaId = idPorPlataforma[canonica];
      if (!plataformaId) {
        console.warn(`Plataforma não mapeada: "${jogo.plataforma}" (jogo ${jogo.id}) — pulando.`);
        jogosSemPlataformaMapeada++;
        continue;
      }
      for (const username of donos) {
        const res = await client.query(
          `INSERT INTO posses (usuario_id, jogo_id, plataforma_id) VALUES ($1, $2, $3)
           ON CONFLICT (usuario_id, jogo_id, plataforma_id) DO NOTHING`,
          [idPorUsername[username], jogo.id, plataformaId]
        );
        possesInseridas += res.rowCount;
      }
    }

    console.log(
      `Posses: ${possesInseridas} inserida(s) a partir de ${jogos.rowCount} jogo(s) legado(s)` +
      (jogosSemPlataformaMapeada > 0 ? ` (${jogosSemPlataformaMapeada} sem plataforma mapeada).` : '.')
    );
  } finally {
    client.release();
  }
}

backfill()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
