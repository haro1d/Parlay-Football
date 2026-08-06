<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { fetchMatches } from '@/api/sporttery'
import type { Match, Market } from '@/types'

const loading = ref(false)
const matches = ref<Match[]>([])
const sortBy = ref<'margin-asc' | 'margin-desc'>('margin-asc')
const selected = ref<Match | null>(null)
const errorMsg = ref('')

interface Row {
  match: Match
  returnRate: number
  margin: number
}

const rows = computed<Row[]>(() => {
  const list: Row[] = []
  for (const m of matches.value) {
    const had = m.markets.had
    if (!had || had.returnRate === undefined || had.margin === undefined) continue
    list.push({ match: m, returnRate: had.returnRate, margin: had.margin })
  }
  list.sort((a, b) => (sortBy.value === 'margin-asc' ? a.margin - b.margin : b.margin - a.margin))
  return list
})

const marginType = (m: number) => (m < 0.08 ? 'success' : m < 0.1 ? 'info' : 'warning')

const selectedMarkets = computed(() => {
  if (!selected.value) return [] as { pool: Market; name: string }[]
  return (Object.keys(selected.value.markets) as (keyof typeof selected.value.markets)[])
    .map((k) => ({ pool: selected.value!.markets[k]!, name: selected.value!.markets[k]!.poolNameZh }))
})

async function load() {
  loading.value = true
  errorMsg.value = ''
  try {
    const data = await fetchMatches({ pools: 'had,hhad', pageSize: 300, sort: 'desc' })
    matches.value = data.matches
    selected.value = data.matches.find((m) => m.markets.had) || data.matches[0] || null
  } catch (e: any) {
    errorMsg.value = e.message || '加载失败'
  } finally {
    loading.value = false
  }
}

function onRowClick(row: Row) {
  selected.value = row.match
}

onMounted(load)
</script>

<template>
  <div v-loading="loading" class="analysis">
    <el-alert
      type="info"
      :closable="false"
      title="竞彩为单一博彩方赔率，无第三方参考盘，因此本页以『庄家抽水 / 返还率』衡量价值：抽水越低，理论价值越高。所有数据仅供分析参考。"
    />

    <div class="toolbar">
      <span>排序：</span>
      <el-radio-group v-model="sortBy">
        <el-radio-button value="margin-asc">抽水最低优先</el-radio-button>
        <el-radio-button value="margin-desc">抽水最高优先</el-radio-button>
      </el-radio-group>
      <el-tag v-if="errorMsg" type="danger" size="small">{{ errorMsg }}</el-tag>
    </div>

    <el-table :data="rows" size="small" @row-click="onRowClick" highlight-current-row>
      <el-table-column label="联赛" width="90">
        <template #default="{ row }">{{ row.match.league.abbName }}</template>
      </el-table-column>
      <el-table-column label="对阵" min-width="160">
        <template #default="{ row }">
          {{ row.match.home.abbName }} <span class="vs">VS</span> {{ row.match.away.abbName }}
        </template>
      </el-table-column>
      <el-table-column label="时间" width="130">
        <template #default="{ row }">{{ row.match.matchDate }} {{ row.match.matchTime }}</template>
      </el-table-column>
      <el-table-column label="返还率" width="90">
        <template #default="{ row }">{{ (row.returnRate * 100).toFixed(2) }}%</template>
      </el-table-column>
      <el-table-column label="庄家抽水" width="100">
        <template #default="{ row }">
          <el-tag :type="marginType(row.margin)" size="small">{{ (row.margin * 100).toFixed(2) }}%</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="主胜(含水→去水)" min-width="160">
        <template #default="{ row }">
          <span v-for="o in row.match.markets.had.outcomes" :key="o.code">
            <template v-if="o.key === 'home'">{{ (o.impliedProb * 100).toFixed(1) }}% → {{ (o.noVigProb * 100).toFixed(1) }}%</template>
          </span>
        </template>
      </el-table-column>
      <el-table-column label="平(含水→去水)" min-width="150">
        <template #default="{ row }">
          <span v-for="o in row.match.markets.had.outcomes" :key="o.code">
            <template v-if="o.key === 'draw'">{{ (o.impliedProb * 100).toFixed(1) }}% → {{ (o.noVigProb * 100).toFixed(1) }}%</template>
          </span>
        </template>
      </el-table-column>
      <el-table-column label="主负(含水→去水)" min-width="150">
        <template #default="{ row }">
          <span v-for="o in row.match.markets.had.outcomes" :key="o.code">
            <template v-if="o.key === 'away'">{{ (o.impliedProb * 100).toFixed(1) }}% → {{ (o.noVigProb * 100).toFixed(1) }}%</template>
          </span>
        </template>
      </el-table-column>
    </el-table>

    <el-card v-if="selected" shadow="never" class="detail">
      <template #header>
        <span class="detail-title">
          {{ selected.league.allName }} · {{ selected.home.abbName }} VS {{ selected.away.abbName }}
        </span>
        <span class="detail-sub">{{ selected.matchDate }} {{ selected.matchTime }}</span>
      </template>
      <div v-for="mk in selectedMarkets" :key="mk.name" class="market-block">
        <div class="market-name">
          {{ mk.name }}
          <span v-if="mk.pool.goalLine !== undefined" class="goal">让球 {{ mk.pool.goalLine > 0 ? '+' : '' }}{{ mk.pool.goalLine }}</span>
          <span class="market-margin">返还率 {{ ((mk.pool.returnRate || 0) * 100).toFixed(2) }}% · 抽水 {{ ((mk.pool.margin || 0) * 100).toFixed(2) }}%</span>
        </div>
        <el-table :data="mk.pool.outcomes" size="small">
          <el-table-column prop="labelZh" label="选项" />
          <el-table-column prop="odds" label="赔率" width="90" />
          <el-table-column label="含水概率">
            <template #default="{ row }">{{ ((row.impliedProb || 0) * 100).toFixed(1) }}%</template>
          </el-table-column>
          <el-table-column label="去水概率">
            <template #default="{ row }">{{ ((row.noVigProb || 0) * 100).toFixed(1) }}%</template>
          </el-table-column>
          <el-table-column label="真实赔率" prop="fairOdds" width="90" />
        </el-table>
      </div>
    </el-card>
  </div>
</template>

<style scoped>
.analysis {
  max-width: 1280px;
}
.toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 16px 0;
  color: #374151;
  font-size: 14px;
}
.vs {
  color: #9ca3af;
  font-size: 12px;
  margin: 0 2px;
}
.detail {
  margin-top: 16px;
}
.detail-title {
  font-weight: 700;
}
.detail-sub {
  color: #9ca3af;
  font-size: 13px;
  margin-left: 10px;
}
.market-block {
  margin-bottom: 16px;
}
.market-name {
  font-weight: 600;
  margin-bottom: 8px;
  display: flex;
  align-items: center;
  gap: 10px;
}
.goal {
  color: #2563eb;
  font-size: 12px;
}
.market-margin {
  color: #6b7280;
  font-size: 12px;
  margin-left: auto;
}
</style>
