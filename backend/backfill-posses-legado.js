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

const db = require('./db');

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

async function backfill() {
  const usuarios = await db.query(
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
    const res = await db.query(
      'INSERT INTO plataformas (nome) VALUES ($1) ON CONFLICT (nome) DO NOTHING',
      [nome]
    );
    plataformasInseridas += res.rowCount;
  }
  console.log(`Plataformas: ${plataformasInseridas} inserida(s).`);

  const plataformasRes = await db.query('SELECT id, nome FROM plataformas');
  const idPorPlataforma = Object.fromEntries(plataformasRes.rows.map((p) => [p.nome, p.id]));

  const jogos = await db.query('SELECT id, plataforma FROM jogos');

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
      const res = await db.query(
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
}

backfill()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
