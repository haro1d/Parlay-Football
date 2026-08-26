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

// 体彩官方 5 玩法开奖结果条目（来自 getFixedBonusV1 的 matchResultList）
export interface MatchResultItem {
  code: string // 'HAD' | 'HHAD' | 'CRS' | 'TTG' | 'HAFU'
  combination: string
  combinationDesc: string // '负' | '(-1)负' | '1:2' | '3' | '负负'
  goalLine?: string
  odds: string
  oddsType?: string
  refundStatus?: string
}

// 单条历史赔率快照（来自 getFixedBonusV1 的 oddsHistory.*List）
export interface OddsHistoryEntry {
  h: string
  d: string
  a: string
  hf?: string | number
  df?: string | number
  af?: string | number
  goalLine?: string
  updateDate: string
  updateTime: string
}

export type OddsHistory = Partial<Record<PoolCode, OddsHistoryEntry[]>>

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
  homeId?: number
  awayId?: number
  bettingSingle: boolean
  bettingAllUp: boolean
  markets: Partial<Record<PoolCode, Market>>
  // 体彩官方已结束比赛：5 玩法开奖结果 + 历史赔率走势
  matchResultList?: MatchResultItem[]
  oddsHistory?: OddsHistory
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
  // 静态部署回退：标记当前数据来自部署时抓取的真实快照
  _snapshot?: boolean
  snapshotAt?: string
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
// `homeName`/`awayName` are the REAL team names; `score` is the OFFICIAL
// home-away score (fullCourtGoal). `selfName` is the current team, and
// `isSelfHome` flags whether it was the home side, so the UI can render the
// matchup in official home-vs-away order and highlight the current team.
export interface InsightMatch {
  matchDate: string
  tournament: string
  homeName: string
  awayName: string
  score: string
  result: MatchResult
  isSelfHome: boolean
  selfName: string
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
  source: 'sporttery' | 'espn'
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
  source?: string
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
