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
        encaminhamento_json TEXT
      )
    `);

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

