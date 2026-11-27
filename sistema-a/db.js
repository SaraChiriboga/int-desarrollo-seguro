'use strict';
// Base de datos LOCAL de Sistema A (independiente de la de Keycloak).
const path = require('path');
const Database = require('better-sqlite3');

const db = new Database(path.join(__dirname, 'data', 'sistema-a.db'));
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS usuarios (
    sub          TEXT PRIMARY KEY,
    username     TEXT,
    email        TEXT,
    nombre       TEXT,
    roles        TEXT NOT NULL DEFAULT '',
    primer_login TEXT NOT NULL,
    ultimo_login TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS auditoria (
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    fecha   TEXT NOT NULL,
    sub     TEXT,
    evento  TEXT NOT NULL,
    ip      TEXT
  );
`);

// Todas las consultas son parametrizadas (prevención de SQL Injection).
const upsertStmt = db.prepare(`
  INSERT INTO usuarios (sub, username, email, nombre, roles, primer_login, ultimo_login)
  VALUES (@sub, @username, @email, @nombre, @roles, @now, @now)
  ON CONFLICT(sub) DO UPDATE SET
    username=@username, email=@email, nombre=@nombre, roles=@roles, ultimo_login=@now
`);
const getUserStmt = db.prepare('SELECT * FROM usuarios WHERE sub = ?');
const listUsersStmt = db.prepare('SELECT * FROM usuarios ORDER BY ultimo_login DESC LIMIT 100');
const logStmt = db.prepare('INSERT INTO auditoria (fecha, sub, evento, ip) VALUES (?, ?, ?, ?)');
const listLogStmt = db.prepare('SELECT * FROM auditoria ORDER BY id DESC LIMIT 50');

module.exports = {
  upsertUser: (u) => upsertStmt.run({ ...u, now: new Date().toISOString() }),
  getUser: (sub) => getUserStmt.get(sub),
  listUsers: () => listUsersStmt.all(),
  logEvent: (sub, evento, ip) => logStmt.run(new Date().toISOString(), sub || null, evento, ip || null),
  listLog: () => listLogStmt.all(),
};
