import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  upsertLead,
  listLeads,
  getLead,
  updateLead,
  deleteLead,
  stats,
  logEmail,
  listEmailsForLead,
  emailCountsByLead,
} from './db.js';
import { findBusinessesWithoutWebsite } from './providers/googlePlaces.js';
import { sendEmail } from './providers/resend.js';
import { buildTemplates, renderTemplate } from './emailTemplates.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

const emailTemplates = buildTemplates({
  senderName: process.env.SENDER_NAME || 'The J&O Studios team',
  address: process.env.EMAIL_FOOTER_ADDRESS || '',
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// Run a search against Google Places and store any businesses with no website.
app.post('/api/search', async (req, res) => {
  const { businessType, location, maxPages } = req.body ?? {};
  if (!businessType || !location) {
    return res.status(400).json({ error: 'businessType and location are required' });
  }

  const query = `${businessType} in ${location}`;
  try {
    const results = await findBusinessesWithoutWebsite({
      query,
      apiKey: process.env.GOOGLE_PLACES_API_KEY,
      maxPages: Number(maxPages) || 3,
    });

    for (const lead of results) {
      upsertLead({ ...lead, searchQuery: query });
    }

    res.json({
      query,
      found: results.length,
      leads: listLeads({ searchQuery: query }),
    });
  } catch (err) {
    console.error(err);
    res.status(err.status || 500).json({ error: err.message });
  }
});

app.get('/api/leads', (req, res) => {
  const { status, city, category, q } = req.query;
  const leads = listLeads({ status, city, category, q });
  const emailCounts = emailCountsByLead();
  for (const lead of leads) {
    const info = emailCounts[lead.id];
    lead.emails_sent = info?.count ?? 0;
    lead.last_emailed_at = info?.lastSentAt ?? null;
  }
  res.json(leads);
});

app.get('/api/leads/export.csv', (req, res) => {
  const { status, city, category, q } = req.query;
  const leads = listLeads({ status, city, category, q });
  const columns = [
    'id', 'name', 'category', 'phone', 'email', 'address', 'city', 'state',
    'rating', 'review_count', 'business_status', 'google_maps_url', 'status',
    'notes', 'search_query', 'created_at',
  ];
  const escape = (val) => {
    if (val === null || val === undefined) return '';
    const str = String(val);
    return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
  };
  const rows = [columns.join(',')];
  for (const lead of leads) {
    rows.push(columns.map((c) => escape(lead[c])).join(','));
  }
  const csv = rows.join('\n');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="leads.csv"');
  res.send(csv);
});

app.get('/api/leads/:id', (req, res) => {
  const lead = getLead(Number(req.params.id));
  if (!lead) return res.status(404).json({ error: 'Not found' });
  res.json(lead);
});

app.patch('/api/leads/:id', (req, res) => {
  const lead = updateLead(Number(req.params.id), req.body ?? {});
  if (!lead) return res.status(404).json({ error: 'Not found' });
  res.json(lead);
});

app.delete('/api/leads/:id', (req, res) => {
  deleteLead(Number(req.params.id));
  res.status(204).end();
});

app.get('/api/stats', (req, res) => {
  res.json(stats());
});

// ---- Cold email outreach (Resend) ----

app.get('/api/email-templates', (req, res) => {
  res.json(
    Object.values(emailTemplates).map(({ id, label, description }) => ({ id, label, description })),
  );
});

app.get('/api/leads/:id/emails', (req, res) => {
  const lead = getLead(Number(req.params.id));
  if (!lead) return res.status(404).json({ error: 'Not found' });
  res.json(listEmailsForLead(lead.id));
});

// Render a template against a lead's data without sending anything, so the UI
// can show an editable preview before the user commits to sending it.
app.get('/api/leads/:id/email-preview', (req, res) => {
  const lead = getLead(Number(req.params.id));
  if (!lead) return res.status(404).json({ error: 'Not found' });
  const template = req.query.template || 'cold_intro';
  try {
    res.json(renderTemplate(emailTemplates, template, lead));
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

async function sendToLead(lead, { template, subject, body }) {
  if (!lead.email) {
    return { ok: false, skipped: true, reason: 'no email on file' };
  }
  if (lead.status === 'not_interested') {
    return { ok: false, skipped: true, reason: 'marked not interested' };
  }

  const rendered = renderTemplate(emailTemplates, template, lead);
  const finalSubject = subject || rendered.subject;
  const finalBody = body || rendered.body;

  try {
    const result = await sendEmail({
      apiKey: process.env.RESEND_API_KEY,
      from: process.env.EMAIL_FROM,
      to: lead.email,
      subject: finalSubject,
      text: finalBody,
      replyTo: process.env.EMAIL_REPLY_TO,
    });
    logEmail({
      leadId: lead.id, template, toEmail: lead.email,
      subject: finalSubject, body: finalBody, status: 'sent', providerId: result?.id,
    });
    if (lead.status === 'new') updateLead(lead.id, { status: 'contacted' });
    return { ok: true, providerId: result?.id };
  } catch (err) {
    logEmail({
      leadId: lead.id, template, toEmail: lead.email,
      subject: finalSubject, body: finalBody, status: 'failed', error: err.message,
    });
    return { ok: false, error: err.message };
  }
}

app.post('/api/leads/:id/email', async (req, res) => {
  const lead = getLead(Number(req.params.id));
  if (!lead) return res.status(404).json({ error: 'Not found' });

  const { template, subject, body } = req.body ?? {};
  if (!template) return res.status(400).json({ error: 'template is required' });

  const result = await sendToLead(lead, { template, subject, body });
  if (result.skipped) return res.status(400).json({ error: result.reason });
  if (!result.ok) return res.status(502).json({ error: result.error });
  res.json(result);
});

// Send one template to a batch of leads, with a short delay between sends so
// this doesn't slam the Resend API or read as a spam burst.
app.post('/api/leads/email-bulk', async (req, res) => {
  const { leadIds, template } = req.body ?? {};
  if (!Array.isArray(leadIds) || leadIds.length === 0) {
    return res.status(400).json({ error: 'leadIds must be a non-empty array' });
  }
  if (!template) return res.status(400).json({ error: 'template is required' });

  const results = [];
  for (const id of leadIds) {
    const lead = getLead(Number(id));
    if (!lead) {
      results.push({ leadId: id, ok: false, skipped: true, reason: 'not found' });
      continue;
    }
    const result = await sendToLead(lead, { template });
    results.push({ leadId: lead.id, name: lead.name, ...result });
    await sleep(300);
  }

  res.json({
    sent: results.filter((r) => r.ok).length,
    skipped: results.filter((r) => r.skipped).length,
    failed: results.filter((r) => !r.ok && !r.skipped).length,
    results,
  });
});

app.listen(PORT, () => {
  console.log(`No-Website Leads server running at http://localhost:${PORT}`);
  if (!process.env.GOOGLE_PLACES_API_KEY) {
    console.warn('WARNING: GOOGLE_PLACES_API_KEY is not set. Searches will fail until you add it to .env');
  }
  if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) {
    console.warn('WARNING: RESEND_API_KEY and/or EMAIL_FROM is not set. Cold email sending will fail until you add both to .env');
  }
});
