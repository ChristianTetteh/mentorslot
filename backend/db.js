const { Pool } = require("pg");

const useSSL = process.env.PGSSL !== "false";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // rejectUnauthorized:false: managed Postgres poolers (Supabase's) present a
  // certificate chain Node's default CA store doesn't trust, so strict
  // verification fails the connection. The link is still encrypted, but the
  // server's identity isn't verified. To tighten it, pass the provider's CA
  // via `ca` and set rejectUnauthorized to true.
  ssl: useSSL ? { rejectUnauthorized: false } : false,
});

// An error on an *idle* pooled client (server restart, dropped connection)
// is emitted on the pool; with no listener Node treats it as uncaught and
// kills the process. Log it; pg discards the dead client and reconnects.
pool.on("error", (err) => {
  console.error("Unexpected error on idle database client:", err.message);
});

module.exports = pool;
