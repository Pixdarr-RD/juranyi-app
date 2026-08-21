/* ======================================================================
   Capa de acceso a datos (D1). Cada función hace una operación puntual;
   las rutas en index.js las combinan según el endpoint.
   ====================================================================== */

import { publicId, parseNumericId, nowLabel } from "./utils.js";

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 días

/* ---------- Sesiones ---------- */

export async function createSession(db, token, subjectType, subjectId) {
  const expiresAt = Date.now() + SESSION_TTL_MS;
  await db
    .prepare("INSERT INTO sessions (token, subject_type, subject_id, expires_at) VALUES (?, ?, ?, ?)")
    .bind(token, subjectType, subjectId, expiresAt)
    .run();
}

export async function getSession(db, token) {
  const row = await db
    .prepare("SELECT subject_type, subject_id, expires_at FROM sessions WHERE token = ?")
    .bind(token)
    .first();
  if (!row) return null;
  if (row.expires_at < Date.now()) {
    await db.prepare("DELETE FROM sessions WHERE token = ?").bind(token).run();
    return null;
  }
  return { subjectType: row.subject_type, subjectId: row.subject_id };
}

/* ---------- Usuarios (deudores) ---------- */

export function rowToUser(row) {
  if (!row) return null;
  return {
    id: publicId("U", row.id),
    nombres: row.nombres,
    cedula: row.cedula,
    telefono: row.telefono || "",
    correo: row.correo,
    direccion: row.direccion || "",
    fechaNacimiento: row.fecha_nacimiento || "",
    estadoCivil: row.estado_civil || "",
    estado: row.estado,
    createdAt: row.created_at,
  };
}

export async function findUserByEmail(db, correo) {
  return db.prepare("SELECT * FROM users WHERE lower(correo) = lower(?)").bind(correo).first();
}

export async function findUserByPublicId(db, publicUserId) {
  const id = parseNumericId("U", publicUserId);
  if (id === null) return null;
  return db.prepare("SELECT * FROM users WHERE id = ?").bind(id).first();
}

export async function createUser(db, { nombres, cedula, telefono, correo, hash, salt }) {
  const res = await db
    .prepare(
      `INSERT INTO users (nombres, cedula, telefono, correo, direccion, fecha_nacimiento, estado_civil, password_hash, salt, estado, created_at)
       VALUES (?, ?, ?, ?, '', '', '', ?, ?, 'activo', ?)`
    )
    .bind(nombres, cedula, telefono || "", correo, hash, salt, new Date().toISOString())
    .run();
  const id = res.meta.last_row_id;
  return db.prepare("SELECT * FROM users WHERE id = ?").bind(id).first();
}

export async function updateUserContact(db, numericUserId, { direccion, fechaNacimiento, estadoCivil, telefono }) {
  const current = await db.prepare("SELECT * FROM users WHERE id = ?").bind(numericUserId).first();
  if (!current) return;
  await db
    .prepare(
      `UPDATE users SET direccion = ?, fecha_nacimiento = ?, estado_civil = ?, telefono = ? WHERE id = ?`
    )
    .bind(
      direccion || current.direccion,
      fechaNacimiento || current.fecha_nacimiento,
      estadoCivil || current.estado_civil,
      telefono || current.telefono,
      numericUserId
    )
    .run();
}

export async function patchUser(db, numericUserId, fields) {
  const allowed = ["nombres", "cedula", "telefono", "correo", "direccion", "fechaNacimiento", "estadoCivil", "estado"];
  const colMap = {
    nombres: "nombres",
    cedula: "cedula",
    telefono: "telefono",
    correo: "correo",
    direccion: "direccion",
    fechaNacimiento: "fecha_nacimiento",
    estadoCivil: "estado_civil",
    estado: "estado",
  };
  const sets = [];
  const values = [];
  for (const k of allowed) {
    if (fields[k] !== undefined) {
      sets.push(`${colMap[k]} = ?`);
      values.push(fields[k]);
    }
  }
  if (!sets.length) return;
  values.push(numericUserId);
  await db.prepare(`UPDATE users SET ${sets.join(", ")} WHERE id = ?`).bind(...values).run();
}

export async function listUsers(db) {
  const { results } = await db.prepare("SELECT * FROM users ORDER BY id ASC").all();
  return results;
}

/* ---------- Administradores ---------- */

export function rowToAdmin(row) {
  if (!row) return null;
  return { id: publicId("A", row.id), nombre: row.nombre, correo: row.correo, createdAt: row.created_at };
}

export async function findAdminByEmail(db, correo) {
  return db.prepare("SELECT * FROM admins WHERE lower(correo) = lower(?)").bind(correo).first();
}

/* ---------- Solicitudes / préstamos ---------- */

export function rowToApplication(row) {
  if (!row) return null;
  return {
    id: publicId("APP-", row.id),
    userId: publicId("U", row.user_id),
    monto: row.monto,
    meses: row.meses,
    tasa: row.tasa,
    interes: row.interes,
    total: row.total,
    cuota: row.cuota,
    estado: row.estado,
    milestoneIndex: row.milestone_index,
    fechaSolicitud: row.fecha_solicitud,
    fechaAprobacion: row.fecha_aprobacion,
    motivoRechazo: row.motivo_rechazo,
    formData: row.form_data ? JSON.parse(row.form_data) : {},
    pagos: row.pagos ? JSON.parse(row.pagos) : [],
  };
}

export async function findActiveOrPendingApplication(db, numericUserId) {
  return db
    .prepare(
      "SELECT * FROM applications WHERE user_id = ? AND estado IN ('en_evaluacion','activo') LIMIT 1"
    )
    .bind(numericUserId)
    .first();
}

export async function createApplication(db, { userId, monto, meses, tasa, interes, total, cuota, formData }) {
  const res = await db
    .prepare(
      `INSERT INTO applications (user_id, monto, meses, tasa, interes, total, cuota, estado, milestone_index, fecha_solicitud, fecha_aprobacion, motivo_rechazo, form_data, pagos)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'en_evaluacion', 0, ?, NULL, NULL, ?, '[]')`
    )
    .bind(userId, monto, meses, tasa, interes, total, cuota, nowLabel(), JSON.stringify(formData || {}))
    .run();
  const id = res.meta.last_row_id;
  return db.prepare("SELECT * FROM applications WHERE id = ?").bind(id).first();
}

export async function findApplicationByPublicId(db, publicAppId) {
  const id = parseNumericId("APP-", publicAppId);
  if (id === null) return null;
  return db.prepare("SELECT * FROM applications WHERE id = ?").bind(id).first();
}

export async function findUserApplication(db, publicAppId, numericUserId) {
  const id = parseNumericId("APP-", publicAppId);
  if (id === null) return null;
  return db.prepare("SELECT * FROM applications WHERE id = ? AND user_id = ?").bind(id, numericUserId).first();
}

export async function listUserApplications(db, numericUserId, { excludeStates = [] } = {}) {
  if (excludeStates.length === 0) {
    const { results } = await db
      .prepare("SELECT * FROM applications WHERE user_id = ? ORDER BY id DESC")
      .bind(numericUserId)
      .all();
    return results;
  }
  const placeholders = excludeStates.map(() => "?").join(",");
  const { results } = await db
    .prepare(`SELECT * FROM applications WHERE user_id = ? AND estado NOT IN (${placeholders}) ORDER BY id DESC`)
    .bind(numericUserId, ...excludeStates)
    .all();
  return results;
}

export async function listApplicationsByState(db, numericUserId, estado) {
  const { results } = await db
    .prepare("SELECT * FROM applications WHERE user_id = ? AND estado = ? ORDER BY id DESC")
    .bind(numericUserId, estado)
    .all();
  return results;
}

export async function listAllApplications(db, estado) {
  if (estado) {
    const { results } = await db
      .prepare("SELECT * FROM applications WHERE estado = ? ORDER BY id DESC")
      .bind(estado)
      .all();
    return results;
  }
  const { results } = await db.prepare("SELECT * FROM applications ORDER BY id DESC").all();
  return results;
}

export async function saveApplication(db, numericAppId, patch) {
  // patch: objeto con las mismas keys que la vista pública (monto, meses, tasa, ...)
  const cols = {
    monto: "monto",
    meses: "meses",
    tasa: "tasa",
    interes: "interes",
    total: "total",
    cuota: "cuota",
    estado: "estado",
    milestoneIndex: "milestone_index",
    fechaSolicitud: "fecha_solicitud",
    fechaAprobacion: "fecha_aprobacion",
    motivoRechazo: "motivo_rechazo",
  };
  const sets = [];
  const values = [];
  for (const k of Object.keys(cols)) {
    if (patch[k] !== undefined) {
      sets.push(`${cols[k]} = ?`);
      values.push(patch[k]);
    }
  }
  if (patch.pagos !== undefined) {
    sets.push("pagos = ?");
    values.push(JSON.stringify(patch.pagos));
  }
  if (patch.formData !== undefined) {
    sets.push("form_data = ?");
    values.push(JSON.stringify(patch.formData));
  }
  if (!sets.length) return;
  values.push(numericAppId);
  await db.prepare(`UPDATE applications SET ${sets.join(", ")} WHERE id = ?`).bind(...values).run();
}

/* ---------- Notificaciones ---------- */

export function rowToNotification(row) {
  if (!row) return null;
  return {
    id: publicId("N", row.id),
    userId: publicId("U", row.user_id),
    title: row.title,
    subtitle: row.subtitle,
    time: row.time,
    read: !!row.read,
    createdAt: row.created_at,
  };
}

export async function addNotification(db, numericUserId, title, subtitle) {
  await db
    .prepare(
      `INSERT INTO notifications (user_id, title, subtitle, time, read, created_at) VALUES (?, ?, ?, 'Justo ahora', 0, ?)`
    )
    .bind(numericUserId, title, subtitle, new Date().toISOString())
    .run();
}

export async function listUserNotifications(db, numericUserId) {
  const { results } = await db
    .prepare("SELECT * FROM notifications WHERE user_id = ? ORDER BY id DESC")
    .bind(numericUserId)
    .all();
  return results;
}

export async function markAllNotificationsRead(db, numericUserId) {
  await db.prepare("UPDATE notifications SET read = 1 WHERE user_id = ?").bind(numericUserId).run();
}

/* ---------- Stats para el panel admin ---------- */

export async function computeStats(db) {
  const totalDeudores = (await db.prepare("SELECT COUNT(*) AS n FROM users").first()).n;
  const activos = (await db.prepare("SELECT COUNT(*) AS n FROM applications WHERE estado = 'activo'").first()).n;
  const enEvaluacion = (
    await db.prepare("SELECT COUNT(*) AS n FROM applications WHERE estado = 'en_evaluacion'").first()
  ).n;
  const pagados = (await db.prepare("SELECT COUNT(*) AS n FROM applications WHERE estado = 'pagado'").first()).n;
  const totalPrestado = (
    await db
      .prepare("SELECT COALESCE(SUM(monto),0) AS s FROM applications WHERE estado IN ('activo','pagado')")
      .first()
  ).s;

  // totalPorCobrar y cuotasVencidas requieren mirar dentro del JSON de pagos
  // de los préstamos activos, así que se calculan en JS tras traerlos.
  const { results: activeApps } = await db
    .prepare("SELECT pagos FROM applications WHERE estado = 'activo'")
    .all();
  let totalPorCobrar = 0;
  let cuotasVencidas = 0;
  const now = new Date();
  for (const row of activeApps) {
    const pagos = row.pagos ? JSON.parse(row.pagos) : [];
    for (const p of pagos) {
      if (p.estado !== "Pagado") totalPorCobrar += p.cuota;
      if (p.estado === "Pendiente" && p._dueRaw && new Date(p._dueRaw) < now) cuotasVencidas++;
    }
  }

  return {
    totalDeudores,
    prestamosActivos: activos,
    solicitudesPendientes: enEvaluacion,
    prestamosPagados: pagados,
    totalPrestado: Math.round(totalPrestado * 100) / 100,
    totalPorCobrar: Math.round(totalPorCobrar * 100) / 100,
    cuotasVencidas,
  };
}
