/**
 * Validate security-related env before production deploy.
 * Usage: cd backend && node scripts/security-check-env.js
 */
import dotenv from 'dotenv';

dotenv.config();

const issues = [];
const warnings = [];
const nodeEnv = process.env.NODE_ENV || 'development';
const jwt = String(process.env.JWT_SECRET || '');
const serviceKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '');
const processControl = String(process.env.PROCESS_CONTROL_ENABLED || '').toLowerCase();
const processToken = String(process.env.PROCESS_CONTROL_TOKEN || '');
const cors = String(process.env.CORS_ALLOWED_ORIGINS || '');

if (!jwt || jwt === 'change-me' || jwt.length < 32) {
  issues.push('JWT_SECRET is missing, default, or too short (use: npm run security:new-jwt-secret)');
}

if (serviceKey.includes('your-service-role') || serviceKey.length < 40) {
  issues.push('SUPABASE_SERVICE_ROLE_KEY looks like a placeholder or is missing');
}

if (nodeEnv === 'production') {
  if (processControl === 'true' || processControl === '1') {
    if (!processToken || processToken.length < 24) {
      issues.push('PROCESS_CONTROL_ENABLED=true but PROCESS_CONTROL_TOKEN is missing or weak');
    } else {
      warnings.push('PROCESS_CONTROL_ENABLED=true in production (prefer false unless supervisor needs it)');
    }
  }
  if (cors.includes('*')) {
    issues.push('CORS_ALLOWED_ORIGINS must not contain * in production');
  }
  if (cors && !cors.includes('https://app.gymactionplus.com')) {
    warnings.push('CORS_ALLOWED_ORIGINS does not include https://app.gymactionplus.com');
  }
} else if (processControl === 'true' || processControl === '1') {
  if (!processToken) {
    warnings.push('PROCESS_CONTROL_ENABLED without PROCESS_CONTROL_TOKEN (anyone could call process APIs if JWT missing)');
  }
}

if (issues.length) {
  console.error('Security check FAILED:\n');
  for (const i of issues) console.error(`  ✗ ${i}`);
  if (warnings.length) {
    console.error('\nWarnings:\n');
    for (const w of warnings) console.error(`  ! ${w}`);
  }
  process.exit(1);
}

console.log(`Security check OK (NODE_ENV=${nodeEnv})`);
if (warnings.length) {
  console.log('\nWarnings:');
  for (const w of warnings) console.log(`  ! ${w}`);
}
