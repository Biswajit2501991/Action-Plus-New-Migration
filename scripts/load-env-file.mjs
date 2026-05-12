import fs from 'node:fs';
import path from 'node:path';

export function resolveEnvFilePath(rootDir) {
  const envFile = String(process.env.ENV_FILE || '.env').trim() || '.env';
  return path.isAbsolute(envFile) ? envFile : path.join(rootDir, envFile);
}

export function loadEnvFromFile(rootDir) {
  const envPath = resolveEnvFilePath(rootDir);
  try {
    const raw = fs.readFileSync(envPath, 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx <= 0) continue;
      const key = trimmed.slice(0, idx).trim();
      let value = trimmed.slice(idx + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = value;
    }
    return envPath;
  } catch {
    return null;
  }
}
