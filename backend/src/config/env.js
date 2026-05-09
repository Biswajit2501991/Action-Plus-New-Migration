import dotenv from 'dotenv';

dotenv.config();

function parseProcessControlEnabled() {
  const v = process.env.PROCESS_CONTROL_ENABLED;
  if (v === 'true' || v === '1') return true;
  if (v === 'false' || v === '0') return false;
  return (process.env.NODE_ENV || 'development') !== 'production';
}

export const env = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: Number(process.env.PORT || process.env.BACKEND_PORT || 4000),
  JWT_SECRET: process.env.JWT_SECRET || 'change-me',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '12h',
  DATABASE_PATH: process.env.DATABASE_PATH || './data/app.db',
  PROCESS_CONTROL_ENABLED: parseProcessControlEnabled(),
  PROCESS_CONTROL_TOKEN: process.env.PROCESS_CONTROL_TOKEN || '',
  APG_BACKEND_START_SCRIPT: process.env.APG_BACKEND_START_SCRIPT || '',
};
