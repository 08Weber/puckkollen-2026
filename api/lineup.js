// Line-ups for one game (goalies and lines), re-scraped from swehockey and cached at the CDN for 1 minute.
// Swehockey posts them about an hour before face-off; until then this returns { teams: [] }.
import { BASE, parseLineup, parseLive, seriesFor } from '../lib/swehockey.js';

const page = (path) =>
  fetch(`${BASE}${path}`, { headers: { 'User-Agent': 'Mozilla/5.0' } }).then((r) =>
    r.ok ? r.text() : Promise.reject(new Error(`swehockey ${r.status}`))
  );

// Errors are cached briefly too, so a swehockey outage doesn't turn every visit into a new request to them.
const FAIL = { status: 502, headers: { 'Cache-Control': 'public, s-maxage=30' } };

// ?id= swehockey game id when the schedule has it (played games), else ?home=&away= to look it up on today's Live page.
export async function GET(req) {
  const q = new URL(req.url).searchParams;
  try {
    let id = /^\d+$/.test(q.get('id')) ? q.get('id') : null;
    id ??= parseLive(await page(`/ScheduleAndResults/Live/${seriesFor(req).id}`)).find((l) => l.home === q.get('home') && l.away === q.get('away'))?.id;
    const teams = id ? parseLineup(await page(`/Game/LineUps/${id}`)) : [];
    return Response.json({ id, teams }, { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' } });
  } catch (e) {
    return Response.json({ error: e.message }, FAIL);
  }
}
