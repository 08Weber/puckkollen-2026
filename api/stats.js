// Live player, goalie and penalty stats, re-scraped from swehockey and cached at the CDN for 5 minutes.
import { REMOVED_PLAYERS } from '../lib/removed.js';
import { BASE, parsePenalties, parsePlayerStats, seriesFor } from '../lib/swehockey.js';

const page = (path, id) =>
  fetch(`${BASE}/Teams/Info/${path}/${id}`, { headers: { 'User-Agent': 'Mozilla/5.0' } }).then((r) =>
    r.ok ? r.text() : Promise.reject(new Error(`swehockey ${r.status}`))
  );

// Errors are cached briefly too, so a swehockey outage doesn't turn every visit into a new request to them.
const FAIL = { status: 502, headers: { 'Cache-Control': 'public, s-maxage=30' } };

export async function GET(req) {
  const { id } = seriesFor(req);
  const [statsRes, penRes] = await Promise.allSettled([page('PlayersByTeam', id), page('PlayersByTeamPenalties', id)]);
  if (statsRes.status === 'rejected') return Response.json({ error: statsRes.reason.message }, FAIL);
  const data = parsePlayerStats(statsRes.value);
  if (!data.players.length) return Response.json({ error: 'no players parsed' }, FAIL);
  // The penalty breakdown is a bonus; serve the main stats even if that page fails.
  data.penalties = penRes.status === 'fulfilled' ? parsePenalties(penRes.value) : [];
  const keep = (r) => !REMOVED_PLAYERS.has(`${r.team}|${r.name}`);
  for (const k of ['players', 'goalies', 'penalties']) data[k] = data[k].filter(keep);
  return Response.json(data, {
    headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=900' },
  });
}
