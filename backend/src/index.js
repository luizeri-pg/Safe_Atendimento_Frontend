import dotenv from "dotenv";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { all, get, initDb, openDb, run } from "./db.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.join(__dirname, "..", "..");
const CWD_ROOT = process.cwd();

// Carrega o .env da raiz do projeto
dotenv.config({ path: path.join(REPO_ROOT, ".env") });

const PORT = Number(process.env.PORT || 3000);
const DB_PATH = process.env.DB_PATH || path.join(__dirname, "..", "data.sqlite");

const app = express();
app.disable("x-powered-by");
// O frontend atual usa Tailwind via CDN e possui scripts inline.
// O CSP padrão do helmet bloqueia isso e quebra as páginas estáticas.
// Se quiser CSP forte no futuro, o ideal é remover CDN/inline scripts do frontend.
app.use(
  helmet({
    contentSecurityPolicy: false
  })
);
app.use(morgan("tiny"));
app.use(express.json({ limit: "1mb" }));

// Servir frontend (pages/js/assets) no mesmo serviço (Railway)
// Importante: dependendo do "root directory" configurado no Railway,
// o build pode rodar com CWD = repo root OU CWD = backend/.
function pickStaticRoot() {
  const candidates = [CWD_ROOT, REPO_ROOT];
  for (const root of candidates) {
    const pagesIndex = path.join(root, "pages", "index.html");
    if (fs.existsSync(pagesIndex)) return root;
  }
  return null;
}

const STATIC_ROOT = pickStaticRoot();
if (STATIC_ROOT) {
  // Expor credenciais do Supabase para o frontend em localhost via .env
  // IMPORTANTE: somente PUBLIC anon key. Nunca exponha service role key.
  app.get("/js/supabaseEnv.js", (_req, res) => {
    const url = String(process.env.SUPABASE_URL || "").trim();
    const anonKey = String(process.env.SUPABASE_ANON_KEY || "").trim();
    const authDomain = String(process.env.SAFE_SUPABASE_AUTH_DOMAIN || "safe.local").trim();

    res
      .type("application/javascript")
      .send(
        [
          "(function(){",
          "  window.__SAFE_SUPABASE_ENV = window.__SAFE_SUPABASE_ENV || {};",
          `  window.__SAFE_SUPABASE_ENV.url = ${JSON.stringify(url)};`,
          `  window.__SAFE_SUPABASE_ENV.anonKey = ${JSON.stringify(anonKey)};`,
          `  window.__SAFE_SUPABASE_ENV.authDomain = ${JSON.stringify(authDomain)};`,
          "})();"
        ].join("\n")
      );
  });

  // Evita cache agressivo do Safari/HTTP intermediários (senão o browser fica com JS antigo).
  // Em produção, preferimos sempre revalidar o HTML/JS.
  const noStore = (_res, filePath) => {
    // Só aplica em HTML/JS (assets de imagem podem permanecer cacheáveis se quiser no futuro).
    const p = String(filePath || "");
    if (p.endsWith(".js") || p.endsWith(".html")) {
      _res.setHeader("Cache-Control", "no-store, max-age=0");
    }
  };

  app.use("/assets", express.static(path.join(STATIC_ROOT, "assets")));
  app.use("/js", express.static(path.join(STATIC_ROOT, "js"), { setHeaders: noStore, maxAge: 0 }));
  app.use("/pages", express.static(path.join(STATIC_ROOT, "pages"), { setHeaders: noStore, maxAge: 0 }));
  app.get("/", (_req, res) => res.redirect("/pages/index.html"));
} else {
  // Se cair aqui, o serviço foi deployado sem os arquivos do frontend no container.
  // Ajuda a debugar sem "Cannot GET /pages/index.html" genérico.
  app.get("/", (_req, res) =>
    res
      .status(500)
      .type("text/plain")
      .send(
        [
          "Frontend não encontrado no container.",
          "Esperado: ./pages/index.html",
          `CWD_ROOT=${CWD_ROOT}`,
          `REPO_ROOT=${REPO_ROOT}`,
          "Dica: no Railway, ajuste o Root Directory para o repo root (não apenas backend/), ou inclua pages/js/assets no deploy."
        ].join("\n")
      )
  );
}

// CORS: por padrão libera tudo (facilita frontend estático).
// Se quiser travar, defina SAFE_CORS_ORIGIN="http://127.0.0.1:8000,https://seu-front.com"
const corsOrigins = (process.env.SAFE_CORS_ORIGIN || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: corsOrigins.length ? corsOrigins : true,
    credentials: false
  })
);

// Proxy Supabase Data API (PostgREST/RPC) para evitar CORS no browser.
// - O browser chama o backend (mesma origem no Railway)
// - O backend chama o Supabase (server-side) e repassa a resposta
// - Requer Authorization: Bearer <access_token> do Supabase (role authenticated)
function getSupabasePublicEnv() {
  const supabaseUrl = String(process.env.SUPABASE_URL || "").trim().replace(/\/+$/, "");
  // Para proxy autenticado, a ANON key é suficiente (o token do usuário decide permissões via RLS).
  // Em caso de falta, tentamos service role (último recurso).
  const supabaseAnonKey = String(process.env.SUPABASE_ANON_KEY || "").trim();
  const supabaseServiceKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  return {
    url: supabaseUrl,
    apikey: supabaseAnonKey || supabaseServiceKey || ""
  };
}

app.all("/api/supa/*", async (req, res) => {
  try {
    const { url: supabaseUrl, apikey } = getSupabasePublicEnv();
    if (!supabaseUrl || !apikey) {
      return sendError(res, 500, "Supabase não configurado no backend (SUPABASE_URL + SUPABASE_ANON_KEY).");
    }

    // Whitelist de recursos expostos
    const incoming = String(req.originalUrl || req.url || "");
    const restPath = incoming.replace(/^\/api\/supa/, ""); // ex.: /senhas?select=...
    const allowed =
      restPath.startsWith("/senhas") ||
      restPath.startsWith("/profiles") ||
      restPath.startsWith("/rpc/");
    if (!allowed) {
      return sendError(res, 404, "Rota não encontrada");
    }

    const targetUrl = `${supabaseUrl}/rest/v1${restPath}`;

    const headers = {
      apikey,
      // Importante: repassar o token do usuário para manter auth.uid() e RLS.
      Authorization: String(req.headers.authorization || ""),
      Accept: String(req.headers.accept || "application/json")
    };

    // Preservar Prefer (return=representation), se o frontend mandar.
    if (req.headers.prefer) headers.Prefer = String(req.headers.prefer);
    // Preservar accept-profile/content-profile caso existam (multi-schema).
    if (req.headers["accept-profile"]) headers["accept-profile"] = String(req.headers["accept-profile"]);
    if (req.headers["content-profile"]) headers["content-profile"] = String(req.headers["content-profile"]);

    const method = String(req.method || "GET").toUpperCase();
    const hasBody = method !== "GET" && method !== "HEAD";

    const upstream = await fetch(targetUrl, {
      method,
      headers: {
        ...headers,
        ...(hasBody ? { "Content-Type": "application/json" } : {})
      },
      body: hasBody ? JSON.stringify(req.body ?? {}) : undefined
    });

    const contentType = upstream.headers.get("content-type") || "application/json";
    const text = await upstream.text();
    res.status(upstream.status);
    res.setHeader("content-type", contentType);
    return res.send(text);
  } catch (e) {
    console.error("Erro no proxy Supabase (/api/supa/*):", e);
    return sendError(res, 500, "Erro ao chamar Supabase via proxy", { detail: String(e?.message || e) });
  }
});

// =========================
// Auth (Supabase) - backend-first
// =========================
// Objetivo: deixar o navegador o mais "burro" possível e reduzir problemas de sessão no Safari.
// - O front manda username/senha
// - O backend autentica no Supabase Auth (password grant)
// - O backend busca o profile no PostgREST
// - O front passa a guardar apenas access_token + profile no localStorage
function getAuthDomain() {
  return String(process.env.SAFE_SUPABASE_AUTH_DOMAIN || "safe.local").trim() || "safe.local";
}

app.post("/api/auth/login", async (req, res) => {
  try {
    const usernameRaw = String(req.body?.username || "").trim();
    const password = String(req.body?.password || req.body?.senha || "").trim();
    if (!usernameRaw || !password) {
      return sendError(res, 400, "Usuário e senha são obrigatórios");
    }

    const { url: supabaseUrl, apikey } = getSupabasePublicEnv();
    if (!supabaseUrl || !apikey) {
      return sendError(res, 500, "Supabase não configurado no backend (SUPABASE_URL + SUPABASE_ANON_KEY).");
    }

    const email = `${usernameRaw.toLowerCase()}@${getAuthDomain()}`;

    // Password grant (server-side) - não expõe a anon key no HTML; usa o backend como mediador.
    const tokenRes = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: {
        apikey,
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify({ email, password })
    });

    const tokenText = await tokenRes.text();
    if (!tokenRes.ok) {
      // Auth do Supabase costuma retornar 400/401 com json
      return sendError(res, tokenRes.status, "Credenciais inválidas", {
        detail: tokenText.slice(0, 300)
      });
    }

    const tokenJson = JSON.parse(tokenText || "{}");
    const accessToken = String(tokenJson?.access_token || "").trim();
    const userId = String(tokenJson?.user?.id || "").trim();
    const userEmail = String(tokenJson?.user?.email || email).trim();

    if (!accessToken || !userId) {
      return sendError(res, 500, "Resposta de login inválida (sem token)");
    }

    // Busca profile via PostgREST, autenticado como o usuário (mantém RLS).
    const profRes = await fetch(
      `${supabaseUrl}/rest/v1/profiles?select=id,username,nome,role&id=eq.${encodeURIComponent(userId)}&limit=1`,
      {
        method: "GET",
        headers: {
          apikey,
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json"
        }
      }
    );

    if (!profRes.ok) {
      const txt = await profRes.text().catch(() => "");
      return sendError(res, profRes.status, "Erro ao carregar perfil", { detail: txt.slice(0, 300) });
    }

    const arr = await profRes.json().catch(() => []);
    const profile = Array.isArray(arr) ? arr[0] : arr;
    if (!profile?.role) {
      return sendError(res, 404, "Perfil não encontrado (tabela profiles)");
    }

    return res.json({
      access_token: accessToken,
      user: { id: userId, email: userEmail },
      profile
    });
  } catch (e) {
    console.error("Erro em /api/auth/login:", e);
    return sendError(res, 500, "Erro ao fazer login", { detail: String(e?.message || e) });
  }
});

app.post("/api/auth/logout", async (_req, res) => {
  // Stateless: o front é quem limpa token/localStorage.
  return res.json({ ok: true });
});

// =========================
// Atendimento (Supabase) - endpoints dedicados (sem service role)
// =========================
function getBearerAuth(req) {
  const raw = String(req.headers.authorization || "").trim();
  return raw.toLowerCase().startsWith("bearer ") ? raw : null;
}

app.post("/api/atendimento/encaminhar", async (req, res) => {
  try {
    const authHeader = getBearerAuth(req);
    if (!authHeader) return sendError(res, 401, "Authorization Bearer token é obrigatório");

    const senha = normalizeSenha(req.body?.senha);
    const tipo = String(req.body?.tipo || "medico").trim(); // "medico" | "exame"
    const motivo = req.body?.motivo != null ? String(req.body.motivo).trim() : null;
    const salaDestino = req.body?.salaDestino != null ? String(req.body.salaDestino).trim() : null;
    const medicoDestinoId = req.body?.medicoDestinoId != null ? String(req.body.medicoDestinoId).trim() : null;

    if (!senha) return sendError(res, 400, "Campo 'senha' é obrigatório");

    const { url: supabaseUrl, apikey } = getSupabasePublicEnv();
    if (!supabaseUrl || !apikey) {
      return sendError(res, 500, "Supabase não configurado no backend (SUPABASE_URL + SUPABASE_ANON_KEY).");
    }

    let rpcName = "encaminhar_senha";
    let rpcBody = null;

    if (tipo !== "medico") {
      rpcName = "encaminhar_para_exame";
      if (!salaDestino) return sendError(res, 400, "Campo 'salaDestino' é obrigatório para exames");
      rpcBody = {
        p_senha: senha,
        p_sala_destino: salaDestino,
        p_motivo: motivo
      };
    } else {
      if (!medicoDestinoId) return sendError(res, 400, "Campo 'medicoDestinoId' é obrigatório");
      rpcBody = {
        p_senha: senha,
        p_medico_destino_id: medicoDestinoId,
        p_motivo: motivo,
        p_sala_destino: salaDestino
      };
    }

    const rpcRes = await fetch(`${supabaseUrl}/rest/v1/rpc/${rpcName}`, {
      method: "POST",
      headers: {
        apikey,
        Authorization: authHeader,
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify(rpcBody)
    });

    const txt = await rpcRes.text();
    if (!rpcRes.ok) {
      return sendError(res, rpcRes.status, "Falha ao encaminhar", { detail: txt.slice(0, 500) });
    }

    // RPC retorna um objeto (row) em JSON
    const data = txt ? JSON.parse(txt) : null;
    return res.json(data);
  } catch (e) {
    console.error("Erro em /api/atendimento/encaminhar:", e);
    return sendError(res, 500, "Erro ao encaminhar", { detail: String(e?.message || e) });
  }
});

app.post("/api/auth/me", async (req, res) => {
  try {
    const authHeader = getBearerAuth(req);
    if (!authHeader) return sendError(res, 401, "Authorization Bearer token é obrigatório");

    const { url: supabaseUrl, apikey } = getSupabasePublicEnv();
    if (!supabaseUrl || !apikey) {
      return sendError(res, 500, "Supabase não configurado no backend (SUPABASE_URL + SUPABASE_ANON_KEY).");
    }

    // Recupera usuário atual via Auth (para obter user.id)
    const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
      method: "GET",
      headers: { apikey, Authorization: authHeader, Accept: "application/json" }
    });
    const userTxt = await userRes.text();
    if (!userRes.ok) {
      return sendError(res, userRes.status, "Sessão inválida", { detail: userTxt.slice(0, 300) });
    }
    const userJson = JSON.parse(userTxt || "{}");
    const userId = String(userJson?.id || "").trim();
    if (!userId) return sendError(res, 401, "Sessão inválida (sem usuário)");

    const profRes = await fetch(
      `${supabaseUrl}/rest/v1/profiles?select=id,username,nome,role&id=eq.${encodeURIComponent(userId)}&limit=1`,
      { method: "GET", headers: { apikey, Authorization: authHeader, Accept: "application/json" } }
    );
    if (!profRes.ok) {
      const txt = await profRes.text().catch(() => "");
      return sendError(res, profRes.status, "Erro ao carregar perfil", { detail: txt.slice(0, 300) });
    }
    const arr = await profRes.json().catch(() => []);
    const profile = Array.isArray(arr) ? arr[0] : arr;
    if (!profile?.role) return sendError(res, 404, "Perfil não encontrado (tabela profiles)");

    return res.json({ user: { id: userId, email: userJson?.email || null }, profile });
  } catch (e) {
    console.error("Erro em /api/auth/me:", e);
    return sendError(res, 500, "Erro ao validar sessão", { detail: String(e?.message || e) });
  }
});

async function callSupabaseRpc({ supabaseUrl, apikey, authHeader, rpcName, rpcBody }) {
  const rpcRes = await fetch(`${supabaseUrl}/rest/v1/rpc/${rpcName}`, {
    method: "POST",
    headers: {
      apikey,
      Authorization: authHeader,
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: JSON.stringify(rpcBody || {})
  });
  const txt = await rpcRes.text();
  return { ok: rpcRes.ok, status: rpcRes.status, text: txt };
}

app.post("/api/atendimento/chamar", async (req, res) => {
  try {
    const authHeader = getBearerAuth(req);
    if (!authHeader) return sendError(res, 401, "Authorization Bearer token é obrigatório");
    const senha = normalizeSenha(req.body?.senha);
    if (!senha) return sendError(res, 400, "Campo 'senha' é obrigatório");

    const { url: supabaseUrl, apikey } = getSupabasePublicEnv();
    if (!supabaseUrl || !apikey) {
      return sendError(res, 500, "Supabase não configurado no backend (SUPABASE_URL + SUPABASE_ANON_KEY).");
    }

    const out = await callSupabaseRpc({
      supabaseUrl,
      apikey,
      authHeader,
      rpcName: "chamar_senha",
      rpcBody: { p_senha: senha }
    });
    if (!out.ok) return sendError(res, out.status, "Falha ao chamar senha", { detail: out.text.slice(0, 500) });
    return res.json(out.text ? JSON.parse(out.text) : null);
  } catch (e) {
    console.error("Erro em /api/atendimento/chamar:", e);
    return sendError(res, 500, "Erro ao chamar senha", { detail: String(e?.message || e) });
  }
});

app.post("/api/atendimento/finalizar", async (req, res) => {
  try {
    const authHeader = getBearerAuth(req);
    if (!authHeader) return sendError(res, 401, "Authorization Bearer token é obrigatório");
    const senha = normalizeSenha(req.body?.senha);
    if (!senha) return sendError(res, 400, "Campo 'senha' é obrigatório");

    const { url: supabaseUrl, apikey } = getSupabasePublicEnv();
    if (!supabaseUrl || !apikey) {
      return sendError(res, 500, "Supabase não configurado no backend (SUPABASE_URL + SUPABASE_ANON_KEY).");
    }

    const out = await callSupabaseRpc({
      supabaseUrl,
      apikey,
      authHeader,
      rpcName: "finalizar_senha",
      rpcBody: { p_senha: senha }
    });
    if (!out.ok) return sendError(res, out.status, "Falha ao finalizar senha", { detail: out.text.slice(0, 500) });
    return res.json(out.text ? JSON.parse(out.text) : null);
  } catch (e) {
    console.error("Erro em /api/atendimento/finalizar:", e);
    return sendError(res, 500, "Erro ao finalizar senha", { detail: String(e?.message || e) });
  }
});

app.post("/api/atendimento/aceitar", async (req, res) => {
  try {
    const authHeader = getBearerAuth(req);
    if (!authHeader) return sendError(res, 401, "Authorization Bearer token é obrigatório");
    const senha = normalizeSenha(req.body?.senha);
    if (!senha) return sendError(res, 400, "Campo 'senha' é obrigatório");

    const { url: supabaseUrl, apikey } = getSupabasePublicEnv();
    if (!supabaseUrl || !apikey) {
      return sendError(res, 500, "Supabase não configurado no backend (SUPABASE_URL + SUPABASE_ANON_KEY).");
    }

    const out = await callSupabaseRpc({
      supabaseUrl,
      apikey,
      authHeader,
      rpcName: "aceitar_encaminhamento",
      rpcBody: { p_senha: senha }
    });
    if (!out.ok) return sendError(res, out.status, "Falha ao aceitar encaminhamento", { detail: out.text.slice(0, 500) });
    return res.json(out.text ? JSON.parse(out.text) : null);
  } catch (e) {
    console.error("Erro em /api/atendimento/aceitar:", e);
    return sendError(res, 500, "Erro ao aceitar encaminhamento", { detail: String(e?.message || e) });
  }
});

app.post("/api/atendimento/triar", async (req, res) => {
  try {
    const authHeader = getBearerAuth(req);
    if (!authHeader) return sendError(res, 401, "Authorization Bearer token é obrigatório");

    const senha = normalizeSenha(req.body?.senha);
    const nome = req.body?.nome != null ? String(req.body.nome).trim() : "";
    const cpf = req.body?.cpf != null ? String(req.body.cpf).trim() : "";
    const soc_status = req.body?.soc_status != null ? String(req.body.soc_status).trim() : "nao_verificado";

    if (!senha) return sendError(res, 400, "Campo 'senha' é obrigatório");
    if (!nome) return sendError(res, 400, "Campo 'nome' é obrigatório");
    if (!cpf) return sendError(res, 400, "Campo 'cpf' é obrigatório");

    const { url: supabaseUrl, apikey } = getSupabasePublicEnv();
    if (!supabaseUrl || !apikey) {
      return sendError(res, 500, "Supabase não configurado no backend (SUPABASE_URL + SUPABASE_ANON_KEY).");
    }

    const out = await callSupabaseRpc({
      supabaseUrl,
      apikey,
      authHeader,
      rpcName: "triar_senha",
      rpcBody: { p_senha: senha, p_nome: nome, p_cpf: cpf, p_soc_status: soc_status }
    });
    if (!out.ok) return sendError(res, out.status, "Falha ao triar senha", { detail: out.text.slice(0, 500) });
    return res.json(out.text ? JSON.parse(out.text) : null);
  } catch (e) {
    console.error("Erro em /api/atendimento/triar:", e);
    return sendError(res, 500, "Erro ao triar senha", { detail: String(e?.message || e) });
  }
});

const db = openDb(DB_PATH);
initDb(db);

function nowIso() {
  return new Date().toISOString();
}

function normalizeSenha(s) {
  return String(s || "").trim();
}

function normalizeCpf(cpf) {
  const raw = String(cpf || "").trim();
  const digits = raw.replace(/\D/g, "");
  return digits || raw;
}

function parseEncaminhamento(row) {
  if (!row) return row;
  const copy = { ...row };
  if (copy.encaminhamento_json) {
    try {
      copy.encaminhamento = JSON.parse(copy.encaminhamento_json);
    } catch {
      copy.encaminhamento = null;
    }
  } else {
    copy.encaminhamento = null;
  }
  delete copy.encaminhamento_json;
  return copy;
}

function sendError(res, status, message, extra = {}) {
  // Mantém compatibilidade: alguns trechos do front leem `message`,
  // e partes mais antigas podem ler `error`.
  return res.status(status).json({ message, error: message, ...extra });
}

function isoDateInTimeZone(tz) {
  // Retorna YYYY-MM-DD para o fuso informado (evita "virar o dia" por UTC).
  // 'sv-SE' formata como ISO-like (YYYY-MM-DD).
  try {
    return new Intl.DateTimeFormat("sv-SE", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).format(new Date());
  } catch {
    // Fallback: data local do servidor
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }
}

function toBrDate(dateStr) {
  if (!dateStr) return null;
  const raw = String(dateStr).trim();
  // Aceita DD/MM/YYYY
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(raw)) return raw;
  // Aceita YYYY-MM-DD
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) {
    const [, yyyy, mm, dd] = m;
    return `${dd}/${mm}/${yyyy}`;
  }
  // Tenta parsear (último recurso)
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function extractFirstArray(value, maxDepth = 4) {
  // O frontend espera um array de "consultas". O SOC pode embrulhar isso em objetos.
  // Tentamos encontrar o primeiro array plausível em alguns campos comuns.
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object" || maxDepth <= 0) return null;

  const preferredKeys = [
    "dados",
    "data",
    "registros",
    "results",
    "resultado",
    "itens",
    "items",
    "lista",
    "list"
  ];

  for (const k of preferredKeys) {
    if (Object.prototype.hasOwnProperty.call(value, k)) {
      const found = extractFirstArray(value[k], maxDepth - 1);
      if (found) return found;
    }
  }

  for (const v of Object.values(value)) {
    const found = extractFirstArray(v, maxDepth - 1);
    if (found) return found;
  }
  return null;
}

// Healthcheck
app.get("/health", (_req, res) => res.json({ ok: true }));

// Consultar senhas do Supabase via REST API
app.get("/api/senhas/supabase", async (req, res) => {
  try {
    const supabaseUrl = String(process.env.SUPABASE_URL || "").trim();
    const supabaseAnonKey = String(process.env.SUPABASE_ANON_KEY || "").trim();

    if (!supabaseUrl || !supabaseAnonKey) {
      return sendError(res, 500, "Credenciais do Supabase não configuradas no .env");
    }

    // Colunas solicitadas: senha, cpf, status, soc_status
    // Permite override via query param "columns"
    const requestedColumns = req.query.columns 
      ? String(req.query.columns).split(",").map(c => c.trim()).filter(Boolean)
      : ["senha", "cpf", "status", "soc_status"];
    
    const columnsParam = requestedColumns.map((c) => `"${c}"`).join(",");

    // Construir URL com query params opcionais
    let url = `${supabaseUrl}/rest/v1/senhas?columns=${encodeURIComponent(columnsParam)}`;
    
    // Suporta filtros comuns do Supabase REST API
    if (req.query.select) {
      url += `&select=${encodeURIComponent(req.query.select)}`;
    }
    if (req.query.order) {
      url += `&order=${encodeURIComponent(req.query.order)}`;
    }
    if (req.query.limit) {
      url += `&limit=${encodeURIComponent(req.query.limit)}`;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      headers: {
        "apikey": supabaseAnonKey,
        "Authorization": `Bearer ${supabaseAnonKey}`,
        "Content-Type": "application/json",
        "Prefer": "return=representation"
      }
    }).finally(() => clearTimeout(timeoutId));

    if (!response.ok) {
      const errorText = await response.text();
      return sendError(res, response.status, "Erro ao consultar Supabase", {
        status: response.status,
        statusText: response.statusText,
        detail: errorText.slice(0, 500),
        url: url.replace(supabaseAnonKey, "***")
      });
    }

    const data = await response.json();
    return res.json({
      success: true,
      count: Array.isArray(data) ? data.length : 0,
      data: data
    });
  } catch (e) {
    const msg = e?.name === "AbortError" ? "Timeout ao consultar Supabase" : "Falha ao consultar Supabase";
    return sendError(res, 502, msg, { detail: String(e?.message || e) });
  }
});

// Usuários: login (para o fluxo do frontend)
app.post("/api/usuarios/login", async (req, res) => {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const senha = String(req.body?.password || req.body?.senha || "").trim();
    const role = String(req.body?.role || "").trim();

    if (!email || !senha) {
      return res.status(400).json({ message: "Email e senha são obrigatórios" });
    }

    // Compatibilidade:
    // - Fluxo antigo: front manda role e validamos email+senha+role
    // - Fluxo novo: front não manda role (login direto) e buscamos por email+senha
    const user = role
      ? await get(
          db,
          `SELECT id, email, role, nome FROM usuarios WHERE email = ? AND senha = ? AND role = ?`,
          [email, senha, role]
        )
      : await get(
          db,
          `SELECT id, email, role, nome FROM usuarios WHERE email = ? AND senha = ?`,
          [email, senha]
        );

    if (!user) return res.status(401).json({ message: "Credenciais inválidas" });
    return res.json(user);
  } catch {
    return res.status(500).json({ message: "Erro ao fazer login" });
  }
});

// Lista de usuários (opcional; sem senha)
app.get("/api/usuarios", async (_req, res) => {
  try {
    const users = await all(db, `SELECT id, email, role, nome FROM usuarios ORDER BY id DESC`);
    res.json(users);
  } catch {
    res.status(500).json({ message: "Erro ao listar usuários" });
  }
});

function normalizeUserKey(param) {
  const raw = String(param || "").trim();
  if (!raw) return null;
  const asInt = Number(raw);
  if (Number.isInteger(asInt) && asInt > 0) return { kind: "id", value: asInt };
  return { kind: "email", value: raw.toLowerCase() };
}

async function getUserByKey(key) {
  if (!key) return null;
  if (key.kind === "id") {
    return await get(
      db,
      `SELECT id, email, role, nome, firstName, lastName, phone, crm, specialty, bio
       FROM usuarios WHERE id = ?`,
      [key.value]
    );
  }
  return await get(
    db,
    `SELECT id, email, role, nome, firstName, lastName, phone, crm, specialty, bio
     FROM usuarios WHERE lower(email) = ?`,
    [key.value]
  );
}

// Perfil do usuário (o dashboard tenta buscar/atualizar)
app.get("/api/usuarios/:id", async (req, res) => {
  try {
    const key = normalizeUserKey(req.params.id);
    if (!key) return res.status(400).json({ message: "Identificador de usuário inválido" });

    const user = await getUserByKey(key);
    if (!user) return res.status(404).json({ message: "Usuário não encontrado" });

    return res.json(user);
  } catch {
    return res.status(500).json({ message: "Erro ao carregar usuário" });
  }
});

app.patch("/api/usuarios/:id", async (req, res) => {
  try {
    const key = normalizeUserKey(req.params.id);
    if (!key) return res.status(400).json({ message: "Identificador de usuário inválido" });

    const existing = await getUserByKey(key);
    if (!existing) return res.status(404).json({ message: "Usuário não encontrado" });

    const allowed = {
      firstName: req.body?.firstName != null ? String(req.body.firstName).trim() : undefined,
      lastName: req.body?.lastName != null ? String(req.body.lastName).trim() : undefined,
      email: req.body?.email != null ? String(req.body.email).trim().toLowerCase() : undefined,
      phone: req.body?.phone != null ? String(req.body.phone).trim() : undefined,
      crm: req.body?.crm != null ? String(req.body.crm).trim() : undefined,
      specialty: req.body?.specialty != null ? String(req.body.specialty).trim() : undefined,
      bio: req.body?.bio != null ? String(req.body.bio).trim() : undefined
    };

    // Monta UPDATE dinâmico
    const updates = [];
    const params = [];

    for (const [k, v] of Object.entries(allowed)) {
      if (v === undefined) continue;
      updates.push(`${k} = ?`);
      params.push(v);
    }

    // Atualiza "nome" automaticamente se veio first/last (melhor para exibição)
    const hasFirst = allowed.firstName !== undefined;
    const hasLast = allowed.lastName !== undefined;
    if (hasFirst || hasLast) {
      const first = hasFirst ? allowed.firstName : existing.firstName || "";
      const last = hasLast ? allowed.lastName : existing.lastName || "";
      const nome = `${String(first || "").trim()} ${String(last || "").trim()}`.trim() || existing.nome;
      updates.push("nome = ?");
      params.push(nome);
    }

    if (!updates.length) {
      return res.json(existing);
    }

    const whereSql = key.kind === "id" ? "id = ?" : "lower(email) = ?";
    await run(db, `UPDATE usuarios SET ${updates.join(", ")} WHERE ${whereSql}`, [...params, key.value]);

    const updated = await getUserByKey(key);
    return res.json(updated);
  } catch (e) {
    // Se bater UNIQUE (email duplicado), retorna erro amigável
    const msg = String(e?.message || "");
    if (msg.includes("UNIQUE") && msg.includes("email")) {
      return res.status(409).json({ message: "Este e-mail já está em uso" });
    }
    return res.status(500).json({ message: "Erro ao atualizar perfil" });
  }
});

// Troca de senha (o dashboard tenta usar)
app.patch("/api/usuarios/:id/senha", async (req, res) => {
  try {
    const key = normalizeUserKey(req.params.id);
    if (!key) return res.status(400).json({ message: "Identificador de usuário inválido" });

    const currentPassword = String(req.body?.currentPassword || "").trim();
    const newPassword = String(req.body?.newPassword || "").trim();
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: "Senha atual e nova senha são obrigatórias" });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ message: "Nova senha deve ter pelo menos 6 caracteres" });
    }
    if (newPassword === currentPassword) {
      return res.status(400).json({ message: "Nova senha deve ser diferente da atual" });
    }

    const whereSql = key.kind === "id" ? "id = ?" : "lower(email) = ?";
    const user = await get(db, `SELECT id, email, senha FROM usuarios WHERE ${whereSql}`, [key.value]);
    if (!user) return res.status(404).json({ message: "Usuário não encontrado" });

    if (String(user.senha) !== currentPassword) {
      return res.status(401).json({ message: "Senha atual incorreta" });
    }

    await run(db, `UPDATE usuarios SET senha = ? WHERE id = ?`, [newPassword, user.id]);
    return res.json({ ok: true });
  } catch {
    return res.status(500).json({ message: "Erro ao alterar senha" });
  }
});

// SOC: proxy para o endpoint exportadados (somente do dia).
// Configuração via env para não versionar credenciais:
// - SOC_EMPRESA, SOC_CODIGO, SOC_CHAVE, SOC_CODIGO_USUARIO_AGENDA
// - (opcional) SOC_EXPORT_URL (default https://ws1.soc.com.br/WebSoc/exportadados)
// - (opcional) SOC_TIMEZONE (default America/Sao_Paulo)
app.get("/api/soc", async (req, res) => {
  const SOC_EXPORT_URL = process.env.SOC_EXPORT_URL || "https://ws1.soc.com.br/WebSoc/exportadados";
  const SOC_TIMEZONE = process.env.SOC_TIMEZONE || "America/Sao_Paulo";

  // Defaults (os mesmos da URL fornecida). Em produção, prefira sobrescrever via env.
  const empresa = process.env.SOC_EMPRESA || "1566278";
  const codigo = process.env.SOC_CODIGO || "206605";
  const chave = process.env.SOC_CHAVE || "4b5a356e0526d14128f6";
  const codigoUsuarioAgenda = process.env.SOC_CODIGO_USUARIO_AGENDA || "2576657";

  // O front manda ?data=YYYY-MM-DD. Se não vier, usa "hoje" no fuso configurado.
  const isoDate = req.query?.data ? String(req.query.data).trim() : isoDateInTimeZone(SOC_TIMEZONE);
  const brDate = toBrDate(isoDate);
  if (!brDate) {
    return sendError(res, 400, "Parâmetro 'data' inválido. Use YYYY-MM-DD ou DD/MM/YYYY.", { data: isoDate });
  }

  const parametro = {
    empresa: String(empresa),
    codigo: String(codigo),
    chave: String(chave),
    tipoSaida: "json",
    codigoUsuarioAgenda: String(codigoUsuarioAgenda),
    dataInicial: brDate,
    dataFinal: brDate
  };

  const url = `${SOC_EXPORT_URL}?parametro=${encodeURIComponent(JSON.stringify(parametro))}`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000);

    const response = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      headers: {
        // Ajuda alguns proxies/WAF a não bloquearem por user-agent vazio.
        "user-agent": "safe-atendimento/1.0"
      }
    }).finally(() => clearTimeout(timeoutId));

    const contentType = response.headers.get("content-type") || "";
    const bodyText = await response.text();

    if (!response.ok) {
      // Se o SOC não estiver disponível, retorna array vazio para permitir cadastro
      // Log do erro para debug, mas não bloqueia o fluxo
      console.warn(`[SOC] Erro ao consultar SOC (${response.status}):`, bodyText.slice(0, 200));
      return res.json([]);
    }

    // Tenta JSON; se falhar, devolve array vazio (permite cadastro mesmo com erro de parse)
    try {
      const json = JSON.parse(bodyText);
      // Se vier um objeto "embrulhado", tenta normalizar para array (compat com o frontend).
      const arr = extractFirstArray(json);
      return res.json(arr || []);
    } catch (parseError) {
      // Se não conseguir fazer parse, retorna array vazio para não bloquear cadastro
      console.warn("[SOC] Erro ao fazer parse da resposta:", parseError);
      return res.json([]);
    }
  } catch (e) {
    // Se houver qualquer erro (timeout, rede, etc), retorna array vazio
    // Isso permite que o sistema continue funcionando mesmo sem SOC
    const msg = e?.name === "AbortError" ? "Timeout ao consultar SOC" : "Falha ao consultar SOC";
    console.warn(`[SOC] ${msg}:`, String(e?.message || e));
    return res.json([]);
  }
});

// Painel (TV): endpoints server-side para evitar CORS no browser.
// Não requer login: o backend usa service role para montar o feed.
function getSupabaseServiceEnv() {
  const supabaseUrl = String(process.env.SUPABASE_URL || "").trim().replace(/\/+$/, "");
  const serviceKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  return { url: supabaseUrl, serviceKey };
}

async function supabaseServiceFetch(pathAndQuery) {
  const { url, serviceKey } = getSupabaseServiceEnv();
  if (!url || !serviceKey) {
    throw new Error("Supabase não configurado (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY)");
  }
  const resp = await fetch(`${url}${pathAndQuery}`, {
    method: "GET",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      Accept: "application/json",
    },
  });
  const text = await resp.text();
  if (!resp.ok) {
    const err = new Error(`Supabase error ${resp.status}`);
    err.status = resp.status;
    err.body = text;
    throw err;
  }
  return JSON.parse(text || "[]");
}

app.get("/api/painel/pendentes", async (_req, res) => {
  try {
    const data = await supabaseServiceFetch(
      "/rest/v1/senhas?select=senha,nome,cpf,status,created_at,updated_at,encaminhamento,medico_atendendo_id&status=eq.pendente&medico_atendendo_id=is.null&order=updated_at.desc&limit=50"
    );
    return res.json(Array.isArray(data) ? data : []);
  } catch (e) {
    console.error("Erro /api/painel/pendentes:", e);
    return sendError(res, 500, "Erro ao carregar painel (pendentes)", {
      detail: String(e?.message || e),
    });
  }
});

app.get("/api/painel/em_atendimento", async (_req, res) => {
  try {
    const data = await supabaseServiceFetch(
      "/rest/v1/senhas?select=senha,nome,cpf,status,created_at,updated_at,called_at,medico_atendendo_id,profiles!medico_atendendo_id(nome,specialty)&status=eq.em_atendimento&medico_atendendo_id=not.is.null&order=called_at.desc&limit=10"
    );
    return res.json(Array.isArray(data) ? data : []);
  } catch (e) {
    console.error("Erro /api/painel/em_atendimento:", e);
    return sendError(res, 500, "Erro ao carregar painel (em atendimento)", {
      detail: String(e?.message || e),
    });
  }
});

// Listar todas as senhas
app.get("/api/senhas", async (_req, res) => {
  try {
    const rows = await all(
      db,
      `SELECT senha, nome, cpf, status, data, encaminhamento_json, medicoAtendendo, medicoAtendendoEmail
       FROM senhas
       ORDER BY datetime(data) DESC`
    );
    res.json(rows.map(parseEncaminhamento));
  } catch (e) {
    sendError(res, 500, "Erro ao listar senhas");
  }
});

// Senhas recentes (últimas 10)
app.get("/api/senhas/recentes", async (_req, res) => {
  try {
    const rows = await all(
      db,
      `SELECT senha, nome, cpf, status, data, encaminhamento_json, medicoAtendendo, medicoAtendendoEmail
       FROM senhas
       ORDER BY datetime(data) DESC
       LIMIT 10`
    );
    res.json(rows.map(parseEncaminhamento));
  } catch {
    sendError(res, 500, "Erro ao listar senhas recentes");
  }
});

// Histórico (por enquanto: todas do dia; se quiser, filtre por data local)
app.get("/api/senhas/historico", async (_req, res) => {
  try {
    const rows = await all(
      db,
      `SELECT senha, nome, cpf, status, data, encaminhamento_json, medicoAtendendo, medicoAtendendoEmail
       FROM senhas
       ORDER BY datetime(data) DESC`
    );
    res.json(rows.map(parseEncaminhamento));
  } catch {
    sendError(res, 500, "Erro ao carregar histórico");
  }
});

// Criar senha
app.post("/api/senhas", async (req, res) => {
  try {
    const senha = normalizeSenha(req.body?.senha);
    const nome = req.body?.nome ? String(req.body.nome).trim() : null;
    const cpf = req.body?.cpf ? normalizeCpf(req.body.cpf) : null;

    if (!senha) return sendError(res, 400, "Campo 'senha' é obrigatório");
    if (senha.length > 50) return sendError(res, 400, "Campo 'senha' é muito longo");

    // Status pode vir explícito (ex.: totem força cadastro).
    // Caso não venha, inferimos: se tem nome -> pendente; senão -> cadastro.
    const requestedStatus = req.body?.status ? String(req.body.status).trim() : null;
    const status = requestedStatus || (nome ? "pendente" : "cadastro");
    const allowedStatus = new Set(["cadastro", "pendente"]);
    if (!allowedStatus.has(status)) {
      return sendError(res, 400, "Status inválido", { allowed: Array.from(allowedStatus) });
    }

    // OBRIGATÓRIO: Salvar apenas no Supabase (sem fallback para SQLite)
    const supabaseUrl = String(process.env.SUPABASE_URL || "").trim();
    const supabaseServiceKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || "").trim();
    const socStatus = req.body?.soc_status || "nao_verificado";
    
    if (!supabaseUrl || !supabaseServiceKey) {
      return sendError(res, 500, "Supabase não configurado. Configure SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env");
    }

    try {
      const supabasePayload = {
        senha: senha,
        status: status,
        soc_status: socStatus
      };
      
      // Se o status for cadastro, não gravamos nome aqui:
      // - mantém o fluxo correto (atendente faz triagem e libera)
      // - compatível com policy de insert anônimo no Supabase (nome precisa ser null/vazio)
      if (nome && status !== "cadastro") supabasePayload.nome = nome;
      if (cpf) supabasePayload.cpf = cpf;

      const supabaseResponse = await fetch(`${supabaseUrl}/rest/v1/senhas`, {
        method: "POST",
        headers: {
          "apikey": supabaseServiceKey,
          "Authorization": `Bearer ${supabaseServiceKey}`,
          "Content-Type": "application/json",
          "Prefer": "return=representation"
        },
        body: JSON.stringify(supabasePayload)
      });

      if (!supabaseResponse.ok) {
        const errorText = await supabaseResponse.text();
        console.error("Erro ao inserir no Supabase:", {
          status: supabaseResponse.status,
          statusText: supabaseResponse.statusText,
          body: errorText.slice(0, 500)
        });
        return sendError(res, supabaseResponse.status, "Erro ao salvar senha no Supabase", {
          detail: errorText.slice(0, 500)
        });
      }

      const supabaseData = await supabaseResponse.json();
      // Retorna no formato esperado pelo frontend
      return res.status(201).json({
        senha: supabaseData[0]?.senha || senha,
        nome: supabaseData[0]?.nome || nome,
        cpf: supabaseData[0]?.cpf || cpf,
        status: supabaseData[0]?.status || status,
        soc_status: supabaseData[0]?.soc_status || "nao_verificado",
        data: supabaseData[0]?.created_at || nowIso()
      });
    } catch (supabaseError) {
      console.error("Erro ao inserir no Supabase:", supabaseError);
      return sendError(res, 500, "Erro ao salvar senha no Supabase", {
        detail: String(supabaseError?.message || supabaseError)
      });
    }
  } catch (e) {
    sendError(res, 500, "Erro ao criar senha");
  }
});

// Atualizar senha por id (senha)
app.patch("/api/senhas/:senha", async (req, res) => {
  try {
    const senha = normalizeSenha(req.params.senha);
    if (!senha) return sendError(res, 400, "Senha inválida");

    // OBRIGATÓRIO: Usar apenas Supabase
    const supabaseUrl = String(process.env.SUPABASE_URL || "").trim();
    const supabaseServiceKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || "").trim();
    
    if (!supabaseUrl || !supabaseServiceKey) {
      return sendError(res, 500, "Supabase não configurado. Configure SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env");
    }

    // Buscar senha existente no Supabase
    const getResponse = await fetch(`${supabaseUrl}/rest/v1/senhas?senha=eq.${encodeURIComponent(senha)}&select=*`, {
      method: "GET",
      headers: {
        "apikey": supabaseServiceKey,
        "Authorization": `Bearer ${supabaseServiceKey}`,
        "Content-Type": "application/json"
      }
    });

    if (!getResponse.ok) {
      return sendError(res, getResponse.status, "Erro ao buscar senha no Supabase");
    }

    const existingData = await getResponse.json();
    if (!Array.isArray(existingData) || existingData.length === 0) {
      return sendError(res, 404, "Senha não encontrada");
    }

    const existing = existingData[0];

    const nome = req.body?.nome != null ? String(req.body.nome).trim() : undefined;
    const cpf = req.body?.cpf != null ? normalizeCpf(req.body.cpf) : undefined;
    const status = req.body?.status != null ? String(req.body.status).trim() : undefined;
    // encaminhamento pode vir como objeto
    const encaminhamento =
      req.body?.encaminhamento != null && typeof req.body.encaminhamento === "object"
        ? req.body.encaminhamento
        : undefined;
    
    const medicoAtendendoId = req.body?.medico_atendendo_id || req.body?.medicoAtendendoId || undefined;

    const allowedStatus = new Set(["cadastro", "pendente", "em_atendimento", "atendida"]);
    if (status !== undefined && !allowedStatus.has(status)) {
      return sendError(res, 400, "Status inválido", { allowed: Array.from(allowedStatus) });
    }

    // Preparar payload para atualização no Supabase
    const updatePayload = {};
    
    if (nome !== undefined) updatePayload.nome = nome;
    if (cpf !== undefined) updatePayload.cpf = cpf;
    if (medicoAtendendoId !== undefined) updatePayload.medico_atendendo_id = medicoAtendendoId;
    if (encaminhamento !== undefined) updatePayload.encaminhamento = encaminhamento;
    
    // Determinar status final
    let finalStatus = existing.status;
    if (status !== undefined) {
      finalStatus = status;
    } else if (nome !== undefined && (existing.status === "cadastro" || !existing.status)) {
      finalStatus = "pendente";
    } else if (
      status === undefined &&
      medicoAtendendoId !== undefined &&
      medicoAtendendoId != null &&
      existing.status !== "atendida"
    ) {
      finalStatus = "em_atendimento";
    }
    updatePayload.status = finalStatus;
    
    // Atualizar updated_at (sempre)
    updatePayload.updated_at = nowIso();
    
    // Se médico chamou, atualizar called_at
    if (medicoAtendendoId !== undefined && medicoAtendendoId != null && !existing.called_at) {
      updatePayload.called_at = nowIso();
    }

    // Atualizar no Supabase
    const updateResponse = await fetch(`${supabaseUrl}/rest/v1/senhas?senha=eq.${encodeURIComponent(senha)}`, {
      method: "PATCH",
      headers: {
        "apikey": supabaseServiceKey,
        "Authorization": `Bearer ${supabaseServiceKey}`,
        "Content-Type": "application/json",
        "Prefer": "return=representation"
      },
      body: JSON.stringify(updatePayload)
    });

    if (!updateResponse.ok) {
      const errorText = await updateResponse.text();
      console.error("Erro ao atualizar no Supabase:", {
        status: updateResponse.status,
        statusText: updateResponse.statusText,
        body: errorText.slice(0, 500)
      });
      return sendError(res, updateResponse.status, "Erro ao atualizar senha no Supabase", {
        detail: errorText.slice(0, 500)
      });
    }

    const updatedData = await updateResponse.json();
    const updated = Array.isArray(updatedData) ? updatedData[0] : updatedData;
    
    // Retornar no formato esperado pelo frontend
    return res.json({
      senha: updated.senha || senha,
      nome: updated.nome || null,
      cpf: updated.cpf || null,
      status: updated.status || finalStatus,
      data: updated.updated_at || updated.created_at || nowIso(),
      encaminhamento: updated.encaminhamento || null,
      medicoAtendendo: updated.medico_atendendo_id ? "Médico" : null,
      medicoAtendendoEmail: null
    });
  } catch (e) {
    console.error("Erro ao atualizar senha:", e);
    return sendError(res, 500, "Erro ao atualizar senha", {
      detail: String(e?.message || e)
    });
  }
});

// "Usuários" (o frontend usa como um POST simples)
app.post("/api/usuarios", async (req, res) => {
  try {
    const senha = normalizeSenha(req.body?.senha);
    const nome = req.body?.nome ? String(req.body.nome).trim() : null;
    const cpf = req.body?.cpf ? normalizeCpf(req.body.cpf) : null;
    if (!senha) return sendError(res, 400, "Campo 'senha' é obrigatório");

    // OBRIGATÓRIO: Salvar apenas no Supabase
    const supabaseUrl = String(process.env.SUPABASE_URL || "").trim();
    const supabaseServiceKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || "").trim();
    
    if (!supabaseUrl || !supabaseServiceKey) {
      return sendError(res, 500, "Supabase não configurado. Configure SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env");
    }

    try {
      // Verificar se a senha já existe
      const getResponse = await fetch(`${supabaseUrl}/rest/v1/senhas?senha=eq.${encodeURIComponent(senha)}&select=senha`, {
        method: "GET",
        headers: {
          "apikey": supabaseServiceKey,
          "Authorization": `Bearer ${supabaseServiceKey}`,
          "Content-Type": "application/json"
        }
      });

      const existingData = await getResponse.json();
      const exists = Array.isArray(existingData) && existingData.length > 0;

      let supabaseData;
      if (exists) {
        // Atualizar senha existente
        const updatePayload = {
          status: "pendente",
          updated_at: nowIso()
        };
        if (nome) updatePayload.nome = nome;
        if (cpf) updatePayload.cpf = cpf;

        const updateResponse = await fetch(`${supabaseUrl}/rest/v1/senhas?senha=eq.${encodeURIComponent(senha)}`, {
          method: "PATCH",
          headers: {
            "apikey": supabaseServiceKey,
            "Authorization": `Bearer ${supabaseServiceKey}`,
            "Content-Type": "application/json",
            "Prefer": "return=representation"
          },
          body: JSON.stringify(updatePayload)
        });

        if (!updateResponse.ok) {
          const errorText = await updateResponse.text();
          return sendError(res, updateResponse.status, "Erro ao atualizar senha no Supabase", {
            detail: errorText.slice(0, 500)
          });
        }

        supabaseData = await updateResponse.json();
      } else {
        // Criar nova senha
        const supabasePayload = {
          senha: senha,
          status: "pendente",
          soc_status: "nao_verificado"
        };
        
        if (nome) supabasePayload.nome = nome;
        if (cpf) supabasePayload.cpf = cpf;

        const createResponse = await fetch(`${supabaseUrl}/rest/v1/senhas`, {
          method: "POST",
          headers: {
            "apikey": supabaseServiceKey,
            "Authorization": `Bearer ${supabaseServiceKey}`,
            "Content-Type": "application/json",
            "Prefer": "return=representation"
          },
          body: JSON.stringify(supabasePayload)
        });

        if (!createResponse.ok) {
          const errorText = await createResponse.text();
          return sendError(res, createResponse.status, "Erro ao criar senha no Supabase", {
            detail: errorText.slice(0, 500)
          });
        }

        supabaseData = await createResponse.json();
      }

      const result = Array.isArray(supabaseData) ? supabaseData[0] : supabaseData;
      return res.status(201).json({
        senha: result.senha || senha,
        nome: result.nome || nome,
        cpf: result.cpf || cpf,
        status: result.status || "pendente",
        data: result.updated_at || result.created_at || nowIso(),
        encaminhamento: result.encaminhamento || null,
        medicoAtendendo: null,
        medicoAtendendoEmail: null
      });
    } catch (supabaseError) {
      console.error("Erro ao salvar no Supabase:", supabaseError);
      return sendError(res, 500, "Erro ao cadastrar usuário no Supabase", {
        detail: String(supabaseError?.message || supabaseError)
      });
    }
  } catch (e) {
    console.error("Erro ao cadastrar usuário:", e);
    return sendError(res, 500, "Erro ao cadastrar usuário", {
      detail: String(e?.message || e)
    });
  }
});

// Exames: listar por senha
app.get("/api/exames/:senha", async (req, res) => {
  try {
    const senha = normalizeSenha(req.params.senha);
    const rows = await all(
      db,
      `SELECT senha, medico, especialidade, tipoExame, resultado, observacoes, data
       FROM exames
       WHERE senha = ?
       ORDER BY datetime(data) DESC`,
      [senha]
    );
    res.json(rows);
  } catch {
    sendError(res, 500, "Erro ao listar exames");
  }
});

// Exames: registrar
app.post("/api/exames", async (req, res) => {
  try {
    const senha = normalizeSenha(req.body?.senha);
    const medico = req.body?.medico ? String(req.body.medico).trim() : null;
    const especialidade = req.body?.especialidade ? String(req.body.especialidade).trim() : null;
    const tipoExame = req.body?.tipoExame ? String(req.body.tipoExame).trim() : "";
    const resultado = req.body?.resultado != null ? String(req.body.resultado).trim() : null;
    const observacoes = req.body?.observacoes != null ? String(req.body.observacoes).trim() : null;

    if (!senha) return sendError(res, 400, "Campo 'senha' é obrigatório");
    if (!tipoExame) return sendError(res, 400, "Campo 'tipoExame' é obrigatório");

    await run(
      db,
      `INSERT INTO exames (senha, medico, especialidade, tipoExame, resultado, observacoes, data)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [senha, medico, especialidade, tipoExame, resultado, observacoes, nowIso()]
    );

    res.status(201).json({ ok: true });
  } catch {
    sendError(res, 500, "Erro ao registrar exame");
  }
});

// Encaminhamento: registra info na senha (salva json e mantém status pendente)
app.post("/api/encaminhamento", async (req, res) => {
  try {
    const senha = normalizeSenha(req.body?.senha);
    const medicoOrigem = req.body?.medicoOrigem ? String(req.body.medicoOrigem).trim() : null;
    const medicoDestino = req.body?.medicoDestino ? String(req.body.medicoDestino).trim() : null;
    const motivo = req.body?.motivo ? String(req.body.motivo).trim() : null;

    if (!senha) return sendError(res, 400, "Campo 'senha' é obrigatório");
    if (!medicoDestino) return sendError(res, 400, "Campo 'medicoDestino' é obrigatório");

    // OBRIGATÓRIO: Usar apenas Supabase
    const supabaseUrl = String(process.env.SUPABASE_URL || "").trim();
    const supabaseServiceKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || "").trim();
    
    if (!supabaseUrl || !supabaseServiceKey) {
      return sendError(res, 500, "Supabase não configurado. Configure SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env");
    }

    // Verificar se a senha existe
    const getResponse = await fetch(`${supabaseUrl}/rest/v1/senhas?senha=eq.${encodeURIComponent(senha)}&select=senha`, {
      method: "GET",
      headers: {
        "apikey": supabaseServiceKey,
        "Authorization": `Bearer ${supabaseServiceKey}`,
        "Content-Type": "application/json"
      }
    });

    if (!getResponse.ok) {
      return sendError(res, getResponse.status, "Erro ao buscar senha no Supabase");
    }

    const existingData = await getResponse.json();
    if (!Array.isArray(existingData) || existingData.length === 0) {
      return sendError(res, 404, "Senha não encontrada");
    }

    const payload = {
      medicoOrigem,
      medicoDestino,
      motivo,
      data: nowIso()
    };

    // Atualizar no Supabase
    const updatePayload = {
      encaminhamento: payload,
      status: "pendente",
      medico_atendendo_id: null,
      updated_at: nowIso()
    };

    const updateResponse = await fetch(`${supabaseUrl}/rest/v1/senhas?senha=eq.${encodeURIComponent(senha)}`, {
      method: "PATCH",
      headers: {
        "apikey": supabaseServiceKey,
        "Authorization": `Bearer ${supabaseServiceKey}`,
        "Content-Type": "application/json",
        "Prefer": "return=representation"
      },
      body: JSON.stringify(updatePayload)
    });

    if (!updateResponse.ok) {
      const errorText = await updateResponse.text();
      console.error("Erro ao atualizar encaminhamento no Supabase:", {
        status: updateResponse.status,
        statusText: updateResponse.statusText,
        body: errorText.slice(0, 500)
      });
      return sendError(res, updateResponse.status, "Erro ao encaminhar paciente no Supabase", {
        detail: errorText.slice(0, 500)
      });
    }

    const updatedData = await updateResponse.json();
    const updated = Array.isArray(updatedData) ? updatedData[0] : updatedData;
    
    return res.status(201).json({
      senha: updated.senha || senha,
      nome: updated.nome || null,
      cpf: updated.cpf || null,
      status: updated.status || "pendente",
      data: updated.updated_at || updated.created_at || nowIso(),
      encaminhamento: updated.encaminhamento || payload,
      medicoAtendendo: null,
      medicoAtendendoEmail: null
    });
  } catch (e) {
    console.error("Erro ao encaminhar paciente:", e);
    return sendError(res, 500, "Erro ao encaminhar paciente", {
      detail: String(e?.message || e)
    });
  }
});

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Safe Atendimento Backend rodando na porta ${PORT}`);
  // eslint-disable-next-line no-console
  console.log(`DB: SQLite (${DB_PATH})`);
});

