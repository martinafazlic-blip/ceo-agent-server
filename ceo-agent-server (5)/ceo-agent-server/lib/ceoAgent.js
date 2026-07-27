import { randomUUID } from "crypto";
import { callClaude, parseJSON } from "./claude.js";
import { enabledAgentNames, touchesForbiddenOps } from "./agents.js";

function profileContext(profile) {
  return `Azienda: ${profile.name}\nSettore: ${profile.sector}\nProdotti/servizi: ${profile.products}\nBudget massimo autorizzabile senza approvazione: ${profile.approvalThreshold} EUR\nLivello di rischio accettato: ${profile.riskLevel}\nBudget disponibile complessivo: ${profile.budgetMax} EUR`;
}

export async function breakdownObjective(state, { text, budget, deadlineDays }) {
  const agents = state.agents;
  const system = `Sei il CEO Agent, il direttore operativo digitale di un'azienda. Governi e coordini le figure aziendali (agenti specialistici), non esegui tu il lavoro.

LIVELLI DI AUTORIZZAZIONE per ogni task:
- Livello 1 (automatico): analisi, ricerche, report, coordinamento. Nessun rischio esterno.
- Livello 2 (entro limite autorizzato): azioni con un costo reale ma sotto la soglia di approvazione.
- Livello 3 (approvazione obbligatoria): contratti, bonifici, conti bancari, prestiti, acquisizioni/cessioni, assunzioni/licenziamenti, stipendi, investimenti rilevanti, dati sensibili, cancellazione dati, informazioni riservate, servizi critici, licenze, dichiarazioni fiscali, azioni legali, o spese sopra soglia.

RILEVAMENTO CONFLITTI: segnala in "conflitti" se il nuovo obiettivo genera duplicazione di lavoro, dati incoerenti o superamento di budget rispetto a quanto gia attivo.

LIVELLO DI ALLERTA: "informativo" | "attenzione" | "critico" | "emergenza", con parsimonia.

Rispondi SOLO con un oggetto JSON valido, senza testo introduttivo, senza backtick:
{"obiettivo_riformulato": string, "kpi_principali": [string,string,string], "rischi": [string,string], "priorita_generale": "critica|alta|media|bassa", "livello_allerta": "informativo|attenzione|critico|emergenza", "conflitti": [string], "tasks": [{"titolo": string, "descrizione": string, "agente": string (uno tra: ${enabledAgentNames(agents).join(", ")}), "priorita": "critica|alta|media|bassa", "scadenza_giorni": number, "kpi": string, "budget_stimato": number, "livello_autorizzazione": 1|2|3}]}
Genera tra 5 e 8 task concreti e diversificati. Non inventare cifre finanziarie reali. Rispondi in italiano.`;

  const activeSummary = state.objectives
    .map(o => `- Obiettivo attivo: "${o.text}" (task: ${o.tasks.map(t => t.titolo).join("; ") || "nessuno"})`)
    .join("\n") || "Nessun obiettivo attivo al momento.";

  const userMsg = `${profileContext(state.profile)}\n\nObiettivi e task gia attivi:\n${activeSummary}\n\nNuovo obiettivo: ${text}\nBudget indicato: ${budget || "non specificato"}\nScadenza (giorni): ${deadlineDays || "non specificata"}`;

  const raw = await callClaude(system, userMsg);
  const parsed = parseJSON(raw);
  const createdAt = Date.now();
  const threshold = parseFloat(state.profile.approvalThreshold) || 0;

  const objective = {
    id: randomUUID(),
    text, budget, deadlineDays, createdAt,
    analysis: {
      obiettivo_riformulato: parsed.obiettivo_riformulato,
      kpi_principali: parsed.kpi_principali || [],
      rischi: parsed.rischi || [],
      priorita_generale: parsed.priorita_generale || "media",
      livelloAllerta: parsed.livello_allerta || "informativo",
      conflitti: parsed.conflitti || []
    },
    tasks: (parsed.tasks || []).map(t => {
      const validAgent = agents[t.agente] && agents[t.agente].enabled;
      const task = {
        id: randomUUID(),
        titolo: t.titolo, descrizione: t.descrizione,
        agente: validAgent ? t.agente : enabledAgentNames(agents)[0],
        priorita: t.priorita || "media",
        scadenzaGiorni: t.scadenza_giorni || 14,
        kpi: t.kpi || "",
        budgetStimato: t.budget_stimato || 0,
        livelloAutorizzazione: [1, 2, 3].includes(t.livello_autorizzazione) ? t.livello_autorizzazione : 2,
        stato: "pianificata",
        risultato: null,
        approvalRequest: null
      };
      if (touchesForbiddenOps(task)) task.livelloAutorizzazione = 3;
      task.richiedeApprovazione =
        task.livelloAutorizzazione === 3 ||
        (task.livelloAutorizzazione === 2 && task.budgetStimato > threshold) ||
        !!(agents[task.agente] && agents[task.agente].supervisionata);
      return task;
    })
  };

  return objective;
}

export async function executeTask(state, task) {
  const agentInfo = state.agents[task.agente];
  const system = `Sei il ${task.agente} di un'azienda. Ruolo: ${agentInfo.role} Ricevi un task assegnato dal CEO Agent. Produci un breve output operativo realistico (massimo 130 parole, testo semplice senza markdown): cosa hai fatto/verificato, un dato plausibile se pertinente (indicando che e una stima), prossimi passi, eventuali rischi o blocchi. Tono professionale, in italiano.`;
  const userMsg = `${profileContext(state.profile)}\n\nTask: ${task.titolo}\nDescrizione: ${task.descrizione}\nKPI: ${task.kpi}\nPriorita: ${task.priorita}\nBudget stimato: ${task.budgetStimato} EUR`;
  return callClaude(system, userMsg);
}

export async function buildApprovalRequest(state, task) {
  const system = `Sei il CEO Agent. Presenta al proprietario una richiesta di approvazione. Rispondi in italiano, testo semplice, con queste etichette su righe separate: Decisione richiesta:, Motivazione:, Importo:, Beneficio:, Rischi:, Alternative:, Raccomandazione:, Urgenza:, Scadenza della decisione:. Massimo 120 parole.`;
  const userMsg = `${profileContext(state.profile)}\n\nTask: ${task.titolo}\nDescrizione: ${task.descrizione}\nAgente: ${task.agente}\nBudget stimato: ${task.budgetStimato} EUR\nPriorita: ${task.priorita}`;
  return callClaude(system, userMsg);
}

export async function generateDailyReport(state) {
  const allTasks = state.objectives.flatMap(o => o.tasks.map(t => ({ ...t, obiettivo: o.text })));
  const summary = allTasks
    .map(t => `- [${t.stato}] (${t.agente}) ${t.titolo}${t.risultato ? " -> " + t.risultato.slice(0, 140) : ""}`)
    .join("\n");
  const system = `Sei il CEO Agent. Produci un report giornaliero conciso in italiano (massimo 180 parole, testo semplice) con: Situazione generale:, Risultati:, Problemi:, Priorita di oggi:. Tono diretto, come un direttore generale che riferisce al proprietario.`;
  const userMsg = `${profileContext(state.profile)}\n\nObiettivi attivi: ${state.objectives.map(o => o.text).join(" | ") || "nessuno"}\n\nStato dei task:\n${summary || "nessun task ancora creato"}`;
  return callClaude(system, userMsg);
}
