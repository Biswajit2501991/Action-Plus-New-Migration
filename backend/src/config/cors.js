const DEFAULT_DEV_ORIGINS = [
  'https://app.gymactionplus.com',
  'http://127.0.0.1:5501',
  'http://127.0.0.1:5500',
  'http://localhost:5501',
  'http://localhost:5500',
];

const DEFAULT_PROD_ORIGINS = [
  'https://app.gymactionplus.com',
];

export function parseCorsOrigins(nodeEnv = 'development') {
  const raw = String(process.env.CORS_ALLOWED_ORIGINS || '').trim();
  if (raw) {
    return raw.split(',').map((s) => s.trim()).filter(Boolean);
  }
  return nodeEnv === 'production' ? [...DEFAULT_PROD_ORIGINS] : [...DEFAULT_DEV_ORIGINS];
}

export function isOriginAllowed(origin, allowedOrigins) {
  if (!origin) return false;
  return allowedOrigins.includes(String(origin).trim());
}
