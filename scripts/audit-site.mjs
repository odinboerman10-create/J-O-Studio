// Scans a website and generates a Claude-written content critique report.
// Usage: node scripts/audit-site.mjs <url> [--lead-id N]
// Writes the report to reports/<slug>.html (gitignored) for quick viewing,
// and logs it in data/leads.sqlite (site_audits table) same as the API does.
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runSiteAudit } from '../server/siteAudit.js';
import { insertSiteAudit } from '../server/db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const [url, ...rest] = argv;
  let leadId = null;
  const idx = rest.indexOf('--lead-id');
  if (idx !== -1 && rest[idx + 1]) leadId = Number(rest[idx + 1]);
  return { url, leadId };
}

async function main() {
  const { url, leadId } = parseArgs(process.argv.slice(2));
  if (!url) {
    console.error('Usage: node scripts/audit-site.mjs <url> [--lead-id N]');
    process.exit(1);
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('ANTHROPIC_API_KEY is not set.');
    process.exit(1);
  }

  const normalizedUrl = /^https?:\/\//i.test(url) ? url : `https://${url}`;
  console.log(`Scanning ${normalizedUrl}...`);

  const { url: finalUrl, critique, reportHtml } = await runSiteAudit(normalizedUrl);

  const audit = insertSiteAudit({
    leadId,
    url: finalUrl,
    score: critique.overallScore ?? null,
    grade: critique.grade ?? null,
    headline: critique.headline ?? null,
    reportHtml,
    reportJson: JSON.stringify(critique),
  });

  const reportsDir = path.join(__dirname, '..', 'reports');
  fs.mkdirSync(reportsDir, { recursive: true });
  const slug = finalUrl.replace(/^https?:\/\//, '').replace(/[^a-z0-9]+/gi, '-').slice(0, 60);
  const filePath = path.join(reportsDir, `${slug}-${audit.id}.html`);
  fs.writeFileSync(filePath, reportHtml);

  console.log(`\nGrade: ${critique.grade} (${critique.overallScore}/100)`);
  console.log(critique.headline);
  console.log(`\nSaved audit #${audit.id} to the database and to ${path.relative(process.cwd(), filePath)}`);
}

main().catch((err) => {
  console.error('Audit failed:', err.message);
  process.exit(1);
});
