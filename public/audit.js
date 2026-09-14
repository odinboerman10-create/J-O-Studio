const form = document.getElementById('audit-form');
const urlInput = document.getElementById('url');
const auditBtn = document.getElementById('audit-btn');
const statusEl = document.getElementById('audit-status');
const auditsBody = document.getElementById('audits-body');

async function loadAudits() {
  const res = await fetch('/api/audits');
  const audits = await res.json();
  auditsBody.innerHTML = '';
  for (const audit of audits) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHtml(audit.url)}</td>
      <td>${escapeHtml(audit.grade ?? '—')}</td>
      <td>${audit.score ?? '—'}</td>
      <td>${escapeHtml(audit.headline ?? '')}</td>
      <td>${new Date(audit.created_at).toLocaleDateString()}</td>
      <td><a class="map-link" href="/api/audits/${audit.id}/report" target="_blank" rel="noopener">View report</a></td>
    `;
    auditsBody.appendChild(tr);
  }
}

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const url = urlInput.value.trim();
  auditBtn.disabled = true;
  statusEl.textContent = `Scanning ${url}... this can take 10-20s.`;

  try {
    const res = await fetch('/api/audit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Audit failed');
    statusEl.textContent = `Done — grade ${data.grade} (${data.score}/100).`;
    await loadAudits();
    window.open(`/api/audits/${data.id}/report`, '_blank');
  } catch (err) {
    statusEl.textContent = `Error: ${err.message}`;
  } finally {
    auditBtn.disabled = false;
  }
});

loadAudits();
