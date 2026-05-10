import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendRoot = path.resolve(__dirname, '..');

const dbPath = path.resolve(backendRoot, process.env.DATABASE_PATH || './data/app.db');
const backupDir = path.resolve(path.dirname(dbPath), 'backups');

async function getBackupFiles() {
  const entries = await fs.readdir(backupDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.db'))
    .map((entry) => entry.name)
    .sort();
}

async function resolveBackupArg(arg) {
  const files = await getBackupFiles();
  if (!files.length) throw new Error(`No backup files found in ${backupDir}`);

  if (!arg || arg === 'latest') {
    return path.join(backupDir, files[files.length - 1]);
  }

  const exact = files.find((name) => name === arg);
  if (exact) return path.join(backupDir, exact);

  const contains = files.find((name) => name.includes(arg));
  if (contains) return path.join(backupDir, contains);

  throw new Error(`Backup not found: ${arg}`);
}

async function main() {
  const input = (process.argv[2] || 'latest').trim();
  const backupPath = await resolveBackupArg(input);

  await fs.mkdir(path.dirname(dbPath), { recursive: true });
  await fs.copyFile(backupPath, dbPath);

  // eslint-disable-next-line no-console
  console.log(`Restored database from: ${path.basename(backupPath)}`);
  // eslint-disable-next-line no-console
  console.log(`Database path: ${dbPath}`);
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(`Restore failed: ${error.message}`);
  process.exit(1);
});
