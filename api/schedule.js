// Live schedule/results, re-scraped from swehockey and cached at the CDN for 2 minutes.
import { BASE, SERIES_ID, parseSchedule } from '../lib/swehockey.js';

// Errors are cached briefly too, so a swehockey outage doesn't turn every visit into a new request to them.
const FAIL = { status: 502, headers: { 'Cache-Control': 'public, s-maxage=30' } };

export async function GET() {
  const res = await fetch(`${BASE}/ScheduleAndResults/Schedule/${SERIES_ID}`, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
  }).catch(() => null);
  if (!res?.ok) return Response.json({ error: `swehockey ${res?.status ?? 'unreachable'}` }, FAIL);
  const data = parseSchedule(await res.text());
  if (!data.games.length) return Response.json({ error: 'no games parsed' }, FAIL);
  return Response.json(data, {
    headers: { 'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=600' },
  });
}
