const searchForm = document.getElementById('search-form');
const searchBtn = document.getElementById('search-btn');
const searchStatus = document.getElementById('search-status');
const leadsBody = document.getElementById('leads-body');
const leadCount = document.getElementById('lead-count');
const filterQ = document.getElementById('filter-q');
const filterStatus = document.getElementById('filter-status');
const refreshBtn = document.getElementById('refresh-btn');
const exportBtn = document.getElementById('export-btn');
const selectAllCheckbox = document.getElementById('select-all');

const selectedCountEl = document.getElementById('selected-count');
const bulkTemplateSelect = document.getElementById('bulk-template');
const bulkEmailBtn = document.getElementById('bulk-email-btn');
const bulkStatus = document.getElementById('bulk-status');

const emailDialog = document.getElementById('email-dialog');
const emailDialogTitle = document.getElementById('email-dialog-title');
const emailDialogClose = document.getElementById('email-dialog-close');
const tabCompose = document.getElementById('tab-compose');
const tabHistory = document.getElementById('tab-history');
const historyCountEl = document.getElementById('history-count');
const composePanel = document.getElementById('compose-panel');
const historyPanel = document.getElementById('history-panel');
const emailTemplateSelect = document.getElementById('email-template');
const emailSubjectInput = document.getElementById('email-subject');
const emailBodyTextarea = document.getElementById('email-body');
const emailSendStatus = document.getElementById('email-send-status');
const emailCancelBtn = document.getElementById('email-cancel-btn');
const emailSendBtn = document.getElementById('email-send-btn');
const historyList = document.getElementById('history-list');

const STATUSES = ['new', 'contacted', 'interested', 'not_interested', 'converted'];

let templates = [];
let currentLeads = [];
const selectedIds = new Set();
let activeLead = null;

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
  currentLeads = leads;
  renderLeads(leads);
  exportBtn.href = `/api/leads/export.csv${qs ? `?${qs}` : ''}`;
}

async function loadTemplates() {
  const res = await fetch('/api/email-templates');
  templates = await res.json();
  for (const select of [emailTemplateSelect, bulkTemplateSelect]) {
    select.innerHTML = '';
    for (const tpl of templates) {
      const opt = document.createElement('option');
      opt.value = tpl.id;
      opt.textContent = tpl.label;
      opt.title = tpl.description;
      select.appendChild(opt);
    }
  }
}

function renderLeads(leads) {
  leadCount.textContent = `${leads.length} lead${leads.length === 1 ? '' : 's'}`;
  leadsBody.innerHTML = '';
  for (const lead of leads) {
    leadsBody.appendChild(renderRow(lead));
  }
  selectAllCheckbox.checked = leads.length > 0 && leads.every((l) => selectedIds.has(l.id));
  updateBulkToolbar();
}

function renderRow(lead) {
  const tr = document.createElement('tr');
  tr.dataset.id = lead.id;

  const selectTd = document.createElement('td');
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.checked = selectedIds.has(lead.id);
  checkbox.addEventListener('change', () => {
    if (checkbox.checked) selectedIds.add(lead.id);
    else selectedIds.delete(lead.id);
    updateBulkToolbar();
  });
  selectTd.appendChild(checkbox);
  tr.appendChild(selectTd);

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
  actionsTd.className = 'actions-cell';

  const emailBtn = document.createElement('button');
  emailBtn.textContent = 'Email';
  emailBtn.className = 'email-btn';
  if (!lead.email) {
    emailBtn.disabled = true;
    emailBtn.title = 'Add an email address first';
  }
  emailBtn.addEventListener('click', () => openEmailDialog(lead, 'compose'));
  actionsTd.appendChild(emailBtn);

  const historyBtn = document.createElement('button');
  historyBtn.textContent = `✉ ${lead.emails_sent ?? 0}`;
  historyBtn.className = 'history-btn';
  historyBtn.title = lead.last_emailed_at ? `Last sent ${formatDate(lead.last_emailed_at)}` : 'No emails sent yet';
  historyBtn.addEventListener('click', () => openEmailDialog(lead, 'history'));
  actionsTd.appendChild(historyBtn);

  const delBtn = document.createElement('button');
  delBtn.textContent = 'Delete';
  delBtn.className = 'delete-btn';
  delBtn.addEventListener('click', async () => {
    if (!confirm(`Remove ${lead.name} from your list?`)) return;
    await fetch(`/api/leads/${lead.id}`, { method: 'DELETE' });
    selectedIds.delete(lead.id);
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

function formatDate(iso) {
  if (!iso) return '';
  return new Date(iso.replace(' ', 'T') + 'Z').toLocaleString();
}

// ---- Bulk selection ----

function updateBulkToolbar() {
  selectedCountEl.textContent = `${selectedIds.size} selected`;
  bulkEmailBtn.disabled = selectedIds.size === 0;
}

selectAllCheckbox.addEventListener('change', () => {
  for (const lead of currentLeads) {
    if (selectAllCheckbox.checked) selectedIds.add(lead.id);
    else selectedIds.delete(lead.id);
  }
  renderLeads(currentLeads);
});

bulkEmailBtn.addEventListener('click', async () => {
  const templateId = bulkTemplateSelect.value;
  const templateLabel = templates.find((t) => t.id === templateId)?.label ?? templateId;
  const count = selectedIds.size;
  if (!confirm(`Send "${templateLabel}" to ${count} lead${count === 1 ? '' : 's'}?`)) return;

  bulkEmailBtn.disabled = true;
  bulkStatus.textContent = `Sending to ${count} lead${count === 1 ? '' : 's'}...`;
  try {
    const res = await fetch('/api/leads/email-bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ leadIds: [...selectedIds], template: templateId }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Bulk send failed');
    bulkStatus.textContent = `Sent ${data.sent}, skipped ${data.skipped}, failed ${data.failed}.`;
    selectedIds.clear();
    await loadLeads();
  } catch (err) {
    bulkStatus.textContent = `Error: ${err.message}`;
  } finally {
    updateBulkToolbar();
  }
});

// ---- Email compose / history dialog ----

function switchTab(tab) {
  const isCompose = tab === 'compose';
  tabCompose.classList.toggle('active', isCompose);
  tabHistory.classList.toggle('active', !isCompose);
  composePanel.hidden = !isCompose;
  historyPanel.hidden = isCompose;
}

async function openEmailDialog(lead, tab) {
  activeLead = lead;
  emailDialogTitle.textContent = `Email — ${lead.name}`;
  emailSendStatus.textContent = '';
  switchTab(tab);

  if (tab === 'history') {
    await loadHistory(lead.id);
  } else {
    await loadPreview(lead.id, emailTemplateSelect.value || templates[0]?.id);
  }

  if (typeof emailDialog.showModal === 'function') emailDialog.showModal();
  else emailDialog.setAttribute('open', '');
}

async function loadPreview(leadId, templateId) {
  if (!templateId) return;
  const res = await fetch(`/api/leads/${leadId}/email-preview?template=${encodeURIComponent(templateId)}`);
  const data = await res.json();
  if (!res.ok) {
    emailSendStatus.textContent = `Error: ${data.error}`;
    return;
  }
  emailTemplateSelect.value = templateId;
  emailSubjectInput.value = data.subject;
  emailBodyTextarea.value = data.body;
}

async function loadHistory(leadId) {
  const res = await fetch(`/api/leads/${leadId}/emails`);
  const emails = await res.json();
  historyCountEl.textContent = emails.length;
  historyList.innerHTML = '';
  if (emails.length === 0) {
    const li = document.createElement('li');
    li.className = 'history-empty';
    li.textContent = 'No emails sent to this lead yet.';
    historyList.appendChild(li);
    return;
  }
  for (const email of emails) {
    const li = document.createElement('li');
    li.className = `history-item status-${email.status}`;
    li.innerHTML = `
      <div class="history-item-head">
        <strong>${escapeHtml(email.subject)}</strong>
        <span class="history-badge">${email.status}</span>
      </div>
      <div class="history-item-meta">${escapeHtml(email.template)} &middot; ${formatDate(email.created_at)}</div>
      ${email.error ? `<div class="history-error">${escapeHtml(email.error)}</div>` : ''}
    `;
    historyList.appendChild(li);
  }
}

emailTemplateSelect.addEventListener('change', () => {
  if (activeLead) loadPreview(activeLead.id, emailTemplateSelect.value);
});

tabCompose.addEventListener('click', () => switchTab('compose'));
tabHistory.addEventListener('click', () => {
  switchTab('history');
  if (activeLead) loadHistory(activeLead.id);
});

emailSendBtn.addEventListener('click', async () => {
  if (!activeLead) return;
  emailSendBtn.disabled = true;
  emailSendStatus.textContent = 'Sending...';
  try {
    const res = await fetch(`/api/leads/${activeLead.id}/email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        template: emailTemplateSelect.value,
        subject: emailSubjectInput.value,
        body: emailBodyTextarea.value,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Send failed');
    emailSendStatus.textContent = 'Sent.';
    await loadLeads();
    setTimeout(() => emailDialog.close(), 700);
  } catch (err) {
    emailSendStatus.textContent = `Error: ${err.message}`;
  } finally {
    emailSendBtn.disabled = false;
  }
});

emailCancelBtn.addEventListener('click', () => emailDialog.close());
emailDialogClose.addEventListener('click', () => emailDialog.close());

// ---- Search + filters ----

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

(async function init() {
  await loadTemplates();
  await loadLeads();
})();
