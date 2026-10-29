/* ==================================================================
   RANTCLE — Configuration loader (replaces .env / dotenv)

   Settings come from, in order of priority:
     1. Windows / OS environment variables (optional overrides)
     2. config/rantcle.config.json  (private file created by `npm run setup`,
        excluded from Git)

   Nothing secret is ever hardcoded in the source code.
   ================================================================== */
const fs = require("fs");
const path = require("path");

const CONFIG_FILE = process.env.RANTCLE_CONFIG
  ? path.resolve(process.env.RANTCLE_CONFIG)
  : path.join(__dirname, "config", "rantcle.config.json");

const BCRYPT_RE = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/;

function readFile() {
  if (!fs.existsSync(CONFIG_FILE)) return { file: {}, error: null };
  try {
    return { file: JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8")), error: null };
  } catch (err) {
    return { file: {}, error: `config file is unreadable (${err.message})` };
  }
}

function load() {
  const { file: f, error: readError } = readFile();
  const fdb = f.database || {};
  const fadmin = f.admin || {};
  const env = process.env;
  const pick = (envVal, fileVal, fallback) =>
    envVal !== undefined && envVal !== "" ? envVal : fileVal !== undefined ? fileVal : fallback;

  const cfg = {
    port: Number(pick(env.PORT, f.port, 3000)) || 3000,
    trustProxy: String(pick(env.TRUST_PROXY, f.trustProxy, false)) === "1" ||
                String(pick(env.TRUST_PROXY, f.trustProxy, false)) === "true",
    database: {
      url: pick(env.DATABASE_URL, fdb.url, ""),
      host: pick(env.DB_HOST, fdb.host, "localhost"),
      port: Number(pick(env.DB_PORT, fdb.port, 5432)) || 5432,
      name: pick(env.DB_NAME, fdb.name, "rantcle"),
      user: pick(env.DB_USER, fdb.user, ""),
      password: pick(env.DB_PASSWORD, fdb.password, ""),
      ssl: String(pick(env.DB_SSL, fdb.ssl, false)) === "true"
    },
    admin: {
      username: pick(env.ADMIN_USERNAME, fadmin.username, ""),
      passwordHash: pick(env.ADMIN_PASSWORD_HASH, fadmin.passwordHash, "")
    },
    jwtSecret: pick(env.JWT_SECRET, f.jwtSecret, "")
  };

  const problems = [];
  if (readError) problems.push(readError);
  if (!cfg.admin.username) problems.push("admin username is not set");
  if (!BCRYPT_RE.test(cfg.admin.passwordHash)) problems.push("admin password hash is missing or not a valid bcrypt hash");
  if (!cfg.jwtSecret || cfg.jwtSecret.length < 32) problems.push("JWT secret is missing or shorter than 32 characters");
  if (!cfg.database.url && !cfg.database.user) problems.push("database user is not set");

  return { cfg, problems };
}

const { cfg, problems } = load();

module.exports = { ...cfg, CONFIG_FILE, problems, BCRYPT_RE };
