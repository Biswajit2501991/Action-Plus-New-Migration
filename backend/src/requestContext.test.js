import { describe, expect, it } from 'vitest';
import { env } from './config/env.js';
import { gymId } from './db/supabase/client.js';
import { getRequestGymId, runWithGymContext } from './requestContext.js';

describe('request gym context', () => {
  it('prefers JWT gym over env when bound', () => {
    const jwtGym = '11111111-1111-4111-8111-111111111111';
    runWithGymContext({ gymId: jwtGym }, () => {
      expect(getRequestGymId()).toBe(jwtGym);
      expect(gymId()).toBe(jwtGym);
    });
  });

  it('falls back to APG_GYM_ID outside a request', () => {
    expect(getRequestGymId()).toBeUndefined();
    if (env.APG_GYM_ID) {
      expect(gymId()).toBe(env.APG_GYM_ID);
    }
  });
});
