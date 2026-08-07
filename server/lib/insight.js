// Team-insight data source.
//
// Primary: the official 竞彩网 detail endpoints (webapi.sporttery.cn), the same
// ones the 体彩 app / 竞彩网 "对阵详情" page uses for its "特征分析 / 积分榜".
// These return REAL historical win/draw/loss records, score ratios and goal
// averages — exactly the data the app shows (the page itself notes
// "本页面部分数据来源于第三方").
//
// Fallback: a deterministic synthetic generator (stable across reloads) used only
// when the upstream is unreachable, so the analysis panel stays usable offline.

const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 ' +
    '(KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
  Referer: 'https://m.sporttery.cn/',
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'zh-CN,zh;q=0.9',
};
const BASE = 'https://webapi.sporttery.cn/gateway/uniform/football';

function str(v) {
  return v === null || v === undefined ? '' : String(v);
}
function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function normLogo(p) {
  if (!p) return undefined;
  return p.startsWith('//') ? 'https:' + p : p;
}

async function fetchJSON(url) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 9000);
  try {
    const r = await fetch(url, { signal: ac.signal, headers: HEADERS });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const j = await r.json();
    if (j && j.errorCode && String(j.errorCode) !== '0') {
      throw new Error(j.errorMessage || 'api error');
    }
    return j?.value || null;
  } finally {
    clearTimeout(t);
  }
}

function fetchHead(mid) {
  return fetchJSON(`${BASE}/getMatchHeadV1.qry?source=web&sportteryMatchId=${mid}&matchId=${mid}`);
}
function fetchFeature(mid) {
  return fetchJSON(`${BASE}/getMatchFeatureV1.qry?source=web&sportteryMatchId=${mid}&matchId=${mid}`);
}
function fetchH2H(mid, limit = 10) {
  return fetchJSON(
    `${BASE}/getResultHistoryV1.qry?source=web&sportteryMatchId=${mid}&termLimits=${limit}&tournamentFlag=0&homeAwayFlag=0`,
  );
}
function fetchRecent(mid, limit = 10) {
  return fetchJSON(
    `${BASE}/getMatchResultV1.qry?source=web&sportteryMatchId=${mid}&termLimits=${limit}&tournamentFlag=0&homeAwayFlag=0`,
  );
}

function toStat(o) {
  if (!o) return undefined;
  return {
    homeWin: num(o.homeWinGoalMatchCnt),
    homeDraw: num(o.homeDrawMatchCnt),
    homeLoss: num(o.homeLossGoalMatchCnt),
    homeWinRate: num(o.homeScoreRatio),
    awayWin: num(o.awayWinGoalMatchCnt),
    awayDraw: num(o.awayDrawMatchCnt),
    awayLoss: num(o.awayLossGoalMatchCnt),
    awayWinRate: num(o.awayScoreRatio),
    total: num(o.totalLegCnt),
  };
}

function toGoalAvg(g) {
  if (!g) return undefined;
  return { home: num(g.homeGoalAvgCnt), away: num(g.awayGoalAvgCnt) };
}

function toStandings(w) {
  if (!w) return undefined;
  const mk = (s) => ({
    ranking: str(s.ranking) || undefined,
    win: num(s.sWinGoalMatchCnt),
    draw: num(s.sDrawMatchCnt),
    loss: num(s.sLossGoalMatchCnt),
    groupName: str(s.groupName) || undefined,
    phaseName: str(s.phaseName) || undefined,
    seasonName: str(s.seasonName) || undefined,
  });
  return { home: mk(w.home || {}), away: mk(w.away || {}) };
}

// ---------------------------------------------------------------------------
// Per-match normalization (real逐场比分 -> display rows)
// ---------------------------------------------------------------------------

function flip(s) {
  const v = str(s);
  return v.includes(':') ? v.split(':').reverse().join(':') : v;
}

// current team's own result code (home/away/draw) -> 胜/平/负
function mapTeamResult(code) {
  if (code === 'home') return '胜';
  if (code === 'away') return '负';
  if (code === 'draw') return '平';
  return '';
}

// result for `teamName` derived from winningTeam + which side it played on
// (used for H2H where teamMatchResult is empty)
function resultFromWinner(match, teamName) {
  const isHome = match.homeTeamShortName === teamName;
  const w = match.winningTeam;
  if (!w || w === 'draw') return '平';
  if (isHome) return w === 'home' ? '胜' : '负';
  return w === 'away' ? '胜' : '负';
}

// one recent/recent-form row. We keep BOTH real team names and the OFFICIAL
// home-away score (fullCourtGoal is always home:away), plus a flag for whether
// `teamName` is the home side and the team's own name, so the UI can render the
// matchup in official home-vs-away order and highlight the current team.
function toInsightMatch(raw, teamName) {
  const homeName = str(raw.homeTeamShortName);
  const awayName = str(raw.awayTeamShortName);
  const score = str(raw.fullCourtGoal || '');
  const isHome = homeName === teamName;
  const result = mapTeamResult(raw.teamMatchResult) || resultFromWinner(raw, teamName);
  return {
    matchDate: str(raw.matchDate),
    tournament: str(raw.tournamentShortName),
    homeName,
    awayName,
    score,
    result,
    isSelfHome: isHome,
    selfName: str(teamName),
  };
}

// one H2H row, from the perspective of `primary` (current home team) for the result.
function toH2HMatch(raw, primary) {
  const homeName = str(raw.homeTeamShortName);
  const awayName = str(raw.awayTeamShortName);
  const score = str(raw.fullCourtGoal || '');
  return {
    matchDate: str(raw.matchDate),
    tournament: str(raw.tournamentShortName),
    homeName,
    awayName,
    score,
    result: resultFromWinner(raw, primary),
    isSelfHome: homeName === primary,
    selfName: str(primary),
  };
}

function toInsightStat(o) {
  if (!o) return { win: 0, draw: 0, loss: 0, winPct: '0%', total: 0 };
  return {
    win: num(o.winGoalMatchCnt),
    draw: num(o.drawMatchCnt),
    loss: num(o.lossGoalMatchCnt),
    winPct: str(o.winProbability || '0%'),
    total: num(o.totalLegCnt),
    goalFor: o.goalCnt !== undefined ? num(o.goalCnt) : undefined,
    goalAgainst: o.lossGoalCnt !== undefined ? num(o.lossGoalCnt) : undefined,
    netGoal: o.netGoal !== undefined ? num(o.netGoal) : undefined,
  };
}

function buildReal(matchId, head, feature, h2h, recent) {
  const homeName = str(head.homeTeamShortName);
  const awayName = str(head.awayTeamShortName);
  const h2hPrimary =
    (h2h && h2h.statistics && h2h.statistics.teamShortName) || homeName;
  const h2hMatches = (
    h2h && Array.isArray(h2h.matchList) ? h2h.matchList : []
  ).map((m) => toH2HMatch(m, h2hPrimary));
  const homeMatches = (
    recent && recent.home && Array.isArray(recent.home.matchList)
      ? recent.home.matchList
      : []
  ).map((m) => toInsightMatch(m, homeName));
  const awayMatches = (
    recent && recent.away && Array.isArray(recent.away.matchList)
      ? recent.away.matchList
      : []
  ).map((m) => toInsightMatch(m, awayName));
  return {
    demo: false,
    source: 'sporttery',
    head: {
      homeName,
      awayName,
      homeLogo: normLogo(head.homeTeamLogoPath),
      awayLogo: normLogo(head.awayTeamLogoPath),
      tournament:
        str(head.tournamentCnShortName) || str(head.tournamentCnName) || undefined,
      matchDateTime: str(head.matchDateTime) || undefined,
      standings: toStandings(head.wbsjStats),
    },
    feature: {
      last: toStat(feature?.last),
      sameHomeAway: toStat(feature?.sameHomeAway),
      eachHomeAway: toStat(feature?.eachHomeAway),
      eachSameHomeAway: toStat(feature?.eachSameHomeAway),
      goalAvg: toGoalAvg(feature?.goalAvg),
    },
    h2h: {
      primary: h2hPrimary,
      stat: toInsightStat(h2h && h2h.statistics),
      matches: h2hMatches,
    },
    recent: {
      home: {
        teamName: homeName,
        stat: toInsightStat(recent && recent.home && recent.home.statistics),
        matches: homeMatches,
      },
      away: {
        teamName: awayName,
        stat: toInsightStat(recent && recent.away && recent.away.statistics),
        matches: awayMatches,
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Synthetic fallback (deterministic, for offline / upstream-unreachable use)
// ---------------------------------------------------------------------------

function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
const TEAMS_POOL = [
  '曼城', '阿森纳', '利物浦', '切尔西', '曼联', '热刺', '纽卡斯尔', '阿斯顿维拉', '布莱顿', '西汉姆',
  '皇家马德里', '巴塞罗那', '马德里竞技', '塞维利亚', '毕尔巴鄂', '瓦伦西亚', '比利亚雷亚尔', '赫罗纳', '皇家社会', '贝蒂斯',
  '国际米兰', 'AC米兰', '尤文图斯', '那不勒斯', '罗马', '拉齐奥', '亚特兰大', '佛罗伦萨', '博洛尼亚', '都灵',
  '拜仁慕尼黑', '多特蒙德', '勒沃库森', '莱比锡', '法兰克福', '柏林联合', '斯图加特', '门兴', '沃尔夫斯堡', '弗赖堡',
  '巴黎圣日耳曼', '马赛', '摩纳哥', '里昂', '里尔', '尼斯', '雷恩', '朗斯',
  '阿根廷', '法国', '巴西', '英格兰', '葡萄牙', '西班牙', '德国', '荷兰', '比利时', '克罗地亚', '意大利', '乌拉圭',
  '上海海港', '上海申花', '北京国安', '山东泰山', '成都蓉城', '武汉三镇', '浙江队', '河南队', '天津津门虎', '沧州雄狮',
];
const RESULTS = ['胜', '平', '负'];
function dateMinus(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}
function genRecent(team, exclude, rng) {
  const pool = TEAMS_POOL.filter((t) => t !== team && t !== exclude);
  const picks = [];
  let guard = 0;
  while (picks.length < 6 && guard < 200) {
    guard++;
    const t = pool[Math.floor(rng() * pool.length)];
    if (!picks.includes(t)) picks.push(t);
  }
  const out = [];
  let off = 5;
  for (const opp of picks) {
    const r = RESULTS[Math.floor(rng() * 3)];
    const gh = r === '胜' ? 1 + Math.floor(rng() * 3) : r === '平' ? Math.floor(rng() * 2) : Math.floor(rng() * 2);
    const ga = r === '负' ? 1 + Math.floor(rng() * 3) : r === '平' ? gh : Math.floor(rng() * 2);
    const isHome = rng() < 0.55;
    const date = dateMinus(off);
    off += 6 + Math.floor(rng() * 12);
    out.push({ date, opponent: opp, home: isHome, result: r, score: `${gh}-${ga}` });
  }
  return out.sort((a, b) => b.date.localeCompare(a.date));
}
function genH2H(home, away, rng) {
  const out = [];
  let off = 110;
  for (let i = 0; i < 5; i++) {
    const r = RESULTS[Math.floor(rng() * 3)];
    const gh = r === '胜' ? 1 + Math.floor(rng() * 3) : r === '平' ? Math.floor(rng() * 2) : Math.floor(rng() * 2);
    const ga = r === '负' ? 1 + Math.floor(rng() * 3) : r === '平' ? gh : Math.floor(rng() * 2);
    const date = dateMinus(off + Math.floor(rng() * 80));
    off += 130;
    out.push({ date, home, away, result: r, score: `${gh}-${ga}` });
  }
  return out.sort((a, b) => b.date.localeCompare(a.date));
}
function synthetic(homeName, awayName) {
  const rng = mulberry32(hashStr(`${homeName}|${awayName}`));
  return {
    demo: true,
    home: { team: homeName, recent: genRecent(homeName, awayName, rng) },
    away: { team: awayName, recent: genRecent(awayName, homeName, rng) },
    h2h: genH2H(homeName, awayName, rng),
  };
}

// ---------------------------------------------------------------------------
// ESPN real data (for third-party finished matches that have no 体彩 matchId)
// ---------------------------------------------------------------------------

async function fetchEspnRaw(url) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 9000);
  try {
    const r = await fetch(url, { signal: ac.signal, headers: { "User-Agent": "Mozilla/5.0" } });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

// One team's completed matches from ESPN's team schedule endpoint.
function fetchEspnTeamSchedule(teamId, lg, limit = 50) {
  return fetchEspnRaw(
    `https://site.api.espn.com/apis/site/v2/sports/soccer/${lg}/teams/${teamId}/schedule?limit=${limit}`,
  ).then((j) => {
    const events = (j && j.events) || [];
    const now = Date.now();
    const out = [];
    for (const e of events) {
      const c = (e.competitions && e.competitions[0]) || {};
      const cs = c.competitors || [];
      const h = cs.find((x) => x.homeAway === "home") || {};
      const a = cs.find((x) => x.homeAway === "away") || {};
      const hs = h.score && h.score.displayValue;
      const as = a.score && a.score.displayValue;
      // only fully-played, past matches with numeric scores
      if (hs == null || as == null || hs === "" || as === "") continue;
      const homeScore = Number(hs);
      const awayScore = Number(as);
      if (!Number.isFinite(homeScore) || !Number.isFinite(awayScore)) continue;
      const d = new Date(e.date || 0);
      if (!(d <= now)) continue;
      out.push({
        id: e.id,
        date: d.toISOString().slice(0, 10),
        homeName: (h.team && (h.team.displayName || h.team.shortDisplayName)) || "",
        awayName: (a.team && (a.team.displayName || a.team.shortDisplayName)) || "",
        homeScore,
        awayScore,
        homeWin: !!(h.score && h.score.winner),
        awayWin: !!(a.score && a.score.winner),
        tournament: (e.league && (e.league.shortName || e.league.name)) || (c.type && c.type.type) || "",
      });
    }
    return out;
  });
}

function perspectiveResult(ev, team) {
  if (ev.homeScore === ev.awayScore) return "平";
  const isHome = ev.homeName === team;
  if (isHome) return ev.homeWin ? "胜" : "负";
  return ev.awayWin ? "胜" : "负";
}
function toEspnRecentMatch(ev, teamName) {
  return {
    matchDate: ev.date,
    tournament: ev.tournament || "",
    homeName: ev.homeName,
    awayName: ev.awayName,
    score: `${ev.homeScore}:${ev.awayScore}`,
    result: perspectiveResult(ev, teamName),
    isSelfHome: ev.homeName === teamName,
    selfName: teamName,
  };
}
function toEspnH2HMatch(ev, primary) {
  return {
    matchDate: ev.date,
    tournament: ev.tournament || "",
    homeName: ev.homeName,
    awayName: ev.awayName,
    score: `${ev.homeScore}:${ev.awayScore}`,
    result: perspectiveResult(ev, primary),
    isSelfHome: ev.homeName === primary,
    selfName: primary,
  };
}
function computeStat(matches) {
  let win = 0,
    draw = 0,
    loss = 0;
  for (const m of matches) {
    if (m.result === "胜") win++;
    else if (m.result === "平") draw++;
    else if (m.result === "负") loss++;
  }
  const total = matches.length;
  const winPct = total ? Math.round((win / total) * 100) + "%" : "0%";
  return { win, draw, loss, winPct, total };
}

// Build REAL insight for an ESPN finished match from its team IDs.
async function espnInsight(homeId, awayId, lg, homeName, awayName) {
  const [homeSched, awaySched] = await Promise.all([
    fetchEspnTeamSchedule(homeId, lg),
    fetchEspnTeamSchedule(awayId, lg),
  ]);
  if (!homeSched.length && !awaySched.length) return null;

  const homeMatches = homeSched.slice(0, 8).map((ev) => toEspnRecentMatch(ev, homeName));
  const awayMatches = awaySched.slice(0, 8).map((ev) => toEspnRecentMatch(ev, awayName));
  // H2H: matches that appear in BOTH teams' schedules (same event id).
  const awayIds = new Set(awaySched.map((e) => e.id));
  const h2hEvents = homeSched.filter((e) => awayIds.has(e.id)).slice(0, 6);
  const h2hMatches = h2hEvents.map((ev) => toEspnH2HMatch(ev, homeName));

  const noFeature = { last: undefined, sameHomeAway: undefined, eachHomeAway: undefined, eachSameHomeAway: undefined, goalAvg: undefined };
  return {
    demo: false,
    source: "espn",
    head: { homeName: homeName || "", awayName: awayName || "" },
    feature: noFeature,
    h2h: { primary: homeName || "", stat: computeStat(h2hMatches), matches: h2hMatches },
    recent: {
      home: { teamName: homeName || "", stat: computeStat(homeMatches), matches: homeMatches },
      away: { teamName: awayName || "", stat: computeStat(awayMatches), matches: awayMatches },
    },
  };
}

// ---------------------------------------------------------------------------

export async function teamInsight(matchId, homeName, awayName, opts = {}) {
  // Third-party finished match (ESPN): real data from ESPN team APIs.
  // These have no 体彩 matchId, so we use the ESPN team IDs directly.
  if (opts && opts.homeId && opts.awayId && opts.league) {
    try {
      const r = await espnInsight(opts.homeId, opts.awayId, opts.league, homeName, awayName);
      if (r) return r;
    } catch {
      // fall through
    }
  }
  if (matchId) {
    try {
      const [head, feature, h2h, recent] = await Promise.all([
        fetchHead(matchId),
        fetchFeature(matchId),
        fetchH2H(matchId),
        fetchRecent(matchId),
      ]);
      if (head && (head.homeTeamShortName || head.awayTeamShortName)) {
        return buildReal(matchId, head, feature, h2h, recent);
      }
    } catch {
      // fall through to synthetic
    }
  }
  return synthetic(homeName || '', awayName || '');
}
