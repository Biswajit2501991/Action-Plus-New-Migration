export function authCookieModeEnabled(): boolean {
  return String(process.env.NEXT_PUBLIC_AUTH_COOKIE_MODE || "").toLowerCase() === "true";
}

export function authFetchCredentials(): RequestCredentials {
  return authCookieModeEnabled() ? "include" : "same-origin";
}
