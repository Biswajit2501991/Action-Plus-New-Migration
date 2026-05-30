import { describe, expect, it } from 'vitest';
import {
  buildMemberPhotoStoragePath,
  sanitizeMemberCodeForPath,
  memberPhotoStorageEnabled,
  MEMBER_PHOTO_BATCH_MAX,
} from '../backend/src/services/memberPhoto/storageConstants.js';
import {
  getCachedMemberPhotoUrl,
  setCachedMemberPhotoUrl,
  invalidateMemberPhotoCache,
} from '../src/features/members/photoUrlCache.js';
import {
  memberIdsNeedingPhotoUrlsAll,
  chunkMemberIds,
} from '../src/features/members/memberPhotoApi.js';
import {
  resolveMemberAvatarSrc,
  mergeMemberPhotoFields,
} from '../src/features/members/memberAvatarResolver.js';

describe('sanitizeMemberCodeForPath', () => {
  it('escapes slashes in member codes', () => {
    expect(sanitizeMemberCodeForPath('APG-183/22')).toBe('APG-183_22');
  });
});

describe('buildMemberPhotoStoragePath', () => {
  it('builds versioned gym-scoped path', () => {
    const p = buildMemberPhotoStoragePath('gym-1', 'APG-100/26', 2, 'jpg');
    expect(p).toBe('gyms/gym-1/members/APG-100_26/profile/v2.jpg');
  });
});

describe('photoUrlCache', () => {
  it('stores and retrieves by version', () => {
    setCachedMemberPhotoUrl('M1', 3, 'https://signed.example/a.jpg', 60000);
    expect(getCachedMemberPhotoUrl('M1', 3)).toContain('https://');
    expect(getCachedMemberPhotoUrl('M1', 2)).toBeNull();
    invalidateMemberPhotoCache('M1');
    expect(getCachedMemberPhotoUrl('M1', 3)).toBeNull();
  });

  it('memberIdsNeedingPhotoUrlsAll skips cached members', () => {
    setCachedMemberPhotoUrl('M2', 1, 'https://signed.example/b.jpg', 60000);
    const ids = memberIdsNeedingPhotoUrlsAll([
      { memberId: 'M2', hasPhoto: true, photoVersion: 1 },
      { memberId: 'M3', hasPhoto: true, photoVersion: 1 },
    ]);
    expect(ids).toEqual(['M3']);
    invalidateMemberPhotoCache('M2');
  });
});

describe('chunkMemberIds', () => {
  it('splits ids into chunks', () => {
    const ids = Array.from({ length: 5 }, (_, i) => `M${i}`);
    expect(chunkMemberIds(ids, 2)).toEqual([['M0', 'M1'], ['M2', 'M3'], ['M4']]);
  });
});

describe('mergeMemberPhotoFields', () => {
  it('prefers higher photoVersion in storage mode', () => {
    const prev = global.window;
    global.window = { __APG_ENV__: { MEMBER_PHOTO_STORAGE_ENABLED: true } };
    const out = mergeMemberPhotoFields(
      { memberId: 'M1', photo: 'data:old', photoVersion: 1, hasPhoto: true },
      { memberId: 'M1', photo: '', photoVersion: 2, hasPhoto: true },
    );
    expect(out.photoVersion).toBe(2);
    expect(out.hasPhoto).toBe(true);
    global.window = prev;
  });
});

describe('resolveMemberAvatarSrc', () => {
  it('uses cache when storage enabled', () => {
    const prev = global.window;
    global.window = { __APG_ENV__: { MEMBER_PHOTO_STORAGE_ENABLED: true } };
    setCachedMemberPhotoUrl('M9', 4, 'https://cdn.example/m9.jpg', 60000);
    const src = resolveMemberAvatarSrc({ memberId: 'M9', hasPhoto: true, photoVersion: 4 });
    expect(src).toContain('https://');
    invalidateMemberPhotoCache('M9');
    global.window = prev;
  });
});

describe('memberPhotoStorageEnabled env', () => {
  it('reads env flag', () => {
    const prev = process.env.MEMBER_PHOTO_STORAGE_ENABLED;
    process.env.MEMBER_PHOTO_STORAGE_ENABLED = 'true';
    expect(memberPhotoStorageEnabled()).toBe(true);
    process.env.MEMBER_PHOTO_STORAGE_ENABLED = prev;
  });
});

describe('MEMBER_PHOTO_BATCH_MAX', () => {
  it('defaults batch size to 100', () => {
    expect(MEMBER_PHOTO_BATCH_MAX).toBe(100);
  });
});

describe('MEMBER_PHOTO_MAX_BYTES', () => {
  it('defaults upload limit to 10 MB', async () => {
    const { MEMBER_PHOTO_MAX_BYTES, MEMBER_PHOTO_MAX_MB } = await import('../backend/src/services/memberPhoto/storageConstants.js');
    expect(MEMBER_PHOTO_MAX_BYTES).toBe(10 * 1024 * 1024);
    expect(MEMBER_PHOTO_MAX_MB).toBe(10);
  });
});
