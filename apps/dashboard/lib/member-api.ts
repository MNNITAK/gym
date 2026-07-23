// Browser-side client for the MEMBER panel. Deliberately separate from the staff
// client (lib/api.ts) so a member token can never be sent to a coach route.
const TOKEN_KEY = "keystone.member.token";
const NAME_KEY = "keystone.member.name";

export function getMemberToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setMemberSession(token: string, name: string): void {
  window.localStorage.setItem(TOKEN_KEY, token);
  window.localStorage.setItem(NAME_KEY, name);
}

export function getMemberName(): string {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(NAME_KEY) ?? "";
}

export function clearMemberSession(): void {
  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(NAME_KEY);
}

export async function meApi<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getMemberToken();
  const res = await fetch(`/api/me${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers ?? {}),
    },
  });
  if (!res.ok) {
    let message = `${res.status}`;
    try {
      message = ((await res.json()) as { error?: string }).error ?? message;
    } catch {
      /* non-JSON error */
    }
    throw new Error(message);
  }
  return res.json() as Promise<T>;
}
