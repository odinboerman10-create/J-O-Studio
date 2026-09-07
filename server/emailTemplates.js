// Cold-outreach email sequence for leads found by the no-website-leads tool.
// Three steps, meant to be sent a few days apart: intro -> nudge -> breakup.

function footer({ senderName, address }) {
  const lines = [
    '',
    `— ${senderName}, J&O Studios`,
  ];
  if (address) lines.push(address);
  lines.push('Don\'t want emails like this? Reply "unsubscribe" and I\'ll take you off the list.');
  return lines.join('\n');
}

function firstName(businessName) {
  // Best-effort: leads only have a business name, not an owner name.
  return businessName;
}

export function buildTemplates({ senderName = 'The J&O Studios team', address = '' } = {}) {
  const sign = footer({ senderName, address });

  return {
    cold_intro: {
      id: 'cold_intro',
      label: 'Cold Intro',
      description: 'First touch — leads with the proof that Google has no website on file for them.',
      subject: (lead) => `found this searching for ${lead.name}`,
      body: (lead) => {
        const where = lead.city ? ` in ${lead.city}` : '';
        return [
          `Hi there,`,
          '',
          `I searched for ${lead.name} on Google this morning to see how you show up${where} — nothing came up. No website, no hours, nothing to click on for someone searching for you.`,
          '',
          `I run J&O Studios, a local web design shop. We build a full website, live in about a week, for $997 flat — no $5,000 agency quote, no eight-week timeline. I can put together a free one-page snapshot of exactly what a customer sees (and doesn't see) when they search for you right now. Want me to send it over? No pitch attached, just the screenshots.`,
          sign,
        ].join('\n');
      },
    },

    follow_up_1: {
      id: 'follow_up_1',
      label: 'Follow-up (curiosity + proof)',
      description: 'Second touch, ~4-5 days later — a lighter nudge with social proof.',
      subject: (lead) => `still no website for ${firstName(lead.name)}?`,
      body: (lead) => {
        return [
          `Hi again,`,
          '',
          `Following up on my last note — ${lead.name} still doesn't show up when someone searches for you on Google.`,
          '',
          `We just finished the same kind of build for another local business: live site, showing up on Google, done in under two weeks. Happy to show you what it looked like before I mention what it cost.`,
          '',
          `Worth a quick look?`,
          sign,
        ].join('\n');
      },
    },

    breakup: {
      id: 'breakup',
      label: 'Breakup',
      description: 'Final touch — short, no pressure, closes the loop or reopens it.',
      subject: () => `should I close this out?`,
      body: (lead) => {
        return [
          `Hi one more time,`,
          '',
          `I don't want to keep landing in your inbox about this, so I'll leave it here: if getting ${lead.name} found on Google isn't a priority right now, no problem at all — just let me know and I'll stop reaching out.`,
          '',
          `If it is something you want handled, reply "yes" and I'll send the free snapshot and a couple of open build slots this month.`,
          sign,
        ].join('\n');
      },
    },
  };
}

export const TEMPLATE_ORDER = ['cold_intro', 'follow_up_1', 'breakup'];

export function renderTemplate(templates, templateId, lead) {
  const tpl = templates[templateId];
  if (!tpl) {
    const err = new Error(`Unknown email template "${templateId}"`);
    err.status = 400;
    throw err;
  }
  return { subject: tpl.subject(lead), body: tpl.body(lead) };
}
