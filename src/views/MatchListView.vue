<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, computed, nextTick } from 'vue'
import { fetchMatches, fetchTeamInsight, fetchAiAnalysis } from '@/api/sporttery'
import type { MatchListResult, PoolCode, Match, TeamInsight, MatchResult, RealInsight, DemoInsight } from '@/types'
import OddsTable from '@/components/OddsTable.vue'
import MatchResultGrid from '@/components/MatchResultGrid.vue'
import { MagicStick } from '@element-plus/icons-vue'
import { zhTeam, zhLeagueName } from '@/translate'

const loading = ref(false)
const result = ref<MatchListResult | null>(null)
const selectedPools = ref<PoolCode[]>(['had', 'hhad'])
const leagueFilter = ref('')
const searchKw = ref('')
const sortOrder = ref<'results' | 'near' | 'asc'>('results')

function fmtMD(d: string) {
  return d ? d.slice(5) : ''
}
// 详情里显示完整日期（含年份），如 2026-08-09
function fmtMDY(d: string) {
  if (!d) return ''
  return d.length >= 10 ? d.slice(0, 10) : d
}
function fmtTime(t: string) {
  if (!t) return ''
  const parts = String(t).split(':')
  const h = parts[0]
  const mi = parts[1]
  if (h !== undefined && mi !== undefined) return `${h.padStart(2, '0')}:${mi}`
  return t
}
function weekdayOf(m: Match | null) {
  return (m?.matchNumStr || '').replace(/\d+$/, '')
}
const page = ref(1)
const pageSize = ref(50)
const displayed = ref<Match[]>([])
const errorMsg = ref('')

const selected = ref<Match | null>(null)
const insight = ref<TeamInsight | null>(null)
const insightLoading = ref(false)
const drawerVisible = ref(false)

const poolOptions: { label: string; value: PoolCode }[] = [
  { label: '胜平负', value: 'had' },
  { label: '让球胜平负', value: 'hhad' },
  { label: '比分', value: 'crs' },
  { label: '总进球', value: 'ttg' },
  { label: '半全场', value: 'hafu' },
]

async function fetchPage(append = false) {
  loading.value = true
  errorMsg.value = ''
  try {
    const res = await fetchMatches({
      pools: selectedPools.value.join(','),
      league: leagueFilter.value || undefined,
      keyword: searchKw.value || undefined,
      sort: sortOrder.value,
      page: page.value,
      pageSize: pageSize.value,
    })
    if (append) {
      displayed.value = [...displayed.value, ...res.matches]
    } else {
      result.value = res
      displayed.value = res.matches
    }
  } catch (e: any) {
    errorMsg.value = e.message || '加载失败'
  } finally {
    loading.value = false
  }
}

// 首次加载 / 筛选变化：重置到第 1 页并替换列表
async function loadInitial() {
  page.value = 1
  await fetchPage(false)
  await nextTick()
  // 首屏内容不足一屏时，自动补满，避免底部哨兵一开始就触发
  fillIfNeeded()
}

// 滚动到底：加载下一页并追加
async function loadMore() {
  if (!needsMore()) return
  page.value += 1
  await fetchPage(true)
  await nextTick()
  // 追加后若哨兵仍在视口内（内容未填满一屏），继续加载直到填满
  fillIfNeeded()
}

async function selectMatch(m: Match) {
  selected.value = m
  drawerVisible.value = true
  insightLoading.value = true
  insight.value = null
  try {
    insight.value = await fetchTeamInsight(m.matchId, m.home.abbName, m.away.abbName, {
      source: m.resultSource,
      homeId: m.homeId,
      awayId: m.awayId,
      league: m.league?.code,
    })
  } catch {
    insight.value = null
  } finally {
    insightLoading.value = false
  }
}

// ---- 赛前 AI 分析（抽屉入口，仅未开赛对局显示）----
function isUpcoming(m: Match | null): boolean {
  if (!m) return false
  if (m.finished) return false
  if (m.status === 'FT') return false
  if (m.statusLabel === '已完成') return false
  return true
}

const PROVIDER_OPTIONS = [
  { value: 'deepseek', label: 'DeepSeek', baseURL: 'https://api.deepseek.com/v1', model: 'deepseek-chat', doc: 'https://platform.deepseek.com/', free: '注册即送 500 万 tokens 免费额度，用完按量计费（很便宜）' },
  { value: 'doubao', label: '豆包（火山方舟）', baseURL: 'https://ark.cn-beijing.volces.com/api/v3', model: '', doc: 'https://www.volcengine.com/product/ark', free: '需实名；在控制台创建「推理接入点」，把 Endpoint ID（如 ep-2024xxxx）填到下方"模型名称"。新用户有免费额度' },
  { value: 'openrouter', label: 'OpenRouter（免费模型多）', baseURL: 'https://openrouter.ai/api/v1', model: 'deepseek/deepseek-r1-distill-llama-70b:free', doc: 'https://openrouter.ai/', free: '注册即用，带 :free 后缀的模型完全免费' },
  { value: 'siliconflow', label: '硅基流动', baseURL: 'https://api.siliconflow.cn/v1', model: 'deepseek-ai/DeepSeek-V3', doc: 'https://siliconflow.cn/', free: '注册送 14 元额度 + 多个开源免费模型' },
  { value: 'custom', label: '自定义', baseURL: '', model: '', doc: '', free: '任意 OpenAI 兼容网关，自行填地址与模型' },
]

const LS_KEY = 'ai_analysis_settings'
const aiDialog = ref(false)
const aiProvider = ref('deepseek')
const aiApiKey = ref('')
const aiBaseURL = ref('')
const aiModel = ref('')
const aiLoading = ref(false)
const aiResult = ref('')
const aiError = ref('')
const aiModelUsed = ref('')
const aiDataBacked = ref(false)

function loadSettings() {
  try {
    const s = JSON.parse(localStorage.getItem(LS_KEY) || '{}')
    if (s.provider) aiProvider.value = s.provider
    if (s.apiKey) aiApiKey.value = s.apiKey
    if (s.baseURL) aiBaseURL.value = s.baseURL
    if (s.model) aiModel.value = s.model
  } catch {}
  applyProviderPreset(aiProvider.value)
}
function saveSettings() {
  localStorage.setItem(
    LS_KEY,
    JSON.stringify({
      provider: aiProvider.value,
      apiKey: aiApiKey.value,
      baseURL: aiBaseURL.value,
      model: aiModel.value,
    }),
  )
}
function applyProviderPreset(value: string) {
  const opt = PROVIDER_OPTIONS.find((o) => o.value === value)
  if (opt && opt.value !== 'custom') {
    aiBaseURL.value = opt.baseURL
    aiModel.value = opt.model
  }
}
function onProviderChange(value: string) {
  applyProviderPreset(value)
  saveSettings()
}
function openAi() {
  aiResult.value = ''
  aiError.value = ''
  loadSettings()
  aiDialog.value = true
}
async function runAi() {
  if (!selected.value) return
  aiLoading.value = true
  aiError.value = ''
  aiResult.value = ''
  try {
    const data = await fetchAiAnalysis({
      provider: aiProvider.value,
      apiKey: aiApiKey.value,
      baseURL: aiBaseURL.value,
      model: aiModel.value,
      matchId: selected.value.matchId,
      homeName: selected.value.home.abbName,
      awayName: selected.value.away.abbName,
      source: selected.value.resultSource || undefined,
      homeId: selected.value.homeId,
      awayId: selected.value.awayId,
      league: selected.value.league?.code,
    })
    aiResult.value = data.analysis
    aiModelUsed.value = data.model
    aiDataBacked.value = !!data.dataBacked
    if (aiApiKey.value) saveSettings()
  } catch (e: any) {
    aiError.value = e.message || '分析失败'
  } finally {
    aiLoading.value = false
  }
}

function onFilterChange() {
  loadInitial()
}

const resultType: Record<MatchResult, '' | 'success' | 'info' | 'danger'> = {
  胜: 'success',
  平: 'info',
  负: 'danger',
}

// 真实特征分析（体彩官方 getMatchFeatureV1）：胜/平/负 + 胜率
const FEATURE_KEYS = ['last', 'sameHomeAway', 'eachHomeAway', 'eachSameHomeAway'] as const
type FeatureKey = (typeof FEATURE_KEYS)[number]
const FEATURE_TITLES: Record<FeatureKey, string> = {
  last: '近期交锋',
  sameHomeAway: '同主客交锋',
  eachHomeAway: '近10场战况',
  eachSameHomeAway: '同主客战况',
}
const real = computed<RealInsight | null>(() =>
  insight.value && !insight.value.demo ? (insight.value as RealInsight) : null,
)
const featureBlocks = computed(() => {
  const r = real.value
  if (!r) return []
  return FEATURE_KEYS.map((k) => ({ key: k, title: FEATURE_TITLES[k], stat: r.feature[k] })).filter(
    (b) => b.stat && b.stat.total > 0,
  )
})
const standings = computed(() => real.value?.head.standings ?? null)
const demo = computed(() =>
  insight.value && insight.value.demo ? (insight.value as DemoInsight) : null,
)

// 已结束赛果来源标签（体彩官方优先，ESPN 免 Key 默认可用，配 Key 后用更全的源）
const finishedTagText = computed(() => {
  const s = result.value?.finishedSource
  if (s === 'sporttery:fixedBonus') return '赛果 · 体彩官方'
  if (s === 'third-party:espn') return '近两日赛果 · ESPN(免费)'
  if (s === 'third-party:apifootball') return '近两日赛果 · API-Football'
  if (s === 'third-party:football-data') return '近两日赛果 · football-data'
  return ''
})

// 单场已结束赛果来源中文标签
function sourceLabel(s?: string) {
  if (s === 'sporttery:fixedBonus') return '体彩官方'
  if (s === 'third-party:espn') return 'ESPN'
  if (s === 'third-party:apifootball') return 'API-Football'
  if (s === 'third-party:football-data') return 'football-data'
  return '第三方'
}

// 胜平负历史赔率走势（仅 HAD 三项赔率，形状稳定）
// 自行对比相邻条目计算涨跌箭头（官方 hf/df/af 标志含义不稳定）
const hadHistory = computed(() => {
  const h = selected.value?.oddsHistory?.had
  if (!h || !h.length) return []
  const arrow = (cur: string, prev: string | undefined) => {
    if (!prev) return ''
    const c = Number(cur), p = Number(prev)
    if (!isFinite(c) || !isFinite(p)) return ''
    if (c > p) return 'up'
    if (c < p) return 'down'
    return ''
  }
  return h.map((e, i) => {
    const prev = i > 0 ? h[i - 1] : undefined
    return {
      updateDate: e.updateDate,
      updateTime: e.updateTime,
      h: e.h, d: e.d, a: e.a,
      hTrend: arrow(e.h, prev?.h),
      dTrend: arrow(e.d, prev?.d),
      aTrend: arrow(e.a, prev?.a),
    }
  })
})
function trendColor(t: string) {
  if (t === 'up') return '#ef4444' // 涨 = 红 (中国习惯)
  if (t === 'down') return '#22c55e' // 跌 = 绿
  return '#111827'
}
function trendIcon(t: string) {
  if (t === 'up') return ' ↑'
  if (t === 'down') return ' ↓'
  return ''
}

const totalPages = computed(() => (result.value ? Math.ceil(result.value.total / pageSize.value) : 1))
const noMore = computed(() => !result.value || page.value >= totalPages.value)

// 顶部醒目横幅：仅在「非实时官方数据」时显示，明确告知当前数据状态，避免误以为是解析错误。
// 关键修正：竞彩每天 11 点前只是「停售新单」（当前无可投注赛事），但已结束赛果接口（体彩官方
// getFixedBonusV1）仍可正常查询，因此停售期也应展示真实的近期赛果，而非一律回退合成示例。
const isLive = computed(() => result.value?.source === 'live-sporttery')
const finishedIsSporttery = computed(
  () => result.value?.finishedSource === 'sporttery:fixedBonus',
)
const bannerTitle = computed(() => {
  if (isLive.value) return ''
  if (result.value?.finishedScanning) return '体彩官方赛果扫描中…'
  if (finishedIsSporttery.value) return '竞彩当前停售（无在售赛事），已结束赛果为体彩官方真实数据'
  if (result.value?.upstreamError) return `竞彩官方接口不可用：${result.value.upstreamError}`
  if (result.value?._snapshot) return '当前为部署时抓取的静态快照（非实时）'
  return '当前为离线示例数据，赔率非真实'
})
const bannerDesc = computed(() => {
  if (isLive.value) return ''
  if (result.value?.finishedScanning)
    return '首次加载时正在后台扫描体彩官方已结束比赛（约 15-20 秒），期间临时显示第三方赛果，稍后会自动切换为体彩官方真实赛果与 5 玩法开奖。'
  if (finishedIsSporttery.value)
    return '当前为每日 11 点前的停售期，没有可投注的新赛事；但昨天及近期已结束比赛的赛果、5 玩法开奖均为体彩官方真实数据，可正常查看（含比分与历史赔率走势）。'
  return '正在显示内置示例（队名真实、赔率为合成），与体彩 App 对不上是正常的。要看到与体彩 App 一致的真实数据，请运行本地实时后端（npm run server）且竞彩处于开售状态；静态预览版无后端，只能显示示例快照。'
})

// 自动翻页：用 IntersectionObserver 观察列表底部的哨兵元素。
// 本布局中 el-main 才是真正的滚动容器（overflow:auto），window 不会触发
// 滚动事件，因此不能用 window.scroll 监听。root:null 表示相对浏览器视口
// 计算交叉，无论由 window 还是 el-main 滚动都能正确触发。
const sentinel = ref<HTMLElement | null>(null)
let io: IntersectionObserver | null = null

function needsMore() {
  return !loading.value && !noMore.value
}

function fillIfNeeded() {
  if (!needsMore() || !sentinel.value) return
  const rect = sentinel.value.getBoundingClientRect()
  // 哨兵顶部已接近视口底部（240px 阈值）即视为到底
  if (rect.top <= window.innerHeight + 240) loadMore()
}

onMounted(() => {
  loadInitial()
  if (sentinel.value && 'IntersectionObserver' in window) {
    io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) fillIfNeeded()
      },
      { root: null, rootMargin: '240px 0px' },
    )
    io.observe(sentinel.value)
  }
})
onBeforeUnmount(() => io?.disconnect())
</script>

<template>
  <div class="list-page">
    <el-alert
      v-if="result && !isLive"
      type="warning"
      :closable="false"
      show-icon
      class="data-banner"
      :title="bannerTitle"
      :description="bannerDesc"
    />
    <el-card shadow="never" class="filter-bar">
      <div class="filters">
        <span class="f-label">玩法：</span>
        <el-checkbox-group v-model="selectedPools" @change="onFilterChange">
          <el-checkbox v-for="p in poolOptions" :key="p.value" :value="p.value">{{ p.label }}</el-checkbox>
        </el-checkbox-group>
      </div>
      <div class="filters second">
        <el-select v-model="leagueFilter" placeholder="按联赛筛选（英超/欧冠/世界杯…）" clearable filterable style="width: 220px"
          @change="onFilterChange">
          <el-option v-for="lg in result?.leagues || []" :key="lg.code + lg.abbName" :label="zhLeagueName(lg)"
            :value="lg.abbName" />
        </el-select>
        <el-input v-model="searchKw" placeholder="搜索球队" clearable style="width: 180px" @keyup.enter="onFilterChange"
          @clear="onFilterChange" />
        <el-select v-model="sortOrder" style="width: 200px" @change="onFilterChange">
          <el-option label="已结束优先（最新在上）" value="results" />
          <el-option label="即将开赛优先（最近的在上）" value="near" />
          <el-option label="时间正序（最早在上）" value="asc" />
        </el-select>
        <el-button type="primary" :loading="loading" @click="loadInitial">刷新</el-button>
        <span v-if="result" class="meta-info">
          共 {{ result.total }} 场 ·
          <el-tag v-if="result.source === 'live-sporttery'" type="success" size="small" effect="dark">实时 · 体彩官方</el-tag>
          <el-tag v-else-if="result.finishedSource === 'sporttery:fixedBonus'" type="warning" size="small" effect="plain">赛果 · 体彩官方（停售期）</el-tag>
          <el-tag v-else type="warning" size="small" effect="plain">离线示例（非真实数据）</el-tag>
          <el-tag v-if="finishedTagText" type="info" size="small" effect="plain">{{ finishedTagText }}</el-tag>
          <el-tag v-else-if="result.finishedAvailable === false" type="warning" size="small" effect="plain">近两日赛果：未配置
            Key</el-tag>
          <el-tag v-if="result._snapshot" type="info" size="small" effect="plain">静态快照 · {{ result.snapshotAt
            }}</el-tag>
        </span>
        <el-tag v-if="result?.upstreamError" type="warning" size="small">
          竞彩官方：{{ result.upstreamError }}（已回退示例数据）
        </el-tag>
        <el-tag v-if="errorMsg" type="danger" size="small">{{ errorMsg }}</el-tag>
      </div>
    </el-card>

    <div v-loading="loading && page === 1" class="cards">
      <el-card v-for="m in displayed" :key="m.matchId" shadow="hover" class="match-card" @click="selectMatch(m)">
        <div class="match-top">
          <span class="num">{{ weekdayOf(m) }}</span>
          <span class="league">{{ zhLeagueName(m.league) }}</span>
          <el-tag v-if="m.statusLabel === '已开售'" size="small" type="success" effect="plain">已开售</el-tag>
          <el-tag v-else size="small" type="info" effect="plain">已完成</el-tag>
          <span class="time">{{ fmtMD(m.matchDate) }} {{ fmtTime(m.matchTime) }}</span>
        </div>
        <div class="teams">
          <div class="team">
            <span class="t-name">{{ zhTeam(m.home.abbName) }}</span>
            <span v-if="m.home.rank" class="t-rank">{{ m.home.rank }}</span>
          </div>
          <span v-if="m.finished" class="score-final">{{ m.finalScore }}</span>
          <span v-else class="vs">VS</span>
          <div class="team">
            <span class="t-name">{{ zhTeam(m.away.abbName) }}</span>
            <span v-if="m.away.rank" class="t-rank">{{ m.away.rank }}</span>
          </div>
        </div>
        <div class="tags">
          <el-tag v-if="m.finished" size="small" type="info" effect="plain">已结束</el-tag>
          <el-tag v-if="m.bettingSingle" size="small" type="success" effect="plain">单关</el-tag>
          <el-tag v-if="m.bettingAllUp" size="small" type="warning" effect="plain">串关</el-tag>
        </div>
        <div v-if="!m.finished" class="odds-wrap">
          <OddsTable v-for="(mk, code) in m.markets" :key="code" :market="mk!" compact />
        </div>
        <div v-else class="finished-result">
          <MatchResultGrid v-if="m.matchResultList?.length" :results="m.matchResultList" compact />
          <div v-else class="finished-note">最终比分 · {{ sourceLabel(m.resultSource) }}</div>
        </div>
      </el-card>
    </div>

    <!-- 列表底部哨兵：进入视口即触发自动加载下一页 -->
    <div ref="sentinel" class="sentinel" aria-hidden="true"></div>

    <el-empty v-if="!loading && result && !result.total" description="暂无比赛数据" />

    <div class="load-more">
      <span v-if="loading && page > 1" class="lm-state">加载中…</span>
      <span v-else-if="noMore && displayed.length" class="lm-state">— 没有更多了 —</span>
      <span v-else-if="displayed.length" class="lm-tip">下拉到页面底部自动加载更多</span>
    </div>

    <!-- 抽屉：点击比赛后展示详情、近期战绩与历史交锋 -->
    <el-drawer v-model="drawerVisible" :size="620" direction="rtl" title="比赛详情 · 战绩与交锋">
      <template v-if="selected">
        <div class="drawer">
          <div class="head">
            <span class="league">{{ zhLeagueName(selected.league) }}</span>
            <el-tag v-if="insight?.demo" size="small" type="warning" effect="plain">演示数据</el-tag>
            <el-tag v-else-if="insight?.source === 'espn'" size="small" type="success" effect="dark">真实数据 ·
              ESPN</el-tag>
            <el-tag v-else size="small" type="success" effect="dark">真实数据 · 体彩官方</el-tag>
            <el-button
              v-if="isUpcoming(selected)"
              type="primary"
              size="small"
              :loading="aiLoading"
              class="ai-entry"
              @click="openAi"
            >
              <el-icon style="margin-right: 4px"><MagicStick /></el-icon> AI 分析
            </el-button>
          </div>
          <el-alert v-if="insight?.demo" type="warning" :closable="false" show-icon class="demo-alert"
            title="近期战绩与历史交锋为合成演示数据"
            description="体彩官方在售接口只提供赔率，不公开历史赛果。当前为离线合成数据；联网时会自动拉取体彩官方 getMatchFeatureV1 真实数据。" />
          <div class="scoreline">
            <div class="side-t">
              <span class="name">{{ zhTeam(selected.home.abbName) }}</span>
              <span v-if="selected.home.rank" class="rank">{{ selected.home.rank }}</span>
            </div>
            <span class="vs">VS</span>
            <div class="side-t">
              <span class="name">{{ zhTeam(selected.away.abbName) }}</span>
              <span v-if="selected.away.rank" class="rank">{{ selected.away.rank }}</span>
            </div>
          </div>
          <div class="when">
            {{ selected.statusLabel }} · {{ weekdayOf(selected) }} {{ fmtMDY(selected.matchDate) }} {{
              fmtTime(selected.matchTime) }}
          </div>

          <!-- 已结束比赛：体彩官方 5 玩法开奖结果 + 胜平负赔率走势 -->
          <template v-if="selected.finished">
            <el-divider content-position="left">
              5 玩法开奖结果
              <el-tag size="small" type="success" effect="dark" class="src-inline">{{ sourceLabel(selected.resultSource)
              }}</el-tag>
            </el-divider>
            <MatchResultGrid :results="selected.matchResultList" />
            <template v-if="hadHistory.length">
              <div class="hist-title">胜平负赔率走势（共 {{ hadHistory.length }} 次调整）</div>
              <el-table :data="hadHistory" size="small" class="hist-table">
                <el-table-column label="时间" width="124">
                  <template #default="{ row }">{{ fmtMDY(row.updateDate) }} {{ fmtTime(row.updateTime) }}</template>
                </el-table-column>
                <el-table-column label="主胜" width="96">
                  <template #default="{ row }">
                    <span :style="{ color: trendColor(row.hTrend) }">{{ row.h }}{{ trendIcon(row.hTrend) }}</span>
                  </template>
                </el-table-column>
                <el-table-column label="平" width="96">
                  <template #default="{ row }">
                    <span :style="{ color: trendColor(row.dTrend) }">{{ row.d }}{{ trendIcon(row.dTrend) }}</span>
                  </template>
                </el-table-column>
                <el-table-column label="客胜" width="96">
                  <template #default="{ row }">
                    <span :style="{ color: trendColor(row.aTrend) }">{{ row.a }}{{ trendIcon(row.aTrend) }}</span>
                  </template>
                </el-table-column>
              </el-table>
            </template>
          </template>

          <!-- 真实特征分析（体彩官方 getMatchFeatureV1） -->
          <template v-if="real">
            <template v-if="featureBlocks.length">
              <el-divider content-position="left">特征分析（体彩官方）</el-divider>
              <div class="feature-grid">
                <div v-for="fb in featureBlocks" :key="fb.key" class="feature-box">
                  <div class="fb-title">{{ fb.title }}</div>
                  <div class="fb-row">
                    <span class="side home">{{ zhTeam(real.head.homeName) }}</span>
                    <span class="wl">{{ fb.stat?.homeWin }}胜{{ fb.stat?.homeDraw }}平{{ fb.stat?.homeLoss }}负</span>
                    <span class="rate">胜率 {{ fb.stat?.homeWinRate }}%</span>
                  </div>
                  <div class="fb-row">
                    <span class="side away">{{ zhTeam(real.head.awayName) }}</span>
                    <span class="wl">{{ fb.stat?.awayWin }}胜{{ fb.stat?.awayDraw }}平{{ fb.stat?.awayLoss }}负</span>
                    <span class="rate">胜率 {{ fb.stat?.awayWinRate }}%</span>
                  </div>
                </div>
              </div>
            </template>

            <template v-if="standings">
              <el-divider content-position="left">积分榜</el-divider>
              <div class="stand-row">
                <span class="side home">{{ zhTeam(real.head.homeName) }}</span>
                <span v-if="standings.home.ranking" class="rank">第 {{ standings.home.ranking }} 名</span>
                <span class="wl">{{ standings.home.win }}胜{{ standings.home.draw }}平{{ standings.home.loss }}负</span>
                <span v-if="standings.home.seasonName" class="season">{{ standings.home.seasonName }}</span>
              </div>
              <div class="stand-row">
                <span class="side away">{{ zhTeam(real.head.awayName) }}</span>
                <span v-if="standings.away.ranking" class="rank">第 {{ standings.away.ranking }} 名</span>
                <span class="wl">{{ standings.away.win }}胜{{ standings.away.draw }}平{{ standings.away.loss }}负</span>
                <span v-if="standings.away.seasonName" class="season">{{ standings.away.seasonName }}</span>
              </div>
            </template>

            <!-- 真实逐场比分：近期战绩 + 历史交锋 -->
            <el-divider content-position="left">主队近期战绩 · {{ zhTeam(real.recent.home.teamName) }}</el-divider>
            <div class="stat-line" v-if="real.recent.home.stat.total">
              近{{ real.recent.home.stat.total }}场：
              <b>{{ real.recent.home.stat.win }}胜{{ real.recent.home.stat.draw }}平{{ real.recent.home.stat.loss }}负</b>
              · 胜率 {{ real.recent.home.stat.winPct }}
              <template v-if="real.recent.home.stat.goalFor !== undefined">· 进{{ real.recent.home.stat.goalFor }}失{{
                real.recent.home.stat.goalAgainst }}</template>
            </div>
            <el-table v-loading="insightLoading" v-if="real.recent.home.matches.length" :data="real.recent.home.matches"
              size="small" class="insight-table">
              <el-table-column label="日期" width="80">
                <template #default="{ row }">{{ fmtMDY(row.matchDate) }}</template>
              </el-table-column>
              <el-table-column label="赛事" width="60" prop="tournament" />
              <el-table-column label="对阵" min-width="160">
                <template #default="{ row }">
                  <span :class="row.homeName === row.selfName ? 'am-self' : 'am-opp'">{{ zhTeam(row.homeName) }}</span>
                  <span class="am-vs"> vs </span>
                  <span :class="row.awayName === row.selfName ? 'am-self' : 'am-opp'">{{ zhTeam(row.awayName) }}</span>
                </template>
              </el-table-column>
              <el-table-column label="比分" width="52" prop="score" />
              <el-table-column label="结果" width="46">
                <template #default="{ row }">
                  <el-tag :type="resultType[row.result as MatchResult]" size="small">{{ row.result }}</el-tag>
                </template>
              </el-table-column>
            </el-table>
            <el-empty v-else description="近一年无赛事记录" :image-size="48" />

            <el-divider content-position="left">客队近期战绩 · {{ zhTeam(real.recent.away.teamName) }}</el-divider>
            <div class="stat-line" v-if="real.recent.away.stat.total">
              近{{ real.recent.away.stat.total }}场：
              <b>{{ real.recent.away.stat.win }}胜{{ real.recent.away.stat.draw }}平{{ real.recent.away.stat.loss }}负</b>
              · 胜率 {{ real.recent.away.stat.winPct }}
              <template v-if="real.recent.away.stat.goalFor !== undefined">· 进{{ real.recent.away.stat.goalFor }}失{{
                real.recent.away.stat.goalAgainst }}</template>
            </div>
            <el-table v-loading="insightLoading" v-if="real.recent.away.matches.length" :data="real.recent.away.matches"
              size="small" class="insight-table">
              <el-table-column label="日期" width="80">
                <template #default="{ row }">{{ fmtMDY(row.matchDate) }}</template>
              </el-table-column>
              <el-table-column label="赛事" width="60" prop="tournament" />
              <el-table-column label="对阵" min-width="160">
                <template #default="{ row }">
                  <span :class="row.homeName === row.selfName ? 'am-self' : 'am-opp'">{{ zhTeam(row.homeName) }}</span>
                  <span class="am-vs"> vs </span>
                  <span :class="row.awayName === row.selfName ? 'am-self' : 'am-opp'">{{ zhTeam(row.awayName) }}</span>
                </template>
              </el-table-column>
              <el-table-column label="比分" width="52" prop="score" />
              <el-table-column label="结果" width="46">
                <template #default="{ row }">
                  <el-tag :type="resultType[row.result as MatchResult]" size="small">{{ row.result }}</el-tag>
                </template>
              </el-table-column>
            </el-table>
            <el-empty v-else description="近一年无赛事记录" :image-size="48" />

            <el-divider content-position="left">历史交锋 · 结果按 {{ zhTeam(real.h2h.primary) }} 视角</el-divider>
            <div class="stat-line" v-if="real.h2h.stat.total">
              近{{ real.h2h.stat.total }}场交锋：
              <b>{{ real.h2h.stat.win }}胜{{ real.h2h.stat.draw }}平{{ real.h2h.stat.loss }}负</b>
              · 胜率 {{ real.h2h.stat.winPct }}
            </div>
            <el-table v-loading="insightLoading" v-if="real.h2h.matches.length" :data="real.h2h.matches" size="small"
              class="insight-table">
              <el-table-column label="日期" width="80">
                <template #default="{ row }">{{ fmtMDY(row.matchDate) }}</template>
              </el-table-column>
              <el-table-column label="赛事" width="60" prop="tournament" />
              <el-table-column label="对阵" min-width="160">
                <template #default="{ row }">
                  <span :class="row.homeName === row.selfName ? 'am-self' : 'am-opp'">{{ zhTeam(row.homeName) }}</span>
                  <span class="am-vs"> vs </span>
                  <span :class="row.awayName === row.selfName ? 'am-self' : 'am-opp'">{{ zhTeam(row.awayName) }}</span>
                </template>
              </el-table-column>
              <el-table-column label="比分" width="52" prop="score" />
              <el-table-column label="结果" width="46">
                <template #default="{ row }">
                  <el-tag :type="resultType[row.result as MatchResult]" size="small">{{ row.result }}</el-tag>
                </template>
              </el-table-column>
            </el-table>
            <el-empty v-else description="近一年无直接交锋记录" :image-size="48" />

            <p class="src-note" v-if="insight?.source === 'espn'">
              数据来源：ESPN 公开赛果接口（球队赛程 / 交锋），真实逐场比分；本场为第三方赛果，非体彩官方对阵详情。
            </p>
            <p class="src-note" v-else>
              数据来源：中国体育彩票竞彩网 getMatchHeadV1 / getMatchFeatureV1 / getResultHistoryV1 / getMatchResultV1（与体彩 App
              同源，页面注明"本页面部分数据来源于第三方"）。
            </p>
          </template>

          <!-- 演示数据回退（离线 / 官方接口不可达） -->
          <template v-else-if="demo">
            <el-divider content-position="left">主队近期战绩</el-divider>
            <el-table v-loading="insightLoading" :data="demo?.home.recent || []" size="small">
              <el-table-column label="日期" width="80">
                <template #default="{ row }">{{ fmtMDY(row.date) }}</template>
              </el-table-column>
              <el-table-column label="对阵" min-width="160">
                <template #default="{ row }">
                  <span v-if="row.home" class="am-self">{{ demo?.home.team }}</span>
                  <span v-else class="am-opp">{{ row.opponent }}</span>
                  <span class="am-vs"> vs </span>
                  <span v-if="row.home" class="am-opp">{{ row.opponent }}</span>
                  <span v-else class="am-self">{{ demo?.home.team }}</span>
                </template>
              </el-table-column>
              <el-table-column prop="score" label="比分" width="64" />
              <el-table-column label="结果" width="64">
                <template #default="{ row }">
                  <el-tag :type="resultType[row.result as MatchResult]" size="small">{{ row.result }}</el-tag>
                </template>
              </el-table-column>
            </el-table>

            <el-divider content-position="left">客队近期战绩</el-divider>
            <el-table v-loading="insightLoading" :data="demo?.away.recent || []" size="small">
              <el-table-column label="日期" width="80">
                <template #default="{ row }">{{ fmtMDY(row.date) }}</template>
              </el-table-column>
              <el-table-column label="对阵" min-width="160">
                <template #default="{ row }">
                  <span v-if="row.home" class="am-self">{{ demo?.away.team }}</span>
                  <span v-else class="am-opp">{{ row.opponent }}</span>
                  <span class="am-vs"> vs </span>
                  <span v-if="row.home" class="am-opp">{{ row.opponent }}</span>
                  <span v-else class="am-self">{{ demo?.away.team }}</span>
                </template>
              </el-table-column>
              <el-table-column prop="score" label="比分" width="64" />
              <el-table-column label="结果" width="64">
                <template #default="{ row }">
                  <el-tag :type="resultType[row.result as MatchResult]" size="small">{{ row.result }}</el-tag>
                </template>
              </el-table-column>
            </el-table>

            <el-divider content-position="left">历史交锋（结果按主队视角）</el-divider>
            <el-table v-loading="insightLoading" :data="demo?.h2h || []" size="small">
              <el-table-column label="日期" width="80">
                <template #default="{ row }">{{ fmtMDY(row.date) }}</template>
              </el-table-column>
              <el-table-column label="对阵" min-width="160">
                <template #default="{ row }">{{ row.home }} vs {{ row.away }}</template>
              </el-table-column>
              <el-table-column prop="score" label="比分" width="64" />
              <el-table-column label="结果" width="64">
                <template #default="{ row }">
                  <el-tag :type="resultType[row.result as MatchResult]" size="small">{{ row.result }}</el-tag>
                </template>
              </el-table-column>
            </el-table>
          </template>

          <!-- 静态托管无后端：详情分析不可用 -->
          <template v-else-if="!insightLoading">
            <el-alert type="info" :closable="false" show-icon class="demo-alert" title="实时分析需要后端服务"
              description="当前为静态预览部署，未运行 Node 后端，无法拉取实时战绩与交锋。本地或 Render 部署可查看完整实时数据。" />
          </template>
        </div>
        <!-- AI 赛前分析对话框 -->
        <el-dialog v-model="aiDialog" title="AI 赛前分析" width="760px" top="6vh" destroy-on-close>
          <div v-if="selected" class="ai-match">
            <span class="ai-league">{{ zhLeagueName(selected.league) }}</span>
            <span class="ai-teams">{{ zhTeam(selected.home.abbName) }} VS {{ zhTeam(selected.away.abbName) }}</span>
          </div>
          <el-alert
            v-if="!aiApiKey"
            type="warning"
            :closable="false"
            show-icon
            class="ai-tip"
            title="未填写 Key：将使用「免 Key 规则速算」"
            description="基于两队真实近期战绩与交锋给出统计预测，无需申请任何大模型 Key。想用 AI 大模型分析，请在下方填入 Key。"
          />
          <el-form label-width="92px" class="ai-form">
            <el-form-item label="模型供应商">
              <el-select v-model="aiProvider" @change="onProviderChange" style="width: 100%">
                <el-option v-for="o in PROVIDER_OPTIONS" :key="o.value" :label="o.label" :value="o.value" />
              </el-select>
            </el-form-item>

            <el-form-item v-if="PROVIDER_OPTIONS.find((o) => o.value === aiProvider)?.doc" label="申请地址">
              <a :href="PROVIDER_OPTIONS.find((o) => o.value === aiProvider)!.doc" target="_blank" rel="noopener" class="ai-doc-link">
                {{ PROVIDER_OPTIONS.find((o) => o.value === aiProvider)!.doc }}
              </a>
              <div class="ai-key-hint">{{ PROVIDER_OPTIONS.find((o) => o.value === aiProvider)!.free }}</div>
            </el-form-item>

            <el-form-item label="API Key">
              <el-input
                v-model="aiApiKey"
                type="password"
                show-password
                placeholder="粘贴你在该厂商申请的免费 API Key（留空=免 Key 规则速算）"
                @input="saveSettings"
              />
              <div class="ai-key-hint">不填也能用：留空即走「免 Key 规则速算」；填了 Key 则由 AI 大模型给出更详细的伤停/战意分析。</div>
            </el-form-item>

            <template v-if="aiProvider === 'custom' || aiProvider === 'doubao'">
              <el-form-item v-if="aiProvider === 'custom'" label="接口地址">
                <el-input v-model="aiBaseURL" placeholder="OpenAI 兼容 /chat/completions 网关地址" @input="saveSettings" />
              </el-form-item>
              <el-form-item label="模型名称">
                <el-input
                  v-model="aiModel"
                  :placeholder="aiProvider === 'doubao' ? '填火山方舟 Endpoint ID，如 ep-2024xxxxxx' : '如 deepseek-chat'"
                  @input="saveSettings"
                />
              </el-form-item>
            </template>
          </el-form>
          <el-button type="primary" :loading="aiLoading" @click="runAi" style="width: 100%">
            {{ aiLoading ? '分析中…' : (aiApiKey ? '开始 AI 分析' : '免 Key 规则速算') }}
          </el-button>
          <el-alert v-if="aiError" type="error" :closable="false" show-icon :title="aiError" class="ai-error" />
          <div v-if="aiResult" class="ai-result">
            <div class="ai-result-head">
              <span>分析结果</span>
              <span class="ai-result-meta">
                模型：{{ aiModelUsed }}
                <el-divider direction="vertical" />
                {{ aiDataBacked ? '基于真实战绩/交锋' : '基于模型自身知识' }}
              </span>
            </div>
            <div class="ai-result-body">{{ aiResult }}</div>
          </div>
        </el-dialog>
      </template>
    </el-drawer>
  </div>
</template>

<style scoped>
.list-page {
  display: flex;
  flex-direction: column;
  min-height: 100%;
}

.filter-bar {
  margin-bottom: 16px;
}

.filters {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
}

.filters.second {
  margin-top: 12px;
}

.f-label {
  color: #374151;
  font-size: 14px;
}

.meta-info {
  color: #6b7280;
  font-size: 12px;
  margin-left: auto;
}

.cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 16px;
}

.match-card {
  cursor: pointer;
  transition: border-color 0.15s, transform 0.15s;
}

.match-card:hover {
  transform: translateY(-2px);
}

.match-top {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: #6b7280;
  margin-bottom: 10px;
  flex-wrap: wrap;
}

.num {
  font-weight: 700;
  color: #2563eb;
  white-space: nowrap;
}

.league {
  background: #eff6ff;
  color: #2563eb;
  padding: 1px 6px;
  border-radius: 4px;
  white-space: nowrap;
}

.time {
  margin-left: auto;
}

.teams {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.team {
  flex: 1;
  text-align: center;
}

.t-name {
  font-size: 18px;
  font-weight: 700;
  color: #111827;
}

.t-rank {
  font-size: 12px;
  color: #9ca3af;
}

.vs {
  color: #9ca3af;
  font-size: 13px;
}

.score-final {
  color: #111827;
  font-size: 20px;
  font-weight: 800;
  letter-spacing: 1px;
  font-variant-numeric: tabular-nums;
}

.finished-note {
  font-size: 12px;
  color: #9ca3af;
  margin-top: 4px;
}

.finished-result {
  margin-top: 4px;
}

.hist-title {
  font-size: 13px;
  color: #374151;
  font-weight: 600;
  margin: 14px 0 6px;
}

.hist-table {
  margin-bottom: 4px;
}

.src-inline {
  margin-left: 8px;
  vertical-align: middle;
}

.am-self {
  color: #b45309;
  font-weight: 700;
  background: #fffbeb;
  padding: 0 4px;
  border-radius: 4px;
}

.am-opp {
  color: #374151;
}

.am-vs {
  color: #9ca3af;
  margin: 0 4px;
}

.tags {
  margin-bottom: 10px;
  display: flex;
  gap: 6px;
}

.odds-wrap {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.pager {
  margin-top: 16px;
  display: flex;
  justify-content: center;
}

.load-more {
  margin: 18px 0 8px;
  text-align: center;
  min-height: 24px;
}

.data-banner {
  margin-bottom: 16px;
}

.sentinel {
  height: 1px;
}

.lm-state {
  color: #2563eb;
  font-size: 13px;
}

.lm-tip {
  color: #9ca3af;
  font-size: 12px;
}

.drawer {
  padding: 4px;
}

.demo-alert {
  margin-bottom: 12px;
}

.drawer .head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.ai-entry {
  margin-left: auto;
}

.ai-match {
  margin-bottom: 12px;
  font-size: 15px;
}
.ai-league {
  color: #6b7280;
  font-size: 13px;
  margin-right: 8px;
}
.ai-teams {
  font-weight: 700;
}
.ai-tip {
  margin-bottom: 16px;
}
.ai-form {
  margin-bottom: 8px;
}
.ai-key-hint {
  margin-top: 6px;
  font-size: 12px;
  color: #909399;
  line-height: 1.5;
}
.ai-doc-link {
  color: #2563eb;
  font-size: 13px;
  word-break: break-all;
}
.ai-error {
  margin-top: 12px;
}
.ai-result {
  margin-top: 16px;
  border: 1px solid var(--el-border-color, #ebeef5);
  border-radius: 8px;
  overflow: hidden;
}
.ai-result-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 14px;
  background: var(--el-fill-color-light, #f5f7fa);
  font-weight: 600;
  font-size: 14px;
}
.ai-result-meta {
  font-weight: 400;
  font-size: 12px;
  color: #909399;
}
.ai-result-body {
  padding: 14px;
  white-space: pre-wrap;
  line-height: 1.7;
  font-size: 14px;
  max-height: 50vh;
  overflow: auto;
}

.drawer .scoreline {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 24px;
  margin-bottom: 6px;
}

.side-t {
  display: flex;
  align-items: baseline;
  gap: 6px;
}

.drawer .name {
  font-size: 20px;
  font-weight: 700;
}

.drawer .rank {
  color: #9ca3af;
  font-size: 13px;
}

.drawer .when {
  text-align: center;
  color: #9ca3af;
  font-size: 13px;
  margin-bottom: 6px;
}

.feature-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
  margin-bottom: 4px;
}

.feature-box {
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 8px 10px;
  background: #fff;
}

.fb-title {
  font-weight: 600;
  font-size: 13px;
  color: #111827;
  margin-bottom: 6px;
}

.fb-row {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  padding: 2px 0;
}

.fb-row .side {
  width: 72px;
  flex: 0 0 72px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.fb-row .side.home {
  color: #2563eb;
}

.fb-row .side.away {
  color: #dc2626;
}

.fb-row .wl {
  color: #374151;
}

.fb-row .rate {
  margin-left: auto;
  color: #6b7280;
}

.stand-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  padding: 4px 0;
}

.stand-row .side.home {
  color: #2563eb;
  font-weight: 600;
  min-width: 84px;
}

.stand-row .side.away {
  color: #dc2626;
  font-weight: 600;
  min-width: 84px;
}

.stand-row .rank {
  color: #b45309;
}

.stand-row .wl {
  color: #374151;
}

.stand-row .season {
  margin-left: auto;
  color: #9ca3af;
  font-size: 12px;
}

.src-note {
  margin-top: 10px;
  font-size: 11px;
  color: #9ca3af;
  line-height: 1.5;
}

.stat-line {
  font-size: 12px;
  color: #374151;
  margin: 2px 0 8px;
}

.stat-line b {
  color: #111827;
}

.insight-table {
  margin-bottom: 4px;
}
</style>
