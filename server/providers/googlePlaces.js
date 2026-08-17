const SEARCH_URL = 'https://places.googleapis.com/v1/places:searchText';

const FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.addressComponents',
  'places.location',
  'places.rating',
  'places.userRatingCount',
  'places.websiteUri',
  'places.nationalPhoneNumber',
  'places.internationalPhoneNumber',
  'places.googleMapsUri',
  'places.businessStatus',
  'places.primaryTypeDisplayName',
  'nextPageToken',
].join(',');

function extractCityState(addressComponents = []) {
  const city = addressComponents.find((c) => c.types.includes('locality'))?.longText
    ?? addressComponents.find((c) => c.types.includes('postal_town'))?.longText
    ?? null;
  const state = addressComponents.find((c) => c.types.includes('administrative_area_level_1'))?.shortText ?? null;
  return { city, state };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Searches Google Places (Text Search, New API) for a query + location, paginating
 * through all pages, then returns only businesses that have NO website on file.
 * Requires a GOOGLE_PLACES_API_KEY with the "Places API (New)" enabled.
 */
export async function findBusinessesWithoutWebsite({ query, apiKey, maxPages = 3 }) {
  if (!apiKey) {
    const err = new Error('Missing Google Places API key. Set GOOGLE_PLACES_API_KEY in your .env file.');
    err.status = 400;
    throw err;
  }

  const allPlaces = [];
  let pageToken;
  let page = 0;

  do {
    const body = pageToken
      ? { pageToken }
      : { textQuery: query, pageSize: 20 };

    const res = await fetch(SEARCH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': FIELD_MASK,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      const err = new Error(`Google Places API error (${res.status}): ${text}`);
      err.status = res.status >= 400 && res.status < 500 ? 400 : 502;
      throw err;
    }

    const data = await res.json();
    allPlaces.push(...(data.places ?? []));
    pageToken = data.nextPageToken;
    page += 1;

    // A freshly issued nextPageToken needs a brief delay before it's valid.
    if (pageToken && page < maxPages) await sleep(2000);
  } while (pageToken && page < maxPages);

  const withoutWebsite = allPlaces.filter((p) => !p.websiteUri);

  return withoutWebsite.map((p) => {
    const { city, state } = extractCityState(p.addressComponents);
    return {
      source: 'google_places',
      sourceId: p.id,
      name: p.displayName?.text ?? 'Unknown business',
      category: p.primaryTypeDisplayName?.text ?? null,
      phone: p.nationalPhoneNumber ?? p.internationalPhoneNumber ?? null,
      email: null,
      address: p.formattedAddress ?? null,
      city,
      state,
      latitude: p.location?.latitude ?? null,
      longitude: p.location?.longitude ?? null,
      googleMapsUrl: p.googleMapsUri ?? null,
      rating: p.rating ?? null,
      reviewCount: p.userRatingCount ?? null,
      businessStatus: p.businessStatus ?? null,
    };
  });
}
