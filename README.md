# CEO Agent Server

## Deploy in 5 click, senza terminale

1. Crea un account gratuito su **github.com**
2. Crea un repository vuoto e trascina dentro tutti i file di questa cartella (drag & drop dal browser)
3. Crea un account gratuito su **render.com**
4. "New" → "Blueprint" → collega il repository → Render legge `render.yaml` da solo e chiede solo
   la tua `ANTHROPIC_API_KEY` (da console.anthropic.com)
5. Clicca "Apply" / "Deploy" → da quel momento il server gira 24/7, anche a computer spento

Nient'altro. Nessun comando da digitare.

Backend reale del CEO Agent: stessa logica della dashboard che hai visto in chat, ma con uno
**scheduler che gira ogni giorno da solo (24/7)**, indipendentemente da te — cosa impossibile
con un file HTML che vive solo nel browser.

## Cosa fa da solo ogni giorno

Alle 08:00 (orario Europe/Rome, configurabile in `.env`), il server genera automaticamente il
report giornaliero del CEO Agent e lo salva. Quando apri la dashboard/frontend, trovi il report
già pronto — nessun click necessario.

## Avvio in locale

```bash
cd ceo-agent-server
npm install
cp .env.example .env
# apri .env e inserisci la tua vera ANTHROPIC_API_KEY (da console.anthropic.com)
npm start
```

Il server parte su `http://localhost:3000`.

## Come funziona il multi-azienda

Ogni azienda si registra una volta e ottiene un proprio spazio dati separato + una chiave di accesso:

```bash
curl -X POST http://localhost:3000/api/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Nord Meccanica Srl","sector":"componentistica","products":"componenti industriali","budgetMax":"50000","riskLevel":"medio","approvalThreshold":"5000"}'
```

Risposta:
```json
{ "tenantId": "nord-meccanica-srl", "apiKey": "a1b2c3...", "profile": {...},
  "avviso": "Salva subito questa apiKey: serve per ogni chiamata futura e non verra' piu' mostrata." }
```

**Salva `tenantId` e `apiKey` subito**: da questo momento ogni chiamata per quell'azienda va fatta
verso `/api/<tenantId>/...` con l'header `x-tenant-key: <apiKey>`. Senza la chiave corretta, le
richieste vengono rifiutate (401) — è l'unica cosa che separa i dati di un'azienda da quelli di
un'altra su questo stesso server.

Esempio:
```bash
curl http://localhost:3000/api/nord-meccanica-srl/state -H "x-tenant-key: a1b2c3..."
```

Se in futuro darai il link di registrazione ad altre aziende, ognuna farà lo stesso `POST /api/register`
e otterrà il proprio `tenantId`/`apiKey`, completamente isolato dagli altri.

## Pannello amministratore (solo tu)

Apri `https://<il-tuo-dominio>/admin.html`, inserisci la tua `ADMIN_KEY` (quella che hai scelto in
`.env`) e vedi l'elenco di tutte le aziende registrate, con un bottone per disattivarle o
riattivarle. Un'azienda disattivata non può più chiamare nessuna rotta API e viene saltata dal
report automatico giornaliero — è il modo per "staccare" un cliente che non paga più, senza
cancellare i suoi dati.

Rotte admin dirette (richiedono header `x-admin-key`):

| Metodo | Rotta | Cosa fa |
|---|---|---|
| GET | `/api/admin/tenants` | Elenco di tutte le aziende |
| GET | `/api/admin/tenants/:tenantId` | Dettaglio completo di un'azienda (incluso apiKey, per supporto) |
| POST | `/api/admin/tenants/:tenantId/disable` | Disattiva un'azienda |
| POST | `/api/admin/tenants/:tenantId/enable` | Riattiva un'azienda |
| DELETE | `/api/admin/tenants/:tenantId` | Cancella definitivamente i dati di un'azienda |

## Rotte API per-azienda

| Metodo | Rotta | Cosa fa |
|---|---|---|
| POST | `/api/register` | Registra una nuova azienda → `tenantId` + `apiKey` (nessuna auth richiesta) |
| GET  | `/api/:tenantId/state` | Stato completo dell'azienda (richiede `x-tenant-key`) |
| GET  | `/api/:tenantId/agents` | Elenco dei 39 agenti dell'azienda |
| PATCH | `/api/:tenantId/profile` | Aggiorna dati profilo, es. il logo (`{"logo":"data:image/png;base64,..."}`) |
| PATCH | `/api/:tenantId/agents/:name` | Aggiorna `enabled` / `price` / `visibleTo` di un agente |
| POST | `/api/:tenantId/objective` | Invia un obiettivo al CEO Agent → genera piano e task (`text, budget, deadlineDays`) |
| POST | `/api/:tenantId/objective/:objId/task/:taskId/execute` | Esegue un task tramite l'agente assegnato |
| POST | `/api/:tenantId/objective/:objId/task/:taskId/request-approval` | Genera la richiesta di approvazione formale |
| POST | `/api/:tenantId/objective/:objId/task/:taskId/decide` | `{ "approved": true/false }` |
| GET  | `/api/:tenantId/report/today` | Report del giorno (generato dal cron, o al volo se mancante) |
| POST | `/api/:tenantId/report/generate` | Forza la generazione di un nuovo report ora |

## Deploy 24/7 (perché giri anche a computer spento)

Questo server deve restare **sempre acceso** su un host esterno, non sul tuo computer. Opzioni semplici:

1. **Render.com** → "New Web Service" → collega questo repo (o carica lo zip) → build command `npm install`, start command `npm start` → aggiungi `ANTHROPIC_API_KEY` nelle Environment Variables.
2. **Railway.app** → stesso procedimento, deploy da GitHub o CLI.
3. **Fly.io** → per chi vuole più controllo sull'infrastruttura.

Su tutte e tre, una volta deployato, lo scheduler (`node-cron`) resta attivo finché il servizio è
in esecuzione — è il servizio stesso che tiene vivo il processo, non serve altro.

## Limiti di questa versione (MVP)

- **Storage**: ogni azienda ha un proprio file JSON (`data/tenants/<tenantId>.json`) — i dati
  sono già separati per azienda. Per una scala grande (centinaia di clienti, accessi simultanei
  frequenti) conviene comunque passare a un database vero (Postgres su Supabase o Neon), ma per
  decine di aziende questa versione regge senza problemi.
- **Autenticazione**: ogni azienda ha una `apiKey` generata alla registrazione, obbligatoria per
  ogni chiamata (header `x-tenant-key`). E' una protezione ragionevole per un MVP, ma non è un
  vero sistema di login con utenti/ruoli multipli per azienda — quello resta un passo successivo.
- **Frontend**: questo repo è solo il backend. Il frontend (la dashboard che hai visto in chat)
  va aggiornato per chiamare queste rotte invece di `api.anthropic.com` direttamente — è un
  passo successivo se vuoi collegarli.
