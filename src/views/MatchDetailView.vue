<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { fetchMatch } from '@/api/sporttery'
import type { Match, PoolCode, Market } from '@/types'
import OddsTable from '@/components/OddsTable.vue'
import ProbabilityChart from '@/components/ProbabilityChart.vue'

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
</script>

<template>
  <div v-loading="loading" class="detail">
    <el-button text :icon="'ArrowLeft'" @click="router.back()">返回</el-button>

    <el-alert v-if="errorMsg" :title="errorMsg" type="error" show-icon class="alert" />
    <el-empty v-else-if="!loading && !match" description="未找到比赛" />

    <template v-if="match">
      <el-card shadow="never" class="summary">
        <div class="head">
          <div>
            <span class="num">{{ match.matchNumStr }}</span>
            <span class="league">{{ match.league.allName }}</span>
          </div>
          <span class="time">{{ match.matchDate }} {{ match.matchTime }}</span>
        </div>
        <div class="scoreline">
          <div class="side">
            <span class="name">{{ match.home.abbName }}</span>
            <span v-if="match.home.rank" class="rank">[{{ match.home.rank }}]</span>
          </div>
          <span class="vs">VS</span>
          <div class="side">
            <span class="name">{{ match.away.abbName }}</span>
            <span v-if="match.away.rank" class="rank">[{{ match.away.rank }}]</span>
          </div>
        </div>
        <div class="tags">
          <el-tag v-if="match.bettingSingle" type="success" effect="plain">单关</el-tag>
          <el-tag v-if="match.bettingAllUp" type="warning" effect="plain">串关</el-tag>
          <el-tag v-for="(_, code) in match.markets" :key="code" effect="plain" size="small">{{ code.toUpperCase() }}</el-tag>
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
  </div>
</template>

<style scoped>
.alert {
  margin: 16px 0;
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
