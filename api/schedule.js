// Live schedule/results, re-scraped from swehockey and cached at the CDN for 15 seconds
// (so at most ~4 swehockey fetches a minute, however many visitors poll during a game).
import { BASE, attachTvIds, parseSchedule, seriesFor, tvApi } from '../lib/swehockey.js';

// Errors are cached briefly too, so a swehockey outage doesn't turn every visit into a new request to them.
const FAIL = { status: 502, headers: { 'Cache-Control': 'public, s-maxage=30' } };

export async function GET(req) {
  const s = seriesFor(req);
  const [res, tv] = await Promise.all([
    fetch(`${BASE}/ScheduleAndResults/Schedule/${s.id}`, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    }).catch(() => null),
    fetch(tvApi(s), { headers: { 'site-id': 'SIF' } })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null),
  ]);
  if (!res?.ok) return Response.json({ error: `swehockey ${res?.status ?? 'unreachable'}` }, FAIL);
  const data = parseSchedule(await res.text());
  if (!data.games.length) return Response.json({ error: 'no games parsed' }, FAIL);
  attachTvIds(data.games, tv);
  return Response.json(data, {
    headers: { 'Cache-Control': 'public, s-maxage=15, stale-while-revalidate=600' },
  });
}
