// 体彩官方已结束比赛数据源 —— 通过 getFixedBonusV1（单场详情接口，无需签名）扫描
// matchId 范围，获取所有体彩开售联赛的已结束比赛（含沙特联/日乙/韩K2 等 ESPN 不收录的联赛）。
//
// 原理：体彩 matchId 连续递增（按"期/批次"分配，同一期比赛 ID 聚集但高低无序，
// 例如 8-17 这期的 6 场里，拉科=2040922 最高、其余 5 场却在 2040914~2040918）。
// getMatchCalculatorV1 只返回在售（Selling）比赛，比赛结束后即从该接口消失，但
// getFixedBonusV1?clientCode=3001&matchId=<id> 仍可查到该比赛的完整数据
// （比分 sectionsNo999 + 5 玩法开奖 matchResultList + 历史赔率 oddsHistory）。
// 因此需「双向」扫描锚点附近的 matchId 区间（向后补低 ID、向前探新 ID），才能完整还原
// 体彩 app 上"最近已完赛"的全部比赛——只向前扫会漏掉同一期里 ID 偏低的那几场。
//
// 比赛日取 oddsHistory 各玩法 hadList/hhadList 等「最后一条」updateDate（即开赛/出票日），
// 而非首条（首条是赔率初上架日，会早 1~2 天）。
//
// 赛果列表接口 getMatchResultV1（jc 路径）被 WAF 403，getMatchResultNewV1（uniform 路径）
// 需签名，均不可用；故采用 matchId 双向扫描方案。

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const STORE_FILE = join(__dirname, '..', '.sporttery-store.json')

// PC 浏览器请求头（与 getFixedBonusV1 验证通过的配置一致）。
const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) ' +
    'Chrome/136.0.0.0 Safari/537.36',
  Referer: 'https://www.sporttery.cn/',
  Origin: 'https://www.sporttery.cn',
  Accept: 'application/json, text/plain, */*',
}

const MEM_TTL = 5 * 60 * 1000 // 内存缓存 5 分钟
const LIVE_SCAN_SPAN = 2500 // 在售期首次回扫的 matchId 跨度（覆盖近几期）
const BACKWARD_SPAN = 1200 // 停售期：从锚点向前（低 ID）扫描的跨度，补全同一期里 ID 偏低的场次
const FORWARD_SPAN = 800 // 停售期：从锚点向后（高 ID）扫描的跨度，探未来新完赛场次
const PRUNE_DAYS = 7 // 持久化保留天数
const RECENT_DAYS = 7 // 返回近几日的已结束比赛
const CONCURRENCY = 30 // 并发请求数
const GAP_STOP = CONCURRENCY // 连续 N 个空 ID 即判定越过真实 frontier，提前结束该方向扫描

let memCache = { at: 0, data: null }
let bgScan = null // 后台扫描 promise（防止并发重复扫描）

function str(v) {
  return v === null || v === undefined ? '' : String(v)
}

async function fetchFixedBonus(matchId) {
  const ac = new AbortController()
  const t = setTimeout(() => ac.abort(), 6000)
  try {
    const r = await fetch(
      `https://webapi.sporttery.cn/gateway/uniform/football/getFixedBonusV1.qry?clientCode=3001&matchId=${matchId}`,
      { signal: ac.signal, headers: HEADERS },
    )
    if (!r.ok) return null
    const j = await r.json()
    if (!j?.success || !j?.value) return null
    return j.value
  } catch {
    return null
  } finally {
    clearTimeout(t)
  }
}

// 从赔率历史列表中取「最新一条」updateDate/updateTime 作为比赛日（即开赛/出票日）。
// 体彩各玩法 hadList 的首条是赔率初上架日（常早于比赛日 1~2 天），末条才是最接近开赛的更新，
// 因此遍历所有玩法的全部条目，取 updateDate（同日期再比 updateTime）最大者。
function maxUpdateFromLists(oh) {
  let bestDate = ''
  let bestTime = '00:00'
  for (const key of ['hadList', 'hhadList', 'crsList', 'ttgList', 'hafuList']) {
    const arr = oh[key]
    if (!Array.isArray(arr)) continue
    for (const item of arr) {
      if (!item || !item.updateDate) continue
      const d = str(item.updateDate)
      const t = str(item.updateTime)
      if (d > bestDate || (d === bestDate && t > bestTime)) {
        bestDate = d
        bestTime = t.slice(0, 5) || '00:00'
      }
    }
  }
  return { date: bestDate, time: bestTime }
}

// 将 getFixedBonusV1 返回转成与 toMatchEspn 兼容的 match 对象。
function parseMatch(value) {
  if (!value) return null
  // 取消的比赛
  if (value.isCancel === '1' || value.isCancel === 1) return null
  const oh = value.oddsHistory || {}
  const home = str(oh.homeTeamAbbName)
  if (!home) return null // 无球队名 = 无效 matchId

  const score = str(value.sectionsNo999)
  const mr = Array.isArray(value.matchResultList) ? value.matchResultList : []
  // 已结束 = 有有效比分 且 有开奖结果
  if (!score || score === '无效场次' || !/\d/.test(score) || !mr.length) return null

  const { date: matchDate, time: matchTime } = maxUpdateFromLists(oh)

  return {
    matchId: Number(oh.matchId) || 0,
    matchNum: 0,
    matchNumStr: '',
    matchNumDate: matchDate,
    businessDate: matchDate,
    matchDate,
    matchTime,
    weekday: '',
    league: {
      id: Number(oh.leagueId) || 0,
      code: '',
      abbName: str(oh.leagueAbbName),
      allName: str(oh.leagueAllName),
    },
    home: { code: '', abbName: str(oh.homeTeamAbbName), allName: str(oh.homeTeamAllName) },
    away: { code: '', abbName: str(oh.awayTeamAbbName), allName: str(oh.awayTeamAllName) },
    status: 'FT',
    statusLabel: '已完成',
    sellStatus: 'finished',
    finished: true,
    finalScore: score,
    resultSource: 'sporttery:fixedBonus',
    bettingSingle: false,
    bettingAllUp: false,
    markets: {},
    // 体彩官方独有：5 玩法开奖 + 历史赔率变动
    matchResultList: mr,
    oddsHistory: {
      had: oh.hadList || [],
      hhad: oh.hhadList || [],
      crs: oh.crsList || [],
      ttg: oh.ttgList || [],
      hafu: oh.hafuList || [],
    },
    homeTeamId: oh.homeTeamId,
    awayTeamId: oh.awayTeamId,
  }
}

function loadStore() {
  try {
    if (!existsSync(STORE_FILE)) return { lastScannedMaxId: 0, lastScannedMinId: 0, matches: {} }
    const j = JSON.parse(readFileSync(STORE_FILE, 'utf8'))
    return {
      lastScannedMaxId: j.lastScannedMaxId || 0,
      lastScannedMinId: j.lastScannedMinId || 0,
      matches: j.matches || {},
    }
  } catch {
    return { lastScannedMaxId: 0, lastScannedMinId: 0, matches: {} }
  }
}

function saveStore(store) {
  try {
    writeFileSync(STORE_FILE, JSON.stringify(store))
  } catch {
    // 持久化失败不影响内存使用
  }
}

async function mapLimit(items, limit, fn) {
  const ret = new Array(items.length)
  let i = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++
      ret[idx] = await fn(items[idx])
    }
  })
  await Promise.all(workers)
  return ret
}

// 扫描一个方向：direction='forward' 时 id 从 fromId 递增到 toId；'backward' 时从 fromId 递减到 toId。
// 一旦已找到过比赛、且连续 GAP_STOP 个 ID 均为空，即认为越过真实 frontier，提前结束该方向，避免无限请求。
// 双向各自独立 early-stop：中间出现空隙不会误杀另一方向。扫描后把实际命中的最大/最小 matchId 写回 store，
// 作为下次扫描的锚点（增量，避免每次全量重扫）。
async function scanRange(fromId, toId, store, direction = 'forward') {
  let maxFoundId = store.lastScannedMaxId
  let minFoundId = store.lastScannedMinId || 0
  let gap = 0
  const step = direction === 'forward' ? 1 : -1
  const inRange = direction === 'forward' ? (i) => i <= toId : (i) => i >= toId
  let id = fromId
  while (inRange(id)) {
    const batch = []
    for (let k = 0; k < CONCURRENCY && inRange(id); k++) {
      batch.push(id)
      id += step
    }
    const ms = await mapLimit(batch, CONCURRENCY, async (x) => parseMatch(await fetchFixedBonus(x)))
    for (const m of ms) {
      if (m) {
        store.matches[m.matchId] = m
        if (m.matchId > maxFoundId) maxFoundId = m.matchId
        if (!minFoundId || m.matchId < minFoundId) minFoundId = m.matchId
        gap = 0
      } else if (maxFoundId > 0 && minFoundId > 0) {
        gap++
      }
    }
    if (maxFoundId > 0 && minFoundId > 0 && gap >= GAP_STOP) break
  }
  store.lastScannedMaxId = Math.max(store.lastScannedMaxId, maxFoundId)
  if (minFoundId > 0) {
    store.lastScannedMinId = store.lastScannedMinId ? Math.min(store.lastScannedMinId, minFoundId) : minFoundId
  }
}

function pruneOld(store) {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - PRUNE_DAYS)
  const cutoffStr = cutoff.toISOString().slice(0, 10)
  for (const id of Object.keys(store.matches)) {
    const m = store.matches[id]
    if (m.matchDate && m.matchDate < cutoffStr) delete store.matches[id]
  }
}

// 返回近 RECENT_DAYS 天的体彩官方已结束比赛。
// currentMaxId：当前在售比赛的最大 matchId（来自 getMatchCalculatorV1）。
// 首次调用时后台异步扫描（约 15-20s），立即返回 null（由调用方 fallback 到 ESPN）；
// 扫描完成后填入内存缓存，后续调用直接读缓存。
export async function getSportteryFinished(currentMaxId) {
  if (memCache.data && Date.now() - memCache.at < MEM_TTL) return memCache.data

  if (!bgScan) {
    bgScan = (async () => {
      try {
        const store = loadStore()
        if (currentMaxId && currentMaxId > 0) {
          // 在售接口可用：增量向前扫新完赛场次，并补扫当前锚点下方（同一期里 ID 偏低的场次）。
          const fFrom = store.lastScannedMaxId
            ? store.lastScannedMaxId + 1
            : Math.max(1, currentMaxId - LIVE_SCAN_SPAN)
          if (fFrom <= currentMaxId) await scanRange(fFrom, currentMaxId, store, 'forward')
          const bFrom = store.lastScannedMaxId ? store.lastScannedMaxId - 1 : currentMaxId - 1
          const bTo = store.lastScannedMinId
            ? store.lastScannedMinId - 1
            : Math.max(1, (store.lastScannedMaxId || currentMaxId) - LIVE_SCAN_SPAN)
          if (bFrom >= bTo) await scanRange(bFrom, bTo, store, 'backward')
        } else {
          // 停售 / 无在售锚点：以持久化锚点为中心双向扫描。
          const maxId = store.lastScannedMaxId || 0
          if (maxId > 0) {
            // 向后（高 ID）探未来新完赛场次
            const fFrom = maxId + 1
            const fTo = maxId + FORWARD_SPAN
            await scanRange(fFrom, fTo, store, 'forward')
            // 向前（低 ID）补全同一期里 ID 偏低的场次（关键：拉科那期其余 5 场就在下方）
            const bFrom = maxId - 1
            const bTo = Math.max(1, store.lastScannedMinId ? store.lastScannedMinId - 1 : maxId - BACKWARD_SPAN)
            if (bFrom >= bTo) await scanRange(bFrom, bTo, store, 'backward')
          } else {
            // 完全没有锚点：做一次向前扫描建立初始锚点
            await scanRange(1, FORWARD_SPAN, store, 'forward')
          }
        }
        pruneOld(store)
        saveStore(store)

        const cutoff = new Date()
        cutoff.setDate(cutoff.getDate() - RECENT_DAYS)
        const cutoffStr = cutoff.toISOString().slice(0, 10)
        const recent = Object.values(store.matches).filter(
          (m) => !m.matchDate || m.matchDate >= cutoffStr,
        )
        memCache = { at: Date.now(), data: recent }
      } catch {
        // 扫描失败：保留旧缓存（若有）
      } finally {
        bgScan = null
      }
    })()
  }

  return memCache.data
}
