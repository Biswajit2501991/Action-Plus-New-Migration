/** Remote fallback if client-side QR generation is unavailable. */
export function qrImageUrl(data: string, size = 280) {
  const encoded = encodeURIComponent(String(data || ""));
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encoded}`;
}

export async function qrDataUrl(data: string, size = 280): Promise<string> {
  const payload = String(data || "").trim();
  if (!payload) return "";
  const QR = await import("qrcode");
  return QR.toDataURL(payload, {
    width: Math.max(80, size),
    margin: 1,
    errorCorrectionLevel: "M",
    color: { dark: "#0f172a", light: "#ffffff" },
  });
}

export function publicAppOrigin() {
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin.replace(/\/$/, "");
  }
  return String(process.env.NEXT_PUBLIC_APP_URL || "https://app.gymactionplus.com").replace(/\/$/, "");
}

export function visitorIntakeUrl(gymCode: string) {
  return `${publicAppOrigin()}/public/visit/${encodeURIComponent(String(gymCode || "").trim())}`;
}

export function attendanceClaimUrl(token: string) {
  return `${publicAppOrigin()}/attendance/claim?t=${encodeURIComponent(String(token || "").trim())}`;
}
