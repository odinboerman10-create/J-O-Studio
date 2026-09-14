import * as cheerio from 'cheerio';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = process.env.ANTHROPIC_API_KEY ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }) : null;
const MODEL = process.env.AUDIT_MODEL || process.env.OUTREACH_MODEL || 'claude-haiku-4-5-20251001';

const CTA_PHRASES = [
  'contact us', 'call now', 'call today', 'get a quote', 'get a free quote', 'request a quote',
  'book now', 'book online', 'schedule', 'free consultation', 'get started', 'learn more',
  'sign up', 'request a call', 'get in touch',
];

const PHONE_RE = /(\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/;
const ADDRESS_RE = /\d{1,6}\s+[A-Za-z0-9.'\s]{3,40}\b(street|st|avenue|ave|road|rd|boulevard|blvd|drive|dr|lane|ln|way|suite|ste)\b/i;
const SOCIAL_DOMAINS = {
  facebook: /facebook\.com/i,
  instagram: /instagram\.com/i,
  linkedin: /linkedin\.com/i,
  twitter: /(twitter\.com|x\.com)/i,
  youtube: /youtube\.com/i,
  tiktok: /tiktok\.com/i,
  google: /(g\.page|goo\.gl\/maps|maps\.google)/i,
};

export async function fetchSiteHtml(url) {
  const started = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; JOStudiosSiteAuditor/1.0)' },
    });
    const html = await res.text();
    return {
      html,
      finalUrl: res.url || url,
      status: res.status,
      ok: res.ok,
      loadTimeMs: Date.now() - started,
      contentLength: html.length,
    };
  } finally {
    clearTimeout(timeout);
  }
}

export function extractSignals(html) {
  const $ = cheerio.load(html);

  const jsonLdBlocks = $('script[type="application/ld+json"]')
    .map((_, el) => $(el).text())
    .get();
  const hasSchemaMarkup = jsonLdBlocks.length > 0;
  const hasLocalBusinessSchema = jsonLdBlocks.some((block) =>
    /(LocalBusiness|Organization|ProfessionalService|Store)/i.test(block)
  );

  $('script, style, noscript').remove();

  const title = $('title').first().text().trim();
  const metaDescription = $('meta[name="description"]').attr('content')?.trim() || '';
  const h1s = $('h1').map((_, el) => $(el).text().trim()).get().filter(Boolean);
  const h2Count = $('h2').length;

  const bodyText = $('body').text().replace(/\s+/g, ' ').trim();
  const wordCount = bodyText ? bodyText.split(' ').length : 0;

  const images = $('img');
  const imgCount = images.length;
  const imgMissingAltCount = images.filter((_, el) => !$(el).attr('alt')?.trim()).length;

  const hasViewportMeta = $('meta[name="viewport"]').length > 0;

  const links = $('a[href]');
  let internalLinkCount = 0;
  let externalLinkCount = 0;
  const socialLinks = {};
  links.each((_, el) => {
    const href = $(el).attr('href') || '';
    if (/^https?:\/\//i.test(href)) {
      externalLinkCount += 1;
      for (const [platform, re] of Object.entries(SOCIAL_DOMAINS)) {
        if (re.test(href)) socialLinks[platform] = true;
      }
    } else if (href && !href.startsWith('#') && !href.startsWith('mailto:') && !href.startsWith('tel:')) {
      internalLinkCount += 1;
    }
  });

  const linkTexts = links.map((_, el) => $(el).text().toLowerCase()).get().join(' ');
  const hrefs = links.map((_, el) => ($(el).attr('href') || '').toLowerCase()).get().join(' ');
  const hasBlogOrNews = /(blog|news|insights|articles)/.test(linkTexts + hrefs);

  const lowerBody = bodyText.toLowerCase();
  const ctaKeywordsFound = CTA_PHRASES.filter((phrase) => lowerBody.includes(phrase));
  const hasTestimonialSignals = /(testimonial|review|★|customer stor)/i.test(bodyText) ||
    jsonLdBlocks.some((block) => /(Review|AggregateRating)/i.test(block));

  return {
    title,
    titleLength: title.length,
    metaDescription,
    metaDescriptionLength: metaDescription.length,
    h1s,
    h1Count: h1s.length,
    h2Count,
    wordCount,
    imgCount,
    imgMissingAltCount,
    hasViewportMeta,
    hasSchemaMarkup,
    hasLocalBusinessSchema,
    phoneFound: PHONE_RE.test(bodyText),
    addressFound: ADDRESS_RE.test(bodyText),
    ctaKeywordsFound,
    socialLinks,
    hasBlogOrNews,
    hasTestimonialSignals,
    internalLinkCount,
    externalLinkCount,
    textSample: bodyText.slice(0, 3000),
  };
}

export async function critiqueContent({ url, signals }) {
  if (!anthropic) {
    const err = new Error('ANTHROPIC_API_KEY is not set');
    err.status = 500;
    throw err;
  }

  const prompt = `You are a sharp, practical web content/SEO consultant at a local-business web design agency. Critique this website's CONTENT — not code or performance — with an eye toward helping it get found and chosen on Google by local customers.

URL: ${url}

Extracted signals (JSON):
${JSON.stringify(
    {
      title: signals.title,
      titleLength: signals.titleLength,
      metaDescription: signals.metaDescription,
      metaDescriptionLength: signals.metaDescriptionLength,
      h1s: signals.h1s,
      h1Count: signals.h1Count,
      h2Count: signals.h2Count,
      wordCount: signals.wordCount,
      imgCount: signals.imgCount,
      imgMissingAltCount: signals.imgMissingAltCount,
      hasViewportMeta: signals.hasViewportMeta,
      hasLocalBusinessSchema: signals.hasLocalBusinessSchema,
      phoneFound: signals.phoneFound,
      addressFound: signals.addressFound,
      ctaKeywordsFound: signals.ctaKeywordsFound,
      socialLinks: signals.socialLinks,
      hasBlogOrNews: signals.hasBlogOrNews,
      hasTestimonialSignals: signals.hasTestimonialSignals,
    },
    null,
    2
  )}

Visible page text sample (may be truncated):
"""
${signals.textSample || '(no visible text extracted)'}
"""

Score and critique the CONTENT: clarity of the value proposition, whether a first-time visitor immediately understands what the business does and why to choose them, strength and visibility of calls-to-action, trust signals (reviews/testimonials/credentials), local SEO content signals (city/service-area mentions, NAP info, service descriptions), and content freshness (blog/news presence). Be specific and reference what you actually saw — don't invent facts not supported by the signals or text sample.

Respond with strict JSON only, no markdown fences, matching exactly this shape:
{
  "overallScore": <integer 0-100>,
  "grade": "<A|B|C|D|F>",
  "headline": "<one-sentence verdict>",
  "strengths": ["<short bullet>", ...up to 4],
  "quickWins": [{"issue": "...", "why": "...", "fix": "..."}, ...up to 4],
  "biggerProjects": [{"issue": "...", "why": "...", "fix": "..."}, ...up to 3],
  "localSeoNotes": "<short paragraph>",
  "pitch": "<short paragraph making the case for a web design agency's help, grounded in what was actually found>"
}`;

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 1500,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = response.content.find((block) => block.type === 'text')?.text ?? '{}';
  try {
    return JSON.parse(text);
  } catch {
    const err = new Error(`Model did not return valid JSON: ${text.slice(0, 200)}`);
    err.status = 502;
    throw err;
  }
}

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

const GRADE_COLORS = { A: '#2f9e63', B: '#5b9e2f', C: '#c99a1f', D: '#d17a2f', F: '#c94f4f' };

export function buildReportHtml({ url, signals, critique }) {
  const gradeColor = GRADE_COLORS[critique.grade] || '#5b6b8c';
  const renderList = (items) => items.map((s) => `<li>${escapeHtml(s)}</li>`).join('');
  const renderIssueList = (items) =>
    items
      .map(
        (item) => `
      <div class="issue">
        <div class="issue-title">${escapeHtml(item.issue)}</div>
        <div class="issue-why"><strong>Why it matters:</strong> ${escapeHtml(item.why)}</div>
        <div class="issue-fix"><strong>Fix:</strong> ${escapeHtml(item.fix)}</div>
      </div>`
      )
      .join('');

  const signalRows = [
    ['Page title', signals.title || '(missing)'],
    ['Title length', `${signals.titleLength} characters`],
    ['Meta description', signals.metaDescription || '(missing)'],
    ['H1 count', signals.h1Count],
    ['H2 count', signals.h2Count],
    ['Word count', signals.wordCount],
    ['Images', `${signals.imgCount} total, ${signals.imgMissingAltCount} missing alt text`],
    ['Mobile viewport tag', signals.hasViewportMeta ? 'Yes' : 'No'],
    ['LocalBusiness/Organization schema', signals.hasLocalBusinessSchema ? 'Yes' : 'No'],
    ['Phone number detected', signals.phoneFound ? 'Yes' : 'No'],
    ['Address detected', signals.addressFound ? 'Yes' : 'No'],
    ['Calls-to-action found', signals.ctaKeywordsFound.length ? signals.ctaKeywordsFound.join(', ') : '(none detected)'],
    ['Social links found', Object.keys(signals.socialLinks).length ? Object.keys(signals.socialLinks).join(', ') : '(none detected)'],
    ['Blog/news section', signals.hasBlogOrNews ? 'Yes' : 'No'],
    ['Testimonials/reviews on page', signals.hasTestimonialSignals ? 'Yes' : 'No'],
  ];

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Content Audit — ${escapeHtml(url)}</title>
<style>
  :root { --ink:#1c2333; --muted:#5b6b8c; --border:#e2e6ef; --bg:#ffffff; --panel:#f7f8fb; --accent:#3557d6; }
  * { box-sizing: border-box; }
  body { margin:0; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif; color:var(--ink); background:var(--bg); }
  main { max-width: 820px; margin: 0 auto; padding: 40px 24px 64px; }
  header { display:flex; align-items:center; justify-content:space-between; gap:16px; border-bottom:1px solid var(--border); padding-bottom:24px; margin-bottom:24px; flex-wrap:wrap; }
  header h1 { font-size:1.4rem; margin:0 0 4px; }
  header .url { color:var(--muted); word-break:break-all; }
  .grade-badge { display:flex; flex-direction:column; align-items:center; justify-content:center; width:84px; height:84px; border-radius:50%; color:white; font-weight:700; background:${gradeColor}; flex-shrink:0; }
  .grade-badge .grade { font-size:2rem; line-height:1; }
  .grade-badge .score { font-size:0.7rem; opacity:0.9; }
  .headline { font-size:1.1rem; font-weight:600; margin: 0 0 28px; }
  section { margin-bottom: 32px; }
  section h2 { font-size:1rem; text-transform:uppercase; letter-spacing:0.04em; color:var(--muted); margin-bottom:12px; }
  ul.plain { margin:0; padding-left:20px; }
  ul.plain li { margin-bottom:6px; }
  .issue { background:var(--panel); border:1px solid var(--border); border-radius:8px; padding:14px 16px; margin-bottom:10px; }
  .issue-title { font-weight:600; margin-bottom:6px; }
  .issue-why, .issue-fix { font-size:0.92rem; margin-top:4px; color:#33405c; }
  table { width:100%; border-collapse:collapse; font-size:0.88rem; }
  table td { padding:8px 10px; border-bottom:1px solid var(--border); vertical-align:top; }
  table td:first-child { color:var(--muted); width:40%; white-space:nowrap; }
  .pitch { background: #eef1fb; border:1px solid #d5daf5; border-radius:8px; padding:16px 18px; font-size:0.95rem; }
  footer { margin-top: 40px; padding-top:20px; border-top:1px solid var(--border); color:var(--muted); font-size:0.85rem; }
</style>
</head>
<body>
<main>
  <header>
    <div>
      <h1>Website Content Audit</h1>
      <div class="url">${escapeHtml(url)}</div>
    </div>
    <div class="grade-badge">
      <div class="grade">${escapeHtml(critique.grade)}</div>
      <div class="score">${escapeHtml(critique.overallScore)}/100</div>
    </div>
  </header>

  <p class="headline">${escapeHtml(critique.headline)}</p>

  <section>
    <h2>What's working</h2>
    <ul class="plain">${renderList(critique.strengths || [])}</ul>
  </section>

  <section>
    <h2>Quick wins</h2>
    ${renderIssueList(critique.quickWins || [])}
  </section>

  <section>
    <h2>Bigger projects</h2>
    ${renderIssueList(critique.biggerProjects || [])}
  </section>

  <section>
    <h2>Local SEO notes</h2>
    <p>${escapeHtml(critique.localSeoNotes)}</p>
  </section>

  <section>
    <h2>How J&amp;O Studios could help</h2>
    <div class="pitch">${escapeHtml(critique.pitch)}</div>
  </section>

  <section>
    <h2>Technical signals (appendix)</h2>
    <table>${signalRows.map(([k, v]) => `<tr><td>${escapeHtml(k)}</td><td>${escapeHtml(v)}</td></tr>`).join('')}</table>
  </section>

  <footer>Generated by J&amp;O Studios on ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}.</footer>
</main>
</body>
</html>`;
}

export async function runSiteAudit(url) {
  const fetched = await fetchSiteHtml(url);
  if (!fetched.ok) {
    const err = new Error(`Could not fetch ${fetched.finalUrl} (HTTP ${fetched.status}) — check the URL is correct and the site is up.`);
    err.status = 502;
    throw err;
  }
  const signals = extractSignals(fetched.html);
  const critique = await critiqueContent({ url: fetched.finalUrl, signals });
  const reportHtml = buildReportHtml({ url: fetched.finalUrl, signals, critique });
  return { url: fetched.finalUrl, signals, critique, reportHtml };
}
