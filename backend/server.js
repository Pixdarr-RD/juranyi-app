require("dotenv").config();
const express = require("express");
const cors = require("cors");

const authRoutes = require("./routes/auth");
const applicationRoutes = require("./routes/applications");
const notificationRoutes = require("./routes/notifications");

const app = express();

// CORS_ORIGIN puede ser una URL única o varias separadas por coma
// (útil si tienes un dominio de preview y uno de producción en Render/Railway).
const corsOrigin = process.env.CORS_ORIGIN || "*";
const allowedOrigins = corsOrigin.split(",").map((o) => o.trim());
app.use(
  cors({
    origin: corsOrigin === "*" ? "*" : allowedOrigins,
  })
);
app.use(express.json());

app.get("/api/health", (req, res) => res.json({ ok: true, service: "juranyi-backend" }));

app.use("/api/auth", authRoutes);
app.use("/api/applications", applicationRoutes);
app.use("/api/notifications", notificationRoutes);

// 404 para rutas de API no encontradas
app.use("/api", (req, res) => res.status(404).json({ error: "Ruta no encontrada." }));

// Manejador de errores genérico
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Error interno del servidor." });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`✅ Juranyi backend corriendo en http://localhost:${PORT}`);
});
