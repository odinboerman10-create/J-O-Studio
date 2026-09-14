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
  db.js                  SQLite (node:sqlite) storage for leads, payments, outreach, etc.
  providers/
    googlePlaces.js       Google Places (New) search + no-website filter
  billing.js             Stripe Checkout + Invoicing
  outreach.js            Drafts (Claude) + sends (Gmail) outreach emails
  enrichment.js          Finds a decision-maker's email per lead via Apollo
  siteAudit.js           Fetches + critiques a website's content (Claude)
scripts/
  find-leads.mjs          Runs config/search-targets.json against Google Places
  enrich-leads.mjs         Finds contact emails for leads that have none (Apollo)
  send-outreach.mjs        Drafts + sends outreach to new leads with an email on file
  gmail-auth.mjs           One-time local helper to mint a Gmail refresh token
  audit-site.mjs           CLI for the content-audit report generator
config/
  search-targets.json      Business categories + cities to search (edit this)
public/
  index.html, app.js, style.css   Leads CRM front end
  pricing.html, pricing.js         Stripe Checkout packages page
  audit.html, audit.js             Content audit report generator page
data/
  leads.sqlite            Database — tracked in git so state persists across
                           GitHub Actions runs (leads, payments, outreach,
                           enrichment, and site-audit history)
```

## Automation: finding leads → enrichment → outreach

Three GitHub Actions workflows chain together into a pipeline:

- **`.github/workflows/find-leads.yml`** — runs weekly (Mondays) and on demand
  (Actions tab → "Find leads" → Run workflow). Searches every
  `{ businessType, location }` pair in `config/search-targets.json` against
  the Google Places API and upserts results into `data/leads.sqlite`, then
  commits the updated database. **Edit `config/search-targets.json` with
  your real target categories/cities before relying on this** — it ships
  with placeholder categories/cities to get you started. Google Places
  doesn't return business emails, so every lead this finds starts with no
  email on file — that's what the next step is for.

- **`.github/workflows/enrich-leads.yml`** — runs weekly (Tuesdays, the day
  after find-leads), capped at `ENRICH_MAX_PER_RUN` leads per run (default
  10 — **this spends one real Apollo credit per successful match**, so this
  cap is what limits your automatic weekly spend; raise it deliberately, not
  by accident). For every lead with no email, it looks up a likely
  decision-maker (owner, founder, GM, etc.) at that business and reveals
  their contact email, writing it back to the lead along with their
  name/title. Also runs on demand (Actions tab → "Enrich leads (Apollo)" →
  Run workflow), and per-lead from the UI ("Find contact" button).

- **`.github/workflows/outreach.yml`** — runs daily. For every lead that's
  `status = 'new'`, now has an email (whether added manually or via
  enrichment above), and has never been emailed before, it drafts a
  personalized email with Claude — addressed to the enriched contact by
  name when available — and sends it via Gmail, then marks the lead
  `contacted`.

All three also run locally: `npm run leads:find`, `npm run leads:enrich`,
`npm run outreach:send`.

### Why not scrape Yelp/Indeed/Google/phone-book listings for this?

All of those explicitly prohibit automated scraping in their Terms of
Service and actively enforce it, "Handshake" is a student job-recruiting
platform with no relevant business directory, and none of them expose real
owner/decision-maker emails anyway — you'd end up regex-guessing addresses
off arbitrary pages, which produces poor hit rates and, fed into automated
Gmail sending, is a fast way to get the sending account flagged for abuse.
Apollo is a licensed B2B contact database (proper data-sourcing agreements,
not scraping) and already had an account connected with credits, so that's
what this enrichment step uses instead.

### One-time setup

1. **Google Places** (if not already done): add `GOOGLE_PLACES_API_KEY` as a
   repo secret (Settings → Secrets and variables → Actions → Secrets).
2. **Anthropic** (drafts outreach copy and content-audit critiques): add
   `ANTHROPIC_API_KEY` as a repo secret.
3. **Apollo** (contact enrichment): get an API key from your Apollo
   dashboard — Settings → Integrations → API — and add it as repo secret
   `APOLLO_API_KEY`. Optional repo variables: `ENRICH_MAX_PER_RUN` (default
   10 leads/run — this is a credit-spend cap, keep it conservative),
   `ENRICH_TARGET_TITLES` (comma-separated job titles to search for,
   defaults are sensible for small local businesses).
4. **Gmail sending**: run `npm run gmail:auth` locally (it walks you through
   creating a Google Cloud OAuth client and opens a consent screen — see the
   comments at the top of `scripts/gmail-auth.mjs`). It prints a refresh
   token. Add as repo secrets: `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`,
   `GMAIL_REFRESH_TOKEN`.
5. **Non-secret config** — add these as repo **variables** (same page,
   "Variables" tab, not "Secrets"): `GMAIL_SENDER_EMAIL`,
   `OUTREACH_MAILING_ADDRESS` (a real physical mailing address — every
   commercial email is legally required to include one under CAN-SPAM; the
   send script refuses to run without it), `OUTREACH_SENDER_NAME` (optional),
   `OUTREACH_MAX_PER_RUN` (optional, defaults to 15/run).
6. Copy the same values into your local `.env` (see `.env.example`) if you
   want to run the scripts locally too.

Outreach currently sends automatically with no human approval step — each
lead gets exactly one email, and the footer includes an opt-out line
("reply unsubscribe"). If someone replies asking to stop, mark their lead
`not_interested` manually; reply-handling isn't automated yet.
