const express = require("express");
const db = require("../db");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

function timeAgo(createdAt) {
  const then = new Date(createdAt.replace(" ", "T") + "Z").getTime();
  const diffMin = Math.max(0, Math.round((Date.now() - then) / 60000));
  if (diffMin < 1) return "Ahora";
  if (diffMin < 60) return `Hace ${diffMin} min`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `Hace ${diffH} h`;
  return `Hace ${Math.round(diffH / 24)} d`;
}

router.get("/", (req, res) => {
  const rows = db
    .prepare("SELECT * FROM notifications WHERE user_id = ? ORDER BY id DESC")
    .all(req.userId);
  res.json({
    notifications: rows.map((r) => ({
      id: r.id,
      title: r.title,
      subtitle: r.subtitle,
      type: r.type,
      read: !!r.read,
      time: timeAgo(r.created_at),
    })),
  });
});

router.post("/read-all", (req, res) => {
  db.prepare("UPDATE notifications SET read = 1 WHERE user_id = ?").run(req.userId);
  res.json({ ok: true });
});

module.exports = router;
