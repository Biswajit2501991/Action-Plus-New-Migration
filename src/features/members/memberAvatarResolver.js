import { getCachedMemberPhotoUrl } from './photoUrlCache.js';

export function memberPhotoStorageEnabled() {
  try {
    return Boolean(window.__APG_ENV__?.MEMBER_PHOTO_STORAGE_ENABLED);
  } catch {
    return false;
  }
}

/**
 * Resolve avatar src for a member row (list/detail).
 * @param {object|null} member
 * @returns {string}
 */
export function resolveMemberAvatarSrc(member) {
  if (!member) return '';
  const inline = String(member.photo || '').trim();
  const version = Number(member.photoVersion || 0);
  const id = String(member.memberId || '').trim();

  if (memberPhotoStorageEnabled() && id && member.hasPhoto) {
    const cached = getCachedMemberPhotoUrl(id, version);
    if (cached) return cached;
    if (inline.startsWith('http')) return inline;
    if (inline.startsWith('data:')) return inline;
    return '';
  }

  return inline;
}

/** Merge photo fields during remote/local member merge when storage mode is on. */
export function mergeMemberPhotoFields(localRow, remoteRow) {
  const localPhoto = String(localRow?.photo || '').trim();
  const remotePhoto = String(remoteRow?.photo || '').trim();
  const localVer = Number(localRow?.photoVersion || 0);
  const remoteVer = Number(remoteRow?.photoVersion || 0);
  const version = Math.max(localVer, remoteVer);
  const hasPhoto = Boolean(remoteRow?.hasPhoto || localRow?.hasPhoto || localPhoto || remotePhoto);

  if (!memberPhotoStorageEnabled()) {
    if (localPhoto && remotePhoto) {
      const localTs = Number(localRow?.updatedAt ? Date.parse(localRow.updatedAt) : 0);
      const remoteTs = Number(remoteRow?.updatedAt ? Date.parse(remoteRow.updatedAt) : 0);
      return {
        photo: localTs >= remoteTs ? localPhoto : remotePhoto,
        photoVersion: version,
        hasPhoto,
      };
    }
    return {
      photo: localPhoto || remotePhoto || '',
      photoVersion: version,
      hasPhoto: Boolean(localPhoto || remotePhoto),
    };
  }

  let photo = '';
  if (remoteVer > localVer) {
    photo = remotePhoto.startsWith('http') ? remotePhoto : '';
  } else if (localVer > remoteVer) {
    photo = localPhoto;
  } else {
    photo = localPhoto || (remotePhoto.startsWith('http') ? remotePhoto : '');
  }

  return { photo, photoVersion: version, hasPhoto };
}
