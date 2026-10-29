// PostgreSQL connection pool. Settings come from config.js (never hardcoded here).
const { Pool } = require("pg");

const config = require("./config");
const db = config.database;

const ssl = db.ssl ? { rejectUnauthorized: false } : undefined;

const pool = new Pool(
  db.url
    ? { connectionString: db.url, ssl, max: 10 }
    : {
        host: db.host,
        port: db.port,
        database: db.name,
        user: db.user,
        password: db.password,
        ssl,
        max: 10,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000
      }
);

// An idle client erroring (e.g. DB restarted) must not crash the process.
pool.on("error", (err) => console.error("Unexpected PostgreSQL pool error:", err.message));

// Run several queries as one all-or-nothing transaction.
async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    try { await client.query("ROLLBACK"); } catch (_) { /* ignore */ }
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { pool, withTransaction };
