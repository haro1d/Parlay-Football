// Finished-match (赛果) data source — REAL third-party results.
//
// 体彩's own finished-match LIST (getMatchResultNewV1) requires a signed
// request token (verified: returns "请求错误" without a sign; the 竞彩 product
// site /jcw/ is itself WAF-blocked with 403). So we cannot fetch 体彩's finished
// list directly. The 体彩 app itself labels such historical data as
// "数据来源于第三方", so using a real third-party results API is consistent.
//
// Data providers (priority order):
//   1. APIFOOTBALL_KEY   -> api-sports.io  (broadest 体彩 coverage: 巴甲/巴西杯/中超…)
//   2. FOOTBALL_DATA_KEY -> football-data.org (top European leagues + UCL/UEL)
//   3. (default, NO KEY) -> ESPN hidden scoreboard API. Free, no auth, covers the
//      main 体彩 competitions (英超/西甲/巴甲/中超/日职/欧冠/欧联/解放者杯…). This is
//      the out-of-the-box source so finished scores show immediately with zero setup.
//
// No provider is ever faked — if every source is unreachable, matches is simply
// empty and the UI shows a notice.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
loadDotEnv();

function loadDotEnv() {
  try {
    const txt = readFileSync(join(__dirname, "..", "..", ".env"), "utf8");
    for (const line of txt.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && m[2] !== undefined && !process.env[m[1]]) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
      }
    }
  } catch {
    // no .env — fine, keys may come from the environment
  }
}

const TTL = 5 * 60 * 1000;
let cache = { at: 0, data: null };

// 体彩 main competitions, mapped to ESPN soccer league codes.
// (verified reachable; 中超=chn.1, 日职=jpn.1, 巴甲=bra.1, 阿甲=arg.1, 墨超=mex.1,
//  解放者杯=conmebol.libertadores, 欧冠=uefa.champions, 欧联=uefa.europa …)
const ESPN_LEAGUES = [
  "eng.1", "esp.1", "ita.1", "ger.1", "fra.1", // 五大联赛
  "uefa.champions", "uefa.europa", // 欧冠 / 欧联
  "bra.1", "arg.1", "mex.1", // 巴甲 / 阿甲 / 墨超
  "chn.1", "jpn.1", "kor.1", // 中超 / 日职 / 韩K
  "conmebol.libertadores", // 解放者杯
  "por.1", "ned.1", "sco.1", "tur.1", "bel.1", // 葡超 / 荷甲 / 苏超 / 土超 / 比甲
  "usa.1", // MLS
  "eng.2", "esp.2", "ger.2", "ita.2", "fra.2", // 次级联赛
];

function datesBack(n) {
  const out = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

function normName(n) {
  return (n || "").trim();
}

function pickConfig() {
  if (process.env.APIFOOTBALL_KEY) return { provider: "apifootball", key: process.env.APIFOOTBALL_KEY };
  if (process.env.FOOTBALL_DATA_KEY) return { provider: "football-data", key: process.env.FOOTBALL_DATA_KEY };
  return { provider: "espn", key: null };
}

async function fetchJSON(url, headers) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 9000);
  try {
    const r = await fetch(url, { signal: ac.signal, headers });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

// Run `fn` over `items` with at most `limit` concurrent in-flight calls.
function mapLimit(items, limit, fn) {
  const ret = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      ret[idx] = await fn(items[idx], idx);
    }
  });
  return Promise.all(workers).then(() => ret);
}

// ---------------------------------------------------------------------------
// ESPN (no key)
// ---------------------------------------------------------------------------

function toMatchEspn(e, lg) {
  const c = (e.competitions && e.competitions[0]) || {};
  const comps = c.competitors || [];
  const h = comps.find((x) => x.homeAway === "home") || {};
  const a = comps.find((x) => x.homeAway === "away") || {};
  const homeName = (h.team && (h.team.displayName || h.team.shortDisplayName)) || "";
  const awayName = (a.team && (a.team.displayName || a.team.shortDisplayName)) || "";
  const homeId = Number(h.team && h.team.id) || null;
  const awayId = Number(a.team && a.team.id) || null;
  const hs = h.score != null ? Number(h.score) : null;
  const as = a.score != null ? Number(a.score) : null;
  const dt = e.date || `${datesBack(1)[0]}T00:00:00Z`;
  const d = new Date(dt);
  const matchDate = d.toISOString().slice(0, 10);
  const matchTime = d.toISOString().slice(11, 16);
  const leagueName = (e.league && e.league.name) || (c.series && c.series.name) || lg;
  return {
    matchId: Number(e.id) || 0,
    matchNum: 0,
    matchNumStr: "",
    matchNumDate: matchDate,
    businessDate: matchDate,
    matchDate,
    matchTime,
    weekday: "",
    league: { id: 0, code: lg, abbName: normName(leagueName), allName: normName(leagueName) },
    home: { code: "", abbName: normName(homeName), allName: normName(homeName) },
    away: { code: "", abbName: normName(awayName), allName: normName(awayName) },
    status: "FT",
    statusLabel: "已完成",
    sellStatus: "finished",
    finished: true,
    finalScore: `${hs ?? 0}-${as ?? 0}`,
    resultSource: "third-party:espn",
    homeId,
    awayId,
    bettingSingle: false,
    bettingAllUp: false,
    markets: {},
  };
}

async function fetchEspn(dateISO, lg) {
  const ymd = String(dateISO).replace(/-/g, "");
  const j = await fetchJSON(
    `https://site.api.espn.com/apis/site/v2/sports/soccer/${lg}/scoreboard?dates=${ymd}`,
    { "User-Agent": "Mozilla/5.0" },
  );
  const ev = (j && j.events) || [];
  return ev
    .filter((e) => e && e.status && e.status.type && e.status.type.completed === true)
    .map((e) => toMatchEspn(e, lg));
}

// ---------------------------------------------------------------------------
// API-Football / football-data.org (key-based, broader coverage)
// ---------------------------------------------------------------------------

const APIFB_LEAGUES = new Set([
  2, 3, 848, 39, 140, 135, 78, 61, 71, 294, 13, 525, 45, 143, 88, 94, 9, 10, 11, 12,
]);

async function fetchOne(dateStr, cfg) {
  if (cfg.provider === "apifootball") {
    const j = await fetchJSON(`https://v3.football.api-sports.io/fixtures?date=${dateStr}`, {
      "x-apisports-key": cfg.key,
    });
    const arr = j?.response || [];
    return arr
      .filter((f) => f && (f.fixture?.status?.short === "FT" || (f.goals && f.goals.home != null)))
      .filter((f) => APIFB_LEAGUES.has(Number(f.league?.id)))
      .map((f) => toMatchApifb(f, dateStr));
  }
  const j = await fetchJSON(`https://api.football-data.org/v4/matches?date=${dateStr}`, {
    "X-Auth-Token": cfg.key,
  });
  const arr = j?.matches || [];
  return arr.filter((m) => m.status === "FINISHED").map((m) => toMatchFd(m, dateStr));
}

function toMatchApifb(f) {
  const g = f.goals || {};
  const sc = f.score?.fulltime || {};
  const home = g.home ?? sc.home ?? 0;
  const away = g.away ?? sc.away ?? 0;
  const dt = f.fixture?.date || `${datesBack(1)[0]}T00:00:00Z`;
  const d = new Date(dt);
  const matchDate = d.toISOString().slice(0, 10);
  const matchTime = d.toISOString().slice(11, 16);
  return {
    matchId: Number(f.fixture?.id) || 0,
    matchNum: 0,
    matchNumStr: "",
    matchNumDate: matchDate,
    businessDate: matchDate,
    matchDate,
    matchTime,
    weekday: "",
    league: { id: Number(f.league?.id) || 0, code: "", abbName: normName(f.league?.name), allName: normName(f.league?.name) },
    home: { code: "", abbName: normName(f.teams?.home?.name), allName: normName(f.teams?.home?.name) },
    away: { code: "", abbName: normName(f.teams?.away?.name), allName: normName(f.teams?.away?.name) },
    status: "FT",
    statusLabel: "已完成",
    sellStatus: "finished",
    finished: true,
    finalScore: `${home}-${away}`,
    resultSource: "third-party:apifootball",
    bettingSingle: false,
    bettingAllUp: false,
    markets: {},
  };
}

function toMatchFd(m) {
  const sc = m.score?.fullTime || {};
  const dt = m.utcDate || `${datesBack(1)[0]}T00:00:00Z`;
  const d = new Date(dt);
  const matchDate = d.toISOString().slice(0, 10);
  const matchTime = d.toISOString().slice(11, 16);
  return {
    matchId: Number(m.id) || 0,
    matchNum: 0,
    matchNumStr: "",
    matchNumDate: matchDate,
    businessDate: matchDate,
    matchDate,
    matchTime,
    weekday: "",
    league: { id: 0, code: "", abbName: normName(m.competition?.name), allName: normName(m.competition?.name) },
    home: { code: "", abbName: normName(m.homeTeam?.name), allName: normName(m.homeTeam?.name) },
    away: { code: "", abbName: normName(m.awayTeam?.name), allName: normName(m.awayTeam?.name) },
    status: "FT",
    statusLabel: "已完成",
    sellStatus: "finished",
    finished: true,
    finalScore: `${sc.home ?? 0}-${sc.away ?? 0}`,
    resultSource: "third-party:football-data",
    bettingSingle: false,
    bettingAllUp: false,
    markets: {},
  };
}

// ---------------------------------------------------------------------------

export async function getFinishedMatches(daysBack = 2) {
  const cfg = pickConfig();
  const now = Date.now();
  if (cache.data && now - cache.at < TTL) {
    return { ...cache.data, available: true };
  }
  try {
    const dates = datesBack(daysBack);
    let matches = [];

    if (cfg.provider === "espn") {
      // 每个日期并行拉取所有联赛（并发受限，避免打爆 ESPN）
      const perDate = await Promise.all(
        dates.map((ds) => mapLimit(ESPN_LEAGUES, 6, (lg) => fetchEspn(ds, lg).catch(() => []))),
      );
      matches = perDate.flat(2).filter(Boolean);
    } else {
      const lists = await Promise.all(dates.map((ds) => fetchOne(ds, cfg).catch(() => [])));
      matches = lists.flat().filter(Boolean);
    }

    const data = {
      matches,
      available: true,
      source:
        cfg.provider === "apifootball"
          ? "third-party:apifootball"
          : cfg.provider === "football-data"
            ? "third-party:football-data"
            : "third-party:espn",
      error: null,
    };
    cache = { at: now, data };
    return data;
  } catch (e) {
    return { matches: [], available: true, source: null, error: e.message };
  }
}
