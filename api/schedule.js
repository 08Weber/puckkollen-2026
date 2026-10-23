// Live schedule/results, re-scraped from swehockey and cached at the CDN for 15 seconds
// (so at most ~4 fetches a minute per swehockey page, however many visitors poll during a game).
// The Live page adds today's running score, period and clock, and swehockey's game id.
import { BASE, attachTvIds, parseLive, parseSchedule, seriesFor, tvApi } from '../lib/swehockey.js';

// Errors are cached briefly too, so a swehockey outage doesn't turn every visit into a new request to them.
const FAIL = { status: 502, headers: { 'Cache-Control': 'public, s-maxage=30' } };

export async function GET(req) {
  const s = seriesFor(req);
  const [res, tv, live] = await Promise.all([
    fetch(`${BASE}/ScheduleAndResults/Schedule/${s.id}`, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    }).catch(() => null),
    fetch(tvApi(s), { headers: { 'site-id': 'SIF' } })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null),
    // A bonus: without it the schedule still works, just without period and clock.
    fetch(`${BASE}/ScheduleAndResults/Live/${s.id}`, { headers: { 'User-Agent': 'Mozilla/5.0' } })
      .then((r) => (r.ok ? r.text() : ''))
      .catch(() => ''),
  ]);
  if (!res?.ok) return Response.json({ error: `swehockey ${res?.status ?? 'unreachable'}` }, FAIL);
  const data = parseSchedule(await res.text());
  if (!data.games.length) return Response.json({ error: 'no games parsed' }, FAIL);
  attachTvIds(data.games, tv);
  // The Live page lists today's games only, so match on teams and today's date.
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Stockholm' });
  for (const l of parseLive(live)) {
    const g = data.games.find((x) => x.home === l.home && x.away === l.away && x.date === today);
    if (!g) continue;
    g.gameId = l.id;
    if (l.hs == null) continue;
    Object.assign(g, { hs: l.hs, as: l.as, periods: l.periods || g.periods, live: { status: l.status, clock: l.clock } });
  }
  return Response.json(data, {
    headers: { 'Cache-Control': 'public, s-maxage=15, stale-while-revalidate=600' },
  });
}
