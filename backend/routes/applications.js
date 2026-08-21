const express = require("express");
const db = require("../db");
const { requireAuth } = require("../middleware/auth");
const { simulateLoan, genPagos, genApplicationId, fmtDate, MILESTONES } = require("../utils/loan");

const router = express.Router();
router.use(requireAuth);

function notify(userId, title, subtitle, type = "info") {
  db.prepare(
    `INSERT INTO notifications (user_id, title, subtitle, type) VALUES (?, ?, ?, ?)`
  ).run(userId, title, subtitle, type);
}

function serializeApp(row) {
  const pagos = db
    .prepare("SELECT num, fecha, cuota, estado FROM payments WHERE application_id = ? ORDER BY num")
    .all(row.id);
  return {
    id: row.id,
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
    user: {
      nombres: row.nombres,
      cedula: row.cedula,
      telefono: row.telefono,
      direccion: row.direccion,
      fechaNacimiento: row.fecha_nacimiento,
      estadoCivil: row.estado_civil,
    },
    pagos,
  };
}

// POST /api/applications/simulate  { monto, meses } -> cálculo server-side
router.post("/simulate", (req, res) => {
  const { monto, meses } = req.body || {};
  const montoNum = Number(monto);
  const mesesNum = Number(meses);
  if (!montoNum || montoNum < 1000 || montoNum > 100000) {
    return res.status(400).json({ error: "El monto debe estar entre RD$1,000 y RD$100,000." });
  }
  const sim = simulateLoan(montoNum, mesesNum);
  if (!sim) return res.status(400).json({ error: "Plazo inválido. Usa 3, 6, 12 o 18 meses." });
  res.json({ monto: montoNum, meses: mesesNum, ...sim });
});

// POST /api/applications  { monto, meses, formData } -> crea una solicitud
router.post("/", (req, res) => {
  const { monto, meses, formData } = req.body || {};
  const montoNum = Number(monto);
  const mesesNum = Number(meses);
  const sim = simulateLoan(montoNum, mesesNum);
  if (!sim) return res.status(400).json({ error: "Datos de préstamo inválidos." });

  const existingPending = db
    .prepare("SELECT id FROM applications WHERE user_id = ? AND estado = 'en_evaluacion'")
    .get(req.userId);
  if (existingPending) {
    return res.status(409).json({ error: "Ya tienes una solicitud en evaluación.", applicationId: existingPending.id });
  }

  const id = genApplicationId();
  const fechaSolicitud = `${fmtDate(new Date())} · ${new Date().toLocaleTimeString("es-DO", { hour: "2-digit", minute: "2-digit" })}`;
  const f = formData || {};

  db.prepare(
    `INSERT INTO applications
      (id, user_id, monto, meses, tasa, interes, total, cuota, estado, milestone_index, fecha_solicitud,
       nombres, cedula, telefono, direccion, fecha_nacimiento, estado_civil)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'en_evaluacion', 0, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id, req.userId, montoNum, mesesNum, sim.tasa, sim.interes, sim.total, sim.cuota, fechaSolicitud,
    f.nombres || "", f.cedula || "", f.telefono || "", f.direccion || "", f.fechaNacimiento || "", f.estadoCivil || ""
  );

  notify(req.userId, "Solicitud enviada", `Tu solicitud #${id} fue recibida.`, "info");

  const row = db.prepare("SELECT * FROM applications WHERE id = ?").get(id);
  res.status(201).json({ application: serializeApp(row) });
});

// GET /api/applications -> todas las del usuario (activas/en evaluación)
router.get("/", (req, res) => {
  const rows = db
    .prepare("SELECT * FROM applications WHERE user_id = ? ORDER BY rowid DESC")
    .all(req.userId);
  res.json({ applications: rows.map(serializeApp) });
});

// GET /api/applications/history -> préstamos pagados
router.get("/history", (req, res) => {
  const rows = db
    .prepare("SELECT * FROM applications WHERE user_id = ? AND estado = 'pagado' ORDER BY fecha_aprobacion DESC")
    .all(req.userId);
  res.json({
    history: rows.map((r) => ({
      id: r.id,
      monto: r.monto,
      totalPagado: r.total,
      fecha: r.fecha_aprobacion,
    })),
  });
});

// GET /api/applications/:id
router.get("/:id", (req, res) => {
  const row = db.prepare("SELECT * FROM applications WHERE id = ? AND user_id = ?").get(req.params.id, req.userId);
  if (!row) return res.status(404).json({ error: "Solicitud no encontrada." });
  res.json({ application: serializeApp(row) });
});

// POST /api/applications/:id/advance -> modo demo: avanza al siguiente hito
router.post("/:id/advance", (req, res) => {
  const row = db.prepare("SELECT * FROM applications WHERE id = ? AND user_id = ?").get(req.params.id, req.userId);
  if (!row) return res.status(404).json({ error: "Solicitud no encontrada." });
  if (row.estado !== "en_evaluacion") {
    return res.status(400).json({ error: "Esta solicitud ya no está en evaluación." });
  }

  const nextIdx = row.milestone_index + 1;

  if (nextIdx >= MILESTONES.length) {
    const fechaAprobacion = fmtDate(new Date());
    const pagos = genPagos(new Date(), row.meses, row.cuota);
    const insertPago = db.prepare(
      `INSERT INTO payments (application_id, num, fecha, cuota, estado) VALUES (?, ?, ?, ?, ?)`
    );
    const tx = db.transaction(() => {
      db.prepare(
        `UPDATE applications SET estado = 'activo', milestone_index = ?, fecha_aprobacion = ? WHERE id = ?`
      ).run(nextIdx, fechaAprobacion, row.id);
      for (const p of pagos) insertPago.run(row.id, p.num, p.fecha, p.cuota, p.estado);
    });
    tx();
    notify(req.userId, "¡Tu préstamo fue aprobado! 🎉", `RD$ ${row.monto.toLocaleString("es-DO")} han sido desembolsados.`, "success");
  } else {
    db.prepare(`UPDATE applications SET milestone_index = ? WHERE id = ?`).run(nextIdx, row.id);
    notify(req.userId, "Actualización de solicitud", MILESTONES[nextIdx], "info");
  }

  const updated = db.prepare("SELECT * FROM applications WHERE id = ?").get(row.id);
  res.json({ application: serializeApp(updated) });
});

// POST /api/applications/:id/payments/:num/pay -> marca una cuota como pagada
router.post("/:id/payments/:num/pay", (req, res) => {
  const row = db.prepare("SELECT * FROM applications WHERE id = ? AND user_id = ?").get(req.params.id, req.userId);
  if (!row) return res.status(404).json({ error: "Préstamo no encontrado." });
  if (row.estado !== "activo") return res.status(400).json({ error: "Este préstamo no está activo." });

  const num = Number(req.params.num);
  const pago = db
    .prepare("SELECT * FROM payments WHERE application_id = ? AND num = ?")
    .get(row.id, num);
  if (!pago) return res.status(404).json({ error: "Cuota no encontrada." });
  if (pago.estado === "Pagado") return res.status(400).json({ error: "Esta cuota ya fue pagada." });

  // Solo se permite pagar la próxima cuota pendiente, en orden
  const nextPending = db
    .prepare("SELECT num FROM payments WHERE application_id = ? AND estado = 'Pendiente' ORDER BY num LIMIT 1")
    .get(row.id);
  if (nextPending.num !== num) {
    return res.status(400).json({ error: "Debes pagar las cuotas en orden." });
  }

  db.prepare("UPDATE payments SET estado = 'Pagado' WHERE application_id = ? AND num = ?").run(row.id, num);
  notify(req.userId, "Pago recibido", `Hemos recibido tu pago de RD$ ${pago.cuota.toLocaleString("es-DO")}.`, "success");

  const remaining = db
    .prepare("SELECT COUNT(*) AS n FROM payments WHERE application_id = ? AND estado = 'Pendiente'")
    .get(row.id);

  if (remaining.n === 0) {
    db.prepare("UPDATE applications SET estado = 'pagado' WHERE id = ?").run(row.id);
    notify(req.userId, "¡Préstamo liquidado! 🎉", "Terminaste de pagar tu préstamo. ¡Gracias por confiar en Juranyi!", "success");
  }

  const updated = db.prepare("SELECT * FROM applications WHERE id = ?").get(row.id);
  res.json({ application: serializeApp(updated) });
});

module.exports = router;
