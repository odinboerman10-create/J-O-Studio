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

## Cold email outreach

Once a lead has an email on file, you can send it a cold outreach email straight
from the leads table — one at a time or in bulk — without leaving the app.

Sending goes through [Resend](https://resend.com). To enable it:

1. Create a Resend account and verify a sending domain (or use their sandbox
   domain while testing), then grab an API key from
   https://resend.com/api-keys.
2. Add to your `.env`:
   ```
   RESEND_API_KEY=re_...
   EMAIL_FROM=J&O Studios <hello@yourdomain.com>
   EMAIL_REPLY_TO=you@yourdomain.com
   SENDER_NAME=Your Name
   EMAIL_FOOTER_ADDRESS=Your business mailing address
   ```
3. Restart the server. The **Email** button on each lead row (and the **Email
   selected** bulk action above the table) will start working.

### The sequence

Three built-in templates, meant to be sent a few days apart per lead:

1. **Cold Intro** — leads with the fact that Google has no website on file for them.
2. **Follow-up** — a lighter nudge with social proof, for leads who haven't replied.
3. **Breakup** — a short, no-pressure final touch that reopens the door.

Every send is logged (status, provider ID, any error) and shown in that lead's
**History** panel. Sending updates a `new` lead to `contacted` automatically.
Leads marked `not_interested`, or with no email on file, are always skipped —
bulk sends report this as "skipped" rather than failing the whole batch.

A matching Claude Code skill lives at `.claude/skills/jo-email-outreach/` — ask
Claude (in a coding session on this repo) to draft or personalize outreach
copy in J&O's voice, and it'll follow the same offer numbers and sequence.

**Compliance:** every email includes a sender sign-off, your business address
(from `EMAIL_FOOTER_ADDRESS`), and an opt-out line, per CAN-SPAM. See the
compliance section above for the rest of what applies to cold outreach.

### Project structure

```
server/
  index.js               Express API + static file server
  db.js                  SQLite (node:sqlite) storage for leads + sent emails
  emailTemplates.js       Cold-outreach email sequence (intro / follow-up / breakup)
  providers/
    googlePlaces.js       Google Places (New) search + no-website filter
    resend.js              Resend API client for sending outreach emails
public/
  index.html, app.js, style.css   Single-page front end
data/
  leads.sqlite            Local database (gitignored)
.claude/
  skills/jo-email-outreach/  Claude Code skill for drafting outreach copy in J&O's voice
```
