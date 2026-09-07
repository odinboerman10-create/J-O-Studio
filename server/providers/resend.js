const RESEND_URL = 'https://api.resend.com/emails';

/**
 * Sends a single plain-text email via the Resend API.
 * Requires a RESEND_API_KEY and a verified `from` address/domain in Resend.
 */
export async function sendEmail({ apiKey, from, to, subject, text, replyTo }) {
  if (!apiKey) {
    const err = new Error('Missing Resend API key. Set RESEND_API_KEY in your .env file.');
    err.status = 400;
    throw err;
  }
  if (!from) {
    const err = new Error('Missing sender address. Set EMAIL_FROM in your .env file.');
    err.status = 400;
    throw err;
  }

  const res = await fetch(RESEND_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject,
      text,
      reply_to: replyTo || undefined,
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data?.message || `Resend API error (${res.status})`);
    err.status = res.status >= 400 && res.status < 500 ? 400 : 502;
    throw err;
  }
  return data;
}
