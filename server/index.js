import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {
  upsertLead,
  listLeads,
  getLead,
  updateLead,
  deleteLead,
  stats,
} from './db.js';
import { findBusinessesWithoutWebsite } from './providers/googlePlaces.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

// If APP_USERNAME/APP_PASSWORD are set, require HTTP Basic Auth on every request.
// This app has no per-user accounts — it's meant to be gated by one shared
// credential when deployed somewhere reachable off your own machine, since
// anyone with the URL could otherwise read/edit/delete your leads and spend
// your Google Places API quota.
function basicAuth(req, res, next) {
  const user = process.env.APP_USERNAME;
  const pass = process.env.APP_PASSWORD;
  if (!user || !pass) return next(); // no credentials configured -> auth disabled

  const header = req.headers.authorization ?? '';
  const [scheme, encoded] = header.split(' ');
  if (scheme === 'Basic' && encoded) {
    const decoded = Buffer.from(encoded, 'base64').toString();
    const sep = decoded.indexOf(':');
    const reqUser = sep === -1 ? decoded : decoded.slice(0, sep);
    const reqPass = sep === -1 ? '' : decoded.slice(sep + 1);
    const userOk = safeEqual(reqUser, user);
    const passOk = safeEqual(reqPass, pass);
    if (userOk && passOk) return next();
  }

  res.set('WWW-Authenticate', 'Basic realm="No-Website Leads"');
  res.status(401).send('Authentication required');
}

function safeEqual(a = '', b = '') {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

app.use(cors());
app.use(basicAuth);
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
  const hasUser = Boolean(process.env.APP_USERNAME);
  const hasPass = Boolean(process.env.APP_PASSWORD);
  if (hasUser !== hasPass) {
    console.warn('WARNING: Only one of APP_USERNAME/APP_PASSWORD is set, so Basic Auth is DISABLED (both are required). The app is running with no login.');
  } else if (!hasUser && !hasPass) {
    console.warn('WARNING: APP_USERNAME/APP_PASSWORD are not set. The app has no login — fine for local use, but set both before deploying anywhere publicly reachable.');
  }
});
