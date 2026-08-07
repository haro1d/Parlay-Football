<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { fetchMatches, fetchTeamInsight } from '@/api/sporttery'
import type { MatchListResult, PoolCode, Match, TeamInsight, MatchResult, RealInsight, DemoInsight } from '@/types'
import OddsTable from '@/components/OddsTable.vue'

const loading = ref(false)
const result = ref<MatchListResult | null>(null)
const selectedPools = ref<PoolCode[]>(['had', 'hhad'])
const leagueFilter = ref('')
const searchKw = ref('')
const sortOrder = ref<'results' | 'near' | 'desc' | 'asc'>('results')

function fmtMD(d: string) {
  return d ? d.slice(5) : ''
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
const pageSize = ref(24)
const pageSizeOptions = [12, 24, 48, 100]
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

async function load() {
  loading.value = true
  errorMsg.value = ''
  try {
    result.value = await fetchMatches({
      pools: selectedPools.value.join(','),
      league: leagueFilter.value || undefined,
      keyword: searchKw.value || undefined,
      sort: sortOrder.value,
      page: page.value,
      pageSize: pageSize.value,
    })
  } catch (e: any) {
    errorMsg.value = e.message || '加载失败'
  } finally {
    loading.value = false
  }
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

function onFilterChange() {
  page.value = 1
  load()
}
function onPageChange(p: number) {
  page.value = p
  load()
}
function onPageSizeChange() {
  page.value = 1
  load()
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

// 已结束赛果来源标签（ESPN 免 Key 默认可用，配 Key 后用更全的源）
const finishedTagText = computed(() => {
  const s = result.value?.finishedSource
  if (s === 'third-party:espn') return '近两日赛果 · ESPN(免费)'
  if (s === 'third-party:apifootball') return '近两日赛果 · API-Football'
  if (s === 'third-party:football-data') return '近两日赛果 · football-data'
  return ''
})

const totalPages = computed(() => (result.value ? Math.ceil(result.value.total / pageSize.value) : 1))

onMounted(load)
</script>

<template>
  <div class="list-page">
    <el-card shadow="never" class="filter-bar">
      <div class="filters">
        <span class="f-label">玩法：</span>
        <el-checkbox-group v-model="selectedPools" @change="onFilterChange">
          <el-checkbox v-for="p in poolOptions" :key="p.value" :value="p.value">{{ p.label }}</el-checkbox>
        </el-checkbox-group>
      </div>
      <div class="filters second">
        <el-select
          v-model="leagueFilter"
          placeholder="按联赛筛选（英超/欧冠/世界杯…）"
          clearable
          filterable
          style="width: 220px"
          @change="onFilterChange"
        >
          <el-option v-for="lg in result?.leagues || []" :key="lg.code + lg.abbName" :label="lg.abbName" :value="lg.abbName" />
        </el-select>
        <el-input
          v-model="searchKw"
          placeholder="搜索球队"
          clearable
          style="width: 180px"
          @keyup.enter="onFilterChange"
          @clear="onFilterChange"
        />
        <el-select v-model="sortOrder" style="width: 170px" @change="onFilterChange">
          <el-option label="赛果优先（已结束最新在上）" value="results" />
          <el-option label="临近优先（未来+近两日）" value="near" />
          <el-option label="最新优先" value="desc" />
          <el-option label="最早优先" value="asc" />
        </el-select>
        <el-select v-model="pageSize" style="width: 120px" @change="onPageSizeChange">
          <el-option v-for="s in pageSizeOptions" :key="s" :label="`${s} 条/页`" :value="s" />
        </el-select>
        <el-button type="primary" :loading="loading" @click="load">刷新</el-button>
        <span v-if="result" class="meta-info">
          共 {{ result.total }} 场 ·
          <el-tag v-if="result.source === 'live-sporttery'" type="success" size="small" effect="dark">实时 · 体彩官方</el-tag>
          <el-tag v-else type="warning" size="small" effect="plain">离线示例（非真实数据）</el-tag>
          <el-tag v-if="finishedTagText" type="info" size="small" effect="plain">{{ finishedTagText }}</el-tag>
          <el-tag v-else-if="result.finishedAvailable === false" type="warning" size="small" effect="plain">近两日赛果：未配置 Key</el-tag>
          <el-tag v-if="result._snapshot" type="info" size="small" effect="plain">静态快照 · {{ result.snapshotAt }}</el-tag>
        </span>
        <el-tag v-if="result?.upstreamError" type="danger" size="small">
          官方接口不可用：{{ result.upstreamError }}（已回退示例数据）
        </el-tag>
        <el-tag v-if="errorMsg" type="danger" size="small">{{ errorMsg }}</el-tag>
      </div>
    </el-card>

    <div v-loading="loading" class="cards">
      <el-card
        v-for="m in result?.matches || []"
        :key="m.matchId"
        shadow="hover"
        class="match-card"
        @click="selectMatch(m)"
      >
        <div class="match-top">
          <span class="num">{{ weekdayOf(m) }}</span>
          <span class="league">{{ m.league.abbName }}</span>
          <el-tag v-if="m.statusLabel === '已开售'" size="small" type="success" effect="plain">已开售</el-tag>
          <el-tag v-else size="small" type="info" effect="plain">已完成</el-tag>
          <span class="time">{{ fmtMD(m.matchDate) }} {{ fmtTime(m.matchTime) }}</span>
        </div>
        <div class="teams">
          <div class="team">
            <span class="t-name">{{ m.home.abbName }}</span>
            <span v-if="m.home.rank" class="t-rank">[{{ m.home.rank }}]</span>
          </div>
          <span v-if="m.finished" class="score-final">{{ m.finalScore }}</span>
          <span v-else class="vs">VS</span>
          <div class="team">
            <span class="t-name">{{ m.away.abbName }}</span>
            <span v-if="m.away.rank" class="t-rank">[{{ m.away.rank }}]</span>
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
        <div v-else class="finished-note">最终比分 · 第三方赛果</div>
      </el-card>
    </div>

    <el-empty v-if="!loading && result && !result.total" description="暂无比赛数据" />

    <div class="pager">
      <el-pagination
        :current-page="page"
        :page-size="pageSize"
        :total="result?.total || 0"
        :page-count="totalPages"
        layout="prev, pager, next, jumper, total"
        @current-change="onPageChange"
      />
    </div>

    <!-- 抽屉：点击比赛后展示详情、近期战绩与历史交锋 -->
    <el-drawer v-model="drawerVisible" :size="620" direction="rtl" title="比赛详情 · 战绩与交锋">
      <template v-if="selected">
        <div class="drawer">
          <div class="head">
            <span class="league">{{ selected.league.allName }}</span>
            <el-tag v-if="insight?.demo" size="small" type="warning" effect="plain">演示数据</el-tag>
            <el-tag v-else-if="insight?.source === 'espn'" size="small" type="success" effect="dark">真实数据 · ESPN</el-tag>
            <el-tag v-else size="small" type="success" effect="dark">真实数据 · 体彩官方</el-tag>
          </div>
          <el-alert
            v-if="insight?.demo"
            type="warning"
            :closable="false"
            show-icon
            class="demo-alert"
            title="近期战绩与历史交锋为合成演示数据"
            description="体彩官方在售接口只提供赔率，不公开历史赛果。当前为离线合成数据；联网时会自动拉取体彩官方 getMatchFeatureV1 真实数据。"
          />
          <div class="scoreline">
            <div class="side-t">
              <span class="name">{{ selected.home.abbName }}</span>
              <span v-if="selected.home.rank" class="rank">[{{ selected.home.rank }}]</span>
            </div>
            <span class="vs">VS</span>
            <div class="side-t">
              <span class="name">{{ selected.away.abbName }}</span>
              <span v-if="selected.away.rank" class="rank">[{{ selected.away.rank }}]</span>
            </div>
          </div>
          <div class="when">
            {{ selected.statusLabel }} · {{ weekdayOf(selected) }} {{ fmtMD(selected.matchDate) }} {{ fmtTime(selected.matchTime) }}
          </div>

            <!-- 真实特征分析（体彩官方 getMatchFeatureV1） -->
            <template v-if="real">
              <template v-if="featureBlocks.length">
                <el-divider content-position="left">特征分析（体彩官方）</el-divider>
                <div class="feature-grid">
                  <div v-for="fb in featureBlocks" :key="fb.key" class="feature-box">
                    <div class="fb-title">{{ fb.title }}</div>
                    <div class="fb-row">
                      <span class="side home">{{ real.head.homeName }}</span>
                      <span class="wl">{{ fb.stat?.homeWin }}胜{{ fb.stat?.homeDraw }}平{{ fb.stat?.homeLoss }}负</span>
                      <span class="rate">胜率 {{ fb.stat?.homeWinRate }}%</span>
                    </div>
                    <div class="fb-row">
                      <span class="side away">{{ real.head.awayName }}</span>
                      <span class="wl">{{ fb.stat?.awayWin }}胜{{ fb.stat?.awayDraw }}平{{ fb.stat?.awayLoss }}负</span>
                      <span class="rate">胜率 {{ fb.stat?.awayWinRate }}%</span>
                    </div>
                  </div>
                </div>
              </template>

            <template v-if="standings">
              <el-divider content-position="left">积分榜</el-divider>
              <div class="stand-row">
                <span class="side home">{{ real.head.homeName }}</span>
                <span v-if="standings.home.ranking" class="rank">第 {{ standings.home.ranking }} 名</span>
                <span class="wl">{{ standings.home.win }}胜{{ standings.home.draw }}平{{ standings.home.loss }}负</span>
                <span v-if="standings.home.seasonName" class="season">{{ standings.home.seasonName }}</span>
              </div>
              <div class="stand-row">
                <span class="side away">{{ real.head.awayName }}</span>
                <span v-if="standings.away.ranking" class="rank">第 {{ standings.away.ranking }} 名</span>
                <span class="wl">{{ standings.away.win }}胜{{ standings.away.draw }}平{{ standings.away.loss }}负</span>
                <span v-if="standings.away.seasonName" class="season">{{ standings.away.seasonName }}</span>
              </div>
            </template>

            <!-- 真实逐场比分：近期战绩 + 历史交锋 -->
            <el-divider content-position="left">主队近期战绩 · {{ real.recent.home.teamName }}</el-divider>
            <div class="stat-line" v-if="real.recent.home.stat.total">
              近{{ real.recent.home.stat.total }}场：
              <b>{{ real.recent.home.stat.win }}胜{{ real.recent.home.stat.draw }}平{{ real.recent.home.stat.loss }}负</b>
              · 胜率 {{ real.recent.home.stat.winPct }}
              <template v-if="real.recent.home.stat.goalFor !== undefined">· 进{{ real.recent.home.stat.goalFor }}失{{ real.recent.home.stat.goalAgainst }}</template>
            </div>
            <el-table v-loading="insightLoading" v-if="real.recent.home.matches.length" :data="real.recent.home.matches" size="small" class="insight-table">
              <el-table-column label="日期" width="62">
                <template #default="{ row }">{{ fmtMD(row.matchDate) }}</template>
              </el-table-column>
              <el-table-column label="赛事" width="60" prop="tournament" />
              <el-table-column label="对阵" min-width="160">
                <template #default="{ row }">
                  <span :class="row.homeName === row.selfName ? 'am-self' : 'am-opp'">{{ row.homeName }}</span>
                  <span class="am-vs"> vs </span>
                  <span :class="row.awayName === row.selfName ? 'am-self' : 'am-opp'">{{ row.awayName }}</span>
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

            <el-divider content-position="left">客队近期战绩 · {{ real.recent.away.teamName }}</el-divider>
            <div class="stat-line" v-if="real.recent.away.stat.total">
              近{{ real.recent.away.stat.total }}场：
              <b>{{ real.recent.away.stat.win }}胜{{ real.recent.away.stat.draw }}平{{ real.recent.away.stat.loss }}负</b>
              · 胜率 {{ real.recent.away.stat.winPct }}
              <template v-if="real.recent.away.stat.goalFor !== undefined">· 进{{ real.recent.away.stat.goalFor }}失{{ real.recent.away.stat.goalAgainst }}</template>
            </div>
            <el-table v-loading="insightLoading" v-if="real.recent.away.matches.length" :data="real.recent.away.matches" size="small" class="insight-table">
              <el-table-column label="日期" width="62">
                <template #default="{ row }">{{ fmtMD(row.matchDate) }}</template>
              </el-table-column>
              <el-table-column label="赛事" width="60" prop="tournament" />
              <el-table-column label="对阵" min-width="160">
                <template #default="{ row }">
                  <span :class="row.homeName === row.selfName ? 'am-self' : 'am-opp'">{{ row.homeName }}</span>
                  <span class="am-vs"> vs </span>
                  <span :class="row.awayName === row.selfName ? 'am-self' : 'am-opp'">{{ row.awayName }}</span>
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

            <el-divider content-position="left">历史交锋 · 结果按 {{ real.h2h.primary }} 视角</el-divider>
            <div class="stat-line" v-if="real.h2h.stat.total">
              近{{ real.h2h.stat.total }}场交锋：
              <b>{{ real.h2h.stat.win }}胜{{ real.h2h.stat.draw }}平{{ real.h2h.stat.loss }}负</b>
              · 胜率 {{ real.h2h.stat.winPct }}
            </div>
            <el-table v-loading="insightLoading" v-if="real.h2h.matches.length" :data="real.h2h.matches" size="small" class="insight-table">
              <el-table-column label="日期" width="62">
                <template #default="{ row }">{{ fmtMD(row.matchDate) }}</template>
              </el-table-column>
              <el-table-column label="赛事" width="60" prop="tournament" />
              <el-table-column label="对阵" min-width="160">
                <template #default="{ row }">
                  <span :class="row.homeName === row.selfName ? 'am-self' : 'am-opp'">{{ row.homeName }}</span>
                  <span class="am-vs"> vs </span>
                  <span :class="row.awayName === row.selfName ? 'am-self' : 'am-opp'">{{ row.awayName }}</span>
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
              数据来源：中国体育彩票竞彩网 getMatchHeadV1 / getMatchFeatureV1 / getResultHistoryV1 / getMatchResultV1（与体彩 App 同源，页面注明"本页面部分数据来源于第三方"）。
            </p>
          </template>

          <!-- 演示数据回退（离线 / 官方接口不可达） -->
          <template v-else-if="demo">
            <el-divider content-position="left">主队近期战绩</el-divider>
            <el-table v-loading="insightLoading" :data="demo?.home.recent || []" size="small">
              <el-table-column label="日期" width="64">
                <template #default="{ row }">{{ fmtMD(row.date) }}</template>
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
              <el-table-column label="日期" width="64">
                <template #default="{ row }">{{ fmtMD(row.date) }}</template>
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
              <el-table-column label="日期" width="64">
                <template #default="{ row }">{{ fmtMD(row.date) }}</template>
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
            <el-alert
              type="info"
              :closable="false"
              show-icon
              class="demo-alert"
              title="实时分析需要后端服务"
              description="当前为静态预览部署，未运行 Node 后端，无法拉取实时战绩与交锋。本地或 Render 部署可查看完整实时数据。"
            />
          </template>
        </div>
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
