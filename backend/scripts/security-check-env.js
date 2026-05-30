/**
 * Validate security-related env before production deploy.
 * Usage: cd backend && node scripts/security-check-env.js
 */
import dotenv from 'dotenv';
import { collectSecurityEnvIssues } from '../src/config/validateSecurityEnv.js';

dotenv.config();

const { issues, warnings, nodeEnv } = collectSecurityEnvIssues();

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
