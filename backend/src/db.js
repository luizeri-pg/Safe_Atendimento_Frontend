import sqlite3 from "sqlite3";

sqlite3.verbose();

export function openDb(dbPath) {
  return new sqlite3.Database(dbPath);
}

export function initDb(db) {
  db.serialize(() => {
    db.run(`
      CREATE TABLE IF NOT EXISTS senhas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        senha TEXT UNIQUE NOT NULL,
        nome TEXT,
        cpf TEXT,
        status TEXT NOT NULL DEFAULT 'cadastro',
        data TEXT NOT NULL,
        encaminhamento_json TEXT,
        medicoAtendendo TEXT,
        medicoAtendendoEmail TEXT
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS usuarios (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        senha TEXT NOT NULL,
        role TEXT NOT NULL,
        nome TEXT
      )
    `);

    // Migrações leves (SQLite): adicionar colunas opcionais de perfil
    // Obs: ALTER TABLE ... ADD COLUMN é idempotente se ignorarmos o erro "duplicate column name".
    const addUserColumn = (col, type) => {
      db.run(`ALTER TABLE usuarios ADD COLUMN ${col} ${type}`, () => {
        // ignora erro se coluna já existir
      });
    };
    addUserColumn("firstName", "TEXT");
    addUserColumn("lastName", "TEXT");
    addUserColumn("phone", "TEXT");
    addUserColumn("crm", "TEXT");
    addUserColumn("specialty", "TEXT");
    addUserColumn("bio", "TEXT");

    // Seed mínimo (para o login do front funcionar sem depender de outro sistema)
    db.run(
      `INSERT OR IGNORE INTO usuarios (email, senha, role, nome) VALUES
        ('medico@safe.com', 'senha123', 'medico', 'Dr. João Silva'),
        ('medico2@safe.com', 'senha123', 'medico', 'Dra. Maria Santos'),
        ('atendente@safe.com', 'senha123', 'atendente', 'Atendente')`
    );

    db.run(`
      CREATE TABLE IF NOT EXISTS exames (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        senha TEXT NOT NULL,
        medico TEXT,
        especialidade TEXT,
        tipoExame TEXT NOT NULL,
        resultado TEXT,
        observacoes TEXT,
        data TEXT NOT NULL,
        FOREIGN KEY (senha) REFERENCES senhas(senha)
      )
    `);
  });
}

export function run(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve({ changes: this.changes, lastID: this.lastID });
    });
  });
}

export function all(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}

export function get(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) return reject(err);
      resolve(row);
    });
  });
}

