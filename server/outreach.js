import Anthropic from '@anthropic-ai/sdk';
import { google } from 'googleapis';

const anthropic = process.env.ANTHROPIC_API_KEY ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }) : null;
const MODEL = process.env.OUTREACH_MODEL || 'claude-haiku-4-5-20251001';

export async function draftOutreachEmail(lead) {
  if (!anthropic) {
    const err = new Error('ANTHROPIC_API_KEY is not set');
    err.status = 500;
    throw err;
  }

  const senderName = process.env.OUTREACH_SENDER_NAME || 'J&O Studios';
  const prompt = `Write a short, personalized cold outreach email from a web design agency called "${senderName}" to a local business that currently has no website.

Business details:
- Name: ${lead.name}
- Category: ${lead.category || 'local business'}
- City/State: ${[lead.city, lead.state].filter(Boolean).join(', ') || 'unknown'}
- Google rating: ${lead.rating ? `${lead.rating} stars (${lead.review_count || 0} reviews)` : 'not listed'}
${lead.contact_name ? `- Recipient: ${lead.contact_name}${lead.contact_title ? ` (${lead.contact_title})` : ''} — address them by first name in the greeting` : '- Recipient: unknown — use a generic greeting like "Hi there" or open straight into the message, no "Dear Sir/Madam"'}

Requirements:
- Subject line under 60 characters, not salesy or spammy (no ALL CAPS, no excessive punctuation).
- Body: 3 short paragraphs max, plain text (no markdown).
- Open by noting specifically that they don't have a website on Google — that's the hook.
- Mention that a website helps them show up and get chosen when people search on Google.
- Soft call to action: reply to this email or reply with a good time for a quick call. No links, no attachments.
- Warm, direct, no corporate jargon or hype words like "revolutionize" or "unlock".
- Do not invent facts about the business beyond what's given above.

Respond with strict JSON only, no markdown fences: {"subject": "...", "body": "..."}`;

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 600,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = response.content.find((block) => block.type === 'text')?.text ?? '{}';
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    const err = new Error(`Model did not return valid JSON: ${text.slice(0, 200)}`);
    err.status = 502;
    throw err;
  }
  if (!parsed.subject || !parsed.body) {
    const err = new Error('Model response missing subject/body');
    err.status = 502;
    throw err;
  }
  return parsed;
}

export function appendComplianceFooter(body) {
  const address = process.env.OUTREACH_MAILING_ADDRESS;
  const senderName = process.env.OUTREACH_SENDER_NAME || 'J&O Studios';
  return `${body}\n\n—\n${senderName}\n${address}\nDon't want future emails like this? Just reply "unsubscribe" and we'll stop reaching out.`;
}

function getGmailClient() {
  const { GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN } = process.env;
  if (!GMAIL_CLIENT_ID || !GMAIL_CLIENT_SECRET || !GMAIL_REFRESH_TOKEN) {
    const err = new Error('Gmail credentials are not fully configured (GMAIL_CLIENT_ID / GMAIL_CLIENT_SECRET / GMAIL_REFRESH_TOKEN)');
    err.status = 500;
    throw err;
  }
  const oauth2Client = new google.auth.OAuth2(GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET);
  oauth2Client.setCredentials({ refresh_token: GMAIL_REFRESH_TOKEN });
  return google.gmail({ version: 'v1', auth: oauth2Client });
}

function encodeMimeMessage({ to, from, subject, body }) {
  const lines = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
    '',
    body,
  ];
  return Buffer.from(lines.join('\r\n'))
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export async function sendOutreachEmail({ to, subject, body }) {
  const senderEmail = process.env.GMAIL_SENDER_EMAIL;
  const senderName = process.env.OUTREACH_SENDER_NAME || 'J&O Studios';
  if (!senderEmail) {
    const err = new Error('GMAIL_SENDER_EMAIL is not set');
    err.status = 500;
    throw err;
  }

  const gmail = getGmailClient();
  const raw = encodeMimeMessage({ to, from: `${senderName} <${senderEmail}>`, subject, body });
  const res = await gmail.users.messages.send({ userId: 'me', requestBody: { raw } });
  return res.data;
}
