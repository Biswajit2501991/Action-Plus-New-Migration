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

  const dataUrlOnly = (value) => {
    const s = String(value || '').trim();
    return s.startsWith('data:') ? s : '';
  };
  let photo = '';
  if (remoteVer > localVer) {
    photo = dataUrlOnly(remotePhoto);
  } else if (localVer > remoteVer) {
    photo = dataUrlOnly(localPhoto);
  } else {
    photo = dataUrlOnly(localPhoto) || dataUrlOnly(remotePhoto);
  }

  return { photo, photoVersion: version, hasPhoto };
}
