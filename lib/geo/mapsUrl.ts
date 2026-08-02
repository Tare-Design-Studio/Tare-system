/**
 * Extracts coordinates from a pasted Google Maps URL.
 *
 * Handles the shapes people actually paste:
 *   .../@12.9716,77.5946,17z/...        map centre (most common)
 *   .../place/Name/@12.9716,77.5946,17z place link
 *   ...?q=12.9716,77.5946               query form
 *   ...!3d12.9716!4d77.5946             the pin itself, inside the data= blob
 *   ...&ll=12.9716,77.5946              legacy
 *   "12.9716, 77.5946"                  bare coords typed by hand
 *
 * `!3d!4d` is preferred over `@`: on a place link the `@` is the map centre,
 * which is offset from the marker. Short links (maps.app.goo.gl / goo.gl/maps)
 * carry no coordinates until redirected — reported separately so the UI can
 * say so instead of silently failing.
 */

export type MapsParseResult =
  | { ok: true; lat: number; lng: number }
  | { ok: false; reason: "short_link" | "no_coords" };

const LAT_RANGE = 90;
const LNG_RANGE = 180;

function valid(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) && Number.isFinite(lng) &&
    Math.abs(lat) <= LAT_RANGE && Math.abs(lng) <= LNG_RANGE &&
    // 0,0 is in the Atlantic — always a parse artefact, never a real site.
    !(lat === 0 && lng === 0)
  );
}

export function parseMapsUrl(input: string): MapsParseResult {
  // Pasted URLs arrive percent-encoded (`?q=12.97,%2077.59`), which would defeat
  // the separator matching below. decodeURIComponent throws on a malformed `%`.
  let s = input.trim();
  try {
    s = decodeURIComponent(s);
  } catch {
    // keep the raw string — the patterns still match unencoded forms
  }
  if (!s) return { ok: false, reason: "no_coords" };

  if (/(maps\.app\.goo\.gl|goo\.gl\/maps)/i.test(s)) {
    return { ok: false, reason: "short_link" };
  }

  // Ordered by trustworthiness: marker pin, then explicit query, then centre.
  const patterns = [
    /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/,
    /[?&](?:q|ll|sll|daddr)=(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/,
    /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/,
    /^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/,
  ];

  for (const re of patterns) {
    const m = s.match(re);
    if (m) {
      const lat = Number(m[1]);
      const lng = Number(m[2]);
      if (valid(lat, lng)) return { ok: true, lat, lng };
    }
  }

  return { ok: false, reason: "no_coords" };
}
