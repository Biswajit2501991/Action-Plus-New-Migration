import dotenv from 'dotenv';

dotenv.config();

export const env = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: Number(process.env.PORT || 4000),
  JWT_SECRET: process.env.JWT_SECRET || 'change-me',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '12h',
  DATABASE_URL: process.env.DATABASE_URL || '',
};
