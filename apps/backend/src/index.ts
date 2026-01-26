import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { createServer } from "http";
import { randomInt } from "node:crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { env, getCorsOrigins } from "./env.js";
import { sendError } from "./errors.js";
import { attachSocket } from "./socket.js";
import {
  callSupabaseRpc,
  getAuthDomainEmail,
  getBearer,
  getSupabasePublicEnv,
  getSupabaseServerEnv,
  supabaseAuthUser,
  supabaseFetchProfile
} from "./supabase.js";

function normalizeSenha(s: unknown) {
  return String(s || "").trim();
}
function normalizeCpf(cpf: unknown) {
  const raw = String(cpf || "").trim();
  const digits = raw.replace(/\D/g, "");
  return digits || raw;
}

function isoDateInTimeZone(tz: string) {
  try {
    return new Intl.DateTimeFormat("sv-SE", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).format(new Date());
  } catch {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }
}

function toBrDate(dateStr: string) {
  if (!dateStr) return null;
  const raw = String(dateStr).trim();
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(raw)) return raw;
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) {
    const [, yyyy, mm, dd] = m;
    return `${dd}/${mm}/${yyyy}`;
  }
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function extractFirstArray(value: unknown, maxDepth = 4): unknown[] | null {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object" || maxDepth <= 0) return null;
  const obj = value as Record<string, unknown>;
  const preferredKeys = ["dados", "data", "registros", "results", "resultado", "itens", "items", "lista", "list"];
  for (const k of preferredKeys) {
    if (Object.prototype.hasOwnProperty.call(obj, k)) {
      const found = extractFirstArray(obj[k], maxDepth - 1);
      if (found) return found;
    }
  }
  for (const v of Object.values(obj)) {
    const found = extractFirstArray(v, maxDepth - 1);
    if (found) return found;
  }
  return null;
}

function nowIso() {
  return new Date().toISOString();
}

function startEndUtcForTzDay(tz: string) {
  // Converte meia-noite do dia local (tz) em UTC para filtrar timestamptz com precisão.
  const isoLocalDay = isoDateInTimeZone(tz); // YYYY-MM-DD
  // America/Sao_Paulo costuma ser -03:00 (sem DST atualmente)
  const start = new Date(`${isoLocalDay}T00:00:00-03:00`).toISOString();
  const end = new Date(`${isoLocalDay}T00:00:00-03:00`);
  end.setUTCDate(end.getUTCDate() + 1);
  const endIso = end.toISOString();
  return { isoLocalDay, startUtc: start, endUtc: endIso };
}

async function countSenhasExact({
  authHeader,
  where
}: {
  authHeader: string;
  where: string; // querystring começando com &
}): Promise<number> {
  const { url: supabaseUrl, apikey } = getSupabasePublicEnv();
  const targetUrl = `${supabaseUrl}/rest/v1/senhas?select=id&limit=1${where}`;
  const resp = await fetch(targetUrl, {
    method: "GET",
    headers: {
      apikey,
      Authorization: authHeader,
      Accept: "application/json",
      Prefer: "count=exact"
    }
  });
  const contentRange = resp.headers.get("content-range") || "";
  const txt = await resp.text();
  if (!resp.ok) throw new Error(txt.slice(0, 200));
  const m = contentRange.match(/\/(\d+)\s*$/);
  if (m && m[1]) return Number(m[1]) || 0;
  try {
    const arr = JSON.parse(txt || "[]");
    return Array.isArray(arr) ? arr.length : 0;
  } catch {
    return 0;
  }
}

function generateSenhaSemAgendamento() {
  // Importante: `public.senhas.senha` é UNIQUE global (histórico). Um espaço pequeno (ex.: 90k)
  // começa a colidir com o tempo. Aqui geramos uma senha com baixa chance de colisão mesmo
  // com base grande e alta concorrência.
  //
  // Formato: S + YYMMDD + HHMMSS (UTC) + RAND6  => ex.: S260122220033123456
  const iso = new Date().toISOString(); // YYYY-MM-DDTHH:mm:ss.sssZ
  const yymmdd = iso.slice(2, 10).replaceAll("-", "");
  const hhmmss = iso.slice(11, 19).replaceAll(":", "");
  const rand6 = String(randomInt(0, 1_000_000)).padStart(6, "0");
  return `S${yymmdd}${hhmmss}${rand6}`;
}

function generateSenhaFromSoc(socCode: string, tz: string) {
  // Também precisa ser UNIQUE global. Como o SOC pode mandar sempre o mesmo código do funcionário,
  // adicionamos a data (no fuso da clínica) + um rand pequeno.
  //
  // Formato: A + YYMMDD(local) + COD + RAND6
  const isoDay = isoDateInTimeZone(tz); // YYYY-MM-DD
  const yymmdd = isoDay.slice(2).replaceAll("-", "");
  const code = String(socCode || "").trim().replace(/\s+/g, "");
  const rand6 = String(randomInt(0, 1_000_000)).padStart(6, "0");
  return `A${yymmdd}${code}${rand6}`;
}

function senhaCurta(raw: unknown) {
  const s = String(raw || "").trim();
  if (!s) return "";
  const hasPrefix = /^[A-Za-z]/.test(s);
  const prefix = hasPrefix ? s[0].toUpperCase() : "";
  const rest = hasPrefix ? s.slice(1) : s;
  const digits = rest.replace(/\D/g, "");
  if (!digits) return s;
  const first5 = digits.slice(0, 5);
  return prefix ? `${prefix}${first5}` : first5;
}

function validateByteStringHeader(name: string, value: string) {
  // undici/fetch exige "ByteString" (cada charCode <= 255) para headers.
  // Se a key do Supabase vier com caractere unicode (aspas “”, espaço invisível, etc.),
  // o fetch lança: "Cannot convert argument to a ByteString..."
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code > 255) {
      return {
        ok: false as const,
        message: `${name} contém caractere inválido no índice ${i} (codepoint ${code}). Re-copie a chave do Supabase (sem aspas/emoji/espaços invisíveis).`
      };
    }
  }
  return { ok: true as const };
}

async function insertSenhaServerSide(payload: Record<string, unknown>) {
  const { url, apikey } = getSupabaseServerEnv();
  if (!url) return { ok: false as const, status: 500, text: "SUPABASE_URL não configurado no backend." };
  if (!apikey)
    return {
      ok: false as const,
      status: 500,
      text: "SUPABASE_SERVICE_ROLE_KEY (recomendado) ou SUPABASE_ANON_KEY não configurado no backend."
    };
  {
    const v = validateByteStringHeader("SUPABASE_*_KEY", apikey);
    if (!v.ok) return { ok: false as const, status: 500, text: v.message };
  }
  try {
    const resp = await fetch(`${url}/rest/v1/senhas`, {
      method: "POST",
      headers: {
        apikey,
        Authorization: `Bearer ${apikey}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
        Accept: "application/json"
      },
      body: JSON.stringify(payload)
    });
    const text = await resp.text();
    return { ok: resp.ok, status: resp.status, text };
  } catch (e: any) {
    return { ok: false as const, status: 502, text: `Falha de rede ao falar com Supabase: ${String(e?.message || e)}` };
  }
}

async function fetchSoc({ dateIso }: { dateIso: string }) {
  const isoDate = dateIso || isoDateInTimeZone(env.SOC_TIMEZONE);
  const brDate = toBrDate(isoDate);
  if (!brDate) return { ok: false as const, status: 400, data: [] as unknown[] };

  const parametro = {
    empresa: env.SOC_EMPRESA || "1566278",
    codigo: env.SOC_CODIGO || "206605",
    chave: env.SOC_CHAVE || "4b5a356e0526d14128f6",
    tipoSaida: "json",
    codigoUsuarioAgenda: env.SOC_CODIGO_USUARIO_AGENDA || "2576657",
    dataInicial: brDate,
    dataFinal: brDate
  };

  const url = `${env.SOC_EXPORT_URL}?parametro=${encodeURIComponent(JSON.stringify(parametro))}`;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000);
    const resp = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      headers: { "user-agent": "safe-atendimento/2.0" }
    }).finally(() => clearTimeout(timeoutId));
    const text = await resp.text();
    if (!resp.ok) return { ok: true as const, status: resp.status, data: [] as unknown[] };
    try {
      const json = JSON.parse(text);
      const arr = extractFirstArray(json) || (Array.isArray(json) ? json : []);
      return { ok: true as const, status: resp.status, data: Array.isArray(arr) ? arr : [] };
    } catch {
      return { ok: true as const, status: resp.status, data: [] as unknown[] };
    }
  } catch {
    return { ok: true as const, status: 200, data: [] as unknown[] };
  }
}

function findSocMatchByCpf(items: unknown[], cpfDigits: string) {
  const candidates = Array.isArray(items) ? items : [];
  for (const it of candidates) {
    if (!it || typeof it !== "object") continue;
    const obj = it as Record<string, unknown>;
    const keys = ["CPFFUNCIONARIO", "cpf", "CPF", "documento", "nrCpf", "cpfFuncionario"];
    for (const k of keys) {
      const raw = obj[k];
      if (!raw) continue;
      const digits = String(raw).replace(/\D/g, "");
      if (digits && digits === cpfDigits) return obj;
    }
  }
  return null;
}

function pickSocNome(socRow: Record<string, unknown> | null) {
  if (!socRow) return null;
  const candidates = ["NOMEFUNCIONARIO", "nome", "NOME", "name"];
  for (const k of candidates) {
    const v = socRow[k];
    const s = v != null ? String(v).trim() : "";
    if (s) return s;
  }
  return null;
}

function pickSocSenha(socRow: Record<string, unknown> | null) {
  if (!socRow) return null;
  const candidates = ["CODIGOFUNCIONARIO", "codigoFuncionario", "id", "ID"];
  for (const k of candidates) {
    const v = socRow[k];
    const s = v != null ? String(v).trim() : "";
    if (s) return s;
  }
  return null;
}

async function resolveCallerProfile(authHeader: string) {
  // authHeader vem como "Bearer <token>"
  const token = String(authHeader || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;
  const userOut = await supabaseAuthUser({ accessToken: token });
  if (!userOut.ok) return null;
  const userId = String((userOut as any).json?.id || "").trim();
  if (!userId) return null;
  const profOut = await supabaseFetchProfile({ accessToken: token, userId });
  if (!profOut.ok) return null;
  return { userId, profile: profOut.profile };
}

async function hasActiveAttendance(profileId: string): Promise<boolean> {
  const { url, apikey } = getSupabaseServerEnv();
  if (!url || !apikey) return false;
  const targetUrl =
    `${url}/rest/v1/senhas` +
    `?select=senha` +
    `&status=eq.em_atendimento` +
    `&medico_atendendo_id=eq.${encodeURIComponent(profileId)}` +
    `&limit=1`;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);
    const resp = await fetch(targetUrl, {
      method: "GET",
      signal: controller.signal,
      headers: { apikey, Authorization: `Bearer ${apikey}`, Accept: "application/json" }
    }).finally(() => clearTimeout(timeoutId));
    const text = await resp.text();
    if (!resp.ok) return false;
    const arr = JSON.parse(text || "[]");
    return Array.isArray(arr) && arr.length > 0;
  } catch {
    return false;
  }
}

function normalizeRoom(s: unknown) {
  return String(s || "").trim().toLowerCase();
}

function isEncaminhamentoExame(enc: any) {
  if (!enc || typeof enc !== "object") return false;
  const tipo = String(enc.tipo || "").trim().toLowerCase();
  const sala = normalizeRoom(enc.salaDestino || "");
  return tipo === "exame" || sala.includes("exame");
}

function inferSalaForAnnouncement({
  callerRole,
  enc
}: {
  callerRole: string;
  enc: any;
}): string | null {
  // Se houver salaDestino (principalmente em exames), preferimos ela.
  const salaDestino = enc && typeof enc === "object" ? String(enc.salaDestino || "").trim() : "";
  if (salaDestino) return salaDestino;

  const r = String(callerRole || "").trim().toLowerCase();
  if (r === "medico") return "Consultório";
  if (r === "enfermagem") return "Exames 1 e Exames 2";
  if (r === "fono") return "Audiometria";
  return null;
}

const app = express();
app.disable("x-powered-by");
app.use(
  helmet({
    contentSecurityPolicy: false
  })
);
app.use(morgan("tiny"));
app.use(express.json({ limit: "1mb" }));

const corsOrigins = getCorsOrigins();
app.use(
  cors({
    origin: corsOrigins.length ? corsOrigins : true,
    credentials: false
  })
);

// =========================
// Assets do legado (para manter visual idêntico)
// =========================
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// dist/ -> apps/backend/ -> apps/ -> repo root
const REPO_ROOT = path.join(__dirname, "..", "..", "..");
const LEGACY_ASSETS = path.join(REPO_ROOT, "assets");
if (fs.existsSync(LEGACY_ASSETS)) {
  app.use("/assets", express.static(LEGACY_ASSETS));
}

// Health
app.get("/health", (_req, res) => res.json({ ok: true }));

// =========================
// Socket.io
// =========================
const httpServer = createServer(app);
const { emitQueueUpdate, emitAlertReception, emitPublicAnnouncement } = attachSocket(httpServer);

// =========================
// Supabase proxy (PostgREST/RPC) - compatível com front legado e novo
// =========================
app.all("/api/supa/*", async (req, res) => {
  try {
    const { url: supabaseUrl, apikey } = getSupabasePublicEnv();
    if (!supabaseUrl || !apikey) {
      return sendError(res, 500, "Supabase não configurado no backend (SUPABASE_URL + SUPABASE_ANON_KEY).");
    }

    const incoming = String(req.originalUrl || req.url || "");
    const restPath = incoming.replace(/^\/api\/supa/, "");

    const allowed = restPath.startsWith("/senhas") || restPath.startsWith("/profiles") || restPath.startsWith("/rpc/");
    if (!allowed) return sendError(res, 404, "Rota não encontrada");

    const targetUrl = `${supabaseUrl}/rest/v1${restPath}`;
    const headers: Record<string, string> = {
      apikey,
      Authorization: String(req.headers.authorization || ""),
      Accept: String(req.headers.accept || "application/json")
    };
    if (req.headers.prefer) headers.Prefer = String(req.headers.prefer);
    if (req.headers["accept-profile"]) headers["accept-profile"] = String(req.headers["accept-profile"]);
    if (req.headers["content-profile"]) headers["content-profile"] = String(req.headers["content-profile"]);

    const method = String(req.method || "GET").toUpperCase();
    const hasBody = method !== "GET" && method !== "HEAD";
    const upstream = await fetch(targetUrl, {
      method,
      headers: { ...headers, ...(hasBody ? { "Content-Type": "application/json" } : {}) },
      body: hasBody ? JSON.stringify((req as any).body ?? {}) : undefined
    });
    const contentType = upstream.headers.get("content-type") || "application/json";
    const text = await upstream.text();
    res.status(upstream.status);
    res.setHeader("content-type", contentType);
    return res.send(text);
  } catch (e: any) {
    return sendError(res, 500, "Erro ao chamar Supabase via proxy", { detail: String(e?.message || e) });
  }
});

// =========================
// Auth (Supabase) - backend-first
// =========================
app.post("/api/auth/login", async (req, res) => {
  try {
    const usernameRaw = String((req as any).body?.username || "").trim();
    const password = String((req as any).body?.password || (req as any).body?.senha || "").trim();
    if (!usernameRaw || !password) return sendError(res, 400, "Usuário e senha são obrigatórios");

    const { url: supabaseUrl, apikey } = getSupabasePublicEnv();
    if (!supabaseUrl || !apikey) {
      return sendError(res, 500, "Supabase não configurado no backend (SUPABASE_URL + SUPABASE_ANON_KEY).");
    }

    const email = getAuthDomainEmail(usernameRaw);
    const tokenRes = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { apikey, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ email, password })
    });
    const tokenText = await tokenRes.text();
    if (!tokenRes.ok) return sendError(res, tokenRes.status, "Credenciais inválidas", { detail: tokenText.slice(0, 300) });

    const tokenJson = JSON.parse(tokenText || "{}");
    const accessToken = String(tokenJson?.access_token || "").trim();
    const refreshToken = String(tokenJson?.refresh_token || "").trim();
    const expiresIn = Number(tokenJson?.expires_in || 0) || null;
    const userId = String(tokenJson?.user?.id || "").trim();
    const userEmail = String(tokenJson?.user?.email || email).trim();
    if (!accessToken || !refreshToken || !userId) return sendError(res, 500, "Resposta de login inválida (sem token)");

    const profOut = await supabaseFetchProfile({ accessToken, userId });
    if (!profOut.ok) return sendError(res, profOut.status, "Erro ao carregar perfil", { detail: profOut.text.slice(0, 300) });
    if (!profOut.profile?.role) return sendError(res, 404, "Perfil não encontrado (tabela profiles)");

    return res.json({
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_in: expiresIn,
      user: { id: userId, email: userEmail },
      profile: profOut.profile
    });
  } catch (e: any) {
    return sendError(res, 500, "Erro ao fazer login", { detail: String(e?.message || e) });
  }
});

app.post("/api/auth/refresh", async (req, res) => {
  try {
    const refreshToken = String((req as any).body?.refresh_token || "").trim();
    if (!refreshToken) return sendError(res, 400, "refresh_token é obrigatório");

    const { url: supabaseUrl, apikey } = getSupabasePublicEnv();
    if (!supabaseUrl || !apikey) {
      return sendError(res, 500, "Supabase não configurado no backend (SUPABASE_URL + SUPABASE_ANON_KEY).");
    }

    const tokenRes = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=refresh_token`, {
      method: "POST",
      headers: { apikey, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken })
    });
    const txt = await tokenRes.text();
    if (!tokenRes.ok) return sendError(res, tokenRes.status, "Falha ao renovar sessão", { detail: txt.slice(0, 300) });

    const json = JSON.parse(txt || "{}");
    const accessToken = String(json?.access_token || "").trim();
    const nextRefresh = String(json?.refresh_token || "").trim();
    const expiresIn = Number(json?.expires_in || 0) || null;
    if (!accessToken || !nextRefresh) return sendError(res, 500, "Resposta inválida ao renovar sessão");
    return res.json({ access_token: accessToken, refresh_token: nextRefresh, expires_in: expiresIn });
  } catch (e: any) {
    return sendError(res, 500, "Erro ao renovar sessão", { detail: String(e?.message || e) });
  }
});

app.post("/api/auth/me", async (req, res) => {
  try {
    const authHeader = getBearer(req.headers.authorization);
    if (!authHeader) return sendError(res, 401, "Authorization Bearer token é obrigatório");

    const { url: supabaseUrl, apikey } = getSupabasePublicEnv();
    if (!supabaseUrl || !apikey) {
      return sendError(res, 500, "Supabase não configurado no backend (SUPABASE_URL + SUPABASE_ANON_KEY).");
    }

    const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
      method: "GET",
      headers: { apikey, Authorization: authHeader, Accept: "application/json" }
    });
    const userTxt = await userRes.text();
    if (!userRes.ok) return sendError(res, userRes.status, "Sessão inválida", { detail: userTxt.slice(0, 300) });
    const userJson = JSON.parse(userTxt || "{}");
    const userId = String(userJson?.id || "").trim();
    if (!userId) return sendError(res, 401, "Sessão inválida (sem usuário)");

    const token = authHeader.replace(/^Bearer\s+/i, "");
    const profOut = await supabaseFetchProfile({ accessToken: token, userId });
    if (!profOut.ok) return sendError(res, profOut.status, "Erro ao carregar perfil", { detail: profOut.text.slice(0, 300) });
    if (!profOut.profile?.role) return sendError(res, 404, "Perfil não encontrado (tabela profiles)");

    return res.json({ user: { id: userId, email: userJson?.email || null }, profile: profOut.profile });
  } catch (e: any) {
    return sendError(res, 500, "Erro ao validar sessão", { detail: String(e?.message || e) });
  }
});

app.post("/api/auth/logout", async (_req, res) => res.json({ ok: true }));

// =========================
// Dashboard: stats (igual legado, porém server-side)
// =========================
app.get("/api/dashboard/stats", async (req, res) => {
  try {
    const authHeader = getBearer(req.headers.authorization);
    if (!authHeader) return sendError(res, 401, "Authorization Bearer token é obrigatório");

    const { startUtc, endUtc, isoLocalDay } = startEndUtcForTzDay(env.SOC_TIMEZONE);
    const start = encodeURIComponent(startUtc);
    const end = encodeURIComponent(endUtc);

    const baseWhereDay = `&updated_at=gte.${start}&updated_at=lt.${end}`;

    const [pacientesHoje, atendidasHoje, pendentesHoje, cadastrosHoje] = await Promise.all([
      countSenhasExact({ authHeader, where: baseWhereDay }),
      countSenhasExact({ authHeader, where: `${baseWhereDay}&status=eq.atendida` }),
      countSenhasExact({ authHeader, where: `${baseWhereDay}&status=eq.pendente` }),
      countSenhasExact({ authHeader, where: `${baseWhereDay}&status=eq.cadastro` })
    ]);

    // Consulta SOC (consultas agendadas do dia)
    const soc = await fetchSoc({ dateIso: isoLocalDay });
    const consultasHojeSoc = Array.isArray(soc.data) ? soc.data.length : 0;

    const naFilaHoje = pendentesHoje + cadastrosHoje; // igual legado
    const tempoMedioMin = atendidasHoje > 0 ? Math.floor(15 + atendidasHoje * 0.5) : 0; // igual legado

    return res.json({
      pacientesHoje,
      consultasHojeSoc,
      consultasRealizadasHoje: atendidasHoje,
      naFilaHoje,
      tempoMedioMin
    });
  } catch (e: any) {
    return sendError(res, 500, "Erro ao carregar estatísticas", { detail: String(e?.message || e) });
  }
});

// =========================
// Totem: Checkin (novo) - server-side + Socket.io
// =========================
app.post("/api/checkin", async (req, res) => {
  try {
    const cpf = normalizeCpf((req as any).body?.cpf);
    if (!cpf) return sendError(res, 400, "cpf é obrigatório");

    const cpfDigits = cpf.replace(/\D/g, "");
    const hoje = isoDateInTimeZone(env.SOC_TIMEZONE);
    const soc = await fetchSoc({ dateIso: hoje });
    const match = findSocMatchByCpf(soc.data, cpfDigits);
    const nome = pickSocNome(match);
    const socSenha = pickSocSenha(match);

    const socFound = Boolean(match);
    const soc_status = socFound ? "encontrado" : "nao_encontrado";

    // Importante:
    // - Inserir "pendente" + nome/cpf direto (auto-enfileirar) normalmente exige SERVICE_ROLE no backend
    //   (ou uma policy RLS permissiva, o que não é recomendado).
    // - Sem SERVICE_ROLE, caímos no fluxo "cadastro" (pede para ir à recepção).
    const hasServiceRole = Boolean(env.SUPABASE_SERVICE_ROLE_KEY);
    const canAutoEnqueue = socFound && Boolean(nome) && hasServiceRole;

    const found = canAutoEnqueue; // semântica do front: "entrou na fila"
    const status = canAutoEnqueue ? "pendente" : "cadastro";

    // Regra:
    // - Achou no SOC -> entra direto em pendente (fila) com nome/cpf, mas a senha precisa ser UNIQUE global.
    // - Não achou -> status=cadastro e avisa recepção.
    let senha =
      socFound && socSenha ? generateSenhaFromSoc(String(socSenha).trim(), env.SOC_TIMEZONE) : generateSenhaSemAgendamento();

    // Tenta inserir; em caso de conflito, gera outra (para o caso sem agendamento).
    let inserted = false;
    let lastUpstreamStatus = 0;
    let lastUpstreamText = "";
    let lastSenhaTried = senha;
    for (let attempt = 0; attempt < 15; attempt++) {
      const payload: Record<string, unknown> = {
        senha,
        status,
        soc_status,
        cpf: cpfDigits || cpf
      };
      // Só envia nome quando for auto-enfileirar (service role).
      if (canAutoEnqueue && nome) payload.nome = nome;

      const out = await insertSenhaServerSide(payload);
      if (out.ok) {
        inserted = true;
        break;
      }
      lastUpstreamStatus = out.status;
      lastUpstreamText = out.text || "";
      lastSenhaTried = senha;

      // Só faz retry quando for realmente UNIQUE (Postgres 23505 / mensagem de duplicidade).
      // Se o Supabase estiver devolvendo 409 por outro motivo, não mascaramos com retries.
      const looksLikeUnique = /23505|duplicate key value|unique constraint|senha_already_exists/i.test(lastUpstreamText);
      if (out.status === 409 && looksLikeUnique) {
        senha =
          socFound && socSenha
            ? generateSenhaFromSoc(String(socSenha).trim(), env.SOC_TIMEZONE)
            : generateSenhaSemAgendamento();
        continue;
      }
      // Se o upstream é RLS, devolvemos 403 (não 409) com diagnóstico acionável.
      try {
        const j = JSON.parse(lastUpstreamText || "{}") as any;
        const isRls =
          String(j?.code || "") === "42501" && /row-level security policy/i.test(String(j?.message || lastUpstreamText));
        if (isRls) {
          return sendError(res, 403, "Supabase bloqueou o check-in por RLS (policies) na tabela 'senhas'.", {
            senha: lastSenhaTried,
            hint: env.SUPABASE_SERVICE_ROLE_KEY
              ? "Verifique policies de INSERT em public.senhas."
              : "Configure SUPABASE_SERVICE_ROLE_KEY no backend (recomendado) ou crie policy de INSERT para o papel usado.",
            upstream: j
          });
        }
      } catch {
        // ignora parse
      }
      return sendError(res, out.status, "Falha ao registrar check-in", { senha: lastSenhaTried, detail: lastUpstreamText.slice(0, 500) });
    }
    if (!inserted) {
      return sendError(res, 409, "Não foi possível gerar uma senha única. Tente novamente.", {
        senha: lastSenhaTried,
        upstreamStatus: lastUpstreamStatus,
        upstreamDetail: lastUpstreamText.slice(0, 500)
      });
    }

    emitQueueUpdate("checkin_created", senha);
    if (!found) emitAlertReception(cpfDigits || cpf, senha);

    return res.json({
      ok: true,
      found,
      senha,
      senhaDisplay: senhaCurta(senha),
      cpf: cpfDigits || cpf,
      // Só devolve nome quando auto-enfileirar (para não “prometer” que entrou na fila sem service role).
      nome: canAutoEnqueue ? nome || null : null,
      status
    });
  } catch (e: any) {
    return sendError(res, 500, "Erro ao fazer check-in", { detail: String(e?.message || e) });
  }
});

// =========================
// Atendente: lista de senhas (server-side, evita CORS/Safari)
// =========================
app.get("/api/atendente/senhas", async (req, res) => {
  try {
    const authHeader = getBearer(req.headers.authorization);
    if (!authHeader) return sendError(res, 401, "Authorization Bearer token é obrigatório");

    const { url: supabaseUrl, apikey } = getSupabasePublicEnv();
    if (!supabaseUrl || !apikey) {
      return sendError(res, 500, "Supabase não configurado no backend (SUPABASE_URL + SUPABASE_ANON_KEY).");
    }

    const targetUrl =
      `${supabaseUrl}/rest/v1/senhas` +
      `?select=senha,nome,cpf,status,created_at,updated_at,encaminhamento,medico_atendendo_id` +
      `&status=in.(cadastro,pendente)` +
      `&medico_atendendo_id=is.null` +
      `&order=updated_at.desc` +
      `&limit=200`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);
    const upstream = await fetch(targetUrl, {
      method: "GET",
      signal: controller.signal,
      headers: { apikey, Authorization: authHeader, Accept: "application/json" }
    }).finally(() => clearTimeout(timeoutId));

    const txt = await upstream.text();
    if (!upstream.ok) {
      return sendError(res, upstream.status, "Falha ao carregar senhas", { detail: txt.slice(0, 500) });
    }
    const data = txt ? JSON.parse(txt) : [];
    return res.json(Array.isArray(data) ? data : []);
  } catch (e: any) {
    const msg = e?.name === "AbortError" ? "Timeout ao carregar senhas" : "Erro ao carregar senhas";
    return sendError(res, 502, msg, { detail: String(e?.message || e) });
  }
});

// =========================
// Atendimento (RPCs) + Socket.io events
// =========================
app.post("/api/atendimento/triar", async (req, res) => {
  try {
    const authHeader = getBearer(req.headers.authorization);
    if (!authHeader) return sendError(res, 401, "Authorization Bearer token é obrigatório");

    const senha = normalizeSenha((req as any).body?.senha);
    const nome = String((req as any).body?.nome || "").trim();
    const cpf = String((req as any).body?.cpf || "").trim();
    const soc_status = String((req as any).body?.soc_status || "nao_verificado").trim();
    const prioridade = Boolean((req as any).body?.prioridade);
    if (!senha || !nome || !cpf) return sendError(res, 400, "Campos 'senha', 'nome' e 'cpf' são obrigatórios");

    const out = await callSupabaseRpc({
      rpcName: "triar_senha",
      rpcBody: { p_senha: senha, p_nome: nome, p_cpf: cpf, p_soc_status: soc_status, p_prioridade: prioridade },
      authHeader
    });
    if (!out.ok) return sendError(res, out.status, "Falha ao triar senha", { detail: out.text.slice(0, 500) });

    emitQueueUpdate("triage_updated", senha);
    return res.json(out.text ? JSON.parse(out.text) : null);
  } catch (e: any) {
    return sendError(res, 500, "Erro ao triar senha", { detail: String(e?.message || e) });
  }
});

app.post("/api/atendimento/chamar", async (req, res) => {
  try {
    const authHeader = getBearer(req.headers.authorization);
    if (!authHeader) return sendError(res, 401, "Authorization Bearer token é obrigatório");
    const senha = normalizeSenha((req as any).body?.senha);
    if (!senha) return sendError(res, 400, "Campo 'senha' é obrigatório");

    const caller = await resolveCallerProfile(authHeader);
    const callerRole = String(caller?.profile?.role || "").trim().toLowerCase();
    const callerId = String(caller?.userId || "").trim();
    if (!callerId) return sendError(res, 403, "Perfil não encontrado (tabela profiles)");

    // Regra pedida:
    // - médico/fono: só pode ter 1 senha em atendimento por vez
    // - enfermagem: pode chamar mais de 1 por vez
    if (callerRole === "medico" || callerRole === "fono") {
      const hasActive = await hasActiveAttendance(callerId);
      if (hasActive) {
        return sendError(res, 409, "Você já tem um atendimento em andamento. Finalize/encaminhe antes de chamar outro.");
      }
    }

    const out = await callSupabaseRpc({ rpcName: "chamar_senha", rpcBody: { p_senha: senha }, authHeader });
    if (!out.ok) {
      // Se o RPC também bloquear (regra aplicada no banco), devolvemos uma msg amigável.
      if (/already_in_attendance/i.test(out.text || "")) {
        return sendError(res, 409, "Você já tem um atendimento em andamento. Finalize/encaminhe antes de chamar outro.");
      }
      return sendError(res, out.status, "Falha ao chamar senha", { detail: out.text.slice(0, 500) });
    }
    const row = out.text ? JSON.parse(out.text) : null;

    emitQueueUpdate("called", senha);
    // Sala anunciada segue o perfil (consultório/exames) e/ou o encaminhamento.
    const sala = inferSalaForAnnouncement({
      callerRole,
      enc: row?.encaminhamento || null
    });
    emitPublicAnnouncement(senha, row?.nome || null, sala, "called");
    return res.json(row);
  } catch (e: any) {
    return sendError(res, 500, "Erro ao chamar senha", { detail: String(e?.message || e) });
  }
});

app.post("/api/atendimento/finalizar", async (req, res) => {
  try {
    const authHeader = getBearer(req.headers.authorization);
    if (!authHeader) return sendError(res, 401, "Authorization Bearer token é obrigatório");
    const senha = normalizeSenha((req as any).body?.senha);
    if (!senha) return sendError(res, 400, "Campo 'senha' é obrigatório");

    const out = await callSupabaseRpc({ rpcName: "finalizar_senha", rpcBody: { p_senha: senha }, authHeader });
    if (!out.ok) return sendError(res, out.status, "Falha ao finalizar senha", { detail: out.text.slice(0, 500) });
    emitQueueUpdate("finished", senha);
    return res.json(out.text ? JSON.parse(out.text) : null);
  } catch (e: any) {
    return sendError(res, 500, "Erro ao finalizar senha", { detail: String(e?.message || e) });
  }
});

app.post("/api/atendimento/aceitar", async (req, res) => {
  try {
    const authHeader = getBearer(req.headers.authorization);
    if (!authHeader) return sendError(res, 401, "Authorization Bearer token é obrigatório");
    const senha = normalizeSenha((req as any).body?.senha);
    if (!senha) return sendError(res, 400, "Campo 'senha' é obrigatório");

    const out = await callSupabaseRpc({ rpcName: "aceitar_encaminhamento", rpcBody: { p_senha: senha }, authHeader });
    if (!out.ok) return sendError(res, out.status, "Falha ao aceitar encaminhamento", { detail: out.text.slice(0, 500) });
    emitQueueUpdate("referral_accepted", senha);
    return res.json(out.text ? JSON.parse(out.text) : null);
  } catch (e: any) {
    return sendError(res, 500, "Erro ao aceitar encaminhamento", { detail: String(e?.message || e) });
  }
});

app.post("/api/atendimento/encaminhar", async (req, res) => {
  try {
    const authHeader = getBearer(req.headers.authorization);
    if (!authHeader) return sendError(res, 401, "Authorization Bearer token é obrigatório");

    const senha = normalizeSenha((req as any).body?.senha);
    const tipo = String((req as any).body?.tipo || "medico").trim();
    const motivo = (req as any).body?.motivo != null ? String((req as any).body.motivo).trim() : null;
    const salaDestino = (req as any).body?.salaDestino != null ? String((req as any).body.salaDestino).trim() : null;
    const medicoDestinoId = (req as any).body?.medicoDestinoId != null ? String((req as any).body.medicoDestinoId).trim() : null;
    if (!senha) return sendError(res, 400, "Campo 'senha' é obrigatório");

    let rpcName = "encaminhar_senha";
    let rpcBody: any = null;
    if (tipo !== "medico") {
      rpcName = "encaminhar_para_exame";
      if (!salaDestino) return sendError(res, 400, "Campo 'salaDestino' é obrigatório para exames");
      rpcBody = { p_senha: senha, p_sala_destino: salaDestino, p_motivo: motivo };
    } else {
      if (!medicoDestinoId) return sendError(res, 400, "Campo 'medicoDestinoId' é obrigatório");
      rpcBody = { p_senha: senha, p_medico_destino_id: medicoDestinoId, p_motivo: motivo, p_sala_destino: salaDestino };
    }

    const out = await callSupabaseRpc({ rpcName, rpcBody, authHeader });
    if (!out.ok) return sendError(res, out.status, "Falha ao encaminhar", { detail: out.text.slice(0, 500) });
    emitQueueUpdate("referred", senha);
    const row = out.text ? JSON.parse(out.text) : null;

    // Quando encaminha (principalmente para exames), também anunciamos no painel público
    // para o paciente saber a sala/destino imediatamente.
    const sala = (() => {
      if (tipo !== "medico") return salaDestino || null; // exames: obrigatório
      // médico: se houver salaDestino explícita, usamos; senão não anunciamos sala
      return salaDestino || (row?.encaminhamento?.salaDestino ? String(row.encaminhamento.salaDestino) : null) || null;
    })();
    if (sala) emitPublicAnnouncement(senha, row?.nome || null, sala, "referred");

    return res.json(row);
  } catch (e: any) {
    return sendError(res, 500, "Erro ao encaminhar", { detail: String(e?.message || e) });
  }
});

// =========================
// Painel (TV): endpoints server-side (usa token do usuário logado)
// =========================
app.get("/api/painel/pendentes", async (_req, res) => {
  try {
    const authHeader = getBearer(res.req.headers.authorization);
    const { url: supabaseUrl } = getSupabasePublicEnv();
    const { apikey } = getSupabaseServerEnv(); // usa service role/anon do backend (server-side)
    if (!supabaseUrl || !apikey) return sendError(res, 500, "Supabase não configurado no backend.");

    const targetUrl =
      `${supabaseUrl}/rest/v1/senhas` +
      `?select=senha,nome,status,encaminhamento,medico_atendendo_id,created_at,updated_at,called_at` +
      `&status=in.(cadastro,pendente)` +
      `&medico_atendendo_id=is.null` +
      `&order=updated_at.desc` +
      `&limit=50`;
    const upstream = await fetch(targetUrl, {
      method: "GET",
      headers: { apikey, Authorization: authHeader || `Bearer ${apikey}`, Accept: "application/json" }
    });
    const txt = await upstream.text();
    if (!upstream.ok) return sendError(res, upstream.status, "Erro ao carregar painel (pendentes)", { detail: txt.slice(0, 500) });
    const data = txt ? JSON.parse(txt) : [];
    return res.json(Array.isArray(data) ? data : []);
  } catch (e: any) {
    return sendError(res, 500, "Erro ao carregar painel (pendentes)", { detail: String(e?.message || e) });
  }
});

app.get("/api/painel/em_atendimento", async (_req, res) => {
  try {
    const authHeader = getBearer(res.req.headers.authorization);
    const { url: supabaseUrl } = getSupabasePublicEnv();
    const { apikey } = getSupabaseServerEnv(); // usa service role/anon do backend (server-side)
    if (!supabaseUrl || !apikey) return sendError(res, 500, "Supabase não configurado no backend.");

    const targetUrl =
      `${supabaseUrl}/rest/v1/senhas` +
      `?select=senha,nome,status,encaminhamento,medico_atendendo_id,created_at,updated_at,called_at` +
      `&status=eq.em_atendimento` +
      `&order=called_at.desc` +
      `&limit=20`;
    const upstream = await fetch(targetUrl, {
      method: "GET",
      headers: { apikey, Authorization: authHeader || `Bearer ${apikey}`, Accept: "application/json" }
    });
    const txt = await upstream.text();
    if (!upstream.ok) return sendError(res, upstream.status, "Erro ao carregar painel (em atendimento)", { detail: txt.slice(0, 500) });
    const data = txt ? JSON.parse(txt) : [];
    return res.json(Array.isArray(data) ? data : []);
  } catch (e: any) {
    return sendError(res, 500, "Erro ao carregar painel (em atendimento)", { detail: String(e?.message || e) });
  }
});

// =========================
// SOC proxy (compatibilidade)
// =========================
app.get("/api/soc", async (req, res) => {
  const isoDate = req.query?.data ? String(req.query.data).trim() : isoDateInTimeZone(env.SOC_TIMEZONE);
  const out = await fetchSoc({ dateIso: isoDate });
  return res.json(out.data);
});

// =========================
// Frontend (SPA) - servir build do Vite em produção
// =========================
const FRONTEND_DIST = path.join(__dirname, "..", "..", "frontend", "dist");

if (fs.existsSync(path.join(FRONTEND_DIST, "index.html"))) {
  // assets do Vite (dist/assets/*)
  app.use(express.static(FRONTEND_DIST, { index: false }));

  // SPA fallback (não intercepta /api nem /socket.io)
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api") || req.path.startsWith("/socket.io")) return next();
    return res.sendFile(path.join(FRONTEND_DIST, "index.html"));
  });
}

// =========================
// Start
// =========================
httpServer.on("error", (err: any) => {
  if (err?.code === "EADDRINUSE") {
    // eslint-disable-next-line no-console
    console.error(
      `Porta ${env.PORT} já está em uso (EADDRINUSE). Feche o processo antigo na porta ${env.PORT} ou mude PORT no .env.`
    );
    process.exit(1);
  }
  // eslint-disable-next-line no-console
  console.error("Erro ao iniciar servidor HTTP:", err);
  process.exit(1);
});

httpServer.listen(env.PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Safe Atendimento (apps/backend) rodando na porta ${env.PORT}`);
});

