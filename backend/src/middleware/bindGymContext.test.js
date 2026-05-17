import { describe, expect, it, vi } from 'vitest';
import { env } from '../config/env.js';
import { bindGymContext } from './bindGymContext.js';

function mockReqRes(auth = {}, path = '/members') {
  const req = { path, auth };
  const res = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
  return { req, res };
}

describe('bindGymContext', () => {
  it('rejects when token gym differs from APG_GYM_ID', () => {
    const saved = env.APG_GYM_ID;
    env.APG_GYM_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const { req, res } = mockReqRes({
      userId: 'staff1',
      gymId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    });
    let nextCalled = false;
    bindGymContext(req, res, () => {
      nextCalled = true;
    });
    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(403);
    expect(res.body?.error).toBe('gym-mismatch');
    env.APG_GYM_ID = saved;
  });

  it('binds gym from JWT when env matches', () => {
    const gid = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    const saved = env.APG_GYM_ID;
    env.APG_GYM_ID = gid;
    const { req, res } = mockReqRes({ userId: 'owner', gymId: gid });
    let nextCalled = false;
    bindGymContext(req, res, () => {
      nextCalled = true;
    });
    expect(nextCalled).toBe(true);
    expect(req.auth.gymId).toBe(gid);
    env.APG_GYM_ID = saved;
  });
});
