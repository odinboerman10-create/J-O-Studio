// One-time interactive helper to mint a Gmail refresh token for outreach sending.
// Run this LOCALLY on your own machine (not in CI) — it opens a browser consent
// screen and needs to catch a redirect on localhost.
//
// Setup before running:
//   1. https://console.cloud.google.com/ → create/select a project.
//   2. Enable the "Gmail API" (APIs & Services → Library).
//   3. APIs & Services → OAuth consent screen → configure it (External is fine;
//      add yourself as a test user if it stays in "Testing" mode).
//   4. APIs & Services → Credentials → Create Credentials → OAuth client ID →
//      Application type: "Desktop app". Copy the generated Client ID + secret.
//   5. Put those in .env as GMAIL_CLIENT_ID / GMAIL_CLIENT_SECRET, then run:
//        node scripts/gmail-auth.mjs
//   6. Approve access in the browser. This script prints a refresh token —
//      save it as GMAIL_REFRESH_TOKEN in .env AND as a GitHub Actions secret.
import 'dotenv/config';
import http from 'node:http';
import { google } from 'googleapis';

const PORT = 53682;
const REDIRECT_URI = `http://127.0.0.1:${PORT}`;

async function main() {
  const { GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET } = process.env;
  if (!GMAIL_CLIENT_ID || !GMAIL_CLIENT_SECRET) {
    console.error('Set GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET in .env first (see the comments at the top of this file).');
    process.exit(1);
  }

  const oauth2Client = new google.auth.OAuth2(GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, REDIRECT_URI);
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: ['https://www.googleapis.com/auth/gmail.send'],
  });

  console.log('Open this URL and approve access with the Google account you want to send outreach from:\n');
  console.log(authUrl);
  console.log(`\nWaiting for the redirect back to ${REDIRECT_URI} ...`);

  const code = await new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, REDIRECT_URI);
      const code = url.searchParams.get('code');
      if (code) {
        res.end('Success — you can close this tab and return to the terminal.');
        server.close();
        resolve(code);
      } else {
        res.end('No code found in redirect — check the terminal for errors.');
        server.close();
        reject(new Error('No authorization code received'));
      }
    });
    server.listen(PORT);
  });

  const { tokens } = await oauth2Client.getToken(code);
  if (!tokens.refresh_token) {
    console.error(
      '\nNo refresh_token returned. This usually means you already authorized this app before. ' +
      'Go to https://myaccount.google.com/permissions, remove access for this app, and re-run this script.'
    );
    process.exit(1);
  }

  console.log('\nSave this as GMAIL_REFRESH_TOKEN (in .env locally, and as a GitHub Actions secret):\n');
  console.log(tokens.refresh_token);
}

main();
