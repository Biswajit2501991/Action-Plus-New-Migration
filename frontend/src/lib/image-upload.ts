export const MAX_IMAGE_FILE_BYTES = 10 * 1024 * 1024;
const MAX_IMAGE_EDGE_PX = 1600;
const IMAGE_JPEG_QUALITY = 0.82;

export function loadImageDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
}

export function downscaleImageDataUrl(
  dataUrl: string,
  maxEdge = MAX_IMAGE_EDGE_PX,
  quality = IMAGE_JPEG_QUALITY,
): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const { width, height } = img;
      const scale = Math.min(1, maxEdge / Math.max(width, height));
      if (scale >= 1) {
        resolve(dataUrl);
        return;
      }
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(width * scale);
      canvas.height = Math.round(height * scale);
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(dataUrl);
        return;
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

export async function fileToAttachmentDataUrl(file: File) {
  if (file.size > MAX_IMAGE_FILE_BYTES) return null;
  try {
    const raw = await loadImageDataUrl(file);
    const compressed = file.type.startsWith("image/") ? await downscaleImageDataUrl(raw) : raw;
    return compressed;
  } catch {
    return null;
  }
}
