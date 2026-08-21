// Transform the raw Sporttery upstream payload into normalized, derived matches.

import { deriveMarket, round, toOdds } from "./derive.js";
import { POOL_NAME_ZH, decodeOutcome, orderedOutcomeCodes, toTrend } from "./labels.js";
import { cleanName } from "./clean.js";

export const ALL_POOLS = ["had", "hhad", "crs", "ttg", "hafu"];

function str(v) {
  return v === null || v === undefined ? "" : String(v);
}

export function buildMarket(pool, raw) {
  const codes = orderedOutcomeCodes(pool, raw);
  const outcomes = [];
  for (const code of codes) {
    const odds = toOdds(raw[code]);
    if (odds === null) continue;
    const { key, labelZh } = decodeOutcome(pool, code);
    outcomes.push({
      code,
      key,
      labelZh,
      odds,
      trend: toTrend(raw[`${code}f`]),
    });
  }
  if (outcomes.length === 0) return null;

  const market = {
    pool,
    poolNameZh: POOL_NAME_ZH[pool],
    updateTime: typeof raw.updateTime === "string" ? raw.updateTime : undefined,
    outcomes,
  };

  const goalLineValue = raw.goalLineValue;
  if (goalLineValue !== undefined && goalLineValue !== "" && goalLineValue !== null) {
    const n = Number(goalLineValue);
    if (Number.isFinite(n)) market.goalLine = n;
  }

  deriveMarketMetrics(market);
  return market;
}

export function deriveMarketMetrics(market) {
  const d = deriveMarket(market.outcomes.map((o) => o.odds));
  market.overround = round(d.overround, 6);
  market.returnRate = round(d.returnRate, 6);
  market.margin = round(d.margin, 6);
  market.outcomes.forEach((o, i) => {
    const po = d.perOutcome[i];
    o.impliedProb = round(po.impliedProb, 6);
    o.noVigProb = round(po.noVigProb, 6);
    o.fairOdds = round(po.fairOdds, 4);
  });
}

export function parseUpstream(payload, opts = {}) {
  const wantedPools = (opts.pools && opts.pools.length ? opts.pools : ALL_POOLS).filter((p) =>
    ALL_POOLS.includes(p),
  );
  const groups = payload?.value?.matchInfoList ?? [];
  const leagueQuery = opts.league?.toLowerCase();
  const kw = opts.keyword?.trim().toLowerCase();
  let matches = [];

  for (const group of groups) {
    if (opts.date && str(group.matchNumDate) !== opts.date) continue;
    for (const sm of group.subMatchList ?? []) {
      if (opts.matchId !== undefined && Number(sm.matchId) !== opts.matchId) continue;
      if (leagueQuery) {
        const hay = `${str(sm.leagueCode)} ${str(sm.leagueAbbName)} ${str(sm.leagueAllName)}`.toLowerCase();
        if (!hay.includes(leagueQuery)) continue;
      }
      if (kw) {
        const hay = `${str(sm.homeTeamAbbName)} ${str(sm.homeTeamAllName)} ${str(sm.awayTeamAbbName)} ${str(sm.awayTeamAllName)}`.toLowerCase();
        if (!hay.includes(kw)) continue;
      }

      const markets = {};
      for (const pool of wantedPools) {
        const raw = sm[pool];
        if (raw && typeof raw === "object") {
          const m = buildMarket(pool, raw);
          if (m) markets[pool] = m;
        }
      }
      if (Object.keys(markets).length === 0) continue;

      matches.push({
        matchId: Number(sm.matchId),
        matchNum: Number(sm.matchNum),
        matchNumStr: str(sm.matchNumStr),
        matchNumDate: str(sm.matchNumDate || group.matchNumDate),
        businessDate: str(sm.businessDate || group.businessDate),
        matchDate: str(sm.matchDate),
        matchTime: str(sm.matchTime),
        weekday: str(group.weekday),
        league: {
          id: Number(sm.leagueId) || 0,
          code: str(sm.leagueCode),
          abbName: cleanName(sm.leagueAbbName),
          allName: cleanName(sm.leagueAllName),
        },
        home: {
          code: str(sm.homeTeamCode),
          abbName: cleanName(sm.homeTeamAbbName),
          allName: cleanName(sm.homeTeamAllName),
          rank: cleanName(sm.homeRank) || undefined,
        },
        away: {
          code: str(sm.awayTeamCode),
          abbName: cleanName(sm.awayTeamAbbName),
          allName: cleanName(sm.awayTeamAllName),
          rank: cleanName(sm.awayRank) || undefined,
        },
        status: str(sm.matchStatus),
        statusLabel: str(sm.matchStatus) === "Selling" ? "已开售" : "已完成",
        sellStatus: str(sm.sellStatus),
        bettingSingle: str(sm.bettingSingle) === "1" || sm.bettingSingle === 1,
        bettingAllUp: str(sm.bettingAllUp) === "1" || sm.bettingAllUp === 1,
        markets,
      });
    }
  }

  // Merge real finished matches (third-party results API) with the same
  // league / keyword filters applied.
  if (opts.extraMatches?.length) {
    for (const em of opts.extraMatches) {
      if (leagueQuery) {
        const hay = `${str(em.league?.code)} ${str(em.league?.abbName)} ${str(em.league?.allName)}`.toLowerCase();
        if (!hay.includes(leagueQuery)) continue;
      }
      if (kw) {
        const hay = `${str(em.home?.abbName)} ${str(em.home?.allName)} ${str(em.away?.abbName)} ${str(em.away?.allName)}`.toLowerCase();
        if (!hay.includes(kw)) continue;
      }
      matches.push(em);
    }
  }

  // Distinct league list (for the filter dropdown).
  const leagueMap = new Map();
  for (const m of matches) {
    const key = m.league.code || m.league.abbName;
    if (!leagueMap.has(key)) {
      leagueMap.set(key, { code: m.league.code, abbName: m.league.abbName, allName: m.league.allName });
    }
  }
  const leagues = Array.from(leagueMap.values()).sort((a, b) => a.abbName.localeCompare(b.abbName, "zh"));

  // 体彩官方排序：同一天内按 matchId 升序(=体彩序号顺序，已验证在售比赛 matchId 升序==matchNumStr 序号升序)，
  // 与体彩 app 一致；体彩 getFixedBonusV1 不返回 matchNumStr，故用 matchId 统一处理在售与已完赛。跨日按日期方向。
  const tOf = (m) => m.matchTime || '00:00'
  // dateDir: 1=日期升序, -1=日期降序；同日内一律按 matchId 升序(体彩序号)
  const byDateSeq = (dateDir) => (a, b) => {
    if (a.matchDate !== b.matchDate) return (a.matchDate < b.matchDate ? -1 : 1) * dateDir
    if (a.matchId !== b.matchId) return a.matchId - b.matchId
    return tOf(a) < tOf(b) ? -1 : tOf(a) > tOf(b) ? 1 : 0
  }
  if (opts.sort === "results") {
    // 赛果优先：已结束(日期降序，同日体彩序号升序) → 未开始(日期升序，同日体彩序号升序)
    const nowTs = Date.now()
    const tsOf = (m) => new Date(`${m.matchDate}T${tOf(m)}`).getTime()
    const isFinished = (m) => m.statusLabel === "已完成" || tsOf(m) < nowTs
    const finished = matches.filter(isFinished).sort(byDateSeq(-1))
    const upcoming = matches.filter((m) => !isFinished(m)).sort(byDateSeq(1))
    matches = [...finished, ...upcoming]
  } else if (opts.sort === "near") {
    // 临近优先：未来(日期升序，同日序号升序) → 已结束(日期降序，同日序号升序)
    const nowTs = Date.now()
    const tsOf = (m) => new Date(`${m.matchDate}T${tOf(m)}`).getTime()
    const future = matches.filter((m) => tsOf(m) >= nowTs).sort(byDateSeq(1))
    const past = matches.filter((m) => tsOf(m) < nowTs).sort(byDateSeq(-1))
    matches = [...future, ...past]
  } else {
    const dir = opts.sort === "asc" ? 1 : -1
    matches.sort(byDateSeq(dir))
  }

  // Pagination.
  const total = matches.length;
  const page = Math.max(1, Number(opts.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(opts.pageSize) || 12));
  const start = (page - 1) * pageSize;
  const pageMatches = matches.slice(start, start + pageSize);

  return {
    updatedAt: str(payload?.value?.lastUpdateTime) || new Date().toISOString(),
    matchCount: total,
    total,
    page,
    pageSize,
    leagues,
    pools: wantedPools,
    matches: pageMatches,
  };
}
