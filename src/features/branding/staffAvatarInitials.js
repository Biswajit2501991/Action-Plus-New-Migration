/**
 * Initials for staff header avatar when no photo is uploaded.
 * "Biswajit Kumar" → BK, "Raja" → R
 * @param {string} name
 * @returns {string}
 */
export function staffInitialsFromName(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

function staffPhotoStorageOn() {
  try {
    return Boolean(window.__APG_ENV__?.MEMBER_PHOTO_STORAGE_ENABLED);
  } catch {
    return false;
  }
}

/** Merge photo fields during remote/local staff merge when storage mode is on. */
export function mergeStaffPhotoFields(localRow, remoteRow) {
  const localPhoto = String(localRow?.photo || localRow?.avatar || '').trim();
  const remotePhoto = String(remoteRow?.photo || remoteRow?.avatar || '').trim();
  const localVer = Number(localRow?.photoVersion || 0);
  const remoteVer = Number(remoteRow?.photoVersion || 0);
  const version = Math.max(localVer, remoteVer);
  const hasPhoto = Boolean(remoteRow?.hasPhoto || localRow?.hasPhoto || localPhoto || remotePhoto);

  if (!staffPhotoStorageOn()) {
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

/**
 * @param {{ id?: string, photo?: string | null, avatar?: string | null, photoVersion?: number, hasPhoto?: boolean } | null | undefined} user
 * @returns {string}
 */
export function staffPhotoSrcFromUser(user) {
  if (!user) return '';
  const inline = String(user.photo || user.avatar || '').trim();
  const version = Number(user.photoVersion || 0);
  const id = String(user.id || '').trim();

  if (staffPhotoStorageOn() && id && user.hasPhoto) {
    const getCached = window.__APG_MODULES?.getCachedMemberPhotoUrl;
    if (typeof getCached === 'function') {
      const cached = getCached(id, version);
      if (cached) return cached;
    }
    if (inline.startsWith('data:')) return inline;
    if (inline.startsWith('http')) return inline;
    return '';
  }

  return inline;
}
