// 体彩官方已结束比赛数据源 —— 通过 getFixedBonusV1（单场详情接口，无需签名）扫描
// matchId 范围，获取所有体彩开售联赛的已结束比赛（含沙特联/日乙/韩K2 等 ESPN 不收录的联赛）。
//
// 原理：体彩 matchId 连续递增；getMatchCalculatorV1 只返回在售（Selling）比赛，比赛结束后
// 即从该接口消失，但 getFixedBonusV1?clientCode=3001&matchId=<id> 仍可查到该比赛的
// 完整数据（比分 sectionsNo999 + 5玩法开奖 matchResultList + 历史赔率 oddsHistory）。
// 因此扫描近期 matchId 区间，即可还原体彩 app 上"最近已完赛"的全部比赛。
//
// 赛果列表接口 getMatchResultV1（jc 路径）被 WAF 403，getMatchResultNewV1（uniform 路径）
// 需签名，均不可用；故采用 matchId 扫描方案。

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

const MEM_TTL = 5 * 60 * 1000 // 内存缓存 5 分钟（过期后仍可返回旧数据，仅控制是否触发重扫）
const RESCAN_SPAN = 2500 // 每次重扫的 matchId 跨度（覆盖近 7-10 天，含已结束比赛）
const RESCAN_THROTTLE = 12 * 60 * 1000 // 全量重扫节流：12 分钟内不重复扫
const PRUNE_DAYS = 10 // 持久化保留天数
const RECENT_DAYS = 5 // 返回近几日的已结束比赛
const CONCURRENCY = 40 // 并发请求数

let memCache = { at: 0, data: null }
let bgScan = null // 后台扫描 promise（防止并发重复扫描）
let lastScanAt = 0 // 上次扫描启动时间戳

function str(v) {
  return v === null || v === undefined ? '' : String(v)
}

// 本地日期串（中国时区 +8），用于过滤"未来日期"脏数据 + 近 N 天截断。
// getFixedBonusV1 对部分未来开售的 matchId 会返回历史比分 + 未来 updateDate，
// 这类数据虽带比分但比赛日为未来，会误导用户，需过滤掉。
// offsetDays: 0=今天，负数=过去 N 天，正数=未来 N 天
function localDateStr(offsetDays = 0) {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
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

// 从赔率历史列表中取最后一条 updateDate/updateTime 作为比赛日近似。
function lastUpdateFromLists(oh) {
  for (const key of ['hadList', 'hhadList', 'crsList', 'ttgList', 'hafuList']) {
    const arr = oh[key]
    if (Array.isArray(arr) && arr.length) {
      const last = arr[arr.length - 1]
      if (last && last.updateDate) {
        return { date: str(last.updateDate), time: str(last.updateTime).slice(0, 5) || '00:00' }
      }
    }
  }
  return { date: '', time: '00:00' }
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

  const { date: matchDate, time: matchTime } = lastUpdateFromLists(oh)

  // 过滤"未来日期"脏数据：getFixedBonusV1 对部分未来开售的 matchId 会返回
  // 历史比分 + 未来 updateDate，这类数据比赛日为未来，不应作为"已结束"展示。
  const today = localDateStr(0)
  if (matchDate && matchDate > today) return null

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
    if (!existsSync(STORE_FILE)) return { lastScannedMaxId: 0, matches: {} }
    const j = JSON.parse(readFileSync(STORE_FILE, 'utf8'))
    return { lastScannedMaxId: j.lastScannedMaxId || 0, matches: j.matches || {} }
  } catch {
    return { lastScannedMaxId: 0, matches: {} }
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

async function scanRange(fromId, toId, store) {
  const ids = []
  for (let id = fromId; id <= toId; id++) ids.push(id)
  const results = await mapLimit(ids, CONCURRENCY, async (id) =>
    parseMatch(await fetchFixedBonus(id)),
  )
  for (const m of results) {
    if (m) store.matches[m.matchId] = m
  }
  store.lastScannedMaxId = toId
}

function pruneOld(store) {
  const cutoffStr = localDateStr(-PRUNE_DAYS)
  for (const id of Object.keys(store.matches)) {
    const m = store.matches[id]
    if (m.matchDate && m.matchDate < cutoffStr) delete store.matches[id]
  }
}

// 返回近 RECENT_DAYS 天的体彩官方已结束比赛。
// currentMaxId：当前在售比赛的最大 matchId（来自 getMatchCalculatorV1）。
//
// 扫描策略：每次都重扫 [currentMaxId - RESCAN_SPAN, currentMaxId] 近期窗口（而非
// 单向增量）。原因：体彩 matchId 按时间递增，但比赛结束后才在 getFixedBonusV1
// 出现比分；若首次扫描时比赛尚未结束（无比分被过滤），增量模式（lastId+1→maxId）
// 永不回头补扫，导致昨日的已结束比赛缺失。重扫窗口可让"刚结束"的比赛被补上。
//
// 节流：RESCAN_THROTTLE 内不重复全量扫描；期间返回旧缓存（若有），首次返回 null
// 由调用方 fallback 到 ESPN。
export async function getSportteryFinished(currentMaxId) {
  // 缓存未过期：直接返回
  if (memCache.data && Date.now() - memCache.at < MEM_TTL) return memCache.data

  // 节流期内：返回旧缓存（可能为 null），不重复扫描
  const shouldRescan = !bgScan && currentMaxId && Date.now() - lastScanAt > RESCAN_THROTTLE
  if (shouldRescan) {
    lastScanAt = Date.now()
    bgScan = (async () => {
      try {
        const store = loadStore()
        // 每次重扫近期窗口（覆盖近 7-10 天），补上"刚结束"的比赛
        const fromId = Math.max(1, currentMaxId - RESCAN_SPAN)
        if (fromId <= currentMaxId) {
          await scanRange(fromId, currentMaxId, store)
        }
        pruneOld(store)
        saveStore(store)

        const cutoffStr = localDateStr(-RECENT_DAYS)
        const todayStr = localDateStr(0)
        const recent = Object.values(store.matches)
          // 近 RECENT_DAYS 天 且 不晚于今天（过滤未来日期脏数据，双重保险）
          .filter((m) => !m.matchDate || (m.matchDate >= cutoffStr && m.matchDate <= todayStr))
        // 顺序交由 parseUpstream 的 byDateSeq 统一排序（同日 matchId 升序=体彩序号，
        // 与体彩 app 一致）；这里保持 matchId 升序的自然插入顺序，不额外排序。
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
