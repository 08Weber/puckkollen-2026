// Scrapes rosters + schedule from swehockey and resolves each player's Elite Prospects profile.
// Usage: node scripts/build-data.js  -> writes public/data.json
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { REMOVED_PLAYERS } from '../lib/removed.js';
import { BASE, SERIES_ID, TV_API, attachTvIds, parseRoster, parseSchedule } from '../lib/swehockey.js';

const get = async (url) => {
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res;
};

const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, '');
const posGroup = (p) => (p === 'GK' ? 'G' : /D$/.test(p) ? 'D' : 'F');
// Kids switch between D and F, so only goalie vs skater disqualifies; an empty EP position is allowed.
const isGoalie = (epPos) => /^G/.test(epPos || '');
const used = new Set();

async function findEP(p) {
  // Double surnames are often listed on EP with only one part (or one extra), so try each surname word,
  // and finally the surname alone. Matching stays strict: birth year + first name + a shared surname word.
  const first = p.first.split(/\s+/)[0];
  const words = [...new Set(p.last.split(/\s+/))];
  const queries = [...new Set([`${p.first} ${p.last}`, ...words.map((w) => `${first} ${w}`), ...words])];
  for (const q of queries) {
    const ep = await lookupEP(p, q, first, words);
    if (ep) return ep;
  }
  return null;
}

async function lookupEP(p, q, first, surnames) {
  let hits;
  try {
    hits = await (await get(`https://autocomplete.eliteprospects.com/all?q=${encodeURIComponent(q)}`)).json();
  } catch {
    return null;
  }
  const year = p.born.slice(0, 4);
  const sn = surnames.map(norm);
  const cands = hits.filter((h) => {
    if (h._type !== 'player' || h.age !== year || used.has(h.id) || (h.position && isGoalie(h.position) !== (p.pos === 'GK'))) return false;
    const [hf, ...hl] = h.fullname.split(/\s+/).map(norm);
    return hf === norm(first) && hl.some((w) => sn.includes(w));
  });
  // Several same-name, same-year kids: prefer matching position, then current club.
  const club = (h) => norm(h.team || '').includes(norm(p.club).slice(0, 6));
  const pos = (h) => h.position?.startsWith(posGroup(p.pos));
  const best = cands.find((h) => club(h) && pos(h)) || cands.find(club) || cands.find(pos) || cands[0];
  if (!best) return null;
  used.add(best.id);
  return `${best.id}/${best.slug}`;
}

async function pool(items, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) await fn(items[i++]); }));
}

const rosterHtml = await (await get(`${BASE}/Teams/Info/TeamRoster/${SERIES_ID}`)).text();
const scheduleHtml = await (await get(`${BASE}/ScheduleAndResults/Schedule/${SERIES_ID}`)).text();
const teams = parseRoster(rosterHtml);
for (const t of teams) t.players = t.players.filter((p) => !REMOVED_PLAYERS.has(`${t.name}|${p.last}, ${p.first}`));
const schedule = parseSchedule(scheduleHtml);
const tvBroadcasts = await fetch(TV_API, { headers: { 'site-id': 'SIF' } }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
attachTvIds(schedule.games, tvBroadcasts);

const players = teams.flatMap((t) => t.players);
let found = 0;
await pool(players, 6, async (p) => {
  p.ep = await findEP(p);
  if (p.ep) found++;
});
console.log(`EP matched ${found}/${players.length} players`);
if (found < players.length * 0.5) throw new Error('EP match rate suspiciously low, aborting');

// Logos from Elite Prospects, saved locally under public/logos/ so the site doesn't hotlink.
const logoDir = new URL('../public/logos/', import.meta.url);
mkdirSync(logoDir, { recursive: true });

async function teamHits(q) {
  try {
    const hits = await (await get(`https://autocomplete.eliteprospects.com/all?q=${encodeURIComponent(q)}`)).json();
    return hits.filter((h) => h._type === 'team' && h.logo);
  } catch {
    return [];
  }
}

async function saveLogo(file) {
  const name = file.replace('_small', '');
  if (!existsSync(new URL(name, logoDir))) {
    const res = await get(`https://files.eliteprospects.com/layout/logos/${file.replace('_small', '_medium')}`);
    writeFileSync(new URL(name, logoDir), Buffer.from(await res.arrayBuffer()));
  }
  return name;
}

// District teams: EP lists them in the "TV-Pucken" league, sometimes with "-" instead of "/" or without " län".
await pool(teams, 4, async (t) => {
  for (const q of [t.name, t.name.replace('/', ' '), t.name.split(/[/ ]/)[0]]) {
    const hit = (await teamHits(q)).find((h) => h.league === 'TV-Pucken');
    if (hit) {
      t.logo = await saveLogo(hit.logo);
      t.epTeam = `${hit.id}/${hit.slug}`;
      console.log(`team  ${t.name} -> ${hit.fullteam}`);
      return;
    }
  }
  console.log(`team  ${t.name} -> NO LOGO`);
});

// Player clubs: exact name first, else the club's youth/senior variant ("Karlskrona HK U16").
// Swehockey uses the registered association name; EP the hockey name. Map the ones that differ.
const CLUB_ALIASES = {
  'Mörrums GoIS IK': 'Mörrums GoIS', 'Lysekils HK Viking': 'Lysekils HK', 'Bofors IK Karlskoga': 'BIK Karlskoga',
  'Visby-Roma HK Ungdom': 'Visby/Roma', 'Umeå Hockey Klubb': 'Umeå HK', 'IF Malmö Redhawks': 'Malmö Redhawks',
  'HV 71': 'HV71', 'Lidingö Vikings HC': 'Lidingö Vikings', 'Åker/Strängnäs HC': 'Åker Strängnäs',
  'Eskilstuna Linden Hockey': 'Linden Hockey', 'Enköpings SK HK': 'Enköpings SK', 'Tegs SK Hockey Ungdom': 'Tegs SK',
  'Mariestad BoIS HC': 'Mariestad BoIS', 'Sörhaga/Alingsås HK': 'Sörhaga', 'IFK Arboga IK': 'IFK Arboga',
  'Örebro Hockey UF': 'Örebro HUF', 'Kumla Hockey Club': 'Kumla HC',
};
const clubs = [...new Set(players.map((p) => p.club))];
const clubLogos = {};
await pool(clubs, 4, async (club) => {
  const q = CLUB_ALIASES[club] ?? club;
  const hits = await teamHits(q.replace('/', ' ')); // EP search returns nothing for queries containing "/"
  const want = [norm(club), norm(q)];
  const hit =
    hits.find((h) => want.includes(norm(h.fullteam))) ||
    hits.find((h) => want.includes(norm(h.fullteam.replace(/ (U|J)\d+.*$/, ''))));
  if (hit) clubLogos[club] = await saveLogo(hit.logo);
  else console.log(`club  ${club} -> NO LOGO (${hits.slice(0, 3).map((h) => h.fullteam).join(', ')})`);
});
console.log(`club logos ${Object.keys(clubLogos).length}/${clubs.length}`);

// Minors: publish birth year only. The full date was needed above for EP matching (year) and nothing else.
for (const p of players) p.born = p.born.slice(0, 4);

writeFileSync(
  new URL('../public/data.json', import.meta.url),
  JSON.stringify({ built: new Date().toISOString(), teams, clubLogos, ...schedule })
);
