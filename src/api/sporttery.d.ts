// 模块声明：sporttery.js 为运行时 JS，缺少类型声明，这里给出最小声明以满足 vue-tsc。
declare module '@/api/sporttery' {
  import type { MatchListResult, TeamInsight, Match } from '@/types'

  export function fetchMatches(params?: Record<string, unknown>): Promise<MatchListResult>
  export function fetchTeamInsight(matchId: number | string | null, home?: string, away?: string): Promise<TeamInsight>
  export function fetchMatch(id: number | string): Promise<Match>
  export function deriveOdds(payload: unknown): Promise<unknown>
  export function compareValue(payload: unknown): Promise<unknown>
  export function calcParlay(payload: unknown): Promise<unknown>
  export function fetchParlayTypes(matches?: unknown): Promise<Record<string, unknown>>
  export function fetchMeta(): Promise<unknown>
}
