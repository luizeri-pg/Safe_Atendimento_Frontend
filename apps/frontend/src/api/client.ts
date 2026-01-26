import { clearSession, getAccessToken, getRefreshToken, setSession } from "../auth/storage";

type RefreshResponse = { access_token: string; refresh_token: string; expires_in: number | null };

let refreshInFlight: Promise<void> | null = null;

async function refreshSessionOnce(): Promise<void> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    const refreshToken = getRefreshToken();
    if (!refreshToken) throw new Error("Sessão expirada. Faça login novamente.");

    const resp = await fetch("/api/auth/refresh", {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken })
    });
    const text = await resp.text();
    if (!resp.ok) throw new Error("Sessão expirada. Faça login novamente.");

    const json = (text ? JSON.parse(text) : null) as RefreshResponse | null;
    const access = String(json?.access_token || "").trim();
    const nextRefresh = String(json?.refresh_token || "").trim();
    const expiresIn = (json?.expires_in ?? null) as number | null;
    if (!access || !nextRefresh) throw new Error("Sessão expirada. Faça login novamente.");

    setSession({ accessToken: access, refreshToken: nextRefresh, expiresIn });
  })()
    .catch((e) => {
      clearSession();
      throw e;
    })
    .finally(() => {
      refreshInFlight = null;
    });
  return refreshInFlight;
}

async function doFetch(path: string, init: RequestInit) {
  const headers = new Headers(init.headers || {});
  if (!headers.has("Accept")) headers.set("Accept", "application/json");
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");

  const token = getAccessToken();
  if (token && !headers.has("Authorization")) headers.set("Authorization", `Bearer ${token}`);

  return await fetch(path.startsWith("/api") ? path : `/api${path}`, {
    ...init,
    headers
  });
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  let resp = await doFetch(path, init);

  // Se o token expirou, tentamos renovar 1 vez e refazemos a chamada.
  if (resp.status === 401) {
    try {
      await refreshSessionOnce();
      resp = await doFetch(path, init);
    } catch {
      // mantém o 401 original para cair no tratamento abaixo
    }
  }

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

