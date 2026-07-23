// Tiny browser-side API client. Stores the staff JWT in localStorage and
// scopes every request to the coach's tenant via the bearer token.
// The API lives in this same Next.js app under /api — no separate server.
export const API_URL = "/api";

const TOKEN_KEY = "keystone.token";

/**
 * Normalize a dynamic route param before putting it back into an API path.
 * Member ids embed the phone number (`demo-gym__+9190...`), and the router hands
 * the segment back percent-encoded — re-encoding it directly would double-escape
 * the `+` into `%252B` and miss the document. Decoding first is idempotent:
 * `+` is untouched by decodeURIComponent, `%2B` becomes `+`.
 */
export function idFromParam(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  window.localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  window.localStorage.removeItem(TOKEN_KEY);
}

export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = getToken();
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers ?? {}),
    },
  });
  if (!res.ok) {
    throw new Error(`${res.status}: ${await res.text()}`);
  }
  return res.json() as Promise<T>;
}
