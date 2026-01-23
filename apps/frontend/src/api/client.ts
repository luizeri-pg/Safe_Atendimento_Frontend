import { getAccessToken } from "../auth/storage";

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers || {});
  if (!headers.has("Accept")) headers.set("Accept", "application/json");
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");

  const token = getAccessToken();
  if (token && !headers.has("Authorization")) headers.set("Authorization", `Bearer ${token}`);

  const resp = await fetch(path.startsWith("/api") ? path : `/api${path}`, {
    ...init,
    headers
  });

  const text = await resp.text();
  if (!resp.ok) {
    let msg = `Erro HTTP ${resp.status}`;
    try {
      const json = JSON.parse(text);
      msg = String(json?.message || json?.error || msg);
    } catch {
      // ignore
    }
    throw new Error(msg);
  }
  return (text ? JSON.parse(text) : null) as T;
}

