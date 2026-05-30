import { describe, expect, it } from 'vitest';
import { collectSecurityEnvIssues } from './validateSecurityEnv.js';

const STRONG_JWT = 'a'.repeat(48);

describe('collectSecurityEnvIssues', () => {
  it('fails production with default JWT secret', () => {
    const { issues } = collectSecurityEnvIssues({
      nodeEnv: 'production',
      jwtSecret: 'change-me',
      processControlEnabled: false,
      supabaseServiceKey: 'x'.repeat(50),
    });
    expect(issues.some((i) => i.includes('JWT_SECRET'))).toBe(true);
  });

  it('fails production when process control enabled', () => {
    const { issues } = collectSecurityEnvIssues({
      nodeEnv: 'production',
      jwtSecret: STRONG_JWT,
      processControlEnabled: true,
      supabaseServiceKey: 'x'.repeat(50),
    });
    expect(issues.some((i) => i.includes('PROCESS_CONTROL_ENABLED'))).toBe(true);
  });

  it('passes production with strong secret and process control off', () => {
    const { issues } = collectSecurityEnvIssues({
      nodeEnv: 'production',
      jwtSecret: STRONG_JWT,
      processControlEnabled: false,
      supabaseServiceKey: 'x'.repeat(50),
      corsOrigins: 'https://app.gymactionplus.com',
    });
    expect(issues).toEqual([]);
  });
});
