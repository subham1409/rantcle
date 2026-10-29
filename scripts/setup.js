/* ==================================================================
   RANTCLE — One-time setup wizard   (run:  npm run setup)

   Asks for your PostgreSQL connection details and the admin login,
   then writes config/rantcle.config.json (private, excluded from Git).

   - The admin password is stored ONLY as a bcrypt hash.
   - The JWT secret is generated here with crypto.randomBytes and saved,
     so admin logins keep working after the server restarts.
   - Re-running setup keeps your existing values (press Enter) and keeps
     the same JWT secret, unless you pass --rotate-secret.
   ================================================================== */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const readline = require("readline");
const { execFileSync } = require("child_process");
const bcrypt = require("bcryptjs");
const { Pool } = require("pg");

const CONFIG_FILE = process.env.RANTCLE_CONFIG
  ? path.resolve(process.env.RANTCLE_CONFIG)
  : path.join(__dirname, "..", "config", "rantcle.config.json");
const ROTATE = process.argv.includes("--rotate-secret");

/* ---------- Tiny prompt helper (supports hidden password entry) ---------- */
const isTTY = !!process.stdin.isTTY;
const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: isTTY });
let muted = false;
const origWrite = rl._writeToOutput.bind(rl);
rl._writeToOutput = (s) => { if (!muted) origWrite(s); };

const queue = [];
const waiters = [];
let closed = false;
rl.on("line", (l) => (waiters.length ? waiters.shift()(l) : queue.push(l)));
rl.on("close", () => { closed = true; waiters.splice(0).forEach((w) => w(null)); });

function ask(question, { hidden = false } = {}) {
  process.stdout.write(question);
  muted = hidden;
  return new Promise((resolve) => {
    const done = (v) => {
      muted = false;
      if (hidden || !isTTY) process.stdout.write("\n");
      resolve(v === null ? "" : v.trim());
    };
    if (queue.length) done(queue.shift());
    else if (closed) done(null);
    else waiters.push(done);
  });
}

async function askDefault(label, def) {
  const a = await ask(`${label}${def !== undefined && def !== "" ? ` [${def}]` : ""}: `);
  return a || (def === undefined ? "" : String(def));
}

/* ---------- Load existing config (so re-running keeps your values) ---------- */
let old = {};
try { old = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8")); } catch (_) { /* first run */ }
const od = old.database || {};
const oa = old.admin || {};

function restrictFile(file) {
  try { fs.chmodSync(file, 0o600); } catch (_) { /* not supported on Windows */ }
  if (process.platform === "win32" && process.env.USERNAME) {
    try {
      // Remove inherited permissions and give only the current Windows user access.
      execFileSync("icacls", [file, "/inheritance:r", "/grant:r", `${process.env.USERNAME}:(R,W)`], { stdio: "ignore" });
    } catch (_) {
      console.log("  (Could not tighten file permissions automatically; keep this file private.)");
    }
  }
}

async function main() {
  console.log("\n=== Rantcle setup ===");
  console.log(fs.existsSync(CONFIG_FILE)
    ? "Existing configuration found. Press Enter to keep the value shown in [brackets].\n"
    : "No configuration yet. Let's create it. Press Enter to accept the value in [brackets].\n");

  console.log("-- PostgreSQL connection (the app user from db/01_app_user.sql) --");
  const host = await askDefault("Database host", od.host || "localhost");
  const port = Number(await askDefault("Database port", od.port || 5432)) || 5432;
  const name = await askDefault("Database name", od.name || "rantcle");
  const user = await askDefault("Database user", od.user || "rantcle_app");

  let dbPassword = await ask(
    `Database password${od.password ? " (Enter = keep current)" : ""}: `, { hidden: true });
  if (!dbPassword) dbPassword = od.password || "";
  const ssl = /^y/i.test(await askDefault("Use SSL for the database? (y/N)", od.ssl ? "y" : "n"));

  console.log("\n-- Admin login for /admin.html --");
  const username = await askDefault("Admin username", oa.username || "admin");

  let passwordHash = oa.passwordHash || "";
  for (;;) {
    const p1 = await ask(
      `Admin password (min 8 characters)${passwordHash ? " (Enter = keep current)" : ""}: `, { hidden: true });
    if (!p1 && passwordHash) break;
    if (p1.length < 8) { console.log("  Password must be at least 8 characters. Try again."); continue; }
    const p2 = await ask("Repeat admin password: ", { hidden: true });
    if (p1 !== p2) { console.log("  Passwords did not match. Try again."); continue; }
    passwordHash = bcrypt.hashSync(p1, 12);   // only the hash is ever saved
    break;
  }

  // JWT secret: keep the existing one so logged-in admins survive restarts.
  let jwtSecret = old.jwtSecret;
  if (ROTATE || !jwtSecret || jwtSecret.length < 32) {
    jwtSecret = crypto.randomBytes(48).toString("hex");
    console.log(ROTATE && old.jwtSecret
      ? "\nNew JWT secret generated (everyone will have to log in again)."
      : "\nJWT secret generated.");
  } else {
    console.log("\nKeeping your existing JWT secret (admin sessions stay valid).");
  }

  const config = {
    port: old.port || 3000,
    trustProxy: !!old.trustProxy,
    database: { host, port, name, user, password: dbPassword, ssl },
    admin: { username, passwordHash },
    jwtSecret
  };

  // Write atomically, then lock the file down.
  fs.mkdirSync(path.dirname(CONFIG_FILE), { recursive: true });
  const tmp = CONFIG_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(config, null, 2) + "\n", { mode: 0o600 });
  fs.renameSync(tmp, CONFIG_FILE);
  restrictFile(CONFIG_FILE);
  console.log(`\nSaved: ${CONFIG_FILE}`);

  // Check the database connection so problems show up now, not at npm start.
  process.stdout.write("Testing database connection... ");
  const pool = new Pool({ host, port, database: name, user, password: dbPassword,
    ssl: ssl ? { rejectUnauthorized: false } : undefined, connectionTimeoutMillis: 5000 });
  try {
    await pool.query("SELECT 1 FROM vehicles LIMIT 1");
    console.log("OK");
  } catch (err) {
    console.log("FAILED");
    console.log(`  ${err.message}`);
    console.log("  Settings were saved anyway. Fix the database (tables created? password right?) and run: npm start");
  } finally {
    await pool.end().catch(() => {});
  }

  console.log("\nSetup complete. Start the website with:  npm start\n");
}

main()
  .catch((err) => { console.error("Setup failed:", err.message); process.exitCode = 1; })
  .finally(() => rl.close());
