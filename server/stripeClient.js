import Stripe from 'stripe';

if (!process.env.STRIPE_SECRET_KEY) {
  console.warn('WARNING: STRIPE_SECRET_KEY is not set. Payment/invoicing routes will fail until you add it to .env');
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
