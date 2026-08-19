<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { fetchMatch, fetchAiAnalysis } from '@/api/sporttery'
import type { Match, PoolCode, Market } from '@/types'
import OddsTable from '@/components/OddsTable.vue'
import ProbabilityChart from '@/components/ProbabilityChart.vue'
import { MagicStick } from '@element-plus/icons-vue'
import { zhTeam, zhLeagueName } from '@/translate'

const route = useRoute()
const router = useRouter()
const loading = ref(false)
const match = ref<Match | null>(null)
const errorMsg = ref('')

const activePool = ref<PoolCode>('had')

const poolList = computed<PoolCode[]>(() =>
  match.value ? (Object.keys(match.value.markets) as PoolCode[]) : [],
)

const currentMarket = computed<Market | null>(() => {
  if (!match.value) return null
  return match.value.markets[activePool.value] || null
})

const chartData = computed(() => {
  if (!currentMarket.value) return []
  return currentMarket.value.outcomes.map((o) => ({
    label: o.labelZh,
    impliedProb: o.impliedProb || 0,
    noVigProb: o.noVigProb || 0,
  }))
})

async function load() {
  loading.value = true
  errorMsg.value = ''
  try {
    match.value = await fetchMatch(Number(route.params.id))
    if (poolList.value.length) activePool.value = poolList.value[0]!
  } catch (e: any) {
    errorMsg.value = e.message || '加载失败'
  } finally {
    loading.value = false
  }
}

onMounted(load)

// ---- AI 赛前分析（免费大模型，用户自选供应商 + 自带 Key） ----
// 是否为“还没开始”的对局：已结束（FT / 已完成 / finished）则不展示分析按钮
function isUpcoming(m: Match | null): boolean {
  if (!m) return false
  if (m.finished) return false
  if (m.status === 'FT') return false
  if (m.statusLabel === '已完成') return false
  return true
}

const PROVIDER_OPTIONS = [
  { value: 'deepseek', label: 'DeepSeek', baseURL: 'https://api.deepseek.com/v1', model: 'deepseek-chat', doc: 'https://platform.deepseek.com/' },
  { value: 'doubao', label: '豆包（火山方舟）', baseURL: 'https://ark.cn-beijing.volces.com/api/v3', model: 'doubao-seed-1-6-250615', doc: 'https://www.volcengine.com/product/ark' },
  { value: 'openrouter', label: 'OpenRouter（免费模型多）', baseURL: 'https://openrouter.ai/api/v1', model: 'deepseek/deepseek-r1-distill-llama-70b:free', doc: 'https://openrouter.ai/' },
  { value: 'siliconflow', label: '硅基流动', baseURL: 'https://api.siliconflow.cn/v1', model: 'deepseek-ai/DeepSeek-V3', doc: 'https://siliconflow.cn/' },
  { value: 'custom', label: '自定义', baseURL: '', model: '', doc: '' },
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
const aiNoKeyHint = ref(false)

function loadSettings() {
  try {
    const s = JSON.parse(localStorage.getItem(LS_KEY) || '{}')
    if (s.provider) aiProvider.value = s.provider
    if (s.apiKey) aiApiKey.value = s.apiKey
    if (s.baseURL) aiBaseURL.value = s.baseURL
    if (s.model) aiModel.value = s.model
  } catch { }
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
  if (!match.value) return
  // 未填 Key：走“免 Key 规则速算”（基于真实战绩/交锋，无需任何大模型 Key）
  if (!aiApiKey.value) {
    aiNoKeyHint.value = true
  } else {
    aiNoKeyHint.value = false
  }
  aiLoading.value = true
  aiError.value = ''
  aiResult.value = ''
  try {
    const data = await fetchAiAnalysis({
      provider: aiProvider.value,
      apiKey: aiApiKey.value,
      baseURL: aiBaseURL.value,
      model: aiModel.value,
      matchId: match.value.matchId,
      homeName: match.value.home.abbName,
      awayName: match.value.away.abbName,
      source: match.value.resultSource || undefined,
      homeId: match.value.homeId,
      awayId: match.value.awayId,
      league: match.value.league?.code,
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
</script>

<template>
  <div v-loading="loading" class="detail">
    123
    <div class="topbar">
      <el-button text :icon="'ArrowLeft'" @click="router.back()">返回</el-button>
      <el-button v-if="isUpcoming(match)" type="primary" :loading="aiLoading" @click="openAi">
        <el-icon style="margin-right: 4px">
          <MagicStick />
        </el-icon> AI 分析
      </el-button>
    </div>

    <el-alert v-if="errorMsg" :title="errorMsg" type="error" show-icon class="alert" />
    <el-empty v-else-if="!loading && !match" description="未找到比赛" />

    <template v-if="match">
      <el-card shadow="never" class="summary">
        <div class="head">
          <div>
            <span class="num">{{ match.matchNumStr }}</span>
            <span class="league">{{ zhLeagueName(match.league) }}</span>
          </div>
          <span class="time">{{ match.matchDate }} {{ match.matchTime }}</span>
        </div>
        <div class="scoreline">
          <div class="side">
            <span class="name">{{ zhTeam(match.home.abbName) }}</span>
            <span v-if="match.home.rank" class="rank">{{ match.home.rank }}</span>
          </div>
          <span class="vs">VS</span>
          <div class="side">
            <span class="name">{{ zhTeam(match.away.abbName) }}</span>
            <span v-if="match.away.rank" class="rank">{{ match.away.rank }}</span>
          </div>
        </div>
        <div class="tags">
          <el-tag v-if="match.bettingSingle" type="success" effect="plain">单关</el-tag>
          <el-tag v-if="match.bettingAllUp" type="warning" effect="plain">串关</el-tag>
          <el-tag v-for="(_, code) in match.markets" :key="code" effect="plain" size="small">{{ code.toUpperCase()
          }}</el-tag>
        </div>
      </el-card>

      <div class="layout">
        <div class="left">
          <el-radio-group v-model="activePool" class="pool-switch">
            <el-radio-button v-for="p in poolList" :key="p" :value="p">{{ p.toUpperCase() }}</el-radio-button>
          </el-radio-group>
          <OddsTable v-if="currentMarket" :market="currentMarket" :compact="false" />
          <div v-if="currentMarket" class="metrics">
            <el-statistic title="总概率 (overround)" :value="currentMarket.overround || 0" :precision="4" />
            <el-statistic title="返还率" :value="((currentMarket.returnRate || 0) * 100)" :precision="2" suffix="%" />
            <el-statistic title="庄家抽水" :value="((currentMarket.margin || 0) * 100)" :precision="2" suffix="%" />
          </div>
        </div>
        <div class="right">
          <el-card shadow="never" header="概率分布（含水 vs 去水）">
            <ProbabilityChart :data="chartData" :title="currentMarket?.poolNameZh" />
          </el-card>
        </div>
      </div>
    </template>

    <!-- 赛前 AI 分析对话框 -->
    <el-dialog v-model="aiDialog" title="AI 赛前分析" width="760px" top="6vh" destroy-on-close>
      <div v-if="match" class="ai-match">
        <span class="ai-league">{{ zhLeagueName(match.league) }}</span>
        <span class="ai-teams">{{ zhTeam(match.home.abbName) }} VS {{ zhTeam(match.away.abbName) }}</span>
      </div>
      <el-alert type="info" :closable="false" show-icon class="ai-tip"
        title="分析使用你自带的免费大模型 Key，仅转发到你选择的模型网关，不会上传到任何第三方服务器。" />
      <el-alert v-if="!aiApiKey" type="warning" :closable="false" show-icon class="ai-tip"
        title="未填写 Key：将使用「免 Key 规则速算」" description="基于两队真实近期战绩与交锋给出统计预测，无需申请任何大模型 Key。想用 AI 大模型分析，请在下方填入 Key。" />

      <el-form label-width="92px" class="ai-form">
        <el-form-item label="模型供应商">
          <el-select v-model="aiProvider" @change="onProviderChange" style="width: 100%">
            <el-option v-for="o in PROVIDER_OPTIONS" :key="o.value" :label="o.label" :value="o.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="API Key">
          <el-input v-model="aiApiKey" type="password" show-password placeholder="粘贴你在该厂商申请的免费 API Key（留空=免 Key 规则速算）"
            @input="saveSettings" />
          <div class="ai-key-hint">不填也能用：留空即走「免 Key 规则速算」，基于真实战绩给出胜负+比分；填了 Key 则由你选的 AI 大模型分析。</div>
        </el-form-item>
        <el-form-item label="接口地址">
          <el-input v-model="aiBaseURL" placeholder="OpenAI 兼容 /chat/completions 网关地址" @input="saveSettings" />
        </el-form-item>
        <el-form-item label="模型名称">
          <el-input v-model="aiModel" placeholder="如 deepseek-chat" @input="saveSettings" />
        </el-form-item>
        <el-form-item v-if="PROVIDER_OPTIONS.find((o) => o.value === aiProvider)?.doc" label="申请地址">
          <a :href="PROVIDER_OPTIONS.find((o) => o.value === aiProvider)!.doc" target="_blank" rel="noopener">
            {{PROVIDER_OPTIONS.find((o) => o.value === aiProvider)!.doc}}
          </a>
        </el-form-item>
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
  </div>
</template>

<style scoped>
.alert {
  margin: 16px 0;
}

.topbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
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

.summary {
  margin: 16px 0;
}

.head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.num {
  font-weight: 700;
  color: #2563eb;
  margin-right: 8px;
}

.league {
  color: #6b7280;
  font-size: 13px;
}

.time {
  color: #9ca3af;
  font-size: 13px;
}

.scoreline {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 24px;
  margin-bottom: 12px;
}

.side {
  display: flex;
  align-items: baseline;
  gap: 6px;
}

.name {
  font-size: 24px;
  font-weight: 700;
}

.rank {
  color: #9ca3af;
  font-size: 14px;
}

.vs {
  color: #d1d5db;
  font-size: 16px;
}

.tags {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.layout {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.pool-switch {
  margin-bottom: 12px;
}

.metrics {
  display: flex;
  gap: 24px;
  margin-top: 16px;
  flex-wrap: wrap;
}

@media (max-width: 900px) {
  .layout {
    grid-template-columns: 1fr;
  }
}
</style>
