// Drafts a personalized outreach email (via Claude) and sends it (via Gmail)
// to leads that: have an email on file, status = 'new', and have never been
// contacted before. Marks each as 'contacted' after a successful send.
// Usage: node scripts/send-outreach.mjs
// Intended to run both locally (npm run outreach:send) and on a schedule via
// .github/workflows/outreach.yml.
import 'dotenv/config';
import { listOutreachCandidates, insertOutreach, updateLead } from '../server/db.js';
import { draftOutreachEmail, appendComplianceFooter, sendOutreachEmail } from '../server/outreach.js';

const MAX_PER_RUN = Number(process.env.OUTREACH_MAX_PER_RUN || 15);

async function main() {
  if (!process.env.OUTREACH_MAILING_ADDRESS) {
    console.error(
      'OUTREACH_MAILING_ADDRESS is not set. CAN-SPAM requires a valid physical mailing address in every ' +
      'commercial email. Add it to .env / repo secrets before sending outreach.'
    );
    process.exit(1);
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('ANTHROPIC_API_KEY is not set.');
    process.exit(1);
  }
  if (!process.env.GMAIL_SENDER_EMAIL) {
    console.error('GMAIL_SENDER_EMAIL is not set.');
    process.exit(1);
  }

  const candidates = listOutreachCandidates({ limit: MAX_PER_RUN });
  if (candidates.length === 0) {
    console.log('No outreach candidates this run.');
    return;
  }

  console.log(`Sending outreach to ${candidates.length} lead(s)...`);
  let sent = 0;
  let failed = 0;

  for (const lead of candidates) {
    try {
      const { subject, body } = await draftOutreachEmail(lead);
      const finalBody = appendComplianceFooter(body);
      const result = await sendOutreachEmail({ to: lead.email, subject, body: finalBody });

      insertOutreach({
        leadId: lead.id,
        subject,
        body: finalBody,
        status: 'sent',
        providerMessageId: result.id,
      });
      updateLead(lead.id, { status: 'contacted' });
      sent += 1;
      console.log(`✓ ${lead.name} <${lead.email}>`);
    } catch (err) {
      failed += 1;
      console.error(`✗ ${lead.name} <${lead.email}>: ${err.message}`);
      insertOutreach({
        leadId: lead.id,
        subject: '(failed to send)',
        body: '',
        status: 'failed',
        error: err.message,
      });
    }
  }

  console.log(`\nDone. ${sent} sent, ${failed} failed.`);
}

main();
