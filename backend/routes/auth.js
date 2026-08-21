const express = require("express");
const bcrypt = require("bcryptjs");
const db = require("../db");
const { requireAuth, signToken } = require("../middleware/auth");

const router = express.Router();

function toPublicUser(row) {
  return {
    id: row.id,
    nombres: row.nombres,
    cedula: row.cedula,
    telefono: row.telefono,
    correo: row.correo,
    direccion: row.direccion,
    fechaNacimiento: row.fecha_nacimiento,
    estadoCivil: row.estado_civil,
  };
}

router.post("/register", (req, res) => {
  const { nombres, cedula, telefono, correo, password } = req.body || {};
  if (!nombres || !correo || !password) {
    return res.status(400).json({ error: "Nombres, correo y contraseña son obligatorios." });
  }
  const existing = db.prepare("SELECT id FROM users WHERE correo = ?").get(correo);
  if (existing) {
    return res.status(409).json({ error: "Ya existe una cuenta con ese correo." });
  }
  const hash = bcrypt.hashSync(password, 10);
  const info = db
    .prepare(
      `INSERT INTO users (nombres, cedula, telefono, correo, password_hash, direccion, fecha_nacimiento, estado_civil)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(nombres, cedula || "", telefono || "", correo, hash, "", "", "");

  db.prepare(
    `INSERT INTO notifications (user_id, title, subtitle, type) VALUES (?, ?, ?, ?)`
  ).run(info.lastInsertRowid, "¡Bienvenido a Juranyi!", "Tu cuenta fue creada exitosamente.", "success");

  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(info.lastInsertRowid);
  const token = signToken(user.id);
  res.status(201).json({ token, user: toPublicUser(user) });
});

router.post("/login", (req, res) => {
  const { correo, password } = req.body || {};
  if (!correo || !password) {
    return res.status(400).json({ error: "Correo y contraseña son obligatorios." });
  }
  const user = db.prepare("SELECT * FROM users WHERE correo = ?").get(correo);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: "Correo o contraseña incorrectos." });
  }
  const token = signToken(user.id);
  res.json({ token, user: toPublicUser(user) });
});

router.get("/me", requireAuth, (req, res) => {
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(req.userId);
  if (!user) return res.status(404).json({ error: "Usuario no encontrado." });
  res.json({ user: toPublicUser(user) });
});

module.exports = router;
