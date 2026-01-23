export type StoredUser = {
  id: string;
  username: string;
  nome: string;
  role: string;
};

const KEYS = {
  accessToken: "SAFE_ACCESS_TOKEN",
  refreshToken: "SAFE_REFRESH_TOKEN",
  expiresAt: "SAFE_EXPIRES_AT",
  user: "loggedUser",
  publicDisplayToken: "SAFE_PUBLIC_DISPLAY_TOKEN"
} as const;

function ss() {
  return sessionStorage;
}
function ls() {
  return localStorage;
}

// Remove qualquer sessão antiga persistida (localStorage). Usado na inicialização do app.
export function clearLegacyPersistentSession() {
  try {
    ls().removeItem(KEYS.accessToken);
    ls().removeItem(KEYS.refreshToken);
    ls().removeItem(KEYS.expiresAt);
    ls().removeItem(KEYS.user);
  } catch {
    // ignore
  }
}

export function getAccessToken() {
  try {
    return String(ss().getItem(KEYS.accessToken) || "").trim() || null;
  } catch {
    return null;
  }
}

export function getRefreshToken() {
  try {
    return String(ss().getItem(KEYS.refreshToken) || "").trim() || null;
  } catch {
    return null;
  }
}

export function setSession(params: { accessToken: string; refreshToken: string; expiresIn?: number | null }) {
  try {
    ss().setItem(KEYS.accessToken, params.accessToken);
    ss().setItem(KEYS.refreshToken, params.refreshToken);
    if (params.expiresIn && params.expiresIn > 0) {
      ss().setItem(KEYS.expiresAt, String(Date.now() + params.expiresIn * 1000));
    } else {
      ss().removeItem(KEYS.expiresAt);
    }
  } catch {
    // ignore
  }
}

export function clearSession() {
  try {
    // limpa sessão atual
    ss().removeItem(KEYS.accessToken);
    ss().removeItem(KEYS.refreshToken);
    ss().removeItem(KEYS.expiresAt);
    ss().removeItem(KEYS.user);

    // e também limpa qualquer sobra persistida
    clearLegacyPersistentSession();
  } catch {
    // ignore
  }
}

export function getStoredUser(): StoredUser | null {
  try {
    const raw = ss().getItem(KEYS.user);
    if (!raw) return null;
    const json = JSON.parse(raw);
    const role = String(json?.role || "").trim().toLowerCase();
    if (!role) return null;
    return {
      id: String(json?.id || ""),
      username: String(json?.username || ""),
      nome: String(json?.nome || ""),
      role
    };
  } catch {
    return null;
  }
}

export function setStoredUser(user: StoredUser) {
  try {
    ss().setItem(KEYS.user, JSON.stringify({ ...user, role: String(user.role || "").trim().toLowerCase() }));
  } catch {
    // ignore
  }
}

export function getPublicDisplayToken() {
  try {
    return String(ls().getItem(KEYS.publicDisplayToken) || "").trim() || null;
  } catch {
    return null;
  }
}

