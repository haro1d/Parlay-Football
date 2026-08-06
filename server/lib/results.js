// Finished-match (赛果) data source — REAL third-party results.
//
// 体彩's own finished-match LIST (getMatchResultNewV1) requires a signed
// request token (verified: returns "请求错误" without a sign; the 竞彩 product
// site /jcw/ is itself WAF-blocked with 403). So we cannot fetch 体彩's finished
// list directly. The 体彩 app itself labels such historical data as
// "数据来源于第三方", so using a real third-party results API is consistent.
//
// Supported providers (key via env var or a .env file next to server.js):
//   APIFOOTBALL_KEY   -> api-sports.io  (broadest 体彩 coverage: 巴甲/巴西杯/中超…)
//   FOOTBALL_DATA_KEY -> football-data.org (top European leagues + UCL/UEL)
// No key present => finished matches are simply omitted (UI shows a notice,
// never fake data).

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

function datesBack(n) {
  const out = [];
  const now = new Date();
  for (let i = n; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

// 体彩 typically covers these leagues; filtering keeps the finished list relevant
// and avoids dumping every lower-division fixture of the day.
const APIFB_LEAGUES = new Set([
  2, 3, 848, 39, 140, 135, 78, 61, 71, 294, 13, 525, 45, 143, 88, 94, 9, 10, 11, 12,
]);

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

function normName(n) {
  return (n || "").trim();
}

function pickConfig() {
  if (process.env.APIFOOTBALL_KEY) return { key: process.env.APIFOOTBALL_KEY, provider: "apifootball" };
  if (process.env.FOOTBALL_DATA_KEY) return { key: process.env.FOOTBALL_DATA_KEY, provider: "football-data" };
  return null;
}

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
  const dt = f.fixture?.date || `${datesBack(0)[0]}T00:00:00Z`;
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
  const dt = m.utcDate || `${datesBack(0)[0]}T00:00:00Z`;
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

export async function getFinishedMatches(daysBack = 3) {
  const cfg = pickConfig();
  if (!cfg) {
    return { matches: [], available: false, source: null, error: null };
  }
  const now = Date.now();
  if (cache.data && now - cache.at < TTL) {
    return { ...cache.data, available: true };
  }
  try {
    const dates = datesBack(daysBack);
    const lists = await Promise.all(dates.map((ds) => fetchOne(ds, cfg)));
    const matches = lists.flat().filter(Boolean);
    const data = {
      matches,
      available: true,
      source: cfg.provider === "apifootball" ? "third-party:apifootball" : "third-party:football-data",
      error: null,
    };
    cache = { at: now, data };
    return data;
  } catch (e) {
    return { matches: [], available: true, source: null, error: e.message };
  }
}
