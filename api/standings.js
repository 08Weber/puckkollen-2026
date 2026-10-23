// Official group standings from swehockey (one overview page per group), cached at the CDN for 2 minutes.
import { BASE, parseStandings, seriesFor } from '../lib/swehockey.js';

export async function GET(req) {
  const GROUP_IDS = seriesFor(req).groups;
  const groups = {};
  await Promise.all(
    Object.entries(GROUP_IDS).map(async ([letter, id]) => {
      const res = await fetch(`${BASE}/ScheduleAndResults/Overview/${id}`, { headers: { 'User-Agent': 'Mozilla/5.0' } }).catch(() => null);
      const parsed = res?.ok ? parseStandings(await res.text()) : null;
      if (parsed) groups[letter] = { id, ...parsed };
    })
  );
  // All-or-nothing: a partial table would mix official and computed groups on the page.
  if (Object.keys(groups).length !== Object.keys(GROUP_IDS).length)
    return Response.json({ error: 'standings unavailable' }, { status: 502, headers: { 'Cache-Control': 'public, s-maxage=30' } });
  return Response.json({ groups }, { headers: { 'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=600' } });
}
