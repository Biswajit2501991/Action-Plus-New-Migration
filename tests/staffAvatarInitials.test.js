import { describe, it, expect } from 'vitest';
import { staffInitialsFromName, staffPhotoSrcFromUser } from '../src/features/branding/staffAvatarInitials.js';

describe('staffInitialsFromName', () => {
  it('uses first and last word for multi-part names', () => {
    expect(staffInitialsFromName('Biswajit Kumar')).toBe('BK');
  });

  it('uses first letter for single names', () => {
    expect(staffInitialsFromName('Raja')).toBe('R');
  });

  it('handles empty', () => {
    expect(staffInitialsFromName('')).toBe('?');
  });
});

describe('staffPhotoSrcFromUser', () => {
  it('prefers photo then avatar', () => {
    expect(staffPhotoSrcFromUser({ photo: 'data:x', avatar: 'data:y' })).toBe('data:x');
    expect(staffPhotoSrcFromUser({ avatar: 'data:y' })).toBe('data:y');
  });
});
