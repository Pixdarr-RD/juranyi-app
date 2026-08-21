/* ======================================================================
   Juranyi — Backend en Cloudflare Workers + D1
   ----------------------------------------------------------------------
   Reemplaza al server.js de Node.js. Misma API (mismas rutas, mismos
   payloads) para que frontend/ y admin/ no necesiten cambios de lógica,
   solo apuntar apiUrl a la URL de este Worker.

   Despliega con:  npx wrangler deploy
   ====================================================================== */

import {
  hashPassword,
  verifyPassword,
  newToken,
  nowLabel,
  round2,
  rateForTerm,
  simulateLoan,
  buildPagos,
  jsonResponse,
  readJsonBody,
  parseNumericId,
} from "./utils.js";

import * as store from "./db.js";

const MILESTONE_COUNT = 4;

/* -------------------------------------------------------------- */
/*  Router                                                           */
/* -------------------------------------------------------------- */

const routes = [];
function route(method, pattern, handler) {
  const paramNames = [];
  const regex = new RegExp(
    "^" +
      pattern.replace(/:[^/]+/g, (m) => {
        paramNames.push(m.slice(1));
        return "([^/]+)";
      }) +
      "$"
  );
  routes.push({ method, regex, paramNames, handler });
}

async function requireAuth(db, request, kind) {
  const auth = request.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  const session = token ? await store.getSession(db, token) : null;
  if (!session || session.subjectType !== kind) return null;
  return session;
}

/* ---- Auth de usuarios (deudores) ---- */

route("POST", "/api/auth/register", async (db, request) => {
  const body = await readJsonBody(request);
  const { nombres, cedula, telefono, correo, password } = body;
  if (!nombres || !cedula || !correo || !password) {
    return jsonResponse(400, { error: "Completa todos los campos requeridos." });
  }
  const existing = await store.findUserByEmail(db, correo);
  if (existing) return jsonResponse(409, { error: "Ya existe una cuenta con ese correo." });

  const { hash, salt } = await hashPassword(password);
  const row = await store.createUser(db, { nombres, cedula, telefono, correo, hash, salt });
  const token = newToken();
  await store.createSession(db, token, "user", row.id);
  return jsonResponse(201, { token, user: store.rowToUser(row) });
});

route("POST", "/api/auth/login", async (db, request) => {
  const body = await readJsonBody(request);
  const { correo, password } = body;
  const row = await store.findUserByEmail(db, correo || "");
  if (!row || !(await verifyPassword(password || "", row.salt, row.password_hash))) {
    return jsonResponse(401, { error: "Correo o contraseña incorrectos." });
  }
  if (row.estado === "bloqueado") {
    return jsonResponse(403, { error: "Tu cuenta está bloqueada. Contacta a soporte." });
  }
  const token = newToken();
  await store.createSession(db, token, "user", row.id);
  return jsonResponse(200, { token, user: store.rowToUser(row) });
});

/* ---- Aplicaciones / préstamos (usuario) ---- */

route("GET", "/api/applications", async (db, request) => {
  const session = await requireAuth(db, request, "user");
  if (!session) return jsonResponse(401, { error: "No autorizado. Inicia sesión de nuevo." });
  const rows = await store.listUserApplications(db, session.subjectId, {
    excludeStates: ["pagado", "rechazado"],
  });
  return jsonResponse(200, { applications: rows.map(store.rowToApplication) });
});

route("GET", "/api/applications/history", async (db, request) => {
  const session = await requireAuth(db, request, "user");
  if (!session) return jsonResponse(401, { error: "No autorizado. Inicia sesión de nuevo." });
  const rows = await store.listApplicationsByState(db, session.subjectId, "pagado");
  const hist = rows.map((r) => ({
    id: `APP-${r.id}`,
    monto: r.monto,
    totalPagado: r.total,
    fecha: r.fecha_aprobacion || r.fecha_solicitud,
  }));
  return jsonResponse(200, { history: hist });
});

route("GET", "/api/notifications", async (db, request) => {
  const session = await requireAuth(db, request, "user");
  if (!session) return jsonResponse(401, { error: "No autorizado. Inicia sesión de nuevo." });
  const rows = await store.listUserNotifications(db, session.subjectId);
  return jsonResponse(200, { notifications: rows.map(store.rowToNotification) });
});

route("POST", "/api/notifications/read-all", async (db, request) => {
  const session = await requireAuth(db, request, "user");
  if (!session) return jsonResponse(401, { error: "No autorizado. Inicia sesión de nuevo." });
  await store.markAllNotificationsRead(db, session.subjectId);
  return jsonResponse(200, { ok: true });
});

route("POST", "/api/applications", async (db, request) => {
  const session = await requireAuth(db, request, "user");
  if (!session) return jsonResponse(401, { error: "No autorizado. Inicia sesión de nuevo." });
  const body = await readJsonBody(request);
  const { monto, meses, formData } = body;
  if (!monto || !meses) return jsonResponse(400, { error: "Monto y plazo son requeridos." });

  const already = await store.findActiveOrPendingApplication(db, session.subjectId);
  if (already) return jsonResponse(409, { error: "Ya tienes una solicitud o préstamo en curso." });

  const sim = simulateLoan(monto, meses);
  const row = await store.createApplication(db, {
    userId: session.subjectId,
    monto,
    meses,
    tasa: sim.tasa,
    interes: sim.interes,
    total: sim.total,
    cuota: sim.cuota,
    formData,
  });

  if (formData) {
    await store.updateUserContact(db, session.subjectId, {
      direccion: formData.direccion,
      fechaNacimiento: formData.fechaNacimiento,
      estadoCivil: formData.estadoCivil,
      telefono: formData.telefono,
    });
  }

  await store.addNotification(db, session.subjectId, "Solicitud recibida", `Tu solicitud #APP-${row.id} está en evaluación.`);
  return jsonResponse(201, { application: store.rowToApplication(row) });
});

route("POST", "/api/applications/:id/advance", async (db, request, params) => {
  const session = await requireAuth(db, request, "user");
  if (!session) return jsonResponse(401, { error: "No autorizado. Inicia sesión de nuevo." });
  const row = await store.findUserApplication(db, params.id, session.subjectId);
  if (!row) return jsonResponse(404, { error: "Solicitud no encontrada." });

  if (row.estado === "activo" || row.estado === "pagado" || row.estado === "rechazado") {
    return jsonResponse(200, { application: store.rowToApplication(row) });
  }
  const milestoneIndex = Math.min(row.milestone_index + 1, MILESTONE_COUNT - 1);
  if (milestoneIndex >= MILESTONE_COUNT - 1) {
    const pagos = buildPagos(row.meses, row.cuota);
    await store.saveApplication(db, row.id, {
      milestoneIndex,
      estado: "activo",
      fechaAprobacion: nowLabel(),
      pagos,
    });
    await store.addNotification(db, row.user_id, "¡Préstamo aprobado!", `Tu préstamo #APP-${row.id} fue desembolsado.`);
  } else {
    await store.saveApplication(db, row.id, { milestoneIndex });
    await store.addNotification(db, row.user_id, "Actualización de tu solicitud", `Tu solicitud #APP-${row.id} avanzó de etapa.`);
  }
  const updated = await store.findApplicationByPublicId(db, params.id);
  return jsonResponse(200, { application: store.rowToApplication(updated) });
});

route("POST", "/api/applications/:id/payments/:num/pay", async (db, request, params) => {
  const session = await requireAuth(db, request, "user");
  if (!session) return jsonResponse(401, { error: "No autorizado. Inicia sesión de nuevo." });
  const row = await store.findUserApplication(db, params.id, session.subjectId);
  if (!row) return jsonResponse(404, { error: "Préstamo no encontrado." });

  const num = Number(params.num);
  const pagos = row.pagos ? JSON.parse(row.pagos) : [];
  const pago = pagos.find((p) => p.num === num);
  if (!pago) return jsonResponse(404, { error: "Cuota no encontrada." });
  if (pago.estado === "Pagado") return jsonResponse(409, { error: "Esta cuota ya fue pagada." });

  pago.estado = "Pagado";
  pago.fechaPago = nowLabel();
  await store.addNotification(db, row.user_id, "Pago recibido", `Se registró el pago de la cuota #${num}.`);

  let estado = row.estado;
  if (pagos.every((p) => p.estado === "Pagado")) {
    estado = "pagado";
    await store.addNotification(db, row.user_id, "¡Préstamo saldado!", "Has completado el pago de tu préstamo. ¡Felicidades!");
  }
  await store.saveApplication(db, row.id, { pagos, estado });
  const updated = await store.findApplicationByPublicId(db, params.id);
  return jsonResponse(200, { application: store.rowToApplication(updated) });
});

/* ---- Auth de administrador ---- */

route("POST", "/api/admin/login", async (db, request) => {
  const body = await readJsonBody(request);
  const { correo, password } = body;
  const row = await store.findAdminByEmail(db, correo || "");
  if (!row || !(await verifyPassword(password || "", row.salt, row.password_hash))) {
    return jsonResponse(401, { error: "Correo o contraseña incorrectos." });
  }
  const token = newToken();
  await store.createSession(db, token, "admin", row.id);
  return jsonResponse(200, { token, admin: store.rowToAdmin(row) });
});

/* ---- Panel de administrador ---- */

route("GET", "/api/admin/stats", async (db, request) => {
  const session = await requireAuth(db, request, "admin");
  if (!session) return jsonResponse(401, { error: "No autorizado. Inicia sesión de nuevo." });
  const stats = await store.computeStats(db);
  return jsonResponse(200, { stats });
});

route("GET", "/api/admin/users", async (db, request) => {
  const session = await requireAuth(db, request, "admin");
  if (!session) return jsonResponse(401, { error: "No autorizado. Inicia sesión de nuevo." });
  const userRows = await store.listUsers(db);
  const { results: allApps } = await db.prepare("SELECT * FROM applications").all();
  const list = userRows.map((u) => {
    const apps = allApps.filter((a) => a.user_id === u.id);
    const activo = apps.find((a) => a.estado === "activo");
    const pendiente = apps.find((a) => a.estado === "en_evaluacion");
    return Object.assign({}, store.rowToUser(u), {
      prestamoActivo: activo ? { id: `APP-${activo.id}`, monto: activo.monto, cuota: activo.cuota } : null,
      solicitudPendiente: pendiente ? { id: `APP-${pendiente.id}`, monto: pendiente.monto } : null,
      totalSolicitudes: apps.length,
    });
  });
  return jsonResponse(200, { users: list });
});

route("GET", "/api/admin/users/:id", async (db, request, params) => {
  const session = await requireAuth(db, request, "admin");
  if (!session) return jsonResponse(401, { error: "No autorizado. Inicia sesión de nuevo." });
  const userRow = await store.findUserByPublicId(db, params.id);
  if (!userRow) return jsonResponse(404, { error: "Deudor no encontrado." });
  const { results: apps } = await db
    .prepare("SELECT * FROM applications WHERE user_id = ? ORDER BY id DESC")
    .bind(userRow.id)
    .all();
  return jsonResponse(200, { user: store.rowToUser(userRow), applications: apps.map(store.rowToApplication) });
});

route("PATCH", "/api/admin/users/:id", async (db, request, params) => {
  const session = await requireAuth(db, request, "admin");
  if (!session) return jsonResponse(401, { error: "No autorizado. Inicia sesión de nuevo." });
  const userRow = await store.findUserByPublicId(db, params.id);
  if (!userRow) return jsonResponse(404, { error: "Deudor no encontrado." });
  const body = await readJsonBody(request);
  await store.patchUser(db, userRow.id, body);
  const updated = await store.findUserByPublicId(db, params.id);
  return jsonResponse(200, { user: store.rowToUser(updated) });
});

route("GET", "/api/admin/applications", async (db, request, params, query) => {
  const session = await requireAuth(db, request, "admin");
  if (!session) return jsonResponse(401, { error: "No autorizado. Inicia sesión de nuevo." });
  const rows = await store.listAllApplications(db, query.estado);
  const userRows = await store.listUsers(db);
  const withUser = rows.map((a) => {
    const u = userRows.find((x) => x.id === a.user_id);
    const view = store.rowToApplication(a);
    view.deudor = u ? { id: `U${u.id}`, nombres: u.nombres, cedula: u.cedula, correo: u.correo } : null;
    return view;
  });
  return jsonResponse(200, { applications: withUser });
});

route("POST", "/api/admin/applications/:id/approve", async (db, request, params) => {
  const session = await requireAuth(db, request, "admin");
  if (!session) return jsonResponse(401, { error: "No autorizado. Inicia sesión de nuevo." });
  const row = await store.findApplicationByPublicId(db, params.id);
  if (!row) return jsonResponse(404, { error: "Solicitud no encontrada." });
  if (row.estado !== "en_evaluacion") return jsonResponse(409, { error: "Esta solicitud ya fue procesada." });

  const pagos = buildPagos(row.meses, row.cuota);
  await store.saveApplication(db, row.id, {
    estado: "activo",
    milestoneIndex: MILESTONE_COUNT - 1,
    fechaAprobacion: nowLabel(),
    pagos,
  });
  await store.addNotification(db, row.user_id, "¡Préstamo aprobado!", `Tu préstamo #APP-${row.id} fue desembolsado.`);
  const updated = await store.findApplicationByPublicId(db, params.id);
  return jsonResponse(200, { application: store.rowToApplication(updated) });
});

route("POST", "/api/admin/applications/:id/reject", async (db, request, params) => {
  const session = await requireAuth(db, request, "admin");
  if (!session) return jsonResponse(401, { error: "No autorizado. Inicia sesión de nuevo." });
  const row = await store.findApplicationByPublicId(db, params.id);
  if (!row) return jsonResponse(404, { error: "Solicitud no encontrada." });
  if (row.estado !== "en_evaluacion") return jsonResponse(409, { error: "Esta solicitud ya fue procesada." });
  const body = await readJsonBody(request);
  await store.saveApplication(db, row.id, {
    estado: "rechazado",
    motivoRechazo: body.motivo || "No especificado",
  });
  await store.addNotification(db, row.user_id, "Solicitud rechazada", `Tu solicitud #APP-${row.id} no fue aprobada.`);
  const updated = await store.findApplicationByPublicId(db, params.id);
  return jsonResponse(200, { application: store.rowToApplication(updated) });
});

route("PATCH", "/api/admin/applications/:id", async (db, request, params) => {
  const session = await requireAuth(db, request, "admin");
  if (!session) return jsonResponse(401, { error: "No autorizado. Inicia sesión de nuevo." });
  const row = await store.findApplicationByPublicId(db, params.id);
  if (!row) return jsonResponse(404, { error: "Solicitud no encontrada." });
  const body = await readJsonBody(request);

  const monto = body.monto !== undefined ? Number(body.monto) : row.monto;
  const meses = body.meses !== undefined ? Number(body.meses) : row.meses;
  const tasaOverride = body.tasa !== undefined ? Number(body.tasa) : null;
  const tasa = tasaOverride !== null ? tasaOverride : rateForTerm(meses);
  const interes = monto * (tasa / 100) * (meses / 12);
  const total = monto + interes;
  const cuota = total / meses;

  const patch = {
    monto,
    meses,
    tasa,
    interes: round2(interes),
    total: round2(total),
    cuota: round2(cuota),
  };

  const currentPagos = row.pagos ? JSON.parse(row.pagos) : [];
  if (row.estado === "activo" && (!currentPagos.length || currentPagos.every((p) => p.estado !== "Pagado"))) {
    patch.pagos = buildPagos(meses, patch.cuota);
  }

  await store.saveApplication(db, row.id, patch);
  await store.addNotification(db, row.user_id, "Condiciones actualizadas", `Se actualizaron las condiciones de tu préstamo #APP-${row.id}.`);
  const updated = await store.findApplicationByPublicId(db, params.id);
  return jsonResponse(200, { application: store.rowToApplication(updated) });
});

route("POST", "/api/admin/applications/:id/payments/:num/mark-paid", async (db, request, params) => {
  const session = await requireAuth(db, request, "admin");
  if (!session) return jsonResponse(401, { error: "No autorizado. Inicia sesión de nuevo." });
  const row = await store.findApplicationByPublicId(db, params.id);
  if (!row) return jsonResponse(404, { error: "Préstamo no encontrado." });
  const num = Number(params.num);
  const pagos = row.pagos ? JSON.parse(row.pagos) : [];
  const pago = pagos.find((p) => p.num === num);
  if (!pago) return jsonResponse(404, { error: "Cuota no encontrada." });
  pago.estado = "Pagado";
  pago.fechaPago = nowLabel();
  const estado = pagos.every((p) => p.estado === "Pagado") ? "pagado" : row.estado;
  await store.saveApplication(db, row.id, { pagos, estado });
  const updated = await store.findApplicationByPublicId(db, params.id);
  return jsonResponse(200, { application: store.rowToApplication(updated) });
});

route("POST", "/api/admin/applications/:id/payments/:num/mark-late", async (db, request, params) => {
  const session = await requireAuth(db, request, "admin");
  if (!session) return jsonResponse(401, { error: "No autorizado. Inicia sesión de nuevo." });
  const row = await store.findApplicationByPublicId(db, params.id);
  if (!row) return jsonResponse(404, { error: "Préstamo no encontrado." });
  const num = Number(params.num);
  const pagos = row.pagos ? JSON.parse(row.pagos) : [];
  const pago = pagos.find((p) => p.num === num);
  if (!pago) return jsonResponse(404, { error: "Cuota no encontrada." });
  pago.estado = "Atrasado";
  await store.saveApplication(db, row.id, { pagos });
  const updated = await store.findApplicationByPublicId(db, params.id);
  return jsonResponse(200, { application: store.rowToApplication(updated) });
});

route("GET", "/api/admin/applications/:id/receipt/:num", async (db, request, params) => {
  const session = await requireAuth(db, request, "admin");
  if (!session) return jsonResponse(401, { error: "No autorizado. Inicia sesión de nuevo." });
  const row = await store.findApplicationByPublicId(db, params.id);
  if (!row) return jsonResponse(404, { error: "Préstamo no encontrado." });
  const num = Number(params.num);
  const pagos = row.pagos ? JSON.parse(row.pagos) : [];
  const pago = pagos.find((p) => p.num === num);
  if (!pago) return jsonResponse(404, { error: "Cuota no encontrada." });
  const userRow = await store.findUserByPublicId(db, `U${row.user_id}`);
  return jsonResponse(200, {
    receipt: {
      recibo: `APP-${row.id}-${String(num).padStart(2, "0")}`,
      fechaEmision: nowLabel(),
      deudor: userRow ? { nombres: userRow.nombres, cedula: userRow.cedula, correo: userRow.correo } : null,
      prestamo: { id: `APP-${row.id}`, monto: row.monto, meses: row.meses, tasa: row.tasa },
      cuota: pago,
    },
  });
});

/* -------------------------------------------------------------- */
/*  Entry point del Worker                                          */
/* -------------------------------------------------------------- */

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return jsonResponse(204, {});
    }

    const url = new URL(request.url);
    const pathname = url.pathname;
    const query = Object.fromEntries(url.searchParams.entries());

    for (const r of routes) {
      if (r.method !== request.method) continue;
      const m = r.regex.exec(pathname);
      if (!m) continue;
      const params = {};
      r.paramNames.forEach((name, i) => (params[name] = decodeURIComponent(m[i + 1])));
      try {
        return await r.handler(env.DB, request, params, query);
      } catch (err) {
        console.error(err);
        return jsonResponse(500, { error: "Error interno del servidor." });
      }
    }
    return jsonResponse(404, { error: "Ruta no encontrada." });
  },
};
