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

export function getAccessToken() {
  try {
    return String(localStorage.getItem(KEYS.accessToken) || "").trim() || null;
  } catch {
    return null;
  }
}

export function getRefreshToken() {
  try {
    return String(localStorage.getItem(KEYS.refreshToken) || "").trim() || null;
  } catch {
    return null;
  }
}

export function setSession(params: { accessToken: string; refreshToken: string; expiresIn?: number | null }) {
  try {
    localStorage.setItem(KEYS.accessToken, params.accessToken);
    localStorage.setItem(KEYS.refreshToken, params.refreshToken);
    if (params.expiresIn && params.expiresIn > 0) {
      localStorage.setItem(KEYS.expiresAt, String(Date.now() + params.expiresIn * 1000));
    } else {
      localStorage.removeItem(KEYS.expiresAt);
    }
  } catch {
    // ignore
  }
}

export function clearSession() {
  try {
    localStorage.removeItem(KEYS.accessToken);
    localStorage.removeItem(KEYS.refreshToken);
    localStorage.removeItem(KEYS.expiresAt);
    localStorage.removeItem(KEYS.user);
  } catch {
    // ignore
  }
}

export function getStoredUser(): StoredUser | null {
  try {
    const raw = localStorage.getItem(KEYS.user);
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
    localStorage.setItem(KEYS.user, JSON.stringify({ ...user, role: String(user.role || "").trim().toLowerCase() }));
  } catch {
    // ignore
  }
}

export function getPublicDisplayToken() {
  try {
    return String(localStorage.getItem(KEYS.publicDisplayToken) || "").trim() || null;
  } catch {
    return null;
  }
}

