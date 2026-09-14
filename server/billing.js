import { stripe } from './stripeClient.js';
import { PACKAGES } from './packages.js';
import { getLead, insertPayment, updatePaymentStatus } from './db.js';

export async function createCheckoutSession({ packageId, origin }) {
  const pkg = PACKAGES.find((p) => p.id === packageId);
  if (!pkg) {
    const err = new Error('Unknown package');
    err.status = 400;
    throw err;
  }

  const priceData = {
    currency: 'usd',
    unit_amount: pkg.amountCents,
    product_data: { name: pkg.name, description: pkg.description },
  };
  const isSubscription = pkg.mode === 'subscription';
  if (isSubscription) {
    priceData.recurring = { interval: pkg.interval || 'month' };
  }

  const session = await stripe.checkout.sessions.create({
    mode: isSubscription ? 'subscription' : 'payment',
    line_items: [{ price_data: priceData, quantity: 1 }],
    automatic_tax: { enabled: true },
    billing_address_collection: 'required',
    success_url: `${origin}/success.html?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/pricing.html`,
  });

  insertPayment({
    type: 'checkout',
    stripeId: session.id,
    description: pkg.name,
    amountCents: pkg.amountCents,
    currency: 'usd',
    status: 'pending',
    hostedUrl: session.url,
  });

  return session;
}

export async function createAndSendInvoice({ leadId, description, amountCents, daysUntilDue = 7 }) {
  const lead = getLead(leadId);
  if (!lead) {
    const err = new Error('Lead not found');
    err.status = 404;
    throw err;
  }
  if (!lead.email) {
    const err = new Error('This lead has no email on file — add one before invoicing');
    err.status = 400;
    throw err;
  }

  const existing = await stripe.customers.list({ email: lead.email, limit: 1 });
  const customer = existing.data[0] || await stripe.customers.create({
    email: lead.email,
    name: lead.name,
    address: lead.address
      ? { line1: lead.address, city: lead.city ?? undefined, state: lead.state ?? undefined, country: 'US' }
      : undefined,
  });

  await stripe.invoiceItems.create({
    customer: customer.id,
    amount: amountCents,
    currency: 'usd',
    description,
  });

  const invoice = await stripe.invoices.create({
    customer: customer.id,
    collection_method: 'send_invoice',
    days_until_due: daysUntilDue,
    automatic_tax: { enabled: true },
    description: `${lead.name} — ${description}`,
  });

  await stripe.invoices.finalizeInvoice(invoice.id);
  const sent = await stripe.invoices.sendInvoice(invoice.id);

  insertPayment({
    leadId,
    type: 'invoice',
    stripeId: sent.id,
    customerEmail: lead.email,
    description,
    amountCents,
    currency: 'usd',
    status: 'pending',
    hostedUrl: sent.hosted_invoice_url,
  });

  return sent;
}

export async function handleWebhookEvent(event) {
  switch (event.type) {
    case 'checkout.session.completed':
      updatePaymentStatus(event.data.object.id, 'paid');
      break;
    case 'invoice.paid':
      updatePaymentStatus(event.data.object.id, 'paid');
      break;
    case 'invoice.payment_failed':
      updatePaymentStatus(event.data.object.id, 'failed');
      break;
    default:
      break;
  }
}
