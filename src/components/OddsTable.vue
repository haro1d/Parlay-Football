<script setup lang="ts">
import { computed } from 'vue'
import type { Market } from '@/types'

const props = defineProps<{ market: Market; compact?: boolean }>()

// 胜平负 / 让球胜平负 只有 3 个选项，强制单行不换行；比分/总进球/半全场选项多则允许换行。
const singleRow = computed(() => (props.market.outcomes?.length ?? 0) <= 3)

function trendColor(t: string) {
  if (t === 'up') return '#ef4444' // 涨 = 红 (中国习惯)
  if (t === 'down') return '#22c55e' // 跌 = 绿
  return ''
}
function trendIcon(t: string) {
  if (t === 'up') return '↑'
  if (t === 'down') return '↓'
  return ''
}
</script>

<template>
  <div class="odds-table" :class="{ compact, singleRow }">
    <div class="odds-head">
      <span class="pool-name">{{ market.poolNameZh }}</span>
      <span v-if="market.goalLine !== undefined" class="goal">主让 {{ market.goalLine > 0 ? '+' : '' }}{{ market.goalLine }}</span>
      <span v-if="market.returnRate !== undefined" class="rr">返还率 {{ (market.returnRate * 100).toFixed(1) }}%</span>
    </div>
    <div class="odds-body">
      <div v-for="o in market.outcomes" :key="o.code" class="odds-cell" :title="`去水概率 ${(o.noVigProb! * 100).toFixed(1)}%`">
        <span class="label">{{ o.labelZh }}</span>
        <span class="odds" :style="trendColor(o.trend) ? { color: trendColor(o.trend) } : {}">
          {{ o.odds.toFixed(2) }}
          <small v-if="trendIcon(o.trend)" class="trend">{{ trendIcon(o.trend) }}</small>
        </span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.odds-table {
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  overflow: hidden;
  background: #fff;
}
.odds-head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  background: #f8fafc;
  border-bottom: 1px solid #e5e7eb;
  font-size: 13px;
}
.pool-name {
  font-weight: 600;
  color: #111827;
}
.goal {
  color: #b45309;
}
.rr {
  margin-left: auto;
  color: #6b7280;
}
.odds-body {
  display: flex;
  flex-wrap: wrap;
}
.odds-table.singleRow .odds-body {
  flex-wrap: nowrap;
}
.odds-cell {
  flex: 1 1 auto;
  min-width: 72px;
  padding: 8px 10px;
  text-align: center;
  border-right: 1px solid #f1f5f9;
  border-bottom: 1px solid #f1f5f9;
}
.odds-table.singleRow .odds-cell {
  flex: 1 1 0;
  min-width: 0;
}
.odds-cell:last-child {
  border-right: none;
}
.label {
  display: block;
  font-size: 12px;
  color: #6b7280;
}
.odds {
  font-size: 16px;
  font-weight: 700;
  color: #111827;
}
.trend {
  font-size: 11px;
}
.compact .odds {
  font-size: 14px;
}
</style>
