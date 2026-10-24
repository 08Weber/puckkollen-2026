// All events of one game (goals, penalties, goalie changes), re-scraped from swehockey and cached at the CDN for 15 seconds.
import { BASE, parseEvents, parseLive, seriesFor } from '../lib/swehockey.js';

const page = (path) =>
  fetch(`${BASE}${path}`, { headers: { 'User-Agent': 'Mozilla/5.0' } }).then((r) =>
    r.ok ? r.text() : Promise.reject(new Error(`swehockey ${r.status}`))
  );

// Errors are cached briefly too, so a swehockey outage doesn't turn every visit into a new request to them.
const FAIL = { status: 502, headers: { 'Cache-Control': 'public, s-maxage=30' } };

// ?id= swehockey game id when known, else ?home=&away= to look it up on today's Live page (same as /api/lineup).
export async function GET(req) {
  const q = new URL(req.url).searchParams;
  try {
    let id = /^\d+$/.test(q.get('id')) ? q.get('id') : null;
    id ??= parseLive(await page(`/ScheduleAndResults/Live/${seriesFor(req).id}`)).find((l) => l.home === q.get('home') && l.away === q.get('away'))?.id;
    const periods = id ? parseEvents(await page(`/Game/Events/${id}`)) : [];
    return Response.json({ id, periods }, { headers: { 'Cache-Control': 'public, s-maxage=15, stale-while-revalidate=60' } });
  } catch (e) {
    return Response.json({ error: e.message }, FAIL);
  }
}
