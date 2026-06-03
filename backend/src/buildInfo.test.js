import { describe, expect, it } from 'vitest';
import { apiFeatures, buildInfo, versionPayload } from './buildInfo.js';

describe('buildInfo', () => {
  it('exposes version and finance API feature flags', () => {
    expect(buildInfo.version).toMatch(/^\d+\.\d+\.\d+/);
    expect(apiFeatures.financeSummary).toBe(true);
    expect(apiFeatures.memberPaidForMonthLedger).toBe(true);
  });

  it('versionPayload includes features', () => {
    const body = versionPayload({ ok: true });
    expect(body.features.financeSummary).toBe(true);
    expect(body.service).toBe('gym-backend');
  });
});
