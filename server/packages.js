// Web design service packages sold via Stripe Checkout.
// Edit names, descriptions, and amountCents (in cents) to match your real pricing —
// these are placeholder figures.
export const PACKAGES = [
  {
    id: 'starter',
    name: 'Starter Website',
    description: '5-page responsive website, on-page SEO setup, Google Business Profile optimization.',
    amountCents: 150000,
    mode: 'payment',
  },
  {
    id: 'growth',
    name: 'Growth Website + Local SEO',
    description: 'Full custom site, local SEO setup, Google Business Profile + review strategy, analytics dashboard.',
    amountCents: 350000,
    mode: 'payment',
  },
  {
    id: 'seo-retainer',
    name: 'Ongoing SEO & Maintenance',
    description: 'Monthly SEO optimization, content updates, and site maintenance to keep local rankings growing.',
    amountCents: 50000,
    mode: 'subscription',
    interval: 'month',
  },
];
