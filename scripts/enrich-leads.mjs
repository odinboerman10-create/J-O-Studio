// Finds a likely decision-maker's email for leads that have none, via the
// Apollo API. This spends real Apollo credits (one per revealed email) —
// defaults to a conservative cap per run. Feeds directly into outreach:
// any lead this successfully enriches becomes eligible for
// scripts/send-outreach.mjs on its next run.
// Usage: node scripts/enrich-leads.mjs
import 'dotenv/config';
import { listEnrichmentCandidates, insertEnrichment, updateLead } from '../server/db.js';
import { enrichLeadContact } from '../server/enrichment.js';

const MAX_PER_RUN = Number(process.env.ENRICH_MAX_PER_RUN || 10);

async function main() {
  if (!process.env.APOLLO_API_KEY) {
    console.error('APOLLO_API_KEY is not set. Get one from your Apollo dashboard: Settings → Integrations → API.');
    process.exit(1);
  }

  const candidates = listEnrichmentCandidates({ limit: MAX_PER_RUN });
  if (candidates.length === 0) {
    console.log('No enrichment candidates this run.');
    return;
  }

  console.log(`Enriching ${candidates.length} lead(s) — this will spend up to ${candidates.length} Apollo credit(s)...`);
  let found = 0;
  let notFound = 0;

  for (const lead of candidates) {
    try {
      const result = await enrichLeadContact(lead);
      insertEnrichment({
        leadId: lead.id,
        contactName: result.contactName,
        contactTitle: result.contactTitle,
        email: result.email,
        phone: result.phone,
        status: result.status,
        rawJson: JSON.stringify(result.raw ?? null),
      });

      if (result.status === 'found') {
        updateLead(lead.id, {
          email: result.email,
          contact_name: result.contactName,
          contact_title: result.contactTitle,
        });
        found += 1;
        console.log(`✓ ${lead.name} → ${result.contactName} (${result.contactTitle || 'unknown title'}) <${result.email}>`);
      } else {
        notFound += 1;
        console.log(`- ${lead.name}: ${result.reason}`);
      }
    } catch (err) {
      notFound += 1;
      console.error(`✗ ${lead.name}: ${err.message}`);
      insertEnrichment({ leadId: lead.id, status: 'error', rawJson: JSON.stringify({ error: err.message }) });
    }
  }

  console.log(`\nDone. ${found} found, ${notFound} not found/failed. Check your Apollo dashboard for actual credit usage.`);
}

main();
