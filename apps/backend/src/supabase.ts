import { env } from "./env.js";
import type { Profile } from "./types.js";

export function getSupabasePublicEnv() {
  // Para proxy autenticado, a ANON key é suficiente (o token do usuário decide permissões via RLS).
  // Para rotas server-side (painel/checkin), preferimos service role se existir.
  const apikey = env.SUPABASE_ANON_KEY || env.SUPABASE_SERVICE_ROLE_KEY || "";
  return { url: env.SUPABASE_URL, apikey };
}

export function getSupabaseServerEnv() {
  const apikey = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_ANON_KEY || "";
  return { url: env.SUPABASE_URL, apikey };
}

export function getAuthDomainEmail(username: string) {
  return `${String(username || "").trim().toLowerCase()}@${env.SAFE_SUPABASE_AUTH_DOMAIN}`;
}

export function getBearer(authHeader: unknown): string | null {
  const raw = String(authHeader || "").trim();
  if (!raw) return null;
  return raw.toLowerCase().startsWith("bearer ") ? raw : null;
}

export async function supabaseAuthUser({ accessToken }: { accessToken: string }) {
  const { url, apikey } = getSupabasePublicEnv();
  const resp = await fetch(`${url}/auth/v1/user`, {
    method: "GET",
    headers: { apikey, Authorization: `Bearer ${accessToken}`, Accept: "application/json" }
  });
  const text = await resp.text();
  if (!resp.ok) return { ok: false as const, status: resp.status, text };
  return { ok: true as const, status: resp.status, json: JSON.parse(text || "{}") };
}

export async function supabaseFetchProfile({
  accessToken,
  userId
}: {
  accessToken: string;
  userId: string;
}): Promise<{ ok: true; profile: Profile } | { ok: false; status: number; text: string }> {
  const { url, apikey } = getSupabasePublicEnv();
  const resp = await fetch(
    `${url}/rest/v1/profiles?select=id,username,nome,role,crm,specialty&id=eq.${encodeURIComponent(userId)}&limit=1`,
    {
      method: "GET",
      headers: { apikey, Authorization: `Bearer ${accessToken}`, Accept: "application/json" }
    }
  );
  const text = await resp.text();
  if (!resp.ok) return { ok: false, status: resp.status, text };
  const arr = JSON.parse(text || "[]");
  const profile = Array.isArray(arr) ? arr[0] : arr;
  return { ok: true, profile };
}

export async function callSupabaseRpc({
  rpcName,
  rpcBody,
  authHeader
}: {
  rpcName: string;
  rpcBody: unknown;
  authHeader: string;
}) {
  const { url, apikey } = getSupabasePublicEnv();
  const resp = await fetch(`${url}/rest/v1/rpc/${rpcName}`, {
    method: "POST",
    headers: {
      apikey,
      Authorization: authHeader,
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: JSON.stringify(rpcBody ?? {})
  });
  const text = await resp.text();
  return { ok: resp.ok, status: resp.status, text };
}

