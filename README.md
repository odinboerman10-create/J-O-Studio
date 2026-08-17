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
  db.js                  SQLite (node:sqlite) storage for leads
  providers/
    googlePlaces.js       Google Places (New) search + no-website filter
public/
  index.html, app.js, style.css   Single-page front end
data/
  leads.sqlite            Local database (gitignored)
```
