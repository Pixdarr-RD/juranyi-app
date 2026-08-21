const Database = require("better-sqlite3");
const path = require("path");

// En Render/Railway, monta un "persistent disk" en /data (o similar) y
// apunta DB_PATH allí para que la base de datos sobreviva a los redeploys.
const dbPath = process.env.DB_PATH || path.join(__dirname, "juranyi.db");

const db = new Database(dbPath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombres TEXT NOT NULL,
    cedula TEXT,
    telefono TEXT,
    correo TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    direccion TEXT,
    fecha_nacimiento TEXT,
    estado_civil TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS applications (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    monto REAL NOT NULL,
    meses INTEGER NOT NULL,
    tasa REAL NOT NULL,
    interes REAL NOT NULL,
    total REAL NOT NULL,
    cuota REAL NOT NULL,
    estado TEXT NOT NULL DEFAULT 'en_evaluacion', -- en_evaluacion | activo | pagado | rechazado
    milestone_index INTEGER NOT NULL DEFAULT 0,
    fecha_solicitud TEXT NOT NULL,
    fecha_aprobacion TEXT,
    nombres TEXT,
    cedula TEXT,
    telefono TEXT,
    direccion TEXT,
    fecha_nacimiento TEXT,
    estado_civil TEXT
  );

  CREATE TABLE IF NOT EXISTS payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    application_id TEXT NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
    num INTEGER NOT NULL,
    fecha TEXT NOT NULL,
    cuota REAL NOT NULL,
    estado TEXT NOT NULL DEFAULT 'Pendiente' -- Pendiente | Pagado
  );

  CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    subtitle TEXT,
    type TEXT DEFAULT 'info',
    read INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

module.exports = db;
