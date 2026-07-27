import "dotenv/config";
import express from "express";
import cors from "cors";
import cron from "node-cron";
import { createTenant, loadTenant, saveTenant, listTenantIds, deleteTenant } from "./lib/store.js";
import { breakdownObjective, executeTask, buildApprovalRequest, generateDailyReport } from "./lib/ceoAgent.js";

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static("public"));

const PORT = process.env.PORT || 3000;
const CRON_EXPR = process.env.DAILY_REPORT_CRON || "0 8 * * *";
const TZ = process.env.TIMEZONE || "Europe/Rome";

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function publicState(state) {
  const { apiKey, ...rest } = state;
  return rest;
}

// ---------- registrazione nuova azienda ----------

app.post("/api/register", async (req, res) => {
  const { name, sector, products, budgetMax, riskLevel, approvalThreshold, logo } = req.body;
  if (!name) return res.status(400).json({ error: "Il nome azienda e' obbligatorio" });
  const profile = {
    name,
    sector: sector || "non specificato",
    products: products || "non specificato",
    budgetMax: budgetMax || "0",
    riskLevel: riskLevel || "medio",
    approvalThreshold: approvalThreshold || "0",
    logo: logo || null // data URL (es. "data:image/png;base64,...") o URL pubblica
  };
  const state = await createTenant(profile);
  res.json({
    tenantId: state.tenantId,
    apiKey: state.apiKey,
    profile: state.profile,
    nameAlreadyUsed: state.nameAlreadyUsed,
    avviso: "Salva subito questa apiKey: serve per ogni chiamata futura e non verra' piu' mostrata."
  });
});

// ---------- middleware di autenticazione per-azienda ----------

async function tenantAuth(req, res, next) {
  const state = await loadTenant(req.params.tenantId);
  if (!state) return res.status(404).json({ error: "Azienda non trovata" });
  if (state.disabled) return res.status(403).json({ error: "Questo account e' stato disattivato dall'amministratore" });
  const key = req.header("x-tenant-key");
  if (!key || key !== state.apiKey) return res.status(401).json({ error: "Chiave azienda mancante o non valida (header x-tenant-key)" });
  req.tenantState = state;
  next();
}

// ---------- pannello amministratore (solo tu) ----------

function adminAuth(req, res, next) {
  if (!process.env.ADMIN_KEY) return res.status(500).json({ error: "ADMIN_KEY non configurata sul server" });
  const key = req.header("x-admin-key");
  if (!key || key !== process.env.ADMIN_KEY) return res.status(401).json({ error: "Chiave amministratore mancante o non valida" });
  next();
}

app.get("/api/admin/tenants", adminAuth, async (req, res) => {
  const ids = await listTenantIds();
  const tenants = [];
  for (const id of ids) {
    const s = await loadTenant(id);
    if (!s) continue;
    const reportDates = Object.keys(s.dailyReports || {}).sort();
    tenants.push({
      tenantId: s.tenantId,
      name: s.profile?.name || "-",
      sector: s.profile?.sector || "-",
      disabled: !!s.disabled,
      obiettivi: s.objectives.length,
      agentiAttivi: Object.values(s.agents).filter(a => a.enabled).length,
      ultimoReport: reportDates.length ? reportDates[reportDates.length - 1] : null
    });
  }
  res.json(tenants);
});

app.get("/api/admin/tenants/:tenantId", adminAuth, async (req, res) => {
  const s = await loadTenant(req.params.tenantId);
  if (!s) return res.status(404).json({ error: "Azienda non trovata" });
  res.json(s);
});

app.post("/api/admin/tenants/:tenantId/disable", adminAuth, async (req, res) => {
  const s = await loadTenant(req.params.tenantId);
  if (!s) return res.status(404).json({ error: "Azienda non trovata" });
  s.disabled = true;
  await saveTenant(s.tenantId, s);
  res.json({ ok: true });
});

app.post("/api/admin/tenants/:tenantId/enable", adminAuth, async (req, res) => {
  const s = await loadTenant(req.params.tenantId);
  if (!s) return res.status(404).json({ error: "Azienda non trovata" });
  s.disabled = false;
  await saveTenant(s.tenantId, s);
  res.json({ ok: true });
});

app.delete("/api/admin/tenants/:tenantId", adminAuth, async (req, res) => {
  const ok = await deleteTenant(req.params.tenantId);
  res.json({ ok });
});

// ---------- rotte per-azienda (tutte protette) ----------

app.get("/api/:tenantId/state", tenantAuth, async (req, res) => {
  res.json(publicState(req.tenantState));
});

app.get("/api/:tenantId/agents", tenantAuth, async (req, res) => {
  res.json(req.tenantState.agents);
});

app.patch("/api/:tenantId/profile", tenantAuth, async (req, res) => {
  const state = req.tenantState;
  Object.assign(state.profile, req.body); // es. { "logo": "data:image/png;base64,..." }
  await saveTenant(state.tenantId, state);
  res.json(state.profile);
});

app.patch("/api/:tenantId/agents/:name", tenantAuth, async (req, res) => {
  const state = req.tenantState;
  const name = decodeURIComponent(req.params.name);
  if (!state.agents[name]) return res.status(404).json({ error: "Agente non trovato" });
  Object.assign(state.agents[name], req.body);
  await saveTenant(state.tenantId, state);
  res.json(state.agents[name]);
});

app.post("/api/:tenantId/objective", tenantAuth, async (req, res) => {
  try {
    const state = req.tenantState;
    const objective = await breakdownObjective(state, req.body);
    state.objectives.push(objective);
    await saveTenant(state.tenantId, state);
    res.json(objective);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/:tenantId/objective/:objId/task/:taskId/execute", tenantAuth, async (req, res) => {
  try {
    const state = req.tenantState;
    const obj = state.objectives.find(o => o.id === req.params.objId);
    const task = obj?.tasks.find(t => t.id === req.params.taskId);
    if (!task) return res.status(404).json({ error: "Task non trovato" });
    if (task.richiedeApprovazione && task.stato !== "assegnata") {
      return res.status(403).json({ error: "Questo task richiede prima l'approvazione del proprietario" });
    }
    task.stato = "in corso";
    await saveTenant(state.tenantId, state);
    task.risultato = await executeTask(state, task);
    task.stato = "completata";
    await saveTenant(state.tenantId, state);
    res.json(task);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/:tenantId/objective/:objId/task/:taskId/request-approval", tenantAuth, async (req, res) => {
  try {
    const state = req.tenantState;
    const obj = state.objectives.find(o => o.id === req.params.objId);
    const task = obj?.tasks.find(t => t.id === req.params.taskId);
    if (!task) return res.status(404).json({ error: "Task non trovato" });
    task.approvalRequest = await buildApprovalRequest(state, task);
    task.stato = "in approvazione";
    await saveTenant(state.tenantId, state);
    res.json(task);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/:tenantId/objective/:objId/task/:taskId/decide", tenantAuth, async (req, res) => {
  const state = req.tenantState;
  const obj = state.objectives.find(o => o.id === req.params.objId);
  const task = obj?.tasks.find(t => t.id === req.params.taskId);
  if (!task) return res.status(404).json({ error: "Task non trovato" });
  task.stato = req.body.approved ? "assegnata" : "annullata";
  await saveTenant(state.tenantId, state);
  res.json(task);
});

app.get("/api/:tenantId/report/today", tenantAuth, async (req, res) => {
  try {
    const state = req.tenantState;
    const key = todayKey();
    if (!state.dailyReports[key]) {
      state.dailyReports[key] = await generateDailyReport(state);
      await saveTenant(state.tenantId, state);
    }
    res.json({ date: key, report: state.dailyReports[key] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/:tenantId/report/generate", tenantAuth, async (req, res) => {
  try {
    const state = req.tenantState;
    const key = todayKey();
    state.dailyReports[key] = await generateDailyReport(state);
    await saveTenant(state.tenantId, state);
    res.json({ date: key, report: state.dailyReports[key] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---------- scheduler reale: gira 24/7 su TUTTE le aziende registrate ----------
cron.schedule(CRON_EXPR, async () => {
  const key = todayKey();
  const tenantIds = await listTenantIds();
  console.log(`[cron] avvio generazione report per ${tenantIds.length} aziende (${key})`);
  for (const tenantId of tenantIds) {
    try {
      const state = await loadTenant(tenantId);
      if (!state || !state.profile || state.disabled) continue;
      state.dailyReports[key] = await generateDailyReport(state);
      await saveTenant(tenantId, state);
      console.log(`[cron]  ok: ${tenantId}`);
    } catch (e) {
      console.error(`[cron]  errore per ${tenantId}:`, e.message);
    }
  }
}, { timezone: TZ });

app.listen(PORT, () => {
  console.log(`CEO Agent server (multi-azienda) attivo su http://localhost:${PORT}`);
  console.log(`Report automatico programmato per tutte le aziende: "${CRON_EXPR}" (${TZ})`);
});
