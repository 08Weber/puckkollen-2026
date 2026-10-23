// Parsers for stats.swehockey.se HTML (no DOM lib needed: the markup is regular table rows).
export const BASE = 'https://stats.swehockey.se';
// Boys (p) and girls (f) play at the same time; the API picks one with ?k=p|f (boys by default).
// groups: swehockey group overview pages · tv: SvenskHockey.tv competition · epLeague: league name on Elite Prospects.
export const SERIES = {
  p: { id: 21877, groups: { A: 21878, B: 21879, C: 21880, D: 21881 }, tv: '6ad452cbac6ac10a664b9636', epLeague: 'TV-Pucken' },
  f: { id: 21931, groups: { A: 21932, B: 21933, C: 21934, D: 21935 }, tv: '6ad452cbc5f9185d8d8f769e', epLeague: 'TV-Pucken (W)' },
};
export const seriesFor = (req) => SERIES[new URL(req.url).searchParams.get('k')] || SERIES.p;
export const tvApi = (s) => `https://api.livearenasports.com/broadcast?competition-id=${s.tv}&page-size=200`;

export function attachTvIds(games, broadcasts) {
  if (!Array.isArray(broadcasts)) return games;
  for (const g of games) {
    const b =
      broadcasts.find((x) => x.start?.slice(0, 10) === g.date && x.homeTeam?.name === g.home && x.awayTeam?.name === g.away) ||
      broadcasts.find((x) => x.homeTeam?.name === g.home && x.awayTeam?.name === g.away);
    if (b?.id) g.tvId = b.id;
  }
  return games;
}

const decode = (s) =>
  s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ');

const text = (s) => decode(s.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();

// Returns the cells of a <tr> as [{ html, text }], including self-closing <td ... />.
function cells(row) {
  const out = [];
  for (const m of row.matchAll(/<td\b[^>]*?(?:\/>|>([\s\S]*?)<\/td>)/g)) {
    const html = m[1] || '';
    out.push({ html, text: text(html) });
  }
  return out;
}

export function parseSchedule(html) {
  const updated = (html.match(/Last update:\s*([\d-]+ [\d:]+)/) || [])[1] || null;
  const games = [];
  for (const row of html.split('<tr>')) {
    if (!row.includes('lnkTooltip')) continue;
    const c = cells(row);
    const [round, date, game, result, periods, spectators, venue, group] = c;
    const id = (date.html.match(/title="(\d+)"/) || [])[1];
    const [home, away] = game.text.split(' - ').map((s) => s.trim());
    const score = result.text.match(/^(\d+)\s*-\s*(\d+)/);
    games.push({
      id,
      round: round.text || null,
      date: date.text.slice(0, 10),
      time: date.text.slice(11, 16),
      home,
      away,
      hs: score ? +score[1] : null,
      as: score ? +score[2] : null,
      periods: periods?.text.replace(/[()]/g, '').trim() || null,
      spectators: spectators?.text ? +spectators.text.replace(/\D/g, '') : null,
      venue: venue?.text || null,
      group: group?.text.replace(/\s*(POJKAR|FLICKOR)$/i, '') || null,
      eventsUrl: (result.html.match(/\/Game\/Events\/\d+/) || [])[0] || null,
    });
  }
  return { updated, games };
}

// ScheduleAndResults/Overview/<group>: "Group Standings" table. An <hr> row marks the official cut line
// (e.g. top two go on); we return how many rows sit above it.
export function parseStandings(html) {
  const start = html.indexOf('Group Standings');
  const end = html.indexOf('</table>', start);
  if (start < 0 || end < 0) return null;
  const rows = [];
  let cut = null;
  for (const row of html.slice(start, end).split(/<tr[\s>]/)) {
    if (/<hr\b/.test(row)) {
      cut ??= rows.length;
      continue;
    }
    const c = cells(row);
    if (c.length < 13 || !/^\d+$/.test(c[0].text)) continue;
    const [gf, ga] = (c[6].text.match(/(\d+):(\d+)/) || [0, 0, 0]).slice(1).map(Number);
    const n = (i) => +c[i].text || 0;
    rows.push({ rk: n(0), team: c[1].text, gp: n(2), w: n(3), t: n(4), l: n(5), gf, ga, tp: n(8), otw: n(9), otl: n(10), gwsw: n(11), gwsl: n(12) });
  }
  return rows.length ? { rows, cut } : null;
}

// Teams/Info/PlayersByTeam: per team a "Playing Statistics" table, then a "Goalkeeping Statistics" table.
export function parsePlayerStats(html) {
  const num = (s) => parseFloat(s.replace(',', '.')) || 0;
  const players = [];
  const goalies = [];
  const parts = html.split(/<a id="([^"]+)">\s*<\/a>/);
  for (let i = 1; i < parts.length; i += 2) {
    const team = decode(parts[i]);
    const [play, keep = ''] = parts[i + 1].split('Goalkeeping Statistics');
    for (const row of play.split('<tr>')) {
      const c = cells(row);
      if (c.length < 9 || !c[2].text.includes(',')) continue;
      players.push({ team, name: c[2].text, gp: num(c[4].text), g: num(c[5].text), a: num(c[6].text), tp: num(c[7].text), pim: num(c[8].text) });
    }
    for (const row of keep.split('<tr>')) {
      const c = cells(row);
      if (c.length < 12 || !c[2].text.includes(',')) continue;
      goalies.push({ team, name: c[2].text, gpi: num(c[5].text), ga: num(c[7].text), svs: num(c[8].text), svsp: num(c[10].text), gaa: num(c[11].text) });
    }
  }
  return { players, goalies };
}

// Teams/Info/PlayersByTeamPenalties: per player the number of 2, 5, 10 minute and match penalties.
export function parsePenalties(html) {
  const out = [];
  const parts = html.split(/<a id="([^"]+)">\s*<\/a>/);
  for (let i = 1; i < parts.length; i += 2) {
    const team = decode(parts[i]);
    for (const row of parts[i + 1].split(/<tr[\s>]/)) {
      const c = cells(row);
      if (c.length < 8 || !c[1].text.includes(',')) continue;
      out.push({ team, name: c[1].text, p2: +c[4].text || 0, p5: +c[5].text || 0, p10: +c[6].text || 0, mp: +c[7].text || 0 });
    }
  }
  return out;
}

export function parseRoster(html) {
  const teams = [];
  // Each team section starts with <a id="CODE"> </a>
  const parts = html.split(/<a id="([^"]+)">\s*<\/a>/);
  for (let i = 1; i < parts.length; i += 2) {
    const code = parts[i];
    const body = parts[i + 1];
    const name = text((body.match(/class="tdTitle d-none d-sm-table-cell">([^<]*)</) || [])[1] || code);
    const players = [];
    const staff = [];
    for (const row of body.split('<tr>')) {
      const c = cells(row);
      if (c.length >= 8 && /^\d{4}-\d{2}-\d{2}$/.test(c[2].text)) {
        const [last, first] = c[1].text.split(',').map((s) => s.trim());
        players.push({
          no: c[0].text ? +c[0].text : null,
          first,
          last,
          born: c[2].text,
          pos: c[3].text,
          shoots: c[4].text,
          club: c[c.length - 2].text,
          youthClub: c[c.length - 1].text,
        });
      } else if (c.length === 2 && c[1].text.includes(',')) {
        const [last, first] = c[1].text.split(',').map((s) => s.trim());
        staff.push({ role: c[0].text, name: `${first} ${last}` });
      }
    }
    teams.push({ code, name, players, staff });
  }
  return teams;
}
