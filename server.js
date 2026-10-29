/* ==================================================================
   RANTCLE — Express API + static file server (PostgreSQL)
   ================================================================== */
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const express = require("express");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const { pool, withTransaction } = require("./db");

/* ---------- Config (from config.js: Windows env vars or config/rantcle.config.json) ---------- */
const config = require("./config");
if (config.problems.length) {
  console.error("\nRantcle is not configured yet:");
  config.problems.forEach((p) => console.error("  - " + p));
  console.error('\nRun this once to set it up:  npm run setup\n');
  process.exit(1);
}
const JWT_SECRET = config.jwtSecret;
const ADMIN_USERNAME = config.admin.username;
const ADMIN_PASSWORD_HASH = config.admin.passwordHash;

const PORT = config.port;
const UPLOAD_DIR = path.join(__dirname, "uploads");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const TYPES = ["Bike", "Scooter", "Car", "Electric Scooter", "Electric Bike", "Cycle"];
const FUELS = ["Petrol", "Diesel", "Electric", "Manual (Cycle)"];
const TRANSMISSIONS = ["Manual", "Automatic", "N/A"];
const STATUSES = ["Pending", "Accepted", "Rejected", "Completed"];
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

const app = express();
if (config.trustProxy) app.set("trust proxy", 1);
app.disable("x-powered-by");

app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      "script-src": ["'self'", "'unsafe-inline'"],
      "style-src": ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      "font-src": ["'self'", "https://fonts.gstatic.com"],
      "img-src": ["'self'", "data:", "https:"],
      "connect-src": ["'self'"],
      "upgrade-insecure-requests": null
    }
  }
}));
app.use(express.json({ limit: "3mb" }));

/* ---------- Helpers ---------- */
const ok = (res, data, status = 200) => res.status(status).json({ ok: true, data });
const fail = (res, status, error) => res.status(status).json({ ok: false, error });
const asyncRoute = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const num = (v) => (v === null || v === undefined ? null : Number(v));

function vehicleOut(r, admin) {
  const out = {
    id: String(r.id),
    vehicleName: r.vehicle_name,
    brand: r.brand,
    type: r.type,
    location: r.location,
    priceHour: num(r.price_hour),
    priceDay: num(r.price_day),
    fuel: r.fuel,
    transmission: r.transmission,
    description: r.description,
    image: r.image_path || "",
    availability: r.availability,
    rating: num(r.rating),
    createdAt: r.created_at.getTime()
  };
  if (admin) {
    out.ownerName = r.owner_name;
    out.phone = r.owner_phone;          // owner phone is never sent to the public
    out.vehicleNumber = r.vehicle_number || "";
  }
  return out;
}

function bookingOut(r) {
  return {
    id: String(r.id),
    vehicleId: r.vehicle_id === null ? null : String(r.vehicle_id),
    vehicleName: r.vehicle_name,
    customerName: r.customer_name,
    phone: r.phone,
    pickup: r.pickup,
    drop: r.drop_location,
    duration: r.duration_hours,
    totalAmount: num(r.total_amount),
    status: r.status,
    createdAt: r.created_at.getTime()
  };
}

class ValidationError extends Error {}

function reqString(v, label, max, { required = true } = {}) {
  const s = typeof v === "string" ? v.trim() : "";
  if (!s) {
    if (required) throw new ValidationError(`${label} is required`);
    return "";
  }
  if (s.length > max) throw new ValidationError(`${label} must be at most ${max} characters`);
  return s;
}

function reqPhone(v, label = "Phone number") {
  const s = reqString(v, label, 20).replace(/[\s-]/g, "");
  if (!/^\+?[0-9]{7,15}$/.test(s)) throw new ValidationError(`${label} must be 7-15 digits`);
  return s;
}

function reqMoney(v, label) {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || n > 10000000) throw new ValidationError(`${label} must be a number of 0 or more`);
  return Math.round(n * 100) / 100;
}

function reqOneOf(v, list, label) {
  if (!list.includes(v)) throw new ValidationError(`${label} is invalid`);
  return v;
}

/* Decode a "data:image/...;base64,..." string, save it under uploads/, return its public path. */
function saveImage(dataUrl) {
  if (!dataUrl) return null;
  const m = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!m) throw new ValidationError("Image must be a JPEG, PNG or WebP");
  const buf = Buffer.from(m[2], "base64");
  if (buf.length === 0 || buf.length > MAX_IMAGE_BYTES) throw new ValidationError("Image must be under 2 MB");
  const ext = m[1] === "jpeg" ? "jpg" : m[1];
  const name = crypto.randomUUID() + "." + ext;
  fs.writeFileSync(path.join(UPLOAD_DIR, name), buf);
  return "/uploads/" + name;
}

function removeImage(imagePath) {
  if (!imagePath || !imagePath.startsWith("/uploads/")) return;
  const file = path.join(UPLOAD_DIR, path.basename(imagePath));
  fs.unlink(file, () => {});
}

function reqId(v) {
  if (!/^\d{1,18}$/.test(String(v))) throw new ValidationError("Invalid id");
  return String(v);
}

/* ---------- Rate limiters ---------- */
const writeLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 60, standardHeaders: true, legacyHeaders: false,
  message: { ok: false, error: "Too many requests, please try again later" } });
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false,
  message: { ok: false, error: "Too many login attempts, please try again later" } });

/* ---------- Auth ---------- */
const sha = (s) => crypto.createHash("sha256").update(String(s)).digest();

function requireAdmin(req, res, next) {
  const h = req.headers.authorization || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : "";
  try {
    const payload = jwt.verify(token, JWT_SECRET, { algorithms: ["HS256"] });
    if (payload.role !== "admin") throw new Error("not admin");
    next();
  } catch (_) {
    fail(res, 401, "Please log in as admin");
  }
}

const api = express.Router();

api.post("/admin/login", loginLimiter, asyncRoute(async (req, res) => {
  const { username, password } = req.body || {};
  const userOk = crypto.timingSafeEqual(sha(username || ""), sha(ADMIN_USERNAME));
  const passOk = await bcrypt.compare(String(password || ""), ADMIN_PASSWORD_HASH);
  if (!userOk || !passOk) return fail(res, 401, "Wrong username or password");
  const token = jwt.sign({ role: "admin" }, JWT_SECRET, { algorithm: "HS256", expiresIn: "8h" });
  ok(res, { token });
}));

/* ---------- Health ---------- */
api.get("/health", asyncRoute(async (_req, res) => {
  await pool.query("SELECT 1");
  ok(res, { status: "up" });
}));

/* ---------- Vehicles (public) ---------- */
const VEHICLE_SELECT = `
  SELECT v.*, o.name AS owner_name, o.phone AS owner_phone
  FROM vehicles v JOIN owners o ON o.id = v.owner_id`;

api.get("/vehicles", asyncRoute(async (_req, res) => {
  const { rows } = await pool.query(`${VEHICLE_SELECT} ORDER BY v.created_at DESC LIMIT 500`);
  ok(res, rows.map((r) => vehicleOut(r, false)));
}));

api.post("/vehicles", writeLimiter, asyncRoute(async (req, res) => {
  const b = req.body || {};
  let imagePath = null;
  try {
    const ownerName = reqString(b.ownerName, "Owner name", 100);
    const phone = reqPhone(b.phone);
    const vehicleName = reqString(b.vehicleName, "Vehicle name", 100);
    const brand = reqString(b.brand, "Brand", 60);
    const type = reqOneOf(b.type, TYPES, "Vehicle type");
    const vehicleNumber = reqString(b.vehicleNumber, "Vehicle number", 20, { required: false })
      .replace(/\s+/g, "").toUpperCase() || null;
    const location = reqString(b.location, "Location", 120);
    const priceHour = reqMoney(b.priceHour, "Price per hour");
    const priceDay = reqMoney(b.priceDay, "Price per day");
    const fuel = reqOneOf(b.fuel || "Petrol", FUELS, "Fuel type");
    const transmission = reqOneOf(b.transmission || "Manual", TRANSMISSIONS, "Transmission");
    const description = reqString(b.description, "Description", 1000, { required: false });
    const availability = b.availability === false || b.availability === "false" ? false : true;
    imagePath = saveImage(b.image);

    const row = await withTransaction(async (client) => {
      // Keep the first name used for a phone number; the phone is the owner's identity.
      const o = await client.query(
        `INSERT INTO owners (name, phone) VALUES ($1, $2)
         ON CONFLICT (phone) DO UPDATE SET name = owners.name
         RETURNING id`, [ownerName, phone]);
      const v = await client.query(
        `INSERT INTO vehicles (owner_id, vehicle_name, brand, type, vehicle_number, location,
                               price_hour, price_day, fuel, transmission, description, image_path, availability)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
         RETURNING id`,
        [o.rows[0].id, vehicleName, brand, type, vehicleNumber, location,
         priceHour, priceDay, fuel, transmission, description, imagePath, availability]);
      const full = await client.query(`${VEHICLE_SELECT} WHERE v.id = $1`, [v.rows[0].id]);
      return full.rows[0];
    });
    ok(res, vehicleOut(row, false), 201);
  } catch (err) {
    removeImage(imagePath);
    if (err instanceof ValidationError) return fail(res, 400, err.message);
    if (err.code === "23505") return fail(res, 409, "A vehicle with this vehicle number is already listed");
    throw err;
  }
}));

/* ---------- Vehicles (admin) ---------- */
api.get("/admin/vehicles", requireAdmin, asyncRoute(async (_req, res) => {
  const { rows } = await pool.query(`${VEHICLE_SELECT} ORDER BY v.created_at DESC`);
  ok(res, rows.map((r) => vehicleOut(r, true)));
}));

api.patch("/admin/vehicles/:id", requireAdmin, asyncRoute(async (req, res) => {
  try {
    const id = reqId(req.params.id);
    const b = req.body || {};
    const priceHour = reqMoney(b.priceHour, "Price per hour");
    const priceDay = reqMoney(b.priceDay, "Price per day");
    if (typeof b.availability !== "boolean") throw new ValidationError("Availability must be true or false");
    const { rowCount } = await pool.query(
      `UPDATE vehicles SET price_hour = $2, price_day = $3, availability = $4 WHERE id = $1`,
      [id, priceHour, priceDay, b.availability]);
    if (!rowCount) return fail(res, 404, "Vehicle not found");
    ok(res, { id });
  } catch (err) {
    if (err instanceof ValidationError) return fail(res, 400, err.message);
    throw err;
  }
}));

api.delete("/admin/vehicles/:id", requireAdmin, asyncRoute(async (req, res) => {
  let id;
  try { id = reqId(req.params.id); } catch (e) { return fail(res, 400, e.message); }
  const { rows } = await pool.query("DELETE FROM vehicles WHERE id = $1 RETURNING image_path", [id]);
  if (!rows.length) return fail(res, 404, "Vehicle not found");
  removeImage(rows[0].image_path);
  ok(res, { id });
}));

/* ---------- Bookings ---------- */
api.post("/bookings", writeLimiter, asyncRoute(async (req, res) => {
  try {
    const b = req.body || {};
    const vehicleId = reqId(b.vehicleId);
    const customerName = reqString(b.customerName, "Your name", 100);
    const phone = reqPhone(b.phone);
    const pickup = reqString(b.pickup, "Pickup", 120);
    const drop = reqString(b.drop, "Drop", 120, { required: false });
    const hours = Number(b.duration);
    if (!Number.isInteger(hours) || hours < 1 || hours > 720) throw new ValidationError("Duration must be 1-720 hours");

    // Price comes from the database, never from the browser.
    const { rows } = await pool.query(
      `INSERT INTO bookings (vehicle_id, vehicle_name, customer_name, phone, pickup, drop_location,
                             duration_hours, total_amount)
       SELECT v.id, v.vehicle_name, $2, $3, $4, $5, $6::int, $6::int * v.price_hour
       FROM vehicles v WHERE v.id = $1 AND v.availability
       RETURNING *`,
      [vehicleId, customerName, phone, pickup, drop, hours]);
    if (!rows.length) {
      const exists = await pool.query("SELECT 1 FROM vehicles WHERE id = $1", [vehicleId]);
      return exists.rowCount ? fail(res, 409, "This vehicle is not available right now")
                             : fail(res, 404, "Vehicle not found");
    }
    ok(res, bookingOut(rows[0]), 201);
  } catch (err) {
    if (err instanceof ValidationError) return fail(res, 400, err.message);
    throw err;
  }
}));

api.get("/admin/bookings", requireAdmin, asyncRoute(async (_req, res) => {
  const { rows } = await pool.query("SELECT * FROM bookings ORDER BY created_at DESC");
  ok(res, rows.map(bookingOut));
}));

api.patch("/admin/bookings/:id/status", requireAdmin, asyncRoute(async (req, res) => {
  try {
    const id = reqId(req.params.id);
    const status = reqOneOf((req.body || {}).status, STATUSES, "Status");
    const { rowCount } = await pool.query("UPDATE bookings SET status = $2 WHERE id = $1", [id, status]);
    if (!rowCount) return fail(res, 404, "Booking not found");
    ok(res, { id, status });
  } catch (err) {
    if (err instanceof ValidationError) return fail(res, 400, err.message);
    throw err;
  }
}));

api.delete("/admin/bookings/:id", requireAdmin, asyncRoute(async (req, res) => {
  let id;
  try { id = reqId(req.params.id); } catch (e) { return fail(res, 400, e.message); }
  const { rowCount } = await pool.query("DELETE FROM bookings WHERE id = $1", [id]);
  if (!rowCount) return fail(res, 404, "Booking not found");
  ok(res, { id });
}));

api.use((_req, res) => fail(res, 404, "Not found"));
app.use("/api", api);

/* ---------- Static files ---------- */
app.use("/uploads", express.static(UPLOAD_DIR, { fallthrough: false, index: false }));
app.use(express.static(path.join(__dirname, "public")));

/* ---------- Error handler ---------- */
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
  if (err.type === "entity.too.large") return fail(res, 413, "Request is too large");
  if (err.type === "entity.parse.failed") return fail(res, 400, "Invalid JSON");
  if (err.status === 404) return fail(res, 404, "Not found");
  console.error(err);
  const dbDown = ["ECONNREFUSED", "ETIMEDOUT", "ENOTFOUND", "57P01"].includes(err.code);
  fail(res, dbDown ? 503 : 500, dbDown ? "Database is unavailable, please try again shortly" : "Something went wrong");
});

const server = app.listen(PORT, () => console.log(`Rantcle running on http://localhost:${PORT}`));

function shutdown() {
  server.close(() => pool.end().then(() => process.exit(0)));
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
