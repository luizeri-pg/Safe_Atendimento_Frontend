import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import path from "path";
import { fileURLToPath } from "url";
import { all, get, initDb, openDb, run } from "./db.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.join(__dirname, "..", "..");

const PORT = Number(process.env.PORT || 3000);
const DB_PATH = process.env.DB_PATH || path.join(__dirname, "..", "data.sqlite");

const app = express();
app.disable("x-powered-by");
app.use(helmet());
app.use(morgan("tiny"));
app.use(express.json({ limit: "1mb" }));

// Servir frontend (pages/js/assets) no mesmo serviço (Railway)
app.use("/assets", express.static(path.join(REPO_ROOT, "assets")));
app.use("/js", express.static(path.join(REPO_ROOT, "js")));
app.use("/pages", express.static(path.join(REPO_ROOT, "pages")));
app.get("/", (_req, res) => res.redirect("/pages/index.html"));

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
    res.status(500).json({ error: "Erro ao listar senhas" });
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
    res.status(500).json({ error: "Erro ao listar senhas recentes" });
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
    res.status(500).json({ error: "Erro ao carregar histórico" });
  }
});

// Criar senha
app.post("/api/senhas", async (req, res) => {
  try {
    const senha = normalizeSenha(req.body?.senha);
    const nome = req.body?.nome ? String(req.body.nome).trim() : null;
    const cpf = req.body?.cpf ? normalizeCpf(req.body.cpf) : null;

    if (!senha) return res.status(400).json({ error: "Campo 'senha' é obrigatório" });

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
    res.status(500).json({ error: "Erro ao criar senha" });
  }
});

// Atualizar senha por id (senha)
app.patch("/api/senhas/:senha", async (req, res) => {
  try {
    const senha = normalizeSenha(req.params.senha);
    if (!senha) return res.status(400).json({ error: "Senha inválida" });

    const existing = await get(db, `SELECT * FROM senhas WHERE senha = ?`, [senha]);
    if (!existing) return res.status(404).json({ error: "Senha não encontrada" });

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
    res.status(500).json({ error: "Erro ao atualizar senha" });
  }
});

// "Usuários" (o frontend usa como um POST simples)
app.post("/api/usuarios", async (req, res) => {
  try {
    const senha = normalizeSenha(req.body?.senha);
    const nome = req.body?.nome ? String(req.body.nome).trim() : null;
    const cpf = req.body?.cpf ? normalizeCpf(req.body.cpf) : null;
    if (!senha) return res.status(400).json({ error: "Campo 'senha' é obrigatório" });

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
      `SELECT senha, nome, cpf, status, data, encaminhamento_json
       FROM senhas WHERE senha = ?`,
      [senha]
    );
    res.status(201).json(parseEncaminhamento(row));
  } catch {
    res.status(500).json({ error: "Erro ao cadastrar usuário" });
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
    res.status(500).json({ error: "Erro ao listar exames" });
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

    if (!senha) return res.status(400).json({ error: "Campo 'senha' é obrigatório" });
    if (!tipoExame) return res.status(400).json({ error: "Campo 'tipoExame' é obrigatório" });

    await run(
      db,
      `INSERT INTO exames (senha, medico, especialidade, tipoExame, resultado, observacoes, data)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [senha, medico, especialidade, tipoExame, resultado, observacoes, nowIso()]
    );

    res.status(201).json({ ok: true });
  } catch {
    res.status(500).json({ error: "Erro ao registrar exame" });
  }
});

// Encaminhamento: registra info na senha (salva json e mantém status pendente)
app.post("/api/encaminhamento", async (req, res) => {
  try {
    const senha = normalizeSenha(req.body?.senha);
    const medicoOrigem = req.body?.medicoOrigem ? String(req.body.medicoOrigem).trim() : null;
    const medicoDestino = req.body?.medicoDestino ? String(req.body.medicoDestino).trim() : null;
    const motivo = req.body?.motivo ? String(req.body.motivo).trim() : null;

    if (!senha) return res.status(400).json({ error: "Campo 'senha' é obrigatório" });
    if (!medicoDestino) return res.status(400).json({ error: "Campo 'medicoDestino' é obrigatório" });

    const existing = await get(db, `SELECT senha FROM senhas WHERE senha = ?`, [senha]);
    if (!existing) return res.status(404).json({ error: "Senha não encontrada" });

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
      `SELECT senha, nome, cpf, status, data, encaminhamento_json
       FROM senhas WHERE senha = ?`,
      [senha]
    );
    res.status(201).json(parseEncaminhamento(row));
  } catch {
    res.status(500).json({ error: "Erro ao encaminhar paciente" });
  }
});

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Safe Atendimento Backend rodando na porta ${PORT}`);
  // eslint-disable-next-line no-console
  console.log(`DB: ${DB_PATH}`);
});

