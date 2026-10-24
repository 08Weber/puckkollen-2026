const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Own palette per district (background, text), used for the team page banner.
const COLORS = {
  BLE: ['#1d4f9c', '#ffd447'], BOH: ['#b3202a', '#ffffff'], DAL: ['#f2b705', '#14306b'], GOT: ['#6b4f1d', '#f6d87a'],
  GÄS: ['#c2185b', '#ffffff'], GÖT: ['#0b6e99', '#ffd447'], HÄL: ['#2d6a4f', '#ffffff'], JÄM: ['#3d405b', '#f2cc8f'],
  MED: ['#8d1b2d', '#ffffff'], NOR: ['#e36414', '#ffffff'], SKÅ: ['#d4152b', '#ffd447'], SMÅ: ['#6a1b3c', '#f6c453'],
  STO: ['#0a3a7a', '#ffffff'], SÖD: ['#138a7c', '#ffffff'], UPP: ['#e63946', '#ffffff'], VÄR: ['#2b9348', '#fff3b0'],
  VTB: ['#151a24', '#ff5a5f'], VGT: ['#4a1d82', '#ffd447'], VML: ['#0077b6', '#ffffff'], ÅNG: ['#a0522d', '#ffffff'],
  ÖRE: ['#f77f00', '#111111'], ÖST: ['#5a7d2a', '#ffffff'],
};
// Boys by default, girls with ?k=f (the Pojkar/Flickor toggle). Each has its own data file, API calls and favourites.
// id/groups: swehockey series and group overview pages · tv: SvenskHockey.tv competition.
const K = new URLSearchParams(location.search).get('k') === 'f' ? 'f' : 'p';
const SERIES = {
  p: { label: 'Pojkar', id: 21877, groups: { A: 21878, B: 21879, C: 21880, D: 21881 }, tv: '6ad452cbac6ac10a664b9636' },
  f: { label: 'Flickor', id: 21931, groups: { A: 21932, B: 21933, C: 21934, D: 21935 }, tv: '6ad452cbc5f9185d8d8f769e' },
}[K];
const GROUP_PAGE = SERIES.groups;
const GROUP_COLORS = { A: '#e2132f', B: '#1a56db', C: '#14965a', D: '#d97706', S: '#7c3aed' };
const POS = { GK: 'MV', LD: 'VB', RD: 'HB', CE: 'C', LW: 'VF', RW: 'HF' };
const POS_GROUPS = [['Målvakter', ['GK']], ['Backar', ['LD', 'RD']], ['Forwards', ['CE', 'LW', 'RW']]];
const STAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.6l2.6 5.3 5.8.8-4.2 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.2-4.1 5.8-.8z"/></svg>';

const fmt = (o) => new Intl.DateTimeFormat('sv-SE', o);
const dayLong = fmt({ weekday: 'long', day: 'numeric', month: 'long' });
const dayShort = fmt({ weekday: 'short', day: 'numeric', month: 'short' });
const wdFmt = fmt({ weekday: 'short' });
const moFmt = fmt({ month: 'short' });
const noon = (d) => new Date(`${d}T12:00`);
// shortcut: times are Swedish local time and parsed in the viewer's zone; fine for viewers in Sweden.
const start = (g) => new Date(`${g.date}T${g.time}`);
const GAME_MS = 150 * 60 * 1000;
const inPlay = (g, now = Date.now()) => start(g).getTime() <= now && now < start(g).getTime() + GAME_MS;
// g.live comes from swehockey's Live page (via /api/schedule) for today's games; without it, fall back to the time window.
const isLive = (g, now = Date.now()) =>
  start(g).getTime() <= now && (g.live ? !/final|finished/i.test(g.live.status) : inPlay(g, now) && !(g.periods?.split(',').length >= 3));
const nth = (n) => ['1:a', '2:a', '3:e'][n - 1] || `${n}:e`;
// Swehockey's status line in Swedish: { what: "2:a perioden", clock: "14:32", pp: "Powerplay 5 mot 4 · NOR" }.
function liveInfo(g) {
  const s = g.live?.status || '';
  const n = g.periods?.split(',').length || 1;
  const num = (re) => +(s.match(re) || [])[1];
  let what;
  if (!g.live) what = 'Pågår';
  else if (/waiting for overtime/i.test(s)) what = 'Paus inför förlängning';
  else if (/overtime/i.test(s) || (n > 3 && !/period/i.test(s))) what = 'Förlängning';
  else if (/shoot|penalty shot/i.test(s)) what = 'Straffläggning';
  else if (/waiting for \d/i.test(s)) what = `Paus inför ${nth(num(/waiting for (\d)/i))} perioden`;
  else if (/period ended/i.test(s)) what = `${nth(num(/(\d)\w* period/i))} perioden slut`;
  else what = `${nth(num(/(\d)\w* period/i) || n)} perioden`;
  const pp = s.match(/Powerplay \((\d) on (\d)\) for (.+)/i);
  return { what, clock: g.live?.clock || null, pp: pp ? `Powerplay ${pp[1]} mot ${pp[2]} · ${pp[3]}` : '' };
}

const data = await fetch(K === 'f' ? 'data-f.json' : 'data.json').then((r) => r.json());
const teamByName = new Map(data.teams.map((t) => [t.name, t]));
const teamByCode = new Map(data.teams.map((t) => [t.code, t]));
const totalPlayers = data.teams.reduce((n, t) => n + t.players.length, 0);
const years = [...new Set(data.teams.flatMap((t) => t.players.map((p) => p.born)))].sort();
document.title = `TV-pucken 2026 · ${SERIES.label} – inofficiell fansida`;
$('#eyebrow').textContent = `${SERIES.label} · distriktslag födda ${years[0]}${years.length > 1 ? `–${years.at(-1).slice(2)}` : ''}`;
$('#q').placeholder = `Sök bland ${totalPlayers} spelare eller klubbar`;
$('#srcLink').href = `https://stats.swehockey.se/ScheduleAndResults/Schedule/${SERIES.id}`;
for (const a of $$('[data-k]')) if (a.dataset.k === K) a.setAttribute('aria-current', 'page');
// Stable player id that survives data rebuilds: team code + name.
const pid = (t, p) => `${t.code}:${p.first} ${p.last}`;
const playerById = new Map();
const playerByStatKey = new Map(); // "Team|Last, First" -> [team, player], the name format swehockey stats use
for (const t of data.teams)
  for (const p of t.players) {
    playerById.set(pid(t, p), [t, p]);
    playerByStatKey.set(`${t.name}|${p.last}, ${p.first}`, [t, p]);
  }
let games = data.games;
const tvById = new Map(data.games.filter((g) => g.tvId).map((g) => [g.id, g.tvId]));
const TV_COMP = SERIES.tv;
const tvUrl = (g) => {
  const id = g.tvId || tvById.get(g.id);
  return id
    ? `https://www.svenskhockey.tv/sv/game/${encodeURIComponent(id)}`
    : `https://www.svenskhockey.tv/sv/competition/${TV_COMP}`;
};
let updated = data.updated;
let stats = { players: new Map(), goalies: new Map(), pen: new Map() };

const letterOf = (g) => g.group?.match(/^Grupp (\w)/)?.[1] || 'S';
const groupOf = {};
for (const g of games) if (letterOf(g) !== 'S') groupOf[g.home] = groupOf[g.away] = letterOf(g);
const letters = [...new Set(Object.values(groupOf))].sort();
const groupName = (l) => (l === 'S' ? 'Slutspel' : `Grupp ${l}`);

const today = new Date().toLocaleDateString('sv-SE');
const dates = [...new Set(games.map((g) => g.date))];
const state = { day: dates.find((d) => d >= today) ?? 'all', group: 'all', team: '', teamTab: 'trupp' };

// ---------- favourites (this device only) ----------
const FAV_KEY = K === 'f' ? 'tvp26-favs-f' : 'tvp26-favs'; // team codes repeat between boys and girls
const favs = (() => {
  try {
    const o = JSON.parse(localStorage.getItem(FAV_KEY)) || {};
    return { teams: new Set(o.teams), players: new Set(o.players) };
  } catch {
    return { teams: new Set(), players: new Set() };
  }
})();
function saveFavs() {
  try {
    localStorage.setItem(FAV_KEY, JSON.stringify({ teams: [...favs.teams], players: [...favs.players] }));
  } catch {}
}
const favTeamNames = () => new Set([...favs.teams].map((c) => teamByCode.get(c)?.name).filter(Boolean));
const isFavGame = (g, names = favTeamNames()) => names.has(g.home) || names.has(g.away);

function starBtn(kind, id, label) {
  const on = favs[kind === 'team' ? 'teams' : 'players'].has(id);
  return `<button type="button" class="star" data-fav-${kind}="${esc(id)}" aria-pressed="${on}" aria-label="Följ ${esc(label)}" title="${on ? 'Sluta följa' : 'Följ'}">${STAR}</button>`;
}
function followBtn(t) {
  const on = favs.teams.has(t.code);
  return `<button type="button" class="follow" data-fav-team="${esc(t.code)}" aria-pressed="${on}">${STAR}<span>${on ? 'Följer' : 'Följ laget'}</span></button>`;
}

// ---------- small renderers ----------
function badge(name, size = '') {
  const t = teamByName.get(name);
  if (!t) return `<span class="badge tbd ${size}" aria-hidden="true">?</span>`;
  if (t.logo) return `<span class="badge crest ${size}" aria-hidden="true"><img src="logos/${esc(t.logo)}" alt="" loading="lazy"></span>`;
  const [c, fg] = COLORS[t.code] || ['#5a6a82', '#fff'];
  return `<span class="badge ${size}" style="--c:${c};--t:${fg}" aria-hidden="true">${esc(t.code)}</span>`;
}
const teamHref = (name) => `#lag/${encodeURIComponent(teamByName.get(name).code)}`;
const teamName = (name) =>
  teamByName.has(name) ? `<a class="name" href="${teamHref(name)}">${esc(name)}</a>` : `<span class="name tbd">${esc(name)}</span>`;
const epUrl = (p) =>
  p.ep
    ? `https://www.eliteprospects.com/player/${p.ep}`
    : `https://www.eliteprospects.com/search/player?q=${encodeURIComponent(`${p.first} ${p.last}`)}`;

function nextGame(now = Date.now()) {
  return games.find((g) => g.hs == null && start(g).getTime() + GAME_MS > now);
}

function matchCard(g, isNext, favNames = favTeamNames()) {
  const L = letterOf(g);
  const played = g.hs != null;
  const fav = isFavGame(g, favNames);
  const periods = g.periods ? g.periods.split(',').length : 0;
  const row = (name, mine, theirs) => `
    <div class="trow${played && mine < theirs ? ' lost' : ''}">
      ${badge(name)}${teamName(name)}${favNames.has(name) ? `<span class="mini-star" title="Ditt lag">${STAR}</span>` : ''}${played ? `<span class="sc">${mine}</span>` : ''}
    </div>`;
  const when = played
    ? ''
    : `<div class="when">${isNext ? '<span class="next-tag">Nästa</span>' : ''}<b>${esc(g.time)}</b><span>${dayShort.format(noon(g.date))}</span></div>`;
  const live = isLive(g);
  const info = live && liveInfo(g);
  const status = live ? 'Live' : periods > 3 ? 'Slut · förl.' : periods === 3 || g.live ? 'Slut' : 'Pågår';
  const foot = `
    ${
      played
        ? `<div class="match-foot">
        <span><span class="state${live ? ' live' : ''}">${status}</span>${
          live ? ` · ${info.what}${info.clock ? ` · <b class="clock">${esc(info.clock)}</b>` : ''}` : g.periods ? ` · ${esc(g.periods)}` : ''
        }</span>
        ${g.eventsUrl ? `<a href="https://stats.swehockey.se${esc(g.eventsUrl)}" target="_blank" rel="noopener">Matchrapport ↗</a>` : ''}
      </div>`
        : ''
    }
    <div class="match-acts${played ? ' three' : ''}">
      ${played ? `<button type="button" class="act" data-events="${esc(g.id)}">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 6h12M8 12h12M8 18h12"/><circle cx="4" cy="6" r="1.4"/><circle cx="4" cy="12" r="1.4"/><circle cx="4" cy="18" r="1.4"/></svg>Händelser
      </button>` : ''}
      <button type="button" class="act" data-lineup="${esc(g.id)}">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8.5 3.5c1 1.6 6 1.6 7 0l4.5 2.2 2 5.1-3.2 1.3-1.3-2.1V20.5H6.5V10l-1.3 2.1L2 10.8l2-5.1z"/></svg>Laguppställning
      </button>
      <a class="act tv${live ? ' live' : ''}" href="${esc(tvUrl(g))}" target="_blank" rel="noopener">
        ${live ? '<span class="pulse" aria-hidden="true"></span>Se live' : '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2.5" y="5" width="19" height="14" rx="3"/><path d="M10 9.2v5.6l4.8-2.8z"/></svg>SvenskHockey.tv'}
      </a>
    </div>`;
  return `
    <article class="match${played ? ' played' : ''}${isNext ? ' next' : ''}${fav ? ' fav' : ''}" data-game="${esc(g.id)}" style="--g:${GROUP_COLORS[L]}">
      <div class="match-top"><span class="grp">${groupName(L)}</span><span class="venue">${esc(g.venue)}</span></div>
      <div class="match-body"><div class="teams">${row(g.home, g.hs, g.as)}${row(g.away, g.as, g.hs)}</div>${when}</div>
      ${foot}
    </article>`;
}

// Penalty minutes (goalies are listed in the playing stats too) and the 2/5/10/match breakdown.
const pimOf = (t, p) => stats.players.get(statKey(t, p))?.pim ?? 0;
const penOf = (t, p) => stats.pen.get(statKey(t, p)) || { p2: 0, p5: 0, p10: 0, mp: 0 };
function penText(c) {
  const parts = [[c.p2, '2 min'], [c.p5, '5 min'], [c.p10, '10 min'], [c.mp, 'matchstraff']].filter(([n]) => n);
  return parts.map(([n, l]) => `${n} × ${l}`).join(', ');
}
function teamPen(t) {
  const sum = { pim: 0, p2: 0, p5: 0, p10: 0, mp: 0 };
  for (const p of t.players) {
    sum.pim += pimOf(t, p);
    const c = penOf(t, p);
    for (const k of ['p2', 'p5', 'p10', 'mp']) sum[k] += c[k];
  }
  return sum;
}
const utv = (n) => (n ? ` · <span class="utv">${n} utv</span>` : '');

// Points for skaters, save % for goalies; falls back to position + birth year before the first game.
const statKey = (t, p) => `${t.name}|${p.last}, ${p.first}`;
const pct = (v) => `${v.toFixed(1).replace('.', ',')} %`;

// Points for skaters, save % for goalies (zeros before the first game); position + birth year only if stats failed to load.
function playerMeta(t, p) {
  // Swehockey's stats page lags the roster, so a late call-up has no row yet: show zeros, not the fallback.
  const loaded = stats.players.size > 0;
  if (p.pos === 'GK') {
    const s = stats.goalies.get(statKey(t, p)) || (loaded && { gpi: 0 });
    if (s) return (s.gpi ? `<b>${pct(s.svsp)}</b>${s.gpi} m · ${s.ga} ins.` : '<b>– %</b>0 m') + utv(pimOf(t, p));
  } else {
    const s = stats.players.get(statKey(t, p)) || (loaded && { gp: 0, g: 0, a: 0, tp: 0, pim: 0 });
    if (s) return `<b>${s.tp} p</b>${s.g}+${s.a} · ${s.gp} m${utv(s.pim)}`;
  }
  return `<b>${POS[p.pos] || esc(p.pos)}${p.shoots ? ` · ${p.shoots === 'L' ? 'V' : 'H'}` : ''}</b>f. ${esc(p.born.slice(0, 4))}`;
}
function metaTitle(t, p) {
  const s = (p.pos === 'GK' ? stats.goalies : stats.players).get(statKey(t, p));
  if (!s) return '';
  const pen = pimOf(t, p) ? `, ${pimOf(t, p)} utvisningsminuter (${penText(penOf(t, p))})` : ', inga utvisningar';
  return (p.pos === 'GK'
    ? `${s.gpi} matcher, ${s.ga} insläppta mål, ${s.svs} räddningar`
    : `${s.g} mål, ${s.a} assist, ${s.tp} poäng på ${s.gp} matcher`) + pen;
}

function playerRow(t, p, showTeam = false) {
  const logo = data.clubLogos?.[p.club];
  const club = `${logo ? `<img class="clogo" src="logos/${esc(logo)}" alt="" loading="lazy">` : ''}${esc(p.club)}`;
  const name = `${p.first} ${p.last}`;
  return `
    <div class="player">
      <a class="cover" href="${esc(epUrl(p))}" target="_blank" rel="noopener" aria-label="${esc(name)} på Elite Prospects"
        title="${p.ep ? 'Öppna profilen på Elite Prospects' : 'Ingen säker träff – öppnar sökning på Elite Prospects'}"></a>
      <span class="num">${p.no ?? '–'}<small>${POS[p.pos] || esc(p.pos)}</small></span>
      <span class="pinfo"><b>${esc(name)}</b><small>${showTeam ? `${esc(t.name)} · ` : ''}${club}</small></span>
      <span class="pmeta" title="${esc(metaTitle(t, p))}">${playerMeta(t, p)}</span>
      <span class="ep${p.ep ? '' : ' q'}">${p.ep ? 'EP ↗' : 'Sök ↗'}</span>
      ${starBtn('player', pid(t, p), name)}
    </div>`;
}

// ---------- hero ----------
function renderHero() {
  const now = Date.now();
  const first = start(games[0]).getTime();
  const final = games.at(-1);
  const next = nextGame(now);
  const liveGames = games.filter((g) => isLive(g, now));
  const live = liveGames.length > 0;

  let status;
  if (live) status = `<span class="dot live"></span><b>Match pågår</b>`;
  else if (now < first) {
    const h = Math.floor((first - now) / 36e5);
    const left = h >= 24 ? `${Math.floor(h / 24)} d ${h % 24} h` : `${h} h ${Math.floor(((first - now) % 36e5) / 6e4)} min`;
    status = `Nedsläpp om <b>${left}</b>`;
  } else if (next) status = `<span class="dot"></span>Pågår · nästa match <b>${dayShort.format(noon(next.date))} ${esc(next.time)}</b>`;
  else status = `<span class="dot"></span><b>Turneringen är avgjord</b>`;
  $('#status').innerHTML = status;

  const facts = [
    ['Speldagar', `${dayShort.format(noon(dates[0])).replace(/^\S+ /, '')} – ${dayShort.format(noon(final.date)).replace(/^\S+ /, '')}`],
    ['Lag', data.teams.length],
    ['Matcher', games.length],
    ['Spelare', totalPlayers],
  ];
  $('#stats').innerHTML = facts.map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('');

  // Games being played right now get the slides; otherwise every game in the next time slot
  // (several districts face off at the same time). Games involving a followed team come first.
  const favNames = favTeamNames();
  const slides = (
    live ? liveGames : next ? games.filter((x) => x.date === next.date && x.time === next.time) : [final]
  ).sort((a, b) => isFavGame(b, favNames) - isFavGame(a, favNames));
  const started = next && start(next).getTime() <= now;
  const label = live
    ? '<span class="live-tag"><i></i>Live</span>'
    : !next ? 'Final' : started ? 'Pågår nu' : slides.length > 1 ? 'Nästa matcher' : 'Nästa match';
  const side = (name) =>
    teamByName.has(name)
      ? `<a class="side" href="${teamHref(name)}">${badge(name, 'lg')}<span>${esc(name)}</span></a>`
      : `<span class="side">${badge(name, 'lg')}<span>${esc(name)}</span></span>`;
  const liveMid = (g) => {
    const i = liveInfo(g);
    return `<div class="mid live">
      <span class="live-pill"><i></i>Live</span>
      <b>${g.hs ?? 0}–${g.as ?? 0}</b>
      <small>${i.what}</small>${i.clock ? `<span class="clock">${esc(i.clock)}</span>` : ''}
      ${i.pp ? `<small class="pp">${esc(i.pp)}</small>` : ''}
    </div>`;
  };
  const slide = (g) => `
    <div class="slide">
      <div class="versus">
        ${side(g.home)}
        ${
          isLive(g, now)
            ? liveMid(g)
            : `<div class="mid">${g.hs != null ? `${g.hs}–${g.as}` : esc(g.time)}<small>${dayShort.format(noon(g.date))}</small></div>`
        }
        ${side(g.away)}
      </div>
      <p class="where"><b style="color:${GROUP_COLORS[letterOf(g)]}">${groupName(letterOf(g))}</b> · ${esc(g.venue)}${
        isLive(g, now) ? ` · <a class="watch" href="${esc(tvUrl(g))}" target="_blank" rel="noopener">Se live ↗</a>` : ''
      }</p>
    </div>`;
  const keep = carouselIndex();
  $('#feature').innerHTML = `
    <div class="label"><span>${label}</span>${slides.length > 1 ? `<span>${slides.length} samtidigt</span>` : ''}</div>
    <div class="slides" id="slides">${slides.map(slide).join('')}</div>
    ${slides.length > 1 ? `<div class="dots">${slides.map((_, i) => `<button type="button" aria-label="Match ${i + 1}"></button>`).join('')}</div>` : ''}`;
  setupCarousel(keep);
}

// ---------- featured-match carousel: native swipe via scroll-snap, auto-advance every 6 s ----------
const AUTO_MS = 6000;
let autoTimer;
function carouselIndex() {
  const box = $('#slides');
  return box ? Math.round(box.scrollLeft / (box.clientWidth || 1)) : 0;
}
function setupCarousel(keep = 0) {
  clearInterval(autoTimer);
  const box = $('#slides');
  const n = box.children.length;
  if (n < 2) return;
  const dots = [...$('#feature .dots').children];
  const mark = (cur = carouselIndex()) => dots.forEach((d, i) => d.setAttribute('aria-current', i === cur));
  const go = (i, smooth = true) => {
    box.scrollTo({ left: i * box.clientWidth, behavior: smooth ? 'smooth' : 'instant' });
    mark(i);
  };
  const play = () => {
    clearInterval(autoTimer);
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches)
      autoTimer = setInterval(() => go((carouselIndex() + 1) % n), AUTO_MS);
  };
  // Debounced instead of 'scrollend', which iOS Safari lacks.
  let settle;
  box.addEventListener('scroll', () => { clearTimeout(settle); settle = setTimeout(mark, 100); }, { passive: true });
  dots.forEach((d, i) => d.addEventListener('click', () => { go(i); play(); }));
  // Restart the countdown after a swipe so the slide the user picked stays a full interval.
  box.addEventListener('pointerdown', play);
  box.addEventListener('touchstart', play, { passive: true });
  $('#feature').onmouseenter = () => clearInterval(autoTimer);
  $('#feature').onmouseleave = play;
  go(Math.min(keep, n - 1), false);
  play();
}

// ---------- matches ----------
function renderFilters() {
  const count = (d) => games.filter((g) => g.date === d).length;
  $('#days').innerHTML =
    `<button class="day all" data-day="all" aria-pressed="${state.day === 'all'}"><span class="wd">Visa</span><span class="dn">Alla</span><span class="ct">${games.length} matcher</span></button>` +
    dates
      .map((d) => {
        const n = noon(d);
        return `<button class="day" data-day="${d}" aria-pressed="${state.day === d}">
          <span class="wd">${wdFmt.format(n).replace('.', '')}</span><span class="dn">${n.getDate()}</span>
          <span class="mo">${moFmt.format(n).replace('.', '')}</span><span class="ct">${count(d)} st</span></button>`;
      })
      .join('');
  const chips = [['all', 'Alla'], ['fav', 'Mina lag'], ...letters.map((l) => [l, groupName(l)]), ['S', 'Slutspel']];
  $('#groups').innerHTML = chips
    .map(([v, label]) => {
      const icon = v === 'fav' ? `<span class="chip-star">${STAR}</span>` : v !== 'all' ? `<i style="--g:${GROUP_COLORS[v]}"></i>` : '';
      return `<button class="chip${v === 'fav' ? ' chip-fav' : ''}" data-group="${v}" aria-pressed="${state.group === v}">${icon}${label}</button>`;
    })
    .join('');
}

function renderMatches() {
  const favNames = favTeamNames();
  const shown = games.filter(
    (g) =>
      (state.day === 'all' || g.date === state.day) &&
      (state.group === 'all' || (state.group === 'fav' ? isFavGame(g, favNames) : letterOf(g) === state.group)) &&
      (!state.team || g.home === state.team || g.away === state.team)
  );
  const next = nextGame();
  const byDay = new Map();
  for (const g of shown) byDay.set(g.date, [...(byDay.get(g.date) || []), g]);
  let empty = 'Inga matcher för det här urvalet.';
  if (state.group === 'fav' && !favNames.size) empty = 'Du följer inga lag än. Tryck på stjärnan vid ett lag under <a href="#lag">Lag &amp; spelare</a>.';
  else if (state.group === 'fav' && state.day !== 'all') empty = 'Dina lag spelar inte den här dagen. Välj <b>Alla</b> för att se alla deras matcher.';
  $('#matches').innerHTML = shown.length
    ? [...byDay]
        .map(
          ([d, list]) => `
      <div class="daygroup">
        <h3>${dayLong.format(noon(d))} <small>${list.length} ${list.length === 1 ? 'match' : 'matcher'}</small></h3>
        <div class="grid">${list.map((g) => matchCard(g, g === next, favNames)).join('')}</div>
      </div>`
        )
        .join('')
    : `<p class="empty">${empty}</p>`;
}

// ---------- standings + scoring ----------
let official = null; // { groups: { A: { id, rows, cut } } } from /api/standings, when swehockey answers

// Official table when we have it; otherwise computed from results (same 3/2/1 system swehockey uses).
function standings() {
  if (official) {
    return letters.flatMap((letter) =>
      (official.groups[letter]?.rows || []).map((r, i) => ({
        team: r.team, letter, rk: r.rk, gp: r.gp, w: r.w, l: r.l, gf: r.gf, ga: r.ga, pts: r.tp,
        otw: r.otw + r.gwsw, otl: r.otl + r.gwsl, cut: i + 1 === official.groups[letter].cut,
      }))
    );
  }
  const rows = {};
  for (const [team, letter] of Object.entries(groupOf)) rows[team] = { team, letter, gp: 0, w: 0, otw: 0, otl: 0, l: 0, gf: 0, ga: 0, pts: 0 };
  for (const g of games) {
    if (g.hs == null || letterOf(g) === 'S' || !rows[g.home] || !rows[g.away]) continue;
    const ot = g.periods?.split(',').length > 3;
    for (const [me, gf, ga] of [[rows[g.home], g.hs, g.as], [rows[g.away], g.as, g.hs]]) {
      me.gp++; me.gf += gf; me.ga += ga;
      if (gf === ga) me.pts += 1;
      else if (gf > ga) ot ? (me.otw++, (me.pts += 2)) : (me.w++, (me.pts += 3));
      else ot ? (me.otl++, (me.pts += 1)) : me.l++;
    }
  }
  return Object.values(rows).sort(
    (a, b) => b.pts - a.pts || b.gf - b.ga - (a.gf - a.ga) || b.gf - a.gf || a.team.localeCompare(b.team, 'sv')
  );
}

function renderTables() {
  const all = standings();
  const favNames = favTeamNames();
  $('#tables').innerHTML = letters
    .map(
      (l) => `
    <div class="table-card" style="--g:${GROUP_COLORS[l]}">
      <h3><i></i>Grupp ${l}</h3>
      <table>
        <thead><tr><th>Lag</th><th title="Spelade">S</th><th title="Vinster">V</th><th class="hide-sm" title="Vinster efter förlängning">ÖV</th><th class="hide-sm" title="Förluster efter förlängning">ÖF</th><th title="Förluster">F</th><th title="Mål">Mål</th><th title="Utvisningsminuter (summa för lagets spelare)">UTV</th><th title="Poäng">P</th></tr></thead>
        <tbody>${all
          .filter((r) => r.letter === l)
          .map(
            (r, i) => `<tr class="${favNames.has(r.team) ? 'fav-row' : ''}${r.cut ? ' cut' : ''}">
              <td><a class="tteam" href="${teamHref(r.team)}"><span class="rk">${r.rk ?? i + 1}</span>${badge(r.team, 'sm')}${esc(r.team)}</a></td>
              <td>${r.gp}</td><td>${r.w}</td><td class="hide-sm">${r.otw}</td><td class="hide-sm">${r.otl}</td><td>${r.l}</td><td>${r.gf}–${r.ga}</td><td class="utv-col">${teamPen(teamByName.get(r.team)).pim}</td><td class="pts">${r.pts}</td>
            </tr>`
          )
          .join('')}</tbody>
      </table>
      <p class="table-src">${official
        ? `Officiell tabell · <a href="https://stats.swehockey.se/ScheduleAndResults/Overview/${official.groups[l].id}" target="_blank" rel="noopener">swehockey ↗</a>`
        : `Uträknad från resultaten · <a href="https://stats.swehockey.se/ScheduleAndResults/Overview/${GROUP_PAGE[l]}" target="_blank" rel="noopener">officiell tabell ↗</a>`}</p>
    </div>`
    )
    .join('');
  $('#tableSource').textContent = official
    ? 'Officiell tabell från swehockey · 3 p vinst · 2 p vinst efter förlängning/straffar · 1 p förlust efter förlängning/straffar'
    : 'Kunde inte hämta den officiella tabellen just nu – visar uträknad tabell. Officiell tabell finns på swehockey.';
  renderAllStats();
}

// ---------- combined stats for every player in the cup ----------
// Roster is the base (so players without stats still appear, with EP links); live stats are joined on name.
const ps = { mode: 'skaters', pos: 'all', team: '', q: '', sort: 'tp', dir: -1, limit: 50 };
const SK_COLS = [
  ['gp', 'M', 'Matcher'], ['g', 'G', 'Mål'], ['a', 'A', 'Assist'], ['tp', 'P', 'Poäng'],
  ['ppg', 'P/M', 'Poäng per match', 'hide-sm'], ['pim', 'UTV', 'Utvisningsminuter'],
];
const GK_COLS = [
  ['gpi', 'M', 'Matcher'], ['ga', 'Ins.', 'Insläppta mål'], ['svs', 'Rädd.', 'Räddningar', 'hide-sm'],
  ['svsp', 'Rädd%', 'Räddningsprocent'], ['gaa', 'GAA', 'Insläppta mål per 40 min', 'hide-sm'],
];

const PEN_COLS = [
  ['gp', 'M', 'Matcher', 'hide-sm'], ['p2', '2 min', 'Antal 2-minutersutvisningar'], ['p5', '5 min', 'Antal 5-minutersutvisningar'],
  ['p10', '10 min', 'Antal 10-minutersutvisningar'], ['mp', 'MS', 'Matchstraff'], ['pim', 'UTV', 'Utvisningsminuter totalt'],
];

function allStatRows() {
  const goalies = ps.mode === 'goalies';
  const pen = ps.mode === 'pen';
  const q = norm(ps.q.trim());
  const rows = [];
  for (const t of data.teams) {
    if (ps.team && t.name !== ps.team) continue;
    for (const p of t.players) {
      if (!pen && (p.pos === 'GK') !== goalies) continue;
      if (!goalies && ps.pos === 'D' && !/D$/.test(p.pos)) continue;
      if (!goalies && ps.pos === 'F' && (/D$/.test(p.pos) || p.pos === 'GK')) continue;
      if (q && !norm(`${p.first} ${p.last} ${p.club} ${t.name}`).includes(q)) continue;
      if (pen) {
        const st = stats.players.get(statKey(t, p));
        rows.push({ t, p, s: { gp: st?.gp ?? 0, pim: st?.pim ?? 0, ...penOf(t, p) } });
        continue;
      }
      const s = goalies
        ? stats.goalies.get(statKey(t, p)) || { gpi: 0, ga: 0, svs: 0, svsp: 0, gaa: 0 }
        : stats.players.get(statKey(t, p)) || { gp: 0, g: 0, a: 0, tp: 0, pim: 0 };
      rows.push({ t, p, s: goalies ? s : { ...s, ppg: s.gp ? s.tp / s.gp : 0 } });
    }
  }
  const k = ps.sort;
  // Goalies who haven't played sort last whatever the column; ties fall back to goals, then name.
  rows.sort(
    (a, b) =>
      (goalies ? !!b.s.gpi - !!a.s.gpi : 0) ||
      ps.dir * (a.s[k] - b.s[k]) ||
      (b.s.g ?? 0) - (a.s.g ?? 0) ||
      a.p.last.localeCompare(b.p.last, 'sv')
  );
  return rows;
}

function renderAllStats() {
  const goalies = ps.mode === 'goalies';
  const cols = goalies ? GK_COLS : ps.mode === 'pen' ? PEN_COLS : SK_COLS;
  $('#psPos').hidden = goalies;
  if (!stats.players.size) {
    $('#scoring').innerHTML = '<p class="empty">Statistiken kunde inte hämtas just nu. Försök igen om en stund.</p>';
    return;
  }
  const rows = allStatRows();
  const fmtVal = (k, v) => (k === 'svsp' ? (v ? pct(v) : '–') : k === 'ppg' || k === 'gaa' ? v.toFixed(2).replace('.', ',') : v);
  const shown = rows.slice(0, ps.limit);
  const head = cols
    .map(([k, l, title, cls = '']) => {
      const on = ps.sort === k;
      return `<th class="${cls}"><button type="button" class="sortbtn${on ? ' on' : ''}" data-sort="${k}" title="Sortera på ${title.toLowerCase()}">${l}${on ? (ps.dir < 0 ? ' ↓' : ' ↑') : ''}</button></th>`;
    })
    .join('');
  const body = shown
    .map(({ t, p, s }, i) => {
      const cells = cols.map(([k, , , cls = '']) => `<td class="${cls}${ps.sort === k ? ' sorted' : ''}">${fmtVal(k, s[k])}</td>`).join('');
      return `<tr${favs.players.has(pid(t, p)) ? ' class="fav-row"' : ''}>
        <td class="rk">${i + 1}</td>
        <td><a class="pname" href="${esc(epUrl(p))}" target="_blank" rel="noopener">${badge(t.name, 'sm')}<span class="sname"><b>${esc(p.first)} ${esc(p.last)}</b><small>${esc(t.name)} · #${p.no ?? '–'}</small></span></a></td>
        <td class="hide-sm">${POS[p.pos] || esc(p.pos)}</td>${cells}</tr>`;
    })
    .join('');
  const more = rows.length > shown.length ? ` · <button type="button" class="linkbtn" data-more>Visa alla</button>` : '';
  $('#scoring').innerHTML = rows.length
    ? `<div class="table-card">
        <table class="pstats allstats">
          <thead><tr><th class="rkh">#</th><th>${goalies ? 'Målvakt' : 'Spelare'}</th><th class="hide-sm">Pos</th>${head}</tr></thead>
          <tbody>${body}</tbody>
        </table>
      </div>
      <p class="ps-foot">Visar ${shown.length} av ${rows.length} ${goalies ? 'målvakter' : 'spelare'}${more}</p>`
    : '<p class="empty">Inga spelare matchar urvalet.</p>';
}

// ---------- teams ----------
const sortedTeams = [...data.teams].sort((a, b) => a.name.localeCompare(b.name, 'sv'));

function teamTile(t) {
  return `
    <div class="team-tile">
      <a class="cover" href="${teamHref(t.name)}" aria-label="${esc(t.name)}"></a>
      ${badge(t.name, 'lg')}
      <span class="tinfo"><b>${esc(t.name)}</b><small>${groupOf[t.name] ? `Grupp ${groupOf[t.name]} · ` : ''}${t.players.length} spelare</small></span>
      ${starBtn('team', t.code, t.name)}
    </div>`;
}

function renderTeams() {
  const q = norm($('#q').value.trim());
  if (q) {
    const hits = sortedTeams.flatMap((t) =>
      t.players.filter((p) => norm(`${p.first} ${p.last} ${p.club} ${p.youthClub}`).includes(q)).map((p) => [t, p])
    );
    const teamHits = sortedTeams.filter((t) => norm(t.name).includes(q));
    $('#teams').innerHTML =
      (teamHits.length ? `<div class="team-grid">${teamHits.map(teamTile).join('')}</div>` : '') +
      (hits.length
        ? `<p class="hits-note">${hits.length} spelare hittade</p><div class="plist">${hits.map(([t, p]) => playerRow(t, p, true)).join('')}</div>`
        : teamHits.length
          ? ''
          : '<p class="empty">Inga spelare eller lag matchar sökningen.</p>');
    return;
  }
  $('#teams').innerHTML = `<div class="team-grid">${sortedTeams.map(teamTile).join('')}</div>`;
}

function teamStats(t) {
  if (!stats.players.size) return '<p class="empty">Statistiken kunde inte hämtas just nu. Försök igen om en stund.</p>';
  const link = (p) => `<a class="pname" href="${esc(epUrl(p))}" target="_blank" rel="noopener"><span class="no">${p.no ?? ''}</span><span>${esc(p.first)} ${esc(p.last)}</span></a>`;
  const fav = (p) => (favs.players.has(pid(t, p)) ? ' class="fav-row"' : '');
  const sk = t.players
    .filter((p) => p.pos !== 'GK')
    .map((p) => [p, stats.players.get(statKey(t, p)) || { gp: 0, g: 0, a: 0, tp: 0, pim: 0 }])
    .sort((a, b) => b[1].tp - a[1].tp || b[1].g - a[1].g || (a[0].no ?? 99) - (b[0].no ?? 99));
  const gk = t.players
    .filter((p) => p.pos === 'GK')
    .map((p) => [p, stats.goalies.get(statKey(t, p)) || { gpi: 0, ga: 0, svs: 0, svsp: 0 }])
    .sort((a, b) => !!b[1].gpi - !!a[1].gpi || b[1].svsp - a[1].svsp);
  const tp = teamPen(t);
  return `
    <div class="pen-sum">
      <div><b>${tp.pim}</b><span>utvisningsminuter</span></div>
      <div><b>${tp.p2}</b><span>× 2 min</span></div>
      <div><b>${tp.p5}</b><span>× 5 min</span></div>
      <div><b>${tp.p10}</b><span>× 10 min</span></div>
      <div><b>${tp.mp}</b><span>matchstraff</span></div>
    </div>
    <div class="table-card">
      <table class="pstats">
        <thead><tr><th>Spelare</th><th class="hide-sm" title="Position">Pos</th><th title="Matcher">M</th><th title="Mål">G</th><th title="Assist">A</th><th title="Poäng">P</th><th title="Utvisningsminuter">UTV</th></tr></thead>
        <tbody>${sk
          .map(([p, s]) => `<tr${fav(p)}><td>${link(p)}</td><td class="hide-sm">${POS[p.pos] || esc(p.pos)}</td><td>${s.gp}</td><td>${s.g}</td><td>${s.a}</td><td class="pts">${s.tp}</td><td>${s.pim}</td></tr>`)
          .join('')}</tbody>
      </table>
    </div>
    ${gk.length ? `<div class="table-card">
      <table class="pstats">
        <thead><tr><th>Målvakt</th><th title="Matcher">M</th><th title="Insläppta mål">Ins.</th><th title="Räddningar">Rädd.</th><th title="Räddningsprocent">Rädd%</th></tr></thead>
        <tbody>${gk
          .map(([p, s]) => `<tr${fav(p)}><td>${link(p)}</td><td>${s.gpi}</td><td>${s.ga}</td><td>${s.svs}</td><td class="pts">${s.gpi ? pct(s.svsp) : '–'}</td></tr>`)
          .join('')}</tbody>
      </table>
    </div>` : ''}
    <p class="legend">Uppdateras live under cupen. Klicka på en spelare för profilen på Elite Prospects.</p>`;
}

function renderTeam(code) {
  const t = teamByCode.get(code);
  const [c, fg] = COLORS[t.code] || ['#5a6a82', '#fff'];
  const coaches = t.staff.filter((s) => /coach/i.test(s.role)).map((s) => s.name);
  const next = nextGame();
  const roster = POS_GROUPS.map(([label, codes]) => {
    const ps = t.players.filter((p) => codes.includes(p.pos)).sort((a, b) => (a.no ?? 99) - (b.no ?? 99));
    return ps.length ? `<h3>${label} · ${ps.length}</h3><div class="plist">${ps.map((p) => playerRow(t, p)).join('')}</div>` : '';
  }).join('');
  const subtabs = `<div class="subtabs">${[['trupp', 'Trupp'], ['stat', 'Statistik']]
    .map(([v, l]) => `<button type="button" data-teamtab="${v}" aria-pressed="${state.teamTab === v}">${l}</button>`)
    .join('')}</div>`;
  const legend = '<p class="legend">p = poäng · 1+3 = mål+assist · m = matcher · ins. = insläppta mål</p>';
  const ROLE = { 'Head Coach': 'Huvudtränare', 'Assistant Coach': 'Assisterande tränare', 'Equipment Manager': 'Materialare', 'General Manager': 'Lagledare', 'Team Manager': 'Lagledare' };
  $('#team').innerHTML = `
    <a class="back" href="#lag">← Alla lag</a>
    <div class="team-hero" style="--c:${c};--t:${fg}">
      ${badge(t.name, 'xl')}
      <div>
        <h2>${esc(t.name).replace('/', '/<wbr>')}</h2>
        <p>${groupOf[t.name] ? `Grupp ${groupOf[t.name]} · ` : ''}${t.players.length} spelare${coaches.length ? ` · Tränare ${coaches.map(esc).join(', ')}` : ''}</p>
        ${followBtn(t)}
      </div>
    </div>
    <div class="team-cols">
      <div>${subtabs}${state.teamTab === 'stat' ? teamStats(t) : roster + legend}</div>
      <aside>
        <h3>Matcher</h3>
        <div class="grid">${games.filter((g) => g.home === t.name || g.away === t.name).map((g) => matchCard(g, g === next)).join('')}</div>
        ${t.staff.length ? `<h3>Ledare</h3><ul class="staff">${t.staff.map((s) => `<li>${esc(s.name)}<span>${esc(ROLE[s.role] || s.role)}</span></li>`).join('')}</ul>` : ''}
      </aside>
    </div>`;
}

// ---------- favourites view ----------
function renderFavs() {
  const teams = [...favs.teams].map((c) => teamByCode.get(c)).filter(Boolean);
  const players = [...favs.players].map((id) => playerById.get(id)).filter(Boolean);
  updateFavCount();
  const quick = (title) => `
    <h3 class="fav-h">${title}</h3>
    <div class="quick">${sortedTeams
      .filter((t) => !favs.teams.has(t.code))
      .map((t) => `<button type="button" class="qteam" data-fav-team="${esc(t.code)}" aria-pressed="false">${badge(t.name, 'sm')}${esc(t.name)}<span class="plus">+</span></button>`)
      .join('')}</div>`;

  if (!teams.length && !players.length) {
    $('#favs').innerHTML = `
      <div class="fav-empty">
        <div class="big-star">${STAR}</div>
        <h3>Följ dina lag och spelare genom cupen</h3>
        <p>Tryck på stjärnan vid ett lag eller en spelare så samlas deras matcher, resultat, tabellplacering och poäng här.</p>
      </div>
      ${quick('Välj lag att följa')}`;
    return;
  }

  const favNames = new Set(teams.map((t) => t.name));
  const table = standings();
  const now = Date.now();
  const myGames = games.filter((g) => isFavGame(g, favNames));
  const upcoming = myGames.filter((g) => g.hs == null && start(g).getTime() + GAME_MS > now).slice(0, 6);
  const results = myGames.filter((g) => g.hs != null).reverse().slice(0, 6);
  const next = nextGame();

  const teamCard = (t) => {
    const grp = table.filter((r) => r.letter === groupOf[t.name]);
    const pos = grp.findIndex((r) => r.team === t.name);
    const row = grp[pos];
    const mine = games.filter((g) => g.home === t.name || g.away === t.name);
    const nx = mine.find((g) => g.hs == null);
    const last = mine.filter((g) => g.hs != null).at(-1);
    const opp = (g) => (g.home === t.name ? g.away : g.home);
    const res = last && (last.home === t.name ? [last.hs, last.as] : [last.as, last.hs]);
    return `
      <div class="fteam">
        <div class="fteam-head">
          ${badge(t.name, 'lg')}
          <div class="tinfo"><a href="${teamHref(t.name)}"><b>${esc(t.name)}</b></a>
            <small>${row ? `Grupp ${row.letter} · ${row.gp ? `${pos + 1}:${pos < 2 ? 'a' : 'e'} plats · ${row.pts} p` : 'inga matcher spelade än'}` : ''}</small></div>
          ${starBtn('team', t.code, t.name)}
        </div>
        <dl class="fteam-rows">
          <div><dt>Nästa</dt><dd>${nx ? `${dayShort.format(noon(nx.date))} ${esc(nx.time)} mot <b>${esc(opp(nx))}</b>` : '–'}</dd></div>
          <div><dt>Utv.</dt><dd>${(() => { const tp = teamPen(t); return tp.pim ? `<b>${tp.pim} min</b> · ${penText(tp)}` : 'Inga utvisningar'; })()}</dd></div>
          <div><dt>Senast</dt><dd>${last ? `<span class="wl ${res[0] > res[1] ? 'w' : res[0] < res[1] ? 'l' : 'd'}">${res[0]}–${res[1]}</span> mot <b>${esc(opp(last))}</b>` : 'Inte spelat än'}</dd></div>
        </dl>
      </div>`;
  };

  const ps = players
    .map(([t, p]) => [t, p, stats.players.get(`${t.name}|${p.last}, ${p.first}`)?.tp ?? -1])
    .sort((a, b) => b[2] - a[2] || a[1].last.localeCompare(b[1].last, 'sv'));

  $('#favs').innerHTML = `
    ${teams.length ? `<h3 class="fav-h">Mina lag · ${teams.length}</h3><div class="fteams">${teams.map(teamCard).join('')}</div>` : ''}
    ${upcoming.length ? `<h3 class="fav-h">Kommande matcher</h3><div class="grid">${upcoming.map((g) => matchCard(g, g === next, favNames)).join('')}</div>` : ''}
    ${results.length ? `<h3 class="fav-h">Senaste resultat</h3><div class="grid">${results.map((g) => matchCard(g, false, favNames)).join('')}</div>` : ''}
    <h3 class="fav-h">Mina spelare${players.length ? ` · ${players.length}` : ''}</h3>
    ${ps.length ? `<div class="plist">${ps.map(([t, p]) => playerRow(t, p, true)).join('')}</div>` : '<p class="empty small">Tryck på stjärnan vid en spelare i en trupp för att följa hen här.</p>'}
    <details class="more"><summary>Följ fler lag</summary>${quick('')}</details>`;
}

function updateFavCount() {
  const n = favs.teams.size + favs.players.size;
  $('#favCount').textContent = n || '';
  $('#favCount').hidden = !n;
}

let toastTimer;
function toast(msg) {
  const el = $('#toast');
  el.innerHTML = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

// One handler for every star / follow / quick-add button on the page.
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-fav-team],[data-fav-player]');
  if (!b) return;
  e.preventDefault();
  const kind = b.dataset.favTeam ? 'team' : 'player';
  const id = b.dataset.favTeam || b.dataset.favPlayer;
  const set = kind === 'team' ? favs.teams : favs.players;
  const on = !set.has(id);
  on ? set.add(id) : set.delete(id);
  saveFavs();
  const label = kind === 'team' ? teamByCode.get(id)?.name : id.split(':')[1];
  toast(on ? `${STAR}<span><b>${esc(label)}</b> följs nu – se fliken Favoriter</span>` : `<span>Slutade följa <b>${esc(label)}</b></span>`);
  // Sync every control for the same id, then re-render views that depend on favourites.
  for (const x of $$(`[data-fav-${kind}="${CSS.escape(id)}"]`)) {
    x.setAttribute('aria-pressed', on);
    if (x.classList.contains('follow')) x.querySelector('span').textContent = on ? 'Följer' : 'Följ laget';
  }
  updateFavCount();
  if (kind === 'team') {
    renderHero();
    renderMatches();
    renderTables();
  } else renderAllStats();
  if (!$('[data-view="favoriter"]').hidden) renderFavs();
});

// ---------- line-ups on a rink (swehockey posts them about an hour before face-off) ----------
const ORD = ['Första', 'Andra', 'Tredje', 'Fjärde', 'Femte', 'Sjätte'];
// Spots in % of the rink for the home team (bottom half, attacking up): G, [LD, RD], [LW, C, RW].
// The away team (top half, attacking down) gets the same spots turned 180°, so their left wing is on our right.
const SPOTS = { g: [50, 90], d: [[31, 77], [69, 77]], f: [[19, 61], [50, 58.5], [81, 61]] };
// Swehockey's jersey colour per team and game ("Östergötland (Red)"). Unknown or missing: plain home/away tokens.
const JERSEY = {
  white: '#f7f9fc', black: '#16181d', red: '#d4152b', blue: '#1a56db', 'dark blue': '#14306b', navy: '#14306b',
  'light blue': '#4ba3e3', green: '#12804a', yellow: '#f6c90e', orange: '#f77f00', purple: '#5b2a86', grey: '#7a8699', gray: '#7a8699',
};
const inkOn = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return 0.299 * r + 0.587 * g + 0.114 * b > 160 ? '#0a1730' : '#ffffff';
};
const kitOf = (t) => {
  const c = JERSEY[t.color?.trim().toLowerCase()];
  return c ? `--c:${c};--t:${inkOn(c)}` : '';
};
const SHIRT = '<svg viewBox="0 0 60 56" aria-hidden="true"><use href="#lu-jersey"/></svg>';
const RINK = `<svg class="lu-ice" viewBox="0 0 200 320" aria-hidden="true">
  <defs>
    <symbol id="lu-jersey" viewBox="0 0 60 56">
      <path d="M19 3c3 4 19 4 22 0l12 6 6 15-9 4-3-6v31H13V22l-3 6-9-4 6-15z" style="fill:var(--c)" stroke="rgba(10,23,48,.45)" stroke-width="1.5" stroke-linejoin="round"/>
      <path d="M3 20l8 4M57 20l-8 4M13 47h34" style="stroke:var(--t)" stroke-width="3" opacity=".85"/>
      <path d="M23 5q7 6 14 0" fill="none" style="stroke:var(--t)" stroke-width="2.2" opacity=".85"/>
    </symbol>
    <radialGradient id="lu-iceg" cx="50%" cy="50%" r="70%"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#dfe8f3"/></radialGradient>
    <pattern id="lu-net" width="3" height="3" patternUnits="userSpaceOnUse"><path d="M0 0L3 3M3 0L0 3" stroke="#9aa9bd" stroke-width=".4"/></pattern>
  </defs>
  <rect x="2" y="2" width="196" height="316" rx="58" fill="url(#lu-iceg)" stroke="#c4d1e2" stroke-width="4"/>
  <path d="M10 26H190M10 294H190" stroke="#e2132f" stroke-width="1.6" opacity=".8"/>
  <path d="M2 116H198M2 204H198" stroke="#1f5fd6" stroke-width="5" opacity=".85"/>
  <path d="M2 160H198" stroke="#e2132f" stroke-width="4" opacity=".85"/>
  <circle cx="100" cy="160" r="28" fill="none" stroke="#1f5fd6" stroke-width="1.4"/>
  <circle cx="100" cy="160" r="3" fill="#1f5fd6"/>
  <g fill="#e2132f"><circle cx="52" cy="130" r="2.6"/><circle cx="148" cy="130" r="2.6"/><circle cx="52" cy="190" r="2.6"/><circle cx="148" cy="190" r="2.6"/>
    <circle cx="52" cy="62" r="2.6"/><circle cx="148" cy="62" r="2.6"/><circle cx="52" cy="258" r="2.6"/><circle cx="148" cy="258" r="2.6"/></g>
  <g fill="none" stroke="#e2132f" stroke-width="1.4" opacity=".85">
    <circle cx="52" cy="62" r="22"/><circle cx="148" cy="62" r="22"/><circle cx="52" cy="258" r="22"/><circle cx="148" cy="258" r="22"/>
    <path d="M30 58h-4M30 66h-4M74 58h4M74 66h4M126 58h-4M126 66h-4M170 58h4M170 66h4M30 254h-4M30 262h-4M74 254h4M74 262h4M126 254h-4M126 262h-4M170 254h4M170 262h4"/>
  </g>
  <path d="M88 26a12 12 0 0 0 24 0z" fill="#bfe0ff" stroke="#e2132f" stroke-width="1.2"/>
  <path d="M88 294a12 12 0 0 1 24 0z" fill="#bfe0ff" stroke="#e2132f" stroke-width="1.2"/>
  <path d="M92 26v-5q0-3 3-3h10q3 0 3 3v5z" fill="url(#lu-net)" stroke="#e2132f" stroke-width="2"/>
  <path d="M92 294v5q0 3 3 3h10q3 0 3-3v-5z" fill="url(#lu-net)" stroke="#e2132f" stroke-width="2"/>
</svg>`;
const lu = { g: null, id: null, teams: null, i: 0 };

// A jersey in the team's colour for this game, or a plain token in the site's colours (home blue, away red).
// Roster entry for a line-up player (same "Last, First" names as the stats; number + surname as a fallback) for the EP link.
// No match: the line-up entry itself, which epUrl turns into an EP name search.
function luRoster(team, p) {
  const hit = playerByStatKey.get(`${team}|${p.last}, ${p.first}`);
  if (hit) return hit[1];
  return teamByName.get(team)?.players.find((r) => p.no != null && r.no === p.no && r.last === p.last) || p;
}
function luSpot(team, p, [x, y], away, kit, k, goalie = false) {
  if (!p) return '';
  const [l, top] = away ? [100 - x, 100 - y] : [x, y];
  const r = luRoster(team, p);
  return `<a class="lu-p ${away ? 'away' : 'home'}${goalie ? ' g' : ''}" style="left:${l}%;top:${top}%;--d:${k * 35}ms;${kit}"
    href="${esc(epUrl(r))}" target="_blank" rel="noopener" title="${esc(`${p.first} ${p.last}`.trim())} – ${r.ep ? 'Elite Prospects' : 'sök på Elite Prospects'}">
    ${kit ? `<span class="lu-shirt">${SHIRT}<b>${p.no ?? ''}</b></span>` : `<span class="lu-no">${p.no ?? ''}</span>`}
    <span class="lu-nm">${goalie ? '<i>MV</i>' : ''}${p.first ? `<small>${esc(p.first[0])}.</small> ` : ''}${esc(p.last)}</span>
  </a>`;
}
function luTeamBar(t, side) {
  const crest = teamByName.has(t.name) ? badge(t.name) : '';
  return `<div class="lu-team ${side}">
    ${crest}<b>${esc(t.name)}</b>
    <span class="lu-side ${side}${kitOf(t) ? ' kit' : ''}" style="${kitOf(t)}">${kitOf(t) ? SHIRT : ''}${side === 'away' ? 'Borta' : 'Hemma'}</span>
  </div>`;
}
function renderLineup(dir = 0) {
  const dlg = $('#lineup');
  const blank = { name: '', goalies: [], lines: [] };
  const [home = blank, away = blank] = lu.teams;
  const n = Math.max(home.lines.length, away.lines.length);
  const i = lu.i;
  const players = (t, away) => {
    const l = t.lines[i];
    const g = t.goalies.find((p) => p.start) || t.goalies[0];
    const skaters = l ? [...l.d.map((p, k) => [p, SPOTS.d[k]]), ...l.f.map((p, k) => [p, SPOTS.f[k]])] : [];
    const kit = kitOf(t);
    return luSpot(t.name, g, SPOTS.g, away, kit, 0, true) + skaters.map(([p, s], k) => luSpot(t.name, p, s, away, kit, k)).join('');
  };
  const focused = document.activeElement?.dataset?.step;
  dlg.innerHTML = `
    <button type="button" class="lu-close" aria-label="Stäng">×</button>
    <header class="lu-top">
      <p class="lu-eyebrow">Laguppställning</p>
      <div class="lu-nav">
        <button type="button" data-step="-1" aria-label="Föregående femma"${i === 0 ? ' disabled' : ''}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg></button>
        <h2 aria-live="polite"><small>${i + 1} / ${n}</small>${ORD[i] ? `${ORD[i]} femman` : `Femma ${i + 1}`}</h2>
        <button type="button" data-step="1" aria-label="Nästa femma"${i >= n - 1 ? ' disabled' : ''}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg></button>
      </div>
      <div class="lu-prog">${Array.from({ length: n }, (_, k) => `<button type="button" data-goto="${k}" aria-label="${ORD[k] || k + 1} femman"${k === i ? ' aria-current="true"' : ''}></button>`).join('')}</div>
    </header>
    ${luTeamBar(away, 'away')}
    <div class="lu-rink" style="--dx:${dir * 28}px">${RINK}${players(away, true)}${players(home, false)}</div>
    ${luTeamBar(home, 'home')}
    <p class="lu-src">Svep eller använd pilarna för att byta femma · Källa: <a href="https://stats.swehockey.se/Game/LineUps/${esc(lu.id)}" target="_blank" rel="noopener">swehockey ↗</a></p>`;
  if (focused) dlg.querySelector(`[data-step="${focused}"]:not(:disabled)`)?.focus();
}
function goLine(i) {
  if (!lu.teams) return;
  const n = Math.max(...lu.teams.map((t) => t.lines.length));
  i = Math.min(n - 1, Math.max(0, i));
  if (i === lu.i) return;
  const dir = Math.sign(i - lu.i);
  lu.i = i;
  renderLineup(dir);
}
function lineupMessage(msg) {
  const g = lu.g;
  $('#lineup').innerHTML = `<button type="button" class="lu-close" aria-label="Stäng">×</button>
    <div class="lu-msg">
      <p class="lu-eyebrow">Laguppställning</p>
      <div class="lu-vs">${badge(g.home, 'lg')}<span>vs</span>${badge(g.away, 'lg')}</div>
      <h2>${esc(g.home)} – ${esc(g.away)}</h2>
      <p>${msg}</p>
    </div>`;
}
async function openLineup(g) {
  const dlg = $('#lineup');
  evs.id = null; // the dialog is shared with the event list
  clearInterval(evs.timer);
  dlg.setAttribute('aria-label', 'Laguppställning');
  Object.assign(lu, { g, id: null, teams: null, i: 0 });
  lineupMessage('Hämtar laguppställning…');
  if (!dlg.open) dlg.showModal();
  const qs = new URLSearchParams({ k: K, id: g.gameId || g.eventsUrl?.match(/\d+$/)?.[0] || '', home: g.home, away: g.away });
  const r = await fetch(`/api/lineup?${qs}`).then((x) => (x.ok ? x.json() : null)).catch(() => null);
  if (!dlg.open || lu.g !== g) return; // closed, or another game opened meanwhile
  if (!r) return lineupMessage('Kunde inte hämta laguppställningen just nu. Försök igen om en stund.');
  if (!r.teams.length)
    return lineupMessage('Laguppställningen är inte publicerad än. Den brukar läggas upp på swehockey ungefär en timme före nedsläpp.');
  Object.assign(lu, { id: r.id, teams: r.teams });
  renderLineup();
}
// All events of a game in the line-up dialog: goals, penalties, goalie changes, shootout. Refreshed every 20 s while live.
const evs = { id: null, data: null, timer: 0 };
const EV_SIT = { PP: 'Powerplay', SH: 'Boxplay', EN: 'Tom kasse', PS: 'Straffslag' };
const evPeriod = (n) =>
  /^\d/.test(n) ? `${nth(+n[0])} perioden` : /^overtime/i.test(n) ? 'Förlängning' : /shots$/i.test(n) ? 'Straffläggning' : /winning shot/i.test(n) ? 'Avgörande straff' : n;
// Penalty reasons stay in English as swehockey writes them (that's what hockey people say); only the penalty-shot notes are translated.
const evNote = (s = '') =>
  s.replace(/^PenaltyShot$/i, 'Straffslag utdömt').replace(/Missed Penalty Shot/i, 'Missat straffslag').replace(/Saved By/i, '· räddat av');
function evWho(team, p) {
  if (!p) return '';
  if (!p.first) return esc(/team penalty/i.test(p.last) ? 'Lagstraff' : /timeout/i.test(p.last) ? '' : p.last);
  return `<a class="ev-p" href="${esc(epUrl(luRoster(team, p)))}" target="_blank" rel="noopener">${p.no != null ? `<small>${p.no}</small>` : ''}${esc(`${p.first} ${p.last}`)}</a>`;
}
function renderEvents() {
  const dlg = $('#lineup');
  const g = games.find((x) => x.id === evs.id) || lu.g;
  const periods = evs.data?.periods || [];
  // Swehockey's team codes -> home/away; a code we don't know gets whichever side is left.
  const side = new Map();
  const codes = [...new Set(periods.flatMap((p) => p.events.map((e) => e.team)))];
  for (const c of codes) {
    const n = teamByCode.get(c)?.name;
    if (n === g.home || n === g.away) side.set(c, n);
  }
  for (const c of codes) if (!side.has(c)) side.set(c, [g.home, g.away].find((n) => ![...side.values()].includes(n)) || c);
  const live = isLive(g);
  const info = live && liveInfo(g);
  const status = live ? `<span class="state live">Live</span> · ${info.what}${info.clock ? ` · <b class="clock">${esc(info.clock)}</b>` : ''}` : g.hs != null ? 'Slut' : '';
  const item = (e) => {
    const team = side.get(e.team) || e.team;
    const who = evWho(team, e.player);
    let tag, main = who, sub = '';
    if (e.kind === 'goal') {
      tag = `Mål ${e.score[0]}–${e.score[1]}`;
      main = who + (e.total ? ` <span class="ev-n">(${e.total})</span>` : '');
      const sit = e.sit.split(/[\s,]+/).map((s) => EV_SIT[s.replace(/\d+$/, '')]).filter(Boolean);
      sub = [e.assists.length ? `Assist: ${e.assists.map((a) => evWho(team, a)).join(', ')}` : '', ...sit.map((s) => `<span class="ev-sit">${s}</span>`)].filter(Boolean).join(' ');
    } else if (e.kind === 'so') {
      tag = e.scored ? 'Mål' : 'Miss';
      sub = e.goalie ? `mot ${evWho(side.get(e.team) === g.home ? g.away : g.home, e.goalie)}` : '';
    } else if (e.kind === 'pen') {
      tag = e.what;
      sub = esc(evNote(e.note));
    } else if (e.kind === 'gk') {
      tag = /out/i.test(e.what) ? 'MV ut' : 'MV in';
    } else {
      tag = { TO: 'Timeout', PS: 'Straffslag' }[e.what] || e.what || 'Straff';
      sub = esc(evNote(e.note));
    }
    return `<li class="ev ${e.kind}${e.kind === 'so' && e.scored ? ' scored' : ''} ${team === g.away ? 'away' : 'home'}">
      <span class="ev-t">${esc(e.time)}</span>${badge(team)}
      <div class="ev-b"><div class="ev-h"><span class="ev-tag">${esc(tag)}</span>${main}</div>${sub ? `<div class="ev-s">${sub}</div>` : ''}</div>
    </li>`;
  };
  const top = dlg.scrollTop;
  dlg.innerHTML = `<button type="button" class="lu-close" aria-label="Stäng">×</button>
    <header class="ev-top">
      <p class="lu-eyebrow">Händelser</p>
      <div class="ev-score">
        <div>${badge(g.home, 'lg')}<span>${esc(g.home)}</span></div>
        <div class="ev-res"><b>${g.hs ?? 0}–${g.as ?? 0}</b><small>${status}</small></div>
        <div>${badge(g.away, 'lg')}<span>${esc(g.away)}</span></div>
      </div>
    </header>
    ${
      periods.length
        ? periods.map((p) => `<h3 class="ev-per">${esc(evPeriod(p.name))}</h3><ol class="ev-list">${p.events.map(item).join('')}</ol>`).join('')
        : `<p class="ev-empty">${evs.data ? 'Inga händelser än.' : 'Hämtar händelser…'}</p>`
    }
    ${evs.data?.id ? `<p class="lu-src">Senaste överst${live ? ' · uppdateras automatiskt' : ''} · Källa: <a href="https://stats.swehockey.se/Game/Events/${esc(evs.data.id)}" target="_blank" rel="noopener">swehockey ↗</a></p>` : ''}`;
  dlg.scrollTop = top;
}
async function loadEvents(g) {
  const qs = new URLSearchParams({ k: K, id: g.gameId || g.eventsUrl?.match(/\d+$/)?.[0] || '', home: g.home, away: g.away });
  const r = await fetch(`/api/events?${qs}`).then((x) => (x.ok ? x.json() : null)).catch(() => null);
  if (!$('#lineup').open || evs.id !== g.id) return; // closed, or something else opened meanwhile
  if (r) evs.data = r;
  else if (!evs.data) return lineupMessage('Kunde inte hämta händelserna just nu. Försök igen om en stund.');
  renderEvents();
}
function openEvents(g) {
  const dlg = $('#lineup');
  clearInterval(evs.timer);
  Object.assign(lu, { g, id: null, teams: null, i: 0 }); // no line-up: swipes and arrow keys do nothing
  Object.assign(evs, { id: g.id, data: null });
  dlg.setAttribute('aria-label', 'Händelser');
  renderEvents();
  if (!dlg.open) dlg.showModal();
  loadEvents(g);
  evs.timer = setInterval(() => {
    const cur = games.find((x) => x.id === evs.id);
    if (cur && isLive(cur)) loadEvents(cur);
  }, 20000);
}
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-events]');
  const g = el && games.find((x) => x.id === el.dataset.events);
  if (g) openEvents(g);
});
// Click anywhere on a match card (except its links and buttons) or its "Laguppställning" button.
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-lineup]') || (!e.target.closest('a,button') && e.target.closest('.match[data-game]'));
  const g = el && games.find((x) => x.id === (el.dataset.lineup || el.dataset.game));
  if (g) openLineup(g);
});
{
  const dlg = $('#lineup');
  dlg.addEventListener('click', (e) => {
    if (e.target === dlg || e.target.closest('.lu-close')) return dlg.close(); // backdrop or ×
    const b = e.target.closest('[data-step],[data-goto]');
    if (b) goLine(b.dataset.goto != null ? +b.dataset.goto : lu.i + +b.dataset.step);
  });
  dlg.addEventListener('close', () => {
    clearInterval(evs.timer);
    evs.id = null;
  });
  dlg.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') goLine(lu.i + (e.key === 'ArrowLeft' ? -1 : 1));
  });
  // Swipe left/right to change line.
  let x0 = null;
  let y0 = 0;
  dlg.addEventListener('touchstart', (e) => ([x0, y0] = [e.touches[0].clientX, e.touches[0].clientY]), { passive: true });
  dlg.addEventListener('touchend', (e) => {
    if (x0 == null) return;
    const dx = e.changedTouches[0].clientX - x0;
    const dy = e.changedTouches[0].clientY - y0;
    x0 = null;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) goLine(lu.i + (dx < 0 ? 1 : -1));
  });
}

// ---------- routing ----------
const VIEWS = ['matcher', 'tabeller', 'lag', 'favoriter'];
let firstRoute = true;
function route() {
  const [view, code] = decodeURIComponent(location.hash.slice(1)).split('/');
  let v = VIEWS.includes(view) ? view : 'matcher';
  if (v === 'lag' && teamByCode.has(code)) {
    v = 'team';
    renderTeam(code);
  }
  if (v === 'favoriter') renderFavs();
  for (const s of $$('[data-view]')) s.hidden = s.dataset.view !== v;
  const tab = v === 'team' ? 'lag' : v;
  for (const a of $$('[data-tab]')) a.dataset.tab === tab ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current');
  // Keep the tab bar in view when switching; on first load only jump if a specific view was linked.
  const heroH = $('.hero').offsetHeight;
  if ((!firstRoute && scrollY > heroH) || (firstRoute && location.hash)) scrollTo({ top: heroH });
  firstRoute = false;
}

function setUpdated(live) {
  const el = $('#updated');
  el.textContent = updated ? `Uppdaterad ${updated.slice(5).replace('-', '/')}` : '';
  el.classList.toggle('live', live);
}

function renderAll() {
  renderHero();
  renderMatches();
  renderTables();
  if (!$('#team').hidden) renderTeam(decodeURIComponent(location.hash).split('/')[1]);
  if (!$('[data-view="favoriter"]').hidden) renderFavs();
}

renderFilters();
renderAll();
renderTeams();
setUpdated(false);
updateFavCount();
route();

addEventListener('hashchange', route);
$('#days').addEventListener('click', (e) => {
  const b = e.target.closest('[data-day]');
  if (!b) return;
  state.day = b.dataset.day;
  for (const x of e.currentTarget.children) x.setAttribute('aria-pressed', x === b);
  renderMatches();
});
$('#groups').addEventListener('click', (e) => {
  const b = e.target.closest('[data-group]');
  if (!b) return;
  state.group = b.dataset.group;
  for (const x of e.currentTarget.children) x.setAttribute('aria-pressed', x === b);
  // "Mina lag" is most useful across the whole cup, not one day.
  if (state.group === 'fav' && state.day !== 'all') {
    state.day = 'all';
    for (const x of $('#days').children) x.setAttribute('aria-pressed', x.dataset.day === 'all');
  }
  renderMatches();
});
$('#teamFilter').insertAdjacentHTML('beforeend', sortedTeams.map((t) => `<option>${esc(t.name)}</option>`).join(''));
$('#teamFilter').addEventListener('change', (e) => {
  state.team = e.target.value;
  if (state.team) {
    state.day = 'all';
    for (const x of $('#days').children) x.setAttribute('aria-pressed', x.dataset.day === 'all');
  }
  renderMatches();
});
$('#q').addEventListener('input', renderTeams);
$('#psTeam').insertAdjacentHTML('beforeend', sortedTeams.map((t) => `<option>${esc(t.name)}</option>`).join(''));
$('#psControls').addEventListener('click', (e) => {
  const b = e.target.closest('[data-mode],[data-pos]');
  if (!b) return;
  if (b.dataset.mode) {
    ps.mode = b.dataset.mode;
    ps.sort = { goalies: 'svsp', pen: 'pim' }[ps.mode] || 'tp';
    ps.dir = -1;
  } else ps.pos = b.dataset.pos;
  for (const x of b.parentElement.children) x.setAttribute('aria-pressed', x === b);
  ps.limit = 50;
  renderAllStats();
});
$('#psTeam').addEventListener('change', (e) => { ps.team = e.target.value; ps.limit = 50; renderAllStats(); });
$('#psQ').addEventListener('input', (e) => { ps.q = e.target.value; ps.limit = 50; renderAllStats(); });
$('#scoring').addEventListener('click', (e) => {
  if (e.target.closest('[data-more]')) {
    ps.limit = Infinity;
    return renderAllStats();
  }
  const b = e.target.closest('[data-sort]');
  if (!b) return;
  const k = b.dataset.sort;
  // First click sorts high-to-low; the same column again flips. Fewest goals against is best for goalies.
  ps.dir = ps.sort === k ? -ps.dir : k === 'ga' || k === 'gaa' ? 1 : -1;
  ps.sort = k;
  renderAllStats();
});
$('#team').addEventListener('click', (e) => {
  const b = e.target.closest('[data-teamtab]');
  if (!b) return;
  state.teamTab = b.dataset.teamtab;
  renderTeam(decodeURIComponent(location.hash).split('/')[1]);
});

// Results and player stats come live from the API (CDN-cached); data.json is only first paint / fallback.
// `full` also fetches player stats and standings; otherwise only results.
async function refresh(full = true) {
  const get = (u) => fetch(u).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const [sched, st, tbl] = await Promise.all([get(`/api/schedule?k=${K}`), full ? get(`/api/stats?k=${K}`) : null, full ? get(`/api/standings?k=${K}`) : null]);
  if (tbl) official = tbl;
  if (st) {
    stats = {
      players: new Map(st.players.map((s) => [`${s.team}|${s.name}`, s])),
      goalies: new Map(st.goalies.map((s) => [`${s.team}|${s.name}`, s])),
      pen: new Map((st.penalties || []).map((s) => [`${s.team}|${s.name}`, s])),
    };
  }
  if (sched) {
    games = sched.games;
    updated = sched.updated;
  }
  if (sched || st || tbl) {
    renderAll();
    if (!$('[data-view="lag"]').hidden) renderTeams();
    setUpdated(!!sched);
  }
}
// Results every 15 s while a game is on (time window, so it keeps going between periods); everything every 2 min.
const SLOW_MS = 120000;
const FAST_MS = 15000;
let lastFull = 0;
async function tick() {
  const full = Date.now() - lastFull >= SLOW_MS - FAST_MS / 2;
  if (full) lastFull = Date.now();
  try {
    await refresh(full);
  } finally {
    setTimeout(tick, games.some((g) => inPlay(g)) ? FAST_MS : SLOW_MS);
  }
}
tick();
