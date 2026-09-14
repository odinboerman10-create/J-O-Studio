const packagesEl = document.getElementById('packages');
const statusEl = document.getElementById('checkout-status');

function formatPrice(amountCents, mode, interval) {
  const dollars = (amountCents / 100).toLocaleString('en-US', { minimumFractionDigits: 0 });
  return mode === 'subscription' ? `$${dollars}/${interval || 'month'}` : `$${dollars}`;
}

async function loadPackages() {
  const res = await fetch('/api/packages');
  const { packages } = await res.json();

  packagesEl.innerHTML = '';
  for (const pkg of packages) {
    const card = document.createElement('div');
    card.className = 'panel';
    card.style.marginBottom = '16px';
    card.innerHTML = `
      <h2>${pkg.name}</h2>
      <p class="subtitle">${pkg.description}</p>
      <p style="font-size:1.4rem;font-weight:700;margin:12px 0;">${formatPrice(pkg.amountCents, pkg.mode, pkg.interval)}</p>
      <button data-package-id="${pkg.id}">Get started</button>
    `;
    card.querySelector('button').addEventListener('click', () => startCheckout(pkg.id));
    packagesEl.appendChild(card);
  }
}

async function startCheckout(packageId) {
  statusEl.textContent = 'Redirecting to checkout…';
  try {
    const res = await fetch('/api/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ packageId }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Checkout failed');
    window.location.href = data.url;
  } catch (err) {
    statusEl.textContent = `Error: ${err.message}`;
  }
}

loadPackages();
