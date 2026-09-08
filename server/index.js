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
  listPayments,
} from './db.js';
import { findBusinessesWithoutWebsite } from './providers/googlePlaces.js';
import { stripe } from './stripeClient.js';
import { PACKAGES } from './packages.js';
import { createCheckoutSession, createAndSendInvoice, handleWebhookEvent } from './billing.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());

// Stripe needs the raw request body to verify the webhook signature, so this
// route is registered before the global express.json() parser below.
app.post('/api/webhooks/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  let event;
  try {
    if (process.env.STRIPE_WEBHOOK_SECRET) {
      event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], process.env.STRIPE_WEBHOOK_SECRET);
    } else {
      console.warn('STRIPE_WEBHOOK_SECRET is not set — accepting webhook without signature verification (dev only)');
      event = JSON.parse(req.body);
    }
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    await handleWebhookEvent(event);
    res.json({ received: true });
  } catch (err) {
    console.error('Error handling webhook event:', err);
    res.status(500).json({ error: 'Webhook handler failed' });
  }
});

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/api/packages', (req, res) => {
  res.json({ publishableKey: process.env.STRIPE_PUBLISHABLE_KEY ?? null, packages: PACKAGES });
});

app.post('/api/checkout', async (req, res) => {
  const { packageId } = req.body ?? {};
  if (!packageId) return res.status(400).json({ error: 'packageId is required' });
  try {
    const origin = `${req.protocol}://${req.get('host')}`;
    const session = await createCheckoutSession({ packageId, origin });
    res.json({ url: session.url });
  } catch (err) {
    console.error(err);
    res.status(err.status || 500).json({ error: err.message });
  }
});

app.post('/api/leads/:id/invoice', async (req, res) => {
  const { description, amountCents, daysUntilDue } = req.body ?? {};
  if (!description || !amountCents) {
    return res.status(400).json({ error: 'description and amountCents are required' });
  }
  try {
    const invoice = await createAndSendInvoice({
      leadId: Number(req.params.id),
      description,
      amountCents: Number(amountCents),
      daysUntilDue: daysUntilDue ? Number(daysUntilDue) : undefined,
    });
    res.json({ hostedInvoiceUrl: invoice.hosted_invoice_url, invoiceId: invoice.id });
  } catch (err) {
    console.error(err);
    res.status(err.status || 500).json({ error: err.message });
  }
});

app.get('/api/leads/:id/payments', (req, res) => {
  res.json(listPayments({ leadId: Number(req.params.id) }));
});

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
  res.json(listLeads({ status, city, category, q }));
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

app.listen(PORT, () => {
  console.log(`No-Website Leads server running at http://localhost:${PORT}`);
  if (!process.env.GOOGLE_PLACES_API_KEY) {
    console.warn('WARNING: GOOGLE_PLACES_API_KEY is not set. Searches will fail until you add it to .env');
  }
});
