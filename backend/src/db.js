import pg from "pg";

const { Pool } = pg;

export function createPool() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL não definido. No Railway, adicione um Postgres (plugin) para gerar automaticamente."
    );
  }

  // Railway frequentemente exige SSL. Em alguns casos, rejectUnauthorized precisa ser false.
  const ssl =
    process.env.PGSSLMODE === "disable"
      ? false
      : { rejectUnauthorized: false };

  return new Pool({ connectionString, ssl });
}

export async function initDb(pool) {
  // Schema
  await pool.query(`
    CREATE TABLE IF NOT EXISTS senhas (
      id BIGSERIAL PRIMARY KEY,
      senha TEXT UNIQUE NOT NULL,
      nome TEXT,
      cpf TEXT,
      status TEXT NOT NULL DEFAULT 'cadastro',
      data TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      encaminhamento_json JSONB,
      medicoAtendendo TEXT,
      medicoAtendendoEmail TEXT
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id BIGSERIAL PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      senha TEXT NOT NULL,
      role TEXT NOT NULL,
      nome TEXT
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS exames (
      id BIGSERIAL PRIMARY KEY,
      senha TEXT NOT NULL,
      medico TEXT,
      especialidade TEXT,
      tipoExame TEXT NOT NULL,
      resultado TEXT,
      observacoes TEXT,
      data TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT fk_exames_senha FOREIGN KEY (senha) REFERENCES senhas(senha)
    );
  `);

  // Seed mínimo (idempotente)
  await pool.query(
    `
    INSERT INTO usuarios (email, senha, role, nome) VALUES
      ('medico@safe.com', 'senha123', 'medico', 'Dr. João Silva'),
      ('medico2@safe.com', 'senha123', 'medico', 'Dra. Maria Santos'),
      ('atendente@safe.com', 'senha123', 'atendente', 'Atendente')
    ON CONFLICT (email) DO NOTHING;
  `
  );
}

export async function one(pool, text, params = []) {
  const res = await pool.query(text, params);
  return res.rows[0] || null;
}

export async function many(pool, text, params = []) {
  const res = await pool.query(text, params);
  return res.rows;
}

