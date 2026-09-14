// Contact enrichment via the Apollo.io REST API (a licensed B2B contact
// database — not scraping). Needs an API key from your Apollo dashboard:
// Settings → Integrations → API. Each successful email reveal consumes an
// Apollo lead credit — check your dashboard for current pricing/balance.
//
// NOTE: this was written against Apollo's documented v1 API contract and
// could not be live-tested against api.apollo.io from this environment
// (network egress here is restricted). If a call fails with an unexpected
// shape, check the printed response body against your Apollo dashboard's
// API reference and adjust APOLLO_API_BASE / the request bodies below —
// the failure mode is a clear HTTP error, not silent bad data.
const API_BASE = process.env.APOLLO_API_BASE || 'https://api.apollo.io/api/v1';

const DEFAULT_TITLES = [
  'Owner', 'Founder', 'Co-Founder', 'President', 'CEO',
  'General Manager', 'Managing Partner', 'Operations Manager',
];

function targetTitles() {
  const custom = process.env.ENRICH_TARGET_TITLES;
  return custom ? custom.split(',').map((t) => t.trim()).filter(Boolean) : DEFAULT_TITLES;
}

async function apolloRequest(path, body) {
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) {
    const err = new Error('APOLLO_API_KEY is not set');
    err.status = 500;
    throw err;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    const err = new Error(`Apollo API returned non-JSON response (HTTP ${res.status}): ${text.slice(0, 300)}`);
    err.status = 502;
    throw err;
  }
  if (!res.ok) {
    const err = new Error(`Apollo API error (HTTP ${res.status}): ${json.error || json.message || text.slice(0, 300)}`);
    err.status = res.status;
    throw err;
  }
  return json;
}

async function searchPeopleAtOrganization({ organizationName, city, state }) {
  const body = {
    q_organization_name: organizationName,
    person_titles: targetTitles(),
    page: 1,
    per_page: 5,
  };
  if (city || state) {
    body.person_locations = [[city, state].filter(Boolean).join(', ')];
  }
  const json = await apolloRequest('/mixed_people/search', body);
  return json.people || [];
}

async function matchPerson({ firstName, lastName, organizationName }) {
  const json = await apolloRequest('/people/match', {
    first_name: firstName,
    last_name: lastName,
    organization_name: organizationName,
    reveal_personal_emails: true,
  });
  return json.person || null;
}

function isUsableEmail(email) {
  return Boolean(email) && !/email_not_unlocked|not_unlocked@/i.test(email);
}

function pickBestCandidate(people) {
  if (!people.length) return null;
  const priority = targetTitles().map((t) => t.toLowerCase());
  const ranked = [...people].sort((a, b) => {
    const ai = priority.indexOf((a.title || '').toLowerCase());
    const bi = priority.indexOf((b.title || '').toLowerCase());
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });
  return ranked[0];
}

// Finds a likely decision-maker at `lead`'s business and reveals their
// contact email. Returns { status: 'found' | 'not_found', ... }.
export async function enrichLeadContact(lead) {
  const candidates = await searchPeopleAtOrganization({
    organizationName: lead.name,
    city: lead.city,
    state: lead.state,
  });

  const candidate = pickBestCandidate(candidates);
  if (!candidate) {
    return { status: 'not_found', reason: 'No matching contact found at this organization' };
  }

  const matched = await matchPerson({
    firstName: candidate.first_name,
    lastName: candidate.last_name,
    organizationName: lead.name,
  });

  if (!matched || !isUsableEmail(matched.email)) {
    return {
      status: 'not_found',
      reason: 'Found a contact but could not reveal a usable email',
      contactName: [candidate.first_name, candidate.last_name].filter(Boolean).join(' '),
      contactTitle: candidate.title || null,
      raw: matched || candidate,
    };
  }

  return {
    status: 'found',
    contactName: [matched.first_name, matched.last_name].filter(Boolean).join(' '),
    contactTitle: matched.title || candidate.title || null,
    email: matched.email,
    phone: matched.phone_numbers?.[0]?.raw_number || null,
    raw: matched,
  };
}
