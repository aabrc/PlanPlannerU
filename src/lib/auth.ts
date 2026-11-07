export function isValidEmailAddress(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export function buildAuthRedirectUrl(baseUrl: string, origin: string): string {
  const path = baseUrl.startsWith("/") ? baseUrl : "/" + baseUrl;
  return new URL(path, origin).toString();
}
