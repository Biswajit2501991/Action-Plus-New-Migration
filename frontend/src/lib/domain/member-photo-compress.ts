/** Client-side member photo compression (shared by Add / Edit flows). */

const MAX_IMAGE_FILE_BYTES = 2.5 * 1024 * 1024;
export const PHOTO_TOO_LARGE_MSG =
  "Photo is too large. Please choose a smaller image (under 2.5 MB).";

export async function compressMemberPhotoFile(file: File): Promise<string> {
  if (!file) throw new Error("No image selected");
  if (file.size > MAX_IMAGE_FILE_BYTES) throw new Error(PHOTO_TOO_LARGE_MSG);

  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Could not read image"));
    reader.readAsDataURL(file);
  });

  if (!dataUrl.startsWith("data:image/")) throw new Error("Choose an image file");
  if (file.size <= 900_000) return dataUrl;

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("Invalid image"));
    el.src = dataUrl;
  });

  const max = 1280;
  const scale = Math.min(1, max / Math.max(img.width, img.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) return dataUrl;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.82);
}

export function isUploadableMemberPhotoPayload(value?: string | null) {
  return /^data:image\/[a-z+]+;base64,/i.test(String(value || "").trim());
}
