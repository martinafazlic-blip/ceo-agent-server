import { readFile, writeFile, readdir, mkdir, unlink } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { randomBytes } from "crypto";
import { DEFAULT_AGENTS } from "./agents.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TENANTS_DIR = path.join(__dirname, "..", "data", "tenants");

// NOTA: un file JSON per azienda va bene per un MVP con poche decine di clienti.
// Per una vera scala SaaS, sostituire con Postgres (Supabase/Neon) e una riga per tenant.

function tenantFile(tenantId) {
  return path.join(TENANTS_DIR, `${tenantId}.json`);
}

async function ensureDir() {
  if (!existsSync(TENANTS_DIR)) await mkdir(TENANTS_DIR, { recursive: true });
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
  await ensureDir();
  const base = slugify(profile.name);
  let tenantId = base;
  let n = 1;
  while (existsSync(tenantFile(tenantId))) tenantId = `${base}-${n++}`;

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
  return state;
}

export async function loadTenant(tenantId) {
  const file = tenantFile(tenantId);
  if (!existsSync(file)) return null;
  const raw = await readFile(file, "utf-8");
  try { return JSON.parse(raw); } catch { return null; }
}

export async function saveTenant(tenantId, state) {
  await ensureDir();
  await writeFile(tenantFile(tenantId), JSON.stringify(state, null, 2), "utf-8");
}

export async function listTenantIds() {
  await ensureDir();
  const files = await readdir(TENANTS_DIR);
  return files.filter(f => f.endsWith(".json")).map(f => f.replace(/\.json$/, ""));
}

export async function deleteTenant(tenantId) {
  const file = tenantFile(tenantId);
  if (!existsSync(file)) return false;
  await unlink(file);
  return true;
}

