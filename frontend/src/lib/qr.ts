/** Build a QR image URL without extra npm deps (works for posters + kiosk). */
export function qrImageUrl(data: string, size = 280) {
  const encoded = encodeURIComponent(String(data || ""));
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encoded}`;
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
