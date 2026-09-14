import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '..', 'data');
fs.mkdirSync(dataDir, { recursive: true });

const db = new DatabaseSync(path.join(dataDir, 'leads.sqlite'));

db.exec(`
  CREATE TABLE IF NOT EXISTS leads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source TEXT NOT NULL,
    source_id TEXT NOT NULL,
    name TEXT NOT NULL,
    category TEXT,
    phone TEXT,
    email TEXT,
    address TEXT,
    city TEXT,
    state TEXT,
    latitude REAL,
    longitude REAL,
    google_maps_url TEXT,
    rating REAL,
    review_count INTEGER,
    business_status TEXT,
    search_query TEXT,
    status TEXT NOT NULL DEFAULT 'new',
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(source, source_id)
  );

  CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
  CREATE INDEX IF NOT EXISTS idx_leads_city ON leads(city);

  CREATE TABLE IF NOT EXISTS enrichments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lead_id INTEGER NOT NULL REFERENCES leads(id),
    provider TEXT NOT NULL DEFAULT 'apollo',
    contact_name TEXT,
    contact_title TEXT,
    email TEXT,
    phone TEXT,
    status TEXT NOT NULL DEFAULT 'found',
    raw_json TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_enrichments_lead ON enrichments(lead_id);

  CREATE TABLE IF NOT EXISTS payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lead_id INTEGER REFERENCES leads(id),
    type TEXT NOT NULL,
    stripe_id TEXT NOT NULL UNIQUE,
    customer_email TEXT,
    description TEXT,
    amount_cents INTEGER,
    currency TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    hosted_url TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_payments_lead ON payments(lead_id);

  CREATE TABLE IF NOT EXISTS outreach (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lead_id INTEGER NOT NULL REFERENCES leads(id),
    subject TEXT NOT NULL,
    body TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'sent',
    provider_message_id TEXT,
    error TEXT,
    sent_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_outreach_lead ON outreach(lead_id);

  CREATE TABLE IF NOT EXISTS site_audits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lead_id INTEGER REFERENCES leads(id),
    url TEXT NOT NULL,
    score INTEGER,
    grade TEXT,
    headline TEXT,
    report_html TEXT NOT NULL,
    report_json TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_site_audits_lead ON site_audits(lead_id);
`);

// SQLite has no "ADD COLUMN IF NOT EXISTS" — add new lead columns idempotently.
for (const ddl of [
  'ALTER TABLE leads ADD COLUMN contact_name TEXT',
  'ALTER TABLE leads ADD COLUMN contact_title TEXT',
]) {
  try {
    db.exec(ddl);
  } catch (err) {
    if (!/duplicate column/i.test(err.message)) throw err;
  }
}

const insertStmt = db.prepare(`
  INSERT INTO leads (
    source, source_id, name, category, phone, email, address, city, state,
    latitude, longitude, google_maps_url, rating, review_count, business_status, search_query
  ) VALUES (
    @source, @source_id, @name, @category, @phone, @email, @address, @city, @state,
    @latitude, @longitude, @google_maps_url, @rating, @review_count, @business_status, @search_query
  )
  ON CONFLICT(source, source_id) DO UPDATE SET
    name=excluded.name,
    category=excluded.category,
    phone=excluded.phone,
    address=excluded.address,
    city=excluded.city,
    state=excluded.state,
    latitude=excluded.latitude,
    longitude=excluded.longitude,
    google_maps_url=excluded.google_maps_url,
    rating=excluded.rating,
    review_count=excluded.review_count,
    business_status=excluded.business_status,
    updated_at=datetime('now')
`);

export function upsertLead(lead) {
  insertStmt.run({
    source: lead.source,
    source_id: lead.sourceId,
    name: lead.name,
    category: lead.category ?? null,
    phone: lead.phone ?? null,
    email: lead.email ?? null,
    address: lead.address ?? null,
    city: lead.city ?? null,
    state: lead.state ?? null,
    latitude: lead.latitude ?? null,
    longitude: lead.longitude ?? null,
    google_maps_url: lead.googleMapsUrl ?? null,
    rating: lead.rating ?? null,
    review_count: lead.reviewCount ?? null,
    business_status: lead.businessStatus ?? null,
    search_query: lead.searchQuery ?? null,
  });
}

export function listLeads({ status, city, category, q, searchQuery } = {}) {
  let sql = 'SELECT * FROM leads WHERE 1=1';
  const params = {};
  if (status) {
    sql += ' AND status = @status';
    params.status = status;
  }
  if (city) {
    sql += ' AND city LIKE @city';
    params.city = `%${city}%`;
  }
  if (category) {
    sql += ' AND category LIKE @category';
    params.category = `%${category}%`;
  }
  if (q) {
    sql += ' AND (name LIKE @q OR address LIKE @q OR phone LIKE @q OR email LIKE @q)';
    params.q = `%${q}%`;
  }
  if (searchQuery) {
    sql += ' AND search_query = @searchQuery';
    params.searchQuery = searchQuery;
  }
  sql += ' ORDER BY created_at DESC';
  return db.prepare(sql).all(params);
}

export function getLead(id) {
  return db.prepare('SELECT * FROM leads WHERE id = ?').get(id);
}

export function updateLead(id, fields) {
  const allowed = ['status', 'notes', 'email', 'phone', 'contact_name', 'contact_title'];
  const sets = [];
  const params = { id };
  for (const key of allowed) {
    if (fields[key] !== undefined) {
      sets.push(`${key} = @${key}`);
      params[key] = fields[key];
    }
  }
  if (sets.length === 0) return getLead(id);
  sets.push("updated_at = datetime('now')");
  db.prepare(`UPDATE leads SET ${sets.join(', ')} WHERE id = @id`).run(params);
  return getLead(id);
}

export function deleteLead(id) {
  db.prepare('DELETE FROM leads WHERE id = ?').run(id);
}

export function stats() {
  const total = db.prepare('SELECT COUNT(*) AS n FROM leads').get().n;
  const byStatus = db.prepare('SELECT status, COUNT(*) AS n FROM leads GROUP BY status').all();
  return { total, byStatus };
}

const insertPaymentStmt = db.prepare(`
  INSERT INTO payments (lead_id, type, stripe_id, customer_email, description, amount_cents, currency, status, hosted_url)
  VALUES (@leadId, @type, @stripeId, @customerEmail, @description, @amountCents, @currency, @status, @hostedUrl)
`);

export function insertPayment(payment) {
  insertPaymentStmt.run({
    leadId: payment.leadId ?? null,
    type: payment.type,
    stripeId: payment.stripeId,
    customerEmail: payment.customerEmail ?? null,
    description: payment.description ?? null,
    amountCents: payment.amountCents ?? null,
    currency: payment.currency ?? 'usd',
    status: payment.status ?? 'pending',
    hostedUrl: payment.hostedUrl ?? null,
  });
}

export function updatePaymentStatus(stripeId, status) {
  db.prepare("UPDATE payments SET status = ?, updated_at = datetime('now') WHERE stripe_id = ?").run(status, stripeId);
}

export function listPayments({ leadId } = {}) {
  if (leadId) {
    return db.prepare('SELECT * FROM payments WHERE lead_id = ? ORDER BY created_at DESC').all(leadId);
  }
  return db.prepare('SELECT * FROM payments ORDER BY created_at DESC').all();
}

const insertOutreachStmt = db.prepare(`
  INSERT INTO outreach (lead_id, subject, body, status, provider_message_id, error)
  VALUES (@leadId, @subject, @body, @status, @providerMessageId, @error)
`);

export function insertOutreach(record) {
  insertOutreachStmt.run({
    leadId: record.leadId,
    subject: record.subject,
    body: record.body,
    status: record.status ?? 'sent',
    providerMessageId: record.providerMessageId ?? null,
    error: record.error ?? null,
  });
}

export function listOutreach({ leadId } = {}) {
  if (leadId) {
    return db.prepare('SELECT * FROM outreach WHERE lead_id = ? ORDER BY sent_at DESC').all(leadId);
  }
  return db.prepare('SELECT * FROM outreach ORDER BY sent_at DESC').all();
}

// Leads that are candidates for a first outreach email: never contacted,
// have an email on file, and aren't already in a terminal status.
export function listOutreachCandidates({ limit = 20 } = {}) {
  return db.prepare(`
    SELECT leads.* FROM leads
    LEFT JOIN outreach ON outreach.lead_id = leads.id
    WHERE leads.email IS NOT NULL
      AND leads.email != ''
      AND leads.status = 'new'
      AND outreach.id IS NULL
    ORDER BY leads.created_at ASC
    LIMIT @limit
  `).all({ limit });
}

// Leads with no email on file and no prior enrichment attempt (success or
// failure) — candidates for contact enrichment via Apollo.
export function listEnrichmentCandidates({ limit = 20 } = {}) {
  return db.prepare(`
    SELECT leads.* FROM leads
    LEFT JOIN enrichments ON enrichments.lead_id = leads.id
    WHERE (leads.email IS NULL OR leads.email = '')
      AND leads.status = 'new'
      AND enrichments.id IS NULL
    ORDER BY leads.created_at ASC
    LIMIT @limit
  `).all({ limit });
}

const insertEnrichmentStmt = db.prepare(`
  INSERT INTO enrichments (lead_id, provider, contact_name, contact_title, email, phone, status, raw_json)
  VALUES (@leadId, @provider, @contactName, @contactTitle, @email, @phone, @status, @rawJson)
`);

export function insertEnrichment(record) {
  insertEnrichmentStmt.run({
    leadId: record.leadId,
    provider: record.provider ?? 'apollo',
    contactName: record.contactName ?? null,
    contactTitle: record.contactTitle ?? null,
    email: record.email ?? null,
    phone: record.phone ?? null,
    status: record.status ?? 'found',
    rawJson: record.rawJson ?? null,
  });
}

export function listEnrichments({ leadId } = {}) {
  if (leadId) {
    return db.prepare('SELECT * FROM enrichments WHERE lead_id = ? ORDER BY created_at DESC').all(leadId);
  }
  return db.prepare('SELECT * FROM enrichments ORDER BY created_at DESC').all();
}

const insertSiteAuditStmt = db.prepare(`
  INSERT INTO site_audits (lead_id, url, score, grade, headline, report_html, report_json)
  VALUES (@leadId, @url, @score, @grade, @headline, @reportHtml, @reportJson)
`);

export function insertSiteAudit(audit) {
  const info = insertSiteAuditStmt.run({
    leadId: audit.leadId ?? null,
    url: audit.url,
    score: audit.score ?? null,
    grade: audit.grade ?? null,
    headline: audit.headline ?? null,
    reportHtml: audit.reportHtml,
    reportJson: audit.reportJson ?? null,
  });
  return getSiteAudit(Number(info.lastInsertRowid));
}

export function getSiteAudit(id) {
  return db.prepare('SELECT * FROM site_audits WHERE id = ?').get(id);
}

export function listSiteAudits({ leadId } = {}) {
  if (leadId) {
    return db.prepare('SELECT id, lead_id, url, score, grade, headline, created_at FROM site_audits WHERE lead_id = ? ORDER BY created_at DESC').all(leadId);
  }
  return db.prepare('SELECT id, lead_id, url, score, grade, headline, created_at FROM site_audits ORDER BY created_at DESC').all();
}

export default db;
