// Runs every configured search in config/search-targets.json against the
// Google Places API and upserts results into the leads database.
// Usage: node scripts/find-leads.mjs
// Intended to run both locally (npm run leads:find) and on a schedule via
// .github/workflows/find-leads.yml.
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { upsertLead } from '../server/db.js';
import { findBusinessesWithoutWebsite } from '../server/providers/googlePlaces.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    console.error('GOOGLE_PLACES_API_KEY is not set — add it to .env or repo secrets.');
    process.exit(1);
  }

  const targetsPath = path.join(__dirname, '..', 'config', 'search-targets.json');
  const targets = JSON.parse(fs.readFileSync(targetsPath, 'utf8'));

  let totalFound = 0;
  for (const { businessType, location } of targets) {
    const query = `${businessType} in ${location}`;
    try {
      const results = await findBusinessesWithoutWebsite({ query, apiKey, maxPages: 3 });
      for (const lead of results) {
        upsertLead({ ...lead, searchQuery: query });
      }
      totalFound += results.length;
      console.log(`${query}: ${results.length} lead(s) without a website`);
    } catch (err) {
      console.error(`${query}: search failed — ${err.message}`);
    }
  }

  console.log(`\nDone. ${totalFound} lead(s) found across ${targets.length} search(es).`);
}

main();
