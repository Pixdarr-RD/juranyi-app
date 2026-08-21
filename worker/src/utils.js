/* ======================================================================
   Utilidades compartidas: hashing de contraseñas, tokens, JSON, fechas.
   Todo implementado con Web Crypto (disponible nativamente en Workers) —
   Node's crypto.scryptSync no existe en el runtime de Cloudflare, así que
   usamos PBKDF2-SHA256 vía crypto.subtle, que sí está soportado.
   ====================================================================== */

const PBKDF2_ITERATIONS = 100000;
const KEY_LENGTH_BITS = 256;

function bytesToHex(bytes) {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}

async function hashPassword(password, saltHex) {
  const salt = saltHex ? hexToBytes(saltHex) : crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    keyMaterial,
    KEY_LENGTH_BITS
  );
  return { hash: bytesToHex(new Uint8Array(bits)), salt: bytesToHex(salt) };
}

async function verifyPassword(password, saltHex, hashHex) {
  const { hash } = await hashPassword(password, saltHex);
  // Comparación en tiempo constante
  if (hash.length !== hashHex.length) return false;
  let diff = 0;
  for (let i = 0; i < hash.length; i++) diff |= hash.charCodeAt(i) ^ hashHex.charCodeAt(i);
  return diff === 0;
}

function newToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return bytesToHex(bytes);
}

function nowLabel() {
  return new Date().toLocaleDateString("es-DO", { year: "numeric", month: "long", day: "numeric" });
}

function todayPlusMonths(n) {
  const d = new Date();
  d.setMonth(d.getMonth() + n);
  return d.toLocaleDateString("es-DO", { year: "numeric", month: "long", day: "numeric" });
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

function rateForTerm(months) {
  return { 3: 28, 6: 24, 12: 22, 18: 20 }[months] || 24;
}

function simulateLoan(monto, meses) {
  const tasa = rateForTerm(meses);
  const interes = monto * (tasa / 100) * (meses / 12);
  const total = monto + interes;
  const cuota = total / meses;
  return { tasa, interes: round2(interes), total: round2(total), cuota: round2(cuota) };
}

function buildPagos(meses, cuota) {
  const pagos = [];
  for (let i = 1; i <= meses; i++) {
    pagos.push({ num: i, fecha: todayPlusMonths(i), cuota, estado: "Pendiente" });
  }
  return pagos;
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
};

function jsonResponse(status, obj, extraHeaders) {
  const headers = Object.assign({}, CORS_HEADERS, extraHeaders || {});
  // Los status 204/205/304 no pueden llevar body según la Fetch API
  // (a diferencia de Node's http, que sí lo permitía).
  if (status === 204 || status === 205 || status === 304) {
    return new Response(null, { status, headers });
  }
  headers["Content-Type"] = "application/json; charset=utf-8";
  return new Response(JSON.stringify(obj), { status, headers });
}

async function readJsonBody(request) {
  const text = await request.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error("JSON inválido");
  }
}

// IDs públicos con prefijo, ej. "U3", "APP-12", "N7". El id numérico real
// (rowid de D1/AUTOINCREMENT) queda oculto detrás del prefijo.
function publicId(prefix, numericId) {
  return `${prefix}${numericId}`;
}

function parseNumericId(prefix, publicIdStr) {
  if (!publicIdStr || !publicIdStr.startsWith(prefix)) return null;
  const n = Number(publicIdStr.slice(prefix.length));
  return Number.isFinite(n) ? n : null;
}

export {
  hashPassword,
  verifyPassword,
  newToken,
  nowLabel,
  todayPlusMonths,
  round2,
  rateForTerm,
  simulateLoan,
  buildPagos,
  jsonResponse,
  readJsonBody,
  publicId,
  parseNumericId,
};
