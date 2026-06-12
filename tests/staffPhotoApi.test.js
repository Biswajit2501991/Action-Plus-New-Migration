import { describe, expect, it, vi } from 'vitest';
import { staffPhotoStorageEnabled, uploadStaffPhotoApi } from '../src/features/staff/staffPhotoApi.js';

describe('staffPhotoStorageEnabled', () => {
  it('reads MEMBER_PHOTO_STORAGE_ENABLED from env', () => {
    const prev = global.window;
    global.window = { __APG_ENV__: { MEMBER_PHOTO_STORAGE_ENABLED: true } };
    expect(staffPhotoStorageEnabled()).toBe(true);
    global.window = prev;
  });
});

describe('uploadStaffPhotoApi', () => {
  it('posts compressed image to staff photo endpoint', async () => {
    const backendJson = vi.fn().mockResolvedValue({ ok: true, photoUrl: 'https://x.test/p.jpg' });
    await uploadStaffPhotoApi('Koushik', 'data:image/jpeg;base64,abc', backendJson);
    expect(backendJson).toHaveBeenCalledWith('/users/Koushik/photo', {
      method: 'POST',
      body: JSON.stringify({ image: 'data:image/jpeg;base64,abc' }),
    });
  });
});
