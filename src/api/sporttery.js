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
  const res = await http.get('/matches', { params })
  return unwrap(res)
}

// 球队近期战绩 + 历史交锋（体彩官方 getMatchFeatureV1，失败回退演示数据）
// matchId 优先用于拉取真实数据；home/away 仅用于离线回退。
export async function fetchTeamInsight(matchId, home, away) {
  const res = await http.get('/team-insight', { params: { matchId, home, away } })
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
