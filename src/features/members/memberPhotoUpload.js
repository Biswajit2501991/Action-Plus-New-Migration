/** True only for client-compressed data URLs ready for POST /members/:id/photo. */
export function isUploadableMemberPhotoPayload(value) {
  const s = String(value || '').trim();
  return /^data:image\/[a-z+]+;base64,/i.test(s);
}
