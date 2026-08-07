import axios from 'axios'

const http = axios.create({
  baseURL: '/api',
  timeout: 15000,
})

function unwrap(res) {
  if (res.data && res.data.success) return res.data.data
  throw new Error(res.data?.error || '请求失败')
}

// 比赛列表（最新赔率 + 派生指标，支持分页/排序/联赛/关键词筛选）
export async function fetchMatches(params = {}) {
  try {
    const res = await http.get('/matches', { params })
    return unwrap(res)
  } catch (e) {
    // 静态托管（如 CloudStudio）无后端时，回退到部署时抓取的真实快照
    if (typeof window !== 'undefined') {
      try {
        const r = await fetch('/data/matches.json', { cache: 'no-store' })
        if (r.ok) return await r.json()
      } catch {}
    }
    throw e
  }
}

// 球队近期战绩 + 历史交锋
// - 体彩在售比赛：传 matchId 拉取体彩官方真实数据
// - 第三方已结束比赛（ESPN）：传 source + homeId/awayId/league 拉取 ESPN 真实战绩与交锋
export async function fetchTeamInsight(matchId, home, away, opts = {}) {
  const params = { matchId, home, away }
  if (opts.source) params.source = opts.source
  if (opts.homeId) params.homeId = opts.homeId
  if (opts.awayId) params.awayId = opts.awayId
  if (opts.league) params.league = opts.league
  const res = await http.get('/team-insight', { params })
  return unwrap(res)
}

export async function fetchMatch(id) {
  const res = await http.get(`/match/${id}`)
  return unwrap(res)
}

export async function deriveOdds(payload) {
  const res = await http.post('/derive', payload)
  return unwrap(res)
}

export async function compareValue(payload) {
  const res = await http.post('/value', payload)
  return unwrap(res)
}

export async function calcParlay(payload) {
  const res = await http.post('/parlay', payload)
  return unwrap(res)
}

export async function fetchParlayTypes(matches) {
  const res = await http.get('/parlay/types', { params: matches ? { matches } : {} })
  return unwrap(res)
}

export async function fetchMeta() {
  const res = await http.get('/meta')
  return unwrap(res)
}
