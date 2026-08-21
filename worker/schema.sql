-- ======================================================================
-- Juranyi — Esquema D1 (reemplaza a db.json)
-- Aplica con: npx wrangler d1 execute juranyi-db --remote --file=./schema.sql
-- ======================================================================

CREATE TABLE IF NOT EXISTS admins (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre        TEXT NOT NULL,
  correo        TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  salt          TEXT NOT NULL,
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  nombres           TEXT NOT NULL,
  cedula            TEXT NOT NULL,
  telefono          TEXT DEFAULT '',
  correo            TEXT NOT NULL UNIQUE,
  direccion         TEXT DEFAULT '',
  fecha_nacimiento  TEXT DEFAULT '',
  estado_civil      TEXT DEFAULT '',
  password_hash     TEXT NOT NULL,
  salt              TEXT NOT NULL,
  estado            TEXT NOT NULL DEFAULT 'activo', -- activo | bloqueado
  created_at        TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS applications (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id           INTEGER NOT NULL REFERENCES users(id),
  monto             REAL NOT NULL,
  meses             INTEGER NOT NULL,
  tasa              REAL NOT NULL,
  interes           REAL NOT NULL,
  total             REAL NOT NULL,
  cuota             REAL NOT NULL,
  estado            TEXT NOT NULL DEFAULT 'en_evaluacion', -- en_evaluacion | activo | pagado | rechazado
  milestone_index   INTEGER NOT NULL DEFAULT 0,
  fecha_solicitud   TEXT,
  fecha_aprobacion  TEXT,
  motivo_rechazo    TEXT,
  form_data         TEXT NOT NULL DEFAULT '{}', -- JSON
  pagos             TEXT NOT NULL DEFAULT '[]'  -- JSON array de cuotas
);

CREATE TABLE IF NOT EXISTS notifications (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id),
  title       TEXT NOT NULL,
  subtitle    TEXT NOT NULL DEFAULT '',
  time        TEXT NOT NULL DEFAULT 'Justo ahora',
  read        INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token         TEXT PRIMARY KEY,
  subject_type  TEXT NOT NULL, -- 'user' | 'admin'
  subject_id    INTEGER NOT NULL,
  expires_at    INTEGER NOT NULL -- epoch ms
);

CREATE INDEX IF NOT EXISTS idx_applications_user ON applications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

-- Admin por defecto: admin@juranyi.com / admin123
-- (hash generado con PBKDF2-SHA256, 100000 iteraciones, 32 bytes — mismo algoritmo
--  que usa worker/src/index.js. CAMBIA ESTA CONTRASEÑA apenas entres, ver README.)
INSERT INTO admins (nombre, correo, password_hash, salt, created_at)
SELECT 'Administrador', 'admin@juranyi.com',
  '9fa0457a87b4e65f9010463fffda257dd525ca91f22d505d3578b94c9c3c6c38',
  '7f7847bdfe82d66d6cb17f31a4e0fd33',
  datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM admins WHERE correo = 'admin@juranyi.com');
