import { describe, expect, it } from 'vitest';
import { isUploadableMemberPhotoPayload } from '../src/features/members/memberPhotoUpload.js';
import { parseMemberPhotoImagePayload } from '../backend/src/services/memberPhoto/parseImagePayload.js';

describe('isUploadableMemberPhotoPayload', () => {
  it('accepts data URLs only', () => {
    expect(isUploadableMemberPhotoPayload('data:image/jpeg;base64,abc')).toBe(true);
    expect(isUploadableMemberPhotoPayload('https://cdn.example/photo.jpg')).toBe(false);
    expect(isUploadableMemberPhotoPayload('')).toBe(false);
  });
});

describe('parseMemberPhotoImagePayload', () => {
  it('rejects HTTPS signed URLs', () => {
    expect(parseMemberPhotoImagePayload('https://supabase.co/storage/v1/object/sign/x')).toBeNull();
  });

  it('rejects tiny data URLs', () => {
    expect(parseMemberPhotoImagePayload('data:image/jpeg;base64,YQ==')).toBeNull();
  });

  it('accepts valid data URLs above minimum size', () => {
    const b64 = Buffer.alloc(300, 1).toString('base64');
    const parsed = parseMemberPhotoImagePayload(`data:image/jpeg;base64,${b64}`);
    expect(parsed?.mime).toBe('image/jpeg');
    expect(parsed?.buffer?.length).toBeGreaterThanOrEqual(256);
  });
});
