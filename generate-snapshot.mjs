// 抓取本地后端真实数据，生成静态部署用的真实快照（只保留真实场次，剔除合成兜底）。
import { writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT = join(__dirname, 'public', 'data', 'matches.json')

const BASE = 'http://localhost:8787'

async function main() {
  const r = await fetch(`${BASE}/api/matches?sort=results&pageSize=500&pools=had,hhad`)
  const j = await r.json()
  const data = j.data
  // 只保留真实场次：已结束（ESPN 真实赛果）或实时体彩在售比赛。
  const real = (data.matches || []).filter((m) => m.finished === true || data.source === 'live-sporttery')
  const leagues = []
  const seen = new Set()
  for (const m of real) {
    const lg = m.league
    if (lg && lg.code && !seen.has(lg.code)) {
      seen.add(lg.code)
      leagues.push(lg)
    }
  }
  const snap = {
    updatedAt: new Date().toISOString(),
    matchCount: real.length,
    total: real.length,
    page: 1,
    pageSize: real.length,
    leagues,
    pools: ['had', 'hhad'],
    source: 'snapshot-real',
    finishedSource: data.finishedSource,
    finishedAvailable: data.finishedAvailable,
    _snapshot: true,
    snapshotAt: new Date().toLocaleString('zh-CN', { hour12: false }),
    matches: real,
  }
  mkdirSync(dirname(OUT), { recursive: true })
  writeFileSync(OUT, JSON.stringify(snap, null, 2), 'utf-8')
  console.log(`snapshot written: ${real.length} real matches -> ${OUT}`)
  console.log('source=', data.source, 'finishedSource=', data.finishedSource)
}
main().catch((e) => {
  console.error('snapshot failed:', e.message)
  process.exit(1)
})
