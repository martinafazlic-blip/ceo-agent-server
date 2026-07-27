export const DEFAULT_AGENTS = {
  "Sales Agent": { color: "#4FAE8A", role: "Vendite: nuovi clienti, preventivi, conversione, upsell su clienti esistenti.", enabled: true, price: 49, visibleTo: "tutti" },
  "Marketing Agent": { color: "#E8A33D", role: "Analisi di mercato, campagne, generazione lead, ritorno campagne.", enabled: true, price: 49, visibleTo: "tutti" },
  "CFO Agent": { color: "#9B7FD4", role: "Budget, margini, scenari finanziari, costo di acquisizione.", enabled: true, price: 59, visibleTo: "tutti" },
  "Operations Agent": { color: "#4FB8B0", role: "Capacita produttiva, tempi, qualita, colli di bottiglia.", enabled: true, price: 49, visibleTo: "tutti" },
  "HR Agent": { color: "#D68FB0", role: "Personale, competenze, assunzioni, formazione.", enabled: true, price: 39, visibleTo: "tutti" },
  "Customer Service Agent": { color: "#5FC7D6", role: "Soddisfazione clienti, reclami, tempi di risposta, fidelizzazione.", enabled: true, price: 39, visibleTo: "tutti" },
  "Procurement Agent": { color: "#D68A4F", role: "Fornitori, materie prime, tempi e condizioni di acquisto.", enabled: true, price: 39, visibleTo: "tutti" }
};

const EXTRA_AGENTS_RAW = [
  ["Bookkeeper / Contabile", "Registrazione movimenti contabili, tenuta libri, quadrature di base.", 19, false],
  ["Addetto Fatturazione", "Emissione e controllo fatture attive e passive, note di credito.", 19, false],
  ["Addetto Riconciliazione Bancaria", "Riconciliazione estratti conto, verifica incassi e pagamenti.", 19, false],
  ["Addetto Payroll", "Elaborazione buste paga, calcolo contributi, adempimenti periodici.", 25, false],
  ["Analista Dati Finanziari", "Reportistica finanziaria di base, dashboard e andamento KPI.", 25, false],
  ["Customer Service L1-L2", "Assistenza clienti primo e secondo livello, gestione ticket.", 25, false],
  ["Help Desk IT", "Supporto tecnico interno/esterno, risoluzione problemi IT ricorrenti.", 25, false],
  ["Telemarketing / Telesales Base", "Chiamate commerciali base, qualificazione contatti, appuntamenti.", 25, false],
  ["Data Entry", "Inserimento e verifica dati nei sistemi aziendali.", 15, false],
  ["Archiviazione Documenti", "Organizzazione, digitalizzazione e archiviazione documentale.", 15, false],
  ["Segreteria / Gestione Agenda", "Gestione agenda, appuntamenti, corrispondenza amministrativa.", 19, false],
  ["Traduttori / Trascrittori", "Traduzione e trascrizione di documenti e contenuti aziendali.", 19, false],
  ["Approvvigionamento Ordini Ripetitivi", "Gestione riordini standard e ricorrenti verso fornitori abituali.", 19, false],
  ["Copywriter Contenuti Base", "Redazione testi standard per blog, schede prodotto, email.", 25, false],
  ["Social Media Management", "Pianificazione e pubblicazione contenuti sui canali social.", 29, false],
  ["SEO Analyst", "Analisi parole chiave, ottimizzazione contenuti e posizionamento.", 29, false],
  ["Graphic Designer Template Standard", "Creazione grafiche da template per marketing e social.", 25, false],
  ["Screening CV", "Prima selezione dei curricula in base ai requisiti richiesti.", 19, false],
  ["Scheduling Colloqui", "Organizzazione e conferma degli appuntamenti per i colloqui.", 15, false],
  ["Onboarding Amministrativo", "Predisposizione documenti e pratiche per i nuovi assunti.", 19, false],
  ["Sviluppatori Junior (task standard)", "Sviluppo e manutenzione di task tecnici standard e ricorrenti.", 39, false],
  ["QA Tester", "Test funzionali, individuazione e segnalazione bug.", 29, false],
  ["Manutenzione Base Infrastruttura Cloud", "Monitoraggio, backup e manutenzione ordinaria dei sistemi cloud.", 29, false],
  ["Pianificazione Rotte Base", "Pianificazione dei percorsi di consegna standard.", 25, false],
  ["Gestione Inventario / Scorte", "Monitoraggio dei livelli di magazzino e delle scorte minime.", 25, false],
  ["Previsioni Domanda Standard", "Stime di domanda basate sullo storico vendite.", 25, false],
  ["Controller Finanziario", "Supervisione contabile e finanziaria complessiva.", 89, true],
  ["Recruiter Senior (colloqui finali)", "Colloqui finali e decisione di assunzione.", 89, true],
  ["Project Manager", "Coordinamento di progetti complessi tra piu reparti.", 99, true],
  ["Analista di Mercato / Strategia", "Analisi strategica di mercato e raccomandazioni.", 99, true],
  ["Ingegneri Senior (architettura, decisioni tecniche)", "Decisioni di architettura tecnica e scelte ingegneristiche.", 129, true],
  ["Management Intermedio", "Supervisione operativa dei reparti, numero ridotto ma non eliminato.", 129, true]
];

EXTRA_AGENTS_RAW.forEach(([name, role, price, supervisionata], i) => {
  const hue = Math.round((i * 47) % 360);
  DEFAULT_AGENTS[name] = { color: `hsl(${hue},45%,62%)`, role, enabled: true, price, visibleTo: "tutti", supervisionata };
});

export function enabledAgentNames(agents) {
  return Object.keys(agents).filter(n => agents[n].enabled);
}

const FORBIDDEN_KEYWORDS = [
  "firmare contratt", "accordo vincolante", "bonifico", "trasferire denaro", "conto bancario",
  "prestito", "acquistare azienda", "vendere azienda", "vendita di proprieta", "assumere",
  "licenziare", "licenziamento", "modificare stipend", "stipendio", "investimento rilevante",
  "dati sensibili", "credenziali amministrative", "cancellare dati", "informazioni riservate",
  "interrompere servizi", "modificare licenz", "dichiarazione fiscale", "azione legale", "pagamento non autorizzato"
];

export function touchesForbiddenOps(task) {
  const t = (task.titolo + " " + task.descrizione).toLowerCase();
  return FORBIDDEN_KEYWORDS.some(k => t.includes(k));
}
