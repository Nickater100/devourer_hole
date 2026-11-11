// Copia consistente de la base (VACUUM INTO funciona con la base en uso) y
// rotación: se guardan las últimas 20. La corre deploy.sh antes de cada
// despliegue y se puede correr a mano:
//   docker compose exec -T app node src/backup.js
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readdirSync, rmSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

const DB_PATH = process.env.DB_PATH || './data/angryball.db';
const KEEP = 20;

if (!existsSync(DB_PATH)) { console.log('Sin base todavía: nada que respaldar.'); process.exit(0); }
const dir = join(dirname(DB_PATH), 'backups');
mkdirSync(dir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const out = join(dir, `angryball-${stamp}.db`);
const db = new DatabaseSync(DB_PATH);
db.exec(`VACUUM INTO '${out.replace(/'/g, "''")}'`);
db.close();
const all = readdirSync(dir).filter(f => f.endsWith('.db')).sort();
for (const f of all.slice(0, Math.max(0, all.length - KEEP))) rmSync(join(dir, f));
console.log(`Respaldo: ${out} (${Math.min(all.length, KEEP)} guardados)`);
