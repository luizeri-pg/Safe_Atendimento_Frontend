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
  app.use("/assets", express.static(path.join(STATIC_ROOT, "assets")));
  app.use("/js", express.static(path.join(STATIC_ROOT, "js")));
  app.use("/pages", express.static(path.join(STATIC_ROOT, "pages")));
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

// Healthcheck
app.get("/health", (_req, res) => res.json({ ok: true }));

// Usuários: login (para o fluxo do frontend)
app.post("/api/usuarios/login", async (req, res) => {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const senha = String(req.body?.password || req.body?.senha || "").trim();
    const role = String(req.body?.role || "").trim();

    if (!email || !senha || !role) {
      return res.status(400).json({ message: "Email, senha e role são obrigatórios" });
    }

    const user = await get(
      db,
      `SELECT id, email, role, nome FROM usuarios WHERE email = ? AND senha = ? AND role = ?`,
      [email, senha, role]
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

// SOC: este projeto não possui integração real; retornamos vazio por padrão.
// Se você tiver a integração, dá pra plugar aqui.
app.get("/api/soc", (_req, res) => res.json([]));

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

    // Se não vier nome/cpf, mantém status cadastro; se vier, pendente (fila)
    const status = nome ? "pendente" : "cadastro";

    await run(
      db,
      `INSERT OR IGNORE INTO senhas (senha, nome, cpf, status, data, encaminhamento_json)
       VALUES (?, ?, ?, ?, ?, NULL)`,
      [senha, nome, cpf, status, nowIso()]
    );

    // Retorna o registro atual
    const row = await get(
      db,
      `SELECT senha, nome, cpf, status, data, encaminhamento_json, medicoAtendendo, medicoAtendendoEmail
       FROM senhas WHERE senha = ?`,
      [senha]
    );

    res.status(201).json(parseEncaminhamento(row));
  } catch (e) {
    sendError(res, 500, "Erro ao criar senha");
  }
});

// Atualizar senha por id (senha)
app.patch("/api/senhas/:senha", async (req, res) => {
  try {
    const senha = normalizeSenha(req.params.senha);
    if (!senha) return sendError(res, 400, "Senha inválida");

    const existing = await get(db, `SELECT * FROM senhas WHERE senha = ?`, [senha]);
    if (!existing) return sendError(res, 404, "Senha não encontrada");

    const nome = req.body?.nome != null ? String(req.body.nome).trim() : undefined;
    const cpf = req.body?.cpf != null ? normalizeCpf(req.body.cpf) : undefined;
    const status = req.body?.status != null ? String(req.body.status).trim() : undefined;
    const medicoAtendendo =
      req.body?.medicoAtendendo != null ? String(req.body.medicoAtendendo).trim() : undefined;
    const medicoAtendendoEmail =
      req.body?.medicoAtendendoEmail != null
        ? String(req.body.medicoAtendendoEmail).trim()
        : undefined;

    // encaminhamento pode vir como objeto
    const encaminhamento =
      req.body?.encaminhamento != null && typeof req.body.encaminhamento === "object"
        ? req.body.encaminhamento
        : undefined;

    const updates = [];
    const params = [];

    const allowedStatus = new Set(["cadastro", "pendente", "atendida"]);
    if (status !== undefined && !allowedStatus.has(status)) {
      return sendError(res, 400, "Status inválido", { allowed: Array.from(allowedStatus) });
    }

    if (nome !== undefined) {
      updates.push("nome = ?");
      params.push(nome);
      // se preencheu nome e estava em cadastro, promove a pendente
      if ((existing.status === "cadastro" || !existing.status) && status === undefined) {
        updates.push("status = ?");
        params.push("pendente");
      }
    }
    if (cpf !== undefined) {
      updates.push("cpf = ?");
      params.push(cpf);
      if ((existing.status === "cadastro" || !existing.status) && status === undefined) {
        updates.push("status = ?");
        params.push("pendente");
      }
    }
    if (status !== undefined) {
      updates.push("status = ?");
      params.push(status);
    }
    if (medicoAtendendo !== undefined) {
      updates.push("medicoAtendendo = ?");
      params.push(medicoAtendendo);
    }
    if (medicoAtendendoEmail !== undefined) {
      updates.push("medicoAtendendoEmail = ?");
      params.push(medicoAtendendoEmail);
    }
    if (encaminhamento !== undefined) {
      updates.push("encaminhamento_json = ?");
      params.push(JSON.stringify(encaminhamento));
    }

    // sempre atualiza data (para ordenação do painel)
    updates.push("data = ?");
    params.push(nowIso());

    await run(db, `UPDATE senhas SET ${updates.join(", ")} WHERE senha = ?`, [...params, senha]);

    const row = await get(
      db,
      `SELECT senha, nome, cpf, status, data, encaminhamento_json, medicoAtendendo, medicoAtendendoEmail
       FROM senhas WHERE senha = ?`,
      [senha]
    );
    res.json(parseEncaminhamento(row));
  } catch (e) {
    sendError(res, 500, "Erro ao atualizar senha");
  }
});

// "Usuários" (o frontend usa como um POST simples)
app.post("/api/usuarios", async (req, res) => {
  try {
    const senha = normalizeSenha(req.body?.senha);
    const nome = req.body?.nome ? String(req.body.nome).trim() : null;
    const cpf = req.body?.cpf ? normalizeCpf(req.body.cpf) : null;
    if (!senha) return sendError(res, 400, "Campo 'senha' é obrigatório");

    // Garante que a senha exista e já fica pendente
    await run(
      db,
      `INSERT OR IGNORE INTO senhas (senha, nome, cpf, status, data, encaminhamento_json)
       VALUES (?, ?, ?, 'pendente', ?, NULL)`,
      [senha, nome, cpf, nowIso()]
    );
    await run(
      db,
      `UPDATE senhas SET nome = COALESCE(?, nome), cpf = COALESCE(?, cpf), status = 'pendente', data = ?
       WHERE senha = ?`,
      [nome, cpf, nowIso(), senha]
    );

    const row = await get(
      db,
      `SELECT senha, nome, cpf, status, data, encaminhamento_json, medicoAtendendo, medicoAtendendoEmail
       FROM senhas WHERE senha = ?`,
      [senha]
    );
    res.status(201).json(parseEncaminhamento(row));
  } catch {
    sendError(res, 500, "Erro ao cadastrar usuário");
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

    const existing = await get(db, `SELECT senha FROM senhas WHERE senha = ?`, [senha]);
    if (!existing) return sendError(res, 404, "Senha não encontrada");

    const payload = {
      medicoOrigem,
      medicoDestino,
      motivo,
      data: nowIso()
    };

    await run(
      db,
      `UPDATE senhas
       SET encaminhamento_json = ?, status = 'pendente', data = ?
       WHERE senha = ?`,
      [JSON.stringify(payload), nowIso(), senha]
    );

    const row = await get(
      db,
      `SELECT senha, nome, cpf, status, data, encaminhamento_json, medicoAtendendo, medicoAtendendoEmail
       FROM senhas WHERE senha = ?`,
      [senha]
    );
    res.status(201).json(parseEncaminhamento(row));
  } catch {
    sendError(res, 500, "Erro ao encaminhar paciente");
  }
});

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Safe Atendimento Backend rodando na porta ${PORT}`);
  // eslint-disable-next-line no-console
  console.log(`DB: SQLite (${DB_PATH})`);
});

