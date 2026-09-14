# J-O-Studio
J&amp;O Studios is a web design and digital marketing studio that helps businesses build a stronger online presence. We create modern, professional websites and develop digital strategies focused on branding, customer engagement, and business growth. J&amp;O Studios works with businesses to understand their goals, and identify opportunities.

## No-Website Leads tool

A local web app that finds businesses in a given area and category that **don't have a website on file with Google** — a ready-made prospect list for web design outreach.

It searches the official **Google Places API**, not scraped search results, and keeps only businesses where Google has no `websiteUri` for them. Results are saved to a local database with a simple status/notes workflow (New → Contacted → Interested → Not interested → Converted) and can be exported to CSV.

### What it can and can't get you

- ✅ Business name, phone number, full address, category, Google rating, and a link to their Google Maps listing — pulled automatically.
- ❌ **Email addresses are not fetched automatically.** There is no reliable, ToS-compliant public source for a business's email once it has no website (that's exactly why it's a prospect). An `email` column is included in the UI so you can add one manually if you find it (their Facebook/Instagram page, a directory listing, etc.).

### Setup

1. Get a Google Cloud API key with **"Places API (New)"** enabled:
   - Console: https://console.cloud.google.com/apis/library/places.googleapis.com
   - Google requires billing to be enabled on the project, but includes a recurring free monthly credit; check current pricing at https://developers.google.com/maps/billing-and-pricing before running large searches.
2. Copy the environment file and add your key:
   ```bash
   cp .env.example .env
   # then edit .env and set GOOGLE_PLACES_API_KEY=...
   ```
3. Install dependencies and start the server:
   ```bash
   npm install
   npm start
   ```
4. Open http://localhost:3000

### Using it

1. Enter a business type (e.g. `plumber`, `hair salon`, `dentist`) and a location (e.g. `Round Rock, TX`), then click **Search**.
2. Each search fetches up to 3 pages (≈60 businesses) from Google, keeps only the ones with no website, and adds them to your leads list. Re-running the same search updates existing rows instead of duplicating them.
3. Filter/search the leads table, update each lead's status and notes as you contact them, and click **Export CSV** any time to download your current list.

### Compliance — read before you start cold-contacting people

This tool only collects data through Google's official API, which is compliant to use this way. What you *do* with the phone numbers/emails afterward is on you to get right:

- **Phone/SMS outreach** in the US is regulated by the **TCPA** — check consent and do-not-call rules (e.g. the National DNC Registry) before cold calling or texting, especially with any autodialer or pre-recorded message.
- **Email outreach** is regulated by **CAN-SPAM** (US) and, if contacting anyone in the EU/UK, **GDPR/PECR** — always include a real sender identity, a working unsubscribe/opt-out method, and honor opt-outs.
- Keep the data reasonably secure and delete records for anyone who asks you to stop contacting them.

### Project structure

```
server/
  index.js               Express API + static file server
  db.js                  SQLite (node:sqlite) storage for leads, payments, outreach
  providers/
    googlePlaces.js       Google Places (New) search + no-website filter
  billing.js             Stripe Checkout + Invoicing
  outreach.js            Drafts (Claude) + sends (Gmail) outreach emails
scripts/
  find-leads.mjs          Runs config/search-targets.json against Google Places
  send-outreach.mjs        Drafts + sends outreach to new leads with an email on file
  gmail-auth.mjs           One-time local helper to mint a Gmail refresh token
config/
  search-targets.json      Business categories + cities to search (edit this)
public/
  index.html, app.js, style.css   Leads CRM front end
  pricing.html, pricing.js         Stripe Checkout packages page
data/
  leads.sqlite            Database — tracked in git so state persists across
                           GitHub Actions runs (leads, payments, outreach log)
```

## Automation: finding leads + outreach

Two scheduled GitHub Actions workflows extend the leads CRM above:

- **`.github/workflows/find-leads.yml`** — runs weekly (Mondays) and on demand
  (Actions tab → "Find leads" → Run workflow). Searches every
  `{ businessType, location }` pair in `config/search-targets.json` and
  upserts results into `data/leads.sqlite`, then commits the updated database.
  **Edit `config/search-targets.json` with your real target categories/cities
  before relying on this** — it currently ships with placeholder
  categories/cities to get you started.

- **`.github/workflows/outreach.yml`** — runs daily. For every lead that's
  `status = 'new'`, has an email on file, and has never been emailed before,
  it drafts a personalized email with Claude and sends it via Gmail, then
  marks the lead `contacted`. **Important limitation:** Google Places doesn't
  return business emails (see above), so this only fires for leads where
  you've manually added an email via the "email" column in the leads table —
  it won't auto-email everyone the search finds.

Both scripts also run locally: `npm run leads:find` and `npm run outreach:send`.

### One-time setup

1. **Google Places** (if not already done): add `GOOGLE_PLACES_API_KEY` as a
   repo secret (Settings → Secrets and variables → Actions → Secrets).
2. **Anthropic** (drafts the outreach copy): add `ANTHROPIC_API_KEY` as a repo
   secret.
3. **Gmail sending**: run `npm run gmail:auth` locally (it walks you through
   creating a Google Cloud OAuth client and opens a consent screen — see the
   comments at the top of `scripts/gmail-auth.mjs`). It prints a refresh
   token. Add as repo secrets: `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`,
   `GMAIL_REFRESH_TOKEN`.
4. **Non-secret config** — add these as repo **variables** (same page,
   "Variables" tab, not "Secrets"): `GMAIL_SENDER_EMAIL`,
   `OUTREACH_MAILING_ADDRESS` (a real physical mailing address — every
   commercial email is legally required to include one under CAN-SPAM; the
   send script refuses to run without it), `OUTREACH_SENDER_NAME` (optional),
   `OUTREACH_MAX_PER_RUN` (optional, defaults to 15/run).
5. Copy the same values into your local `.env` (see `.env.example`) if you
   want to run the scripts locally too.

Outreach currently sends automatically with no human approval step — each
lead gets exactly one email, and the footer includes an opt-out line
("reply unsubscribe"). If someone replies asking to stop, mark their lead
`not_interested` manually; reply-handling isn't automated yet.
