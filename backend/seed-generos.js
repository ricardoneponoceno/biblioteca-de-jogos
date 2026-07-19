// Seed dos gêneros — popula a tabela `generos` com a lista canônica (a mesma de produção).
// Idempotente (ON CONFLICT (name) DO NOTHING): rodar de novo não duplica.
// Os IDs não precisam bater com os de produção — nada referencia gênero por ID no seed.

const db = require('./db');

const GENEROS = [
  'Ação', 'Aventura', 'Beat`em up', 'Bullet Hell', 'Co-op', 'Corrida', 'Cozy',
  'Esporte', 'Estratégia', 'Hack and Slash', 'Luta', 'Metroidvania', 'MMORPG',
  'MOBA', 'Multiplayer', 'Mundo Aberto', 'Musical', 'Musou', 'Narrativo',
  'Party Game', 'Plataforma', 'Point and Click', 'Puzzle', 'Roguelike', 'RPG',
  'RTS', 'Run and Gun', 'Sandbox', 'Shoot em Up', 'Simulação', 'Stealth',
  'Survival', 'Tático', 'Terror', 'Tiro (FPS)', 'Tiro (TPS)', 'Visual Novel',
];

async function seedGeneros() {
  let inserted = 0;
  for (const name of GENEROS) {
    const res = await db.query(
      'INSERT INTO generos (name) VALUES ($1) ON CONFLICT (name) DO NOTHING',
      [name]
    );
    inserted += res.rowCount;
  }
  console.log(`Gêneros: ${inserted} inserido(s), ${GENEROS.length - inserted} já existente(s).`);
}

seedGeneros()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
