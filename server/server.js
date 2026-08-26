// Local 竞彩足球 odds API server.
// Serves data + calculation endpoints. Tries the official upstream, falls back
// to a bundled sample snapshot when the upstream is unreachable (geo-blocked).

import http from 'node:http'
import { readFile, readFileSync, existsSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, extname, normalize, sep } from 'node:path'

import { parseUpstream, ALL_POOLS } from './lib/parse.js'
import { deriveMarket, compareOdds, valueOf, round } from './lib/derive.js'
import { calcParlay, listParlayTypes, PARLAY_TABLE } from './lib/parlay.js'
import { POOL_NAME_ZH, POOL_MAX_ALLUP } from './lib/labels.js'
import { buildSampleMatches } from './lib/sampleData.js'
import { teamInsight } from './lib/insight.js'
import { aiAnalyze } from './lib/aiAnalyze.js'
import { getFinishedMatches } from './lib/results.js'
import { getSportteryFinished } from './lib/sportteryResults.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PORT = process.env.PORT || 8787
const UPSTREAM = 'https://webapi.sporttery.cn/gateway/jc/football/getMatchCalculatorV1.qry'

// Offline fallback: multi-league synthesized snapshot.
const SAMPLE = buildSampleMatches()
// 空 payload：官方在售接口停售/不可达时使用，仅展示已结束赛果，不混入合成示例赛事。
const EMPTY = { value: { matchInfoList: [] } }
void readFileSync // keep import for potential future sample.json use

function send(res, status, body) {
  const data = JSON.stringify(body)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key',
  })
  res.end(data)
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let buf = ''
    req.on('data', (c) => (buf += c))
    req.on('end', () => {
      if (!buf) return resolve({})
      try {
        resolve(JSON.parse(buf))
      } catch (e) {
        reject(e)
      }
    })
    req.on('error', reject)
  })
}

// 竞彩官方接口需要带浏览器请求头才能绕过 WAF（否则返回 403/567）。
const UPSTREAM_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 ' +
    '(KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
  Referer: 'https://m.sporttery.cn/',
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'zh-CN,zh;q=0.9',
}

// 内存缓存：分页/排序/筛选时不必每次都打官方接口（官方赔率变化不频繁）。
let upstreamCache = { at: 0, payload: null }
const UPSTREAM_TTL = 30_000

async function fetchUpstream() {
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), 9000)
  try {
    const r = await fetch(`${UPSTREAM}?poolCode=hhad,had,crs,ttg,hafu&channel=c`, {
      signal: ac.signal,
      headers: UPSTREAM_HEADERS,
    })
    if (!r.ok) throw new Error(`upstream HTTP ${r.status}`)
    const j = await r.json()
    // 关键：竞彩在「有在售/即将开赛赛事」时，响应里也会常驻携带 vtoolsConfig 的停售提示文案，
    // 因此必须以 matchInfoList 是否真的有数据为准，不能一见停售文案就判定停售。
    const list = j?.value?.matchInfoList || []
    if (list.length) return j // 有真实赛事 → 视为实时数据
    // 仅当 matchInfoList 为空时，才按停售文案降级（每日 11 点前的真正停售期）。
    const stop =
      j?.value?.vtoolsConfig?.onLineStopMessage ||
      j?.value?.vtoolsConfig?.offLineStopMessage
    if (stop) throw new Error(stop)
    throw new Error('空数据')
  } finally {
    clearTimeout(timer)
  }
}

async function getLivePayload() {
  const now = Date.now()
  if (upstreamCache.payload && now - upstreamCache.at < UPSTREAM_TTL) {
    return upstreamCache.payload
  }
  const p = await fetchUpstream()
  upstreamCache = { at: now, payload: p }
  return p
}

async function getMatches(opts) {
  let payload = SAMPLE
  let source = 'sample-snapshot'
  let upstreamError = null
  let liveOdds = false
  // force=sample 可强制使用离线示例（用于排查 / 离线场景）
  if (opts.force !== 'sample') {
    try {
      payload = await getLivePayload()
      source = 'live-sporttery'
      liveOdds = true
    } catch (e) {
      upstreamError = e.message
      // 竞彩处于「停止销售」或官方接口不可达时，当前没有可投注的新赛事，
      // 但已结束比赛的赛果（getFixedBonusV1）仍可正常查询，不应回退到合成示例。
      payload = EMPTY
    }
  }

  // 已结束比赛（赛果）数据源 —— 始终尝试体彩官方，独立于在售接口：
  //  - 锚点 maxId：在售接口成功时取其最大 matchId；停售时取持久化 store 的
  //    lastScannedMaxId 并前向扫描新完赛场次（getSportteryFinished 内部处理）。
  //  - 体彩扫描完成前（首次约 15-20s）临时用 ESPN 第三方赛果兜底，保证不空白。
  let finished = { matches: [], available: true, source: null, error: null }
  let sportteryScanning = false
  const anchorMaxId = liveOdds ? extractMaxMatchId(payload) : 0
  const sportteryFinished = await getSportteryFinished(anchorMaxId)
  if (sportteryFinished && sportteryFinished.length) {
    finished = {
      matches: sportteryFinished,
      available: true,
      source: 'sporttery:fixedBonus',
      error: null,
    }
  } else if (sportteryFinished === null) {
    // 后台首次扫描进行中，临时用 ESPN 兜底
    sportteryScanning = true
    try {
      finished = await getFinishedMatches(3)
    } catch {
      /* ignore */
    }
  } else {
    // sportteryFinished === [] （扫描完成但无数据）→ ESPN 兜底
    try {
      finished = await getFinishedMatches(3)
    } catch {
      /* ignore */
    }
  }

  const result = parseUpstream(payload, { ...opts, extraMatches: finished.matches })
  result.source = liveOdds
    ? 'live-sporttery'
    : finished.source === 'sporttery:fixedBonus'
      ? 'sporttery-finished'
      : 'sample-snapshot'
  result.upstreamError = upstreamError
  result.finishedSource = finished.source
  result.finishedAvailable = finished.available
  if (finished.error) result.finishedError = finished.error
  if (sportteryScanning) result.finishedScanning = true
  if (liveOdds) result.updatedAt = new Date().toISOString()
  return result
}

// 从 getMatchCalculatorV1 的 payload 中提取最大 matchId，作为 getFixedBonusV1 扫描的上界。
function extractMaxMatchId(payload) {
  let max = 0
  for (const g of payload?.value?.matchInfoList || []) {
    for (const sm of g.subMatchList || []) {
      const id = Number(sm.matchId)
      if (id > max) max = id
    }
  }
  return max
}

const META = {
  pools: POOL_NAME_ZH,
  poolMaxAllUp: POOL_MAX_ALLUP,
  formulas: {
    impliedProb: '1 / odds',
    overround: 'Σ(1/odds)',
    returnRate: '1 / overround',
    margin: '1 - returnRate',
    noVigProb: 'impliedProb / overround',
    fairOdds: '1 / noVigProb',
    kelly: 'offeredOdds × refProb',
    kellyFraction: '(b·p - q) / b  其中 b=odds-1, p=refProb, q=1-p',
  },
  parlayTable: PARLAY_TABLE,
  unitPrice: 2,
  ticketCap: 5_000_000,
  dataSource: '中国体育彩票竞彩网 webapi.sporttery.cn（非官方读取）',
  disclaimer: '数据仅供分析参考，请理性购彩。',
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`)
  const p = url.pathname

  if (req.method === 'OPTIONS') return send(res, 204, {})

  try {
    // GET /api/health
    if (p === '/api/health') return send(res, 200, { ok: true })

    // GET /api/meta
    if (p === '/api/meta') return send(res, 200, { success: true, data: META })

    // GET /api/matches
    if (p === '/api/matches' && req.method === 'GET') {
      const pools = url.searchParams.get('pools')?.split(',').filter(Boolean)
      const date = url.searchParams.get('date')
      const league = url.searchParams.get('league')
      const keyword = url.searchParams.get('keyword')
      const sort = url.searchParams.get('sort') || 'near'
      const page = url.searchParams.get('page')
      const pageSize = url.searchParams.get('pageSize')
      const matchId = url.searchParams.get('matchId')
      const force = url.searchParams.get('force')
      const data = await getMatches({
        pools: pools?.length ? pools : ALL_POOLS,
        date: date || undefined,
        league: league || undefined,
        keyword: keyword || undefined,
        sort,
        force: force || undefined,
        page: page ? Number(page) : undefined,
        pageSize: pageSize ? Number(pageSize) : undefined,
        matchId: matchId ? Number(matchId) : undefined,
      })
      return send(res, 200, { success: true, data })
    }

    // GET /api/team-insight?matchId=<id>&home=<name>&away=<name>
    //   &source=third-party:espn&homeId=<id>&awayId=<id>&league=<espn-code>
    // matchId → real 体彩 feature data; ESPN params → real ESPN team data.
    if (p === '/api/team-insight' && req.method === 'GET') {
      const matchId = url.searchParams.get('matchId')
      const home = url.searchParams.get('home')
      const away = url.searchParams.get('away')
      const data = await teamInsight(matchId ? Number(matchId) : null, home, away, {
        source: url.searchParams.get('source') || undefined,
        homeId: url.searchParams.get('homeId') ? Number(url.searchParams.get('homeId')) : undefined,
        awayId: url.searchParams.get('awayId') ? Number(url.searchParams.get('awayId')) : undefined,
        league: url.searchParams.get('league') || undefined,
      })
      return send(res, 200, { success: true, data })
    }

    // GET /api/match/:id
    const m = /^\/api\/match\/(\d+)$/.exec(p)
    if (m && req.method === 'GET') {
      const data = await getMatches({ matchId: Number(m[1]) })
      if (!data.matches.length) return send(res, 404, { success: false, error: 'match not found' })
      return send(res, 200, { success: true, data: data.matches[0] })
    }

    // POST /api/ai-analysis  —— 赛前 AI 分析（免费大模型，用户自带 Key）
    if (p === '/api/ai-analysis' && req.method === 'POST') {
      const body = await readBody(req)
      // 取该场 HAD 赔率隐含概率作为分析主信号（赔率是最强预测器）
      if (body.matchId && !body.hadProbs) {
        try {
          const dm = await getMatches({ matchId: Number(body.matchId) })
          const m = dm.matches && dm.matches[0]
          const had = m && m.markets && m.markets.had
          if (had && had.outcomes) {
            const hp = {}
            for (const o of had.outcomes) {
              const prob = o.noVigProb != null ? o.noVigProb : o.impliedProb
              if (o.code === 'h') hp.home = prob
              else if (o.code === 'd') hp.draw = prob
              else if (o.code === 'a') hp.away = prob
            }
            if (hp.home != null && hp.draw != null && hp.away != null) body.hadProbs = hp
          }
        } catch {}
      }
      const result = await aiAnalyze(body)
      // 错误也返回 200 + success:false，让前端拿到真实错误原因（不要返回 HTTP 502）
      return send(
        res,
        200,
        result.success
          ? { success: true, data: { analysis: result.analysis, model: result.model, source: result.source, dataBacked: result.dataBacked, _debugPrompt: result._debugPrompt, _debugPayload: result._debugPayload } }
          : { success: false, error: result.error, _debugPrompt: result._debugPrompt, _debugPayload: result._debugPayload },
      )
    }

    // POST /api/derive
    if (p === '/api/derive' && req.method === 'POST') {
      const body = await readBody(req)
      let oddsList = body.odds
      if (!oddsList && (body.h || body.d || body.a)) {
        oddsList = [body.h, body.d, body.a].map(Number)
      } else {
        oddsList = (oddsList || []).map(Number)
      }
      const labels = body.labels || oddsList.map((_, i) => `选项${i + 1}`)
      const d = deriveMarket(oddsList)
      const out = {
        overround: round(d.overround, 6),
        returnRate: round(d.returnRate, 6),
        margin: round(d.margin, 6),
        outcomes: d.perOutcome.map((o, i) => ({
          label: labels[i],
          odds: o.odds,
          impliedProb: round(o.impliedProb, 6),
          noVigProb: round(o.noVigProb, 6),
          fairOdds: round(o.fairOdds, 4),
        })),
      }
      return send(res, 200, { success: true, data: out })
    }

    // POST /api/value
    if (p === '/api/value' && req.method === 'POST') {
      const body = await readBody(req)
      const offered = (body.offered || []).map(Number)
      const reference = (body.reference || []).map(Number)
      const labels = body.labels || offered.map((_, i) => `选项${i + 1}`)
      const analyses = compareOdds(offered, reference)
      return send(res, 200, {
        success: true,
        data: {
          outcomes: analyses.map((a, i) => ({
            label: labels[i],
            odds: a.odds,
            refProb: round(a.refProb, 6),
            kelly: round(a.kelly, 4),
            ev: round(a.ev, 4),
            kellyFraction: round(a.kellyFraction, 4),
            isValue: a.isValue,
          })),
        },
      })
    }

    // POST /api/parlay
    if (p === '/api/parlay' && req.method === 'POST') {
      const body = await readBody(req)
      const result = calcParlay(body)
      return send(res, 200, { success: true, data: result })
    }

    // GET /api/parlay/types
    if (p === '/api/parlay/types' && req.method === 'GET') {
      const matches = url.searchParams.get('matches')
      const data = listParlayTypes(matches ? Number(matches) : undefined)
      return send(res, 200, { success: true, data })
    }

    // Serve built frontend (dist/) so this single Node process can host the
    // whole app (same-origin /api + static). Used for PaaS deploys.
    if (req.method === 'GET') {
      if (serveStatic(p, res)) return
    }

    return send(res, 404, { success: false, error: 'not found' })
  } catch (e) {
    return send(res, 400, { success: false, error: e.message })
  }
})

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json',
}
const DIST = join(__dirname, '..', 'dist')

function serveStatic(pathname, res) {
  let rel = decodeURIComponent(pathname.split('?')[0])
  if (rel === '/') rel = '/index.html'
  const target = normalize(join(DIST, rel))
  // block path traversal outside dist/
  if (target !== DIST && !target.startsWith(DIST + sep)) return false
  try {
    const st = statSync(target)
    if (st.isDirectory()) {
      const idx = join(target, 'index.html')
      if (existsSync(idx)) return streamFile(idx, res)
      return false
    }
    if (st.isFile()) return streamFile(target, res)
  } catch {
    // fall through to SPA fallback
  }
  // SPA fallback: unknown route without a file extension → index.html
  if (!extname(rel)) {
    const idx = join(DIST, 'index.html')
    if (existsSync(idx)) return streamFile(idx, res)
  }
  return false
}

function streamFile(filePath, res) {
  const ext = extname(filePath).toLowerCase()
  res.writeHead(200, {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=86400',
  })
  res.end(readFileSync(filePath))
  return true
}

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[竞彩API] listening on http://localhost:${PORT}`)
  console.log(`[竞彩API] sample fallback ${SAMPLE ? 'loaded' : 'MISSING'}`)
  console.log(
    `[竞彩API] static dist ${existsSync(DIST) ? 'enabled' : 'not built (run npm run build)'}`,
  )
})
