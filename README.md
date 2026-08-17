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

### Deploying it (so it's reachable at a URL instead of just localhost)

The app is a plain Node/Express server, so it runs on any Node host. A `Dockerfile` is included, plus ready-to-use configs for two easy options:

- **Render** — commit includes `render.yaml`. In the Render dashboard: New → Blueprint → pick this repo. It builds the Dockerfile, attaches a persistent disk at `/app/data` (so your SQLite leads database survives redeploys), and prompts you for `GOOGLE_PLACES_API_KEY`, `APP_USERNAME`, and `APP_PASSWORD`. **Set all three** — leaving the last two blank deploys with no login.
- **Railway** — commit includes `railway.toml`. New Project → Deploy from GitHub → pick this repo. After the first deploy, add a Volume (service → Volumes) mounted at `/app/data`, and set `GOOGLE_PLACES_API_KEY`, `APP_USERNAME`, and `APP_PASSWORD` in Variables.
- **Anywhere else** (Fly.io, a VPS, etc.) — build and run the included `Dockerfile` directly, mounting a volume at `/app/data` for persistence:
  ```bash
  docker build -t no-website-leads .
  docker run -p 3000:3000 \
    -e GOOGLE_PLACES_API_KEY=your_key \
    -e APP_USERNAME=admin -e APP_PASSWORD=a_strong_password \
    -v $(pwd)/data:/app/data \
    no-website-leads
  ```

**Set `APP_USERNAME` and `APP_PASSWORD` on any deployment reachable off your own machine.** The app ships with no accounts or login by default — set both env vars and every request will require that HTTP Basic Auth login; leave them unset for local-only use. Without this, anyone who finds the URL can view/edit/delete your leads and run searches that spend your Google API quota.

### Compliance — read before you start cold-contacting people

This tool only collects data through Google's official API, which is compliant to use this way. What you *do* with the phone numbers/emails afterward is on you to get right:

- **Phone/SMS outreach** in the US is regulated by the **TCPA** — check consent and do-not-call rules (e.g. the National DNC Registry) before cold calling or texting, especially with any autodialer or pre-recorded message.
- **Email outreach** is regulated by **CAN-SPAM** (US) and, if contacting anyone in the EU/UK, **GDPR/PECR** — always include a real sender identity, a working unsubscribe/opt-out method, and honor opt-outs.
- Keep the data reasonably secure and delete records for anyone who asks you to stop contacting them.

### Project structure

```
server/
  index.js               Express API + static file server
  db.js                  SQLite (node:sqlite) storage for leads
  providers/
    googlePlaces.js       Google Places (New) search + no-website filter
public/
  index.html, app.js, style.css   Single-page front end
data/
  leads.sqlite            Local database (gitignored)
```
