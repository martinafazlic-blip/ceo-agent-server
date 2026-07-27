import pg from "pg";
import { randomBytes } from "crypto";
import { DEFAULT_AGENTS } from "./agents.js";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  console.error("ATTENZIONE: DATABASE_URL non impostata. I dati NON verranno salvati in modo permanente.");
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

let ready = false;
async function ensureTable() {
  if (ready) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tenants (
      tenant_id TEXT PRIMARY KEY,
      data JSONB NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT now()
    )
  `);
  ready = true;
}

function slugify(name) {
  return (
    name.toLowerCase().trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 40) || "azienda"
  );
}

export async function createTenant(profile) {
  await ensureTable();
  const base = slugify(profile.name);
  let tenantId = base;
  let n = 1;
  let nameAlreadyUsed = false;
  while ((await loadTenant(tenantId)) !== null) { tenantId = `${base}-${n++}`; nameAlreadyUsed = true; }

  const state = {
    tenantId,
    apiKey: randomBytes(24).toString("hex"),
    profile,
    agents: JSON.parse(JSON.stringify(DEFAULT_AGENTS)),
    objectives: [],
    auditLog: [],
    dailyReports: {}
  };
  await saveTenant(tenantId, state);
  return { ...state, nameAlreadyUsed };
}

export async function loadTenant(tenantId) {
  await ensureTable();
  const res = await pool.query("SELECT data FROM tenants WHERE tenant_id = $1", [tenantId]);
  if (res.rows.length === 0) return null;
  return res.rows[0].data;
}

export async function saveTenant(tenantId, state) {
  await ensureTable();
  await pool.query(
    `INSERT INTO tenants (tenant_id, data, updated_at) VALUES ($1, $2, now())
     ON CONFLICT (tenant_id) DO UPDATE SET data = $2, updated_at = now()`,
    [tenantId, state]
  );
}

export async function listTenantIds() {
  await ensureTable();
  const res = await pool.query("SELECT tenant_id FROM tenants ORDER BY updated_at DESC");
  return res.rows.map(r => r.tenant_id);
}

export async function deleteTenant(tenantId) {
  await ensureTable();
  const res = await pool.query("DELETE FROM tenants WHERE tenant_id = $1", [tenantId]);
  return res.rowCount > 0;
}
