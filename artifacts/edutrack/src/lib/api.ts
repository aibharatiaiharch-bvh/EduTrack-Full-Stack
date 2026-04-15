// When VITE_API_BASE_URL is set (e.g. Railway URL in production), use it.
// Otherwise fall back to same-origin (Replit dev environment).
const _apiBase = (import.meta.env.VITE_API_BASE_URL as string | undefined)
  ? (import.meta.env.VITE_API_BASE_URL as string).replace(/\/$/, "")
  : import.meta.env.BASE_URL.replace(/\/$/, "");

export function apiUrl(path: string): string {
  return `${_apiBase}/api${path}`;
}

// App base path — used for routing/navigation, always same-origin
export const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
