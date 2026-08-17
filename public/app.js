const searchForm = document.getElementById('search-form');
const searchBtn = document.getElementById('search-btn');
const searchStatus = document.getElementById('search-status');
const leadsBody = document.getElementById('leads-body');
const leadCount = document.getElementById('lead-count');
const filterQ = document.getElementById('filter-q');
const filterStatus = document.getElementById('filter-status');
const refreshBtn = document.getElementById('refresh-btn');
const exportBtn = document.getElementById('export-btn');

const STATUSES = ['new', 'contacted', 'interested', 'not_interested', 'converted'];

function buildQuery() {
  const params = new URLSearchParams();
  if (filterQ.value.trim()) params.set('q', filterQ.value.trim());
  if (filterStatus.value) params.set('status', filterStatus.value);
  return params.toString();
}

async function loadLeads() {
  const qs = buildQuery();
  const res = await fetch(`/api/leads${qs ? `?${qs}` : ''}`);
  const leads = await res.json();
  renderLeads(leads);
  exportBtn.href = `/api/leads/export.csv${qs ? `?${qs}` : ''}`;
}

function renderLeads(leads) {
  leadCount.textContent = `${leads.length} lead${leads.length === 1 ? '' : 's'}`;
  leadsBody.innerHTML = '';
  for (const lead of leads) {
    leadsBody.appendChild(renderRow(lead));
  }
}

function renderRow(lead) {
  const tr = document.createElement('tr');
  tr.dataset.id = lead.id;

  const nameTd = document.createElement('td');
  nameTd.innerHTML = `<strong>${escapeHtml(lead.name)}</strong><br><span style="color:var(--muted)">${escapeHtml(lead.city ?? '')}${lead.state ? ', ' + escapeHtml(lead.state) : ''}</span>`;
  tr.appendChild(nameTd);

  const categoryTd = document.createElement('td');
  categoryTd.textContent = lead.category ?? '';
  tr.appendChild(categoryTd);

  tr.appendChild(makeEditableCell(lead, 'phone', 'text'));

  tr.appendChild(makeEditableCell(lead, 'email', 'email'));

  const addressTd = document.createElement('td');
  addressTd.textContent = lead.address ?? '';
  tr.appendChild(addressTd);

  const ratingTd = document.createElement('td');
  ratingTd.textContent = lead.rating ? `${lead.rating} (${lead.review_count ?? 0})` : '—';
  tr.appendChild(ratingTd);

  const statusTd = document.createElement('td');
  const select = document.createElement('select');
  select.className = `status-${lead.status}`;
  for (const s of STATUSES) {
    const opt = document.createElement('option');
    opt.value = s;
    opt.textContent = s.replace('_', ' ');
    if (s === lead.status) opt.selected = true;
    select.appendChild(opt);
  }
  select.addEventListener('change', () => {
    select.className = `status-${select.value}`;
    patchLead(lead.id, { status: select.value });
  });
  statusTd.appendChild(select);
  tr.appendChild(statusTd);

  const notesTd = document.createElement('td');
  const textarea = document.createElement('textarea');
  textarea.value = lead.notes ?? '';
  textarea.addEventListener('change', () => patchLead(lead.id, { notes: textarea.value }));
  notesTd.appendChild(textarea);
  tr.appendChild(notesTd);

  const mapTd = document.createElement('td');
  if (lead.google_maps_url) {
    const a = document.createElement('a');
    a.href = lead.google_maps_url;
    a.target = '_blank';
    a.rel = 'noopener';
    a.className = 'map-link';
    a.textContent = 'Map';
    mapTd.appendChild(a);
  }
  tr.appendChild(mapTd);

  const actionsTd = document.createElement('td');
  const delBtn = document.createElement('button');
  delBtn.textContent = 'Delete';
  delBtn.className = 'delete-btn';
  delBtn.addEventListener('click', async () => {
    if (!confirm(`Remove ${lead.name} from your list?`)) return;
    await fetch(`/api/leads/${lead.id}`, { method: 'DELETE' });
    tr.remove();
  });
  actionsTd.appendChild(delBtn);
  tr.appendChild(actionsTd);

  return tr;
}

function makeEditableCell(lead, field, type) {
  const td = document.createElement('td');
  const input = document.createElement('input');
  input.type = type;
  input.value = lead[field] ?? '';
  input.placeholder = field === 'email' ? 'add manually' : '';
  input.addEventListener('change', () => patchLead(lead.id, { [field]: input.value }));
  td.appendChild(input);
  return td;
}

async function patchLead(id, fields) {
  await fetch(`/api/leads/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(fields),
  });
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

searchForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const businessType = document.getElementById('businessType').value.trim();
  const location = document.getElementById('location').value.trim();
  const maxPages = document.getElementById('maxPages').value;

  searchBtn.disabled = true;
  searchStatus.textContent = `Searching for "${businessType}" in "${location}"... this can take up to ${maxPages * 2}s.`;

  try {
    const res = await fetch('/api/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ businessType, location, maxPages }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Search failed');
    searchStatus.textContent = `Found ${data.found} business${data.found === 1 ? '' : 'es'} without a website for "${data.query}".`;
    await loadLeads();
  } catch (err) {
    searchStatus.textContent = `Error: ${err.message}`;
  } finally {
    searchBtn.disabled = false;
  }
});

filterQ.addEventListener('input', debounce(loadLeads, 300));
filterStatus.addEventListener('change', loadLeads);
refreshBtn.addEventListener('click', loadLeads);

function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

loadLeads();
