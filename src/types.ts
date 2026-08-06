export type PoolCode = 'had' | 'hhad' | 'crs' | 'ttg' | 'hafu'
export type Trend = 'up' | 'flat' | 'down' | 'unknown'

export interface Outcome {
  code: string
  key: string
  labelZh: string
  odds: number
  trend: Trend
  impliedProb?: number
  noVigProb?: number
  fairOdds?: number
}

export interface Market {
  pool: PoolCode
  poolNameZh: string
  goalLine?: number
  updateTime?: string
  outcomes: Outcome[]
  overround?: number
  returnRate?: number
  margin?: number
}

export interface TeamRef {
  code: string
  abbName: string
  allName: string
  rank?: string
}

export interface LeagueRef {
  id: number
  code: string
  abbName: string
  allName: string
}

export interface Match {
  matchId: number
  matchNum: number
  matchNumStr: string
  matchNumDate: string
  businessDate: string
  matchDate: string
  matchTime: string
  weekday: string
  league: LeagueRef
  home: TeamRef
  away: TeamRef
  status: string
  statusLabel?: string
  sellStatus?: string
  finished?: boolean
  finalScore?: string
  resultSource?: string
  bettingSingle: boolean
  bettingAllUp: boolean
  markets: Partial<Record<PoolCode, Market>>
}

export interface LeagueOption {
  code: string
  abbName: string
  allName: string
}

export interface MatchListResult {
  updatedAt: string
  matchCount: number
  total: number
  page: number
  pageSize: number
  leagues: LeagueOption[]
  pools: PoolCode[]
  source?: string
  upstreamError?: string | null
  finishedSource?: string | null
  finishedAvailable?: boolean
  finishedError?: string | null
  matches: Match[]
}

export type MatchResult = '胜' | '平' | '负'

export interface RecentMatch {
  date: string
  opponent: string
  home: boolean
  result: MatchResult
  score: string
}

export interface H2HMatch {
  date: string
  home: string
  away: string
  result: MatchResult
  score: string
}

export interface FeatureStat {
  homeWin: number
  homeDraw: number
  homeLoss: number
  homeWinRate: number
  awayWin: number
  awayDraw: number
  awayLoss: number
  awayWinRate: number
  total: number
}

export interface StandingsSide {
  ranking?: string
  win: number
  draw: number
  loss: number
  groupName?: string
  phaseName?: string
  seasonName?: string
}

export interface StandingsStat {
  home: StandingsSide
  away: StandingsSide
}

// A single real historical/recent match, normalized for display.
// `score` is always shown from the CURRENT team's perspective (current:opponent).
export interface InsightMatch {
  matchDate: string
  tournament: string
  opponent: string
  score: string
  result: MatchResult
  isHome: boolean
}

// Win/draw/loss summary for one team over a slice of matches.
export interface InsightStat {
  win: number
  draw: number
  loss: number
  winPct: string
  total: number
  goalFor?: number
  goalAgainst?: number
  netGoal?: number
}

export interface RealInsight {
  demo: false
  source: 'sporttery'
  head: {
    homeName: string
    awayName: string
    homeLogo?: string
    awayLogo?: string
    tournament?: string
    matchDateTime?: string
    standings?: StandingsStat
  }
  feature: {
    last?: FeatureStat
    sameHomeAway?: FeatureStat
    eachHomeAway?: FeatureStat
    eachSameHomeAway?: FeatureStat
    goalAvg?: { home: number; away: number }
  }
  // 历史交锋（真实逐场比分），结果按主队（当前主队）视角
  h2h: {
    primary: string
    stat: InsightStat
    matches: InsightMatch[]
  }
  // 近期战绩（真实逐场比分）
  recent: {
    home: { teamName: string; stat: InsightStat; matches: InsightMatch[] }
    away: { teamName: string; stat: InsightStat; matches: InsightMatch[] }
  }
}

export interface DemoInsight {
  demo: true
  home: { team: string; recent: RecentMatch[] }
  away: { team: string; recent: RecentMatch[] }
  h2h: H2HMatch[]
}

export type TeamInsight = RealInsight | DemoInsight

export const POOL_ORDER: PoolCode[] = ['had', 'hhad', 'crs', 'ttg', 'hafu']
export const POOL_LABEL: Record<PoolCode, string> = {
  had: '胜平负',
  hhad: '让球胜平负',
  crs: '比分',
  ttg: '总进球',
  hafu: '半全场',
}
