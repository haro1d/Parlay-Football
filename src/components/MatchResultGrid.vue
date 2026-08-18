<script setup lang="ts">
import { computed } from 'vue'
import type { MatchResultItem, PoolCode } from '@/types'

const props = defineProps<{
  results?: MatchResultItem[] | null
  compact?: boolean
}>()

// 体彩 5 玩法 code → 中文名 + 排序权重
const POOL_META: Record<string, { name: string; order: number; tag: string }> = {
  HAD: { name: '胜平负', order: 1, tag: 'primary' },
  HHAD: { name: '让球', order: 2, tag: 'success' },
  CRS: { name: '比分', order: 3, tag: 'warning' },
  TTG: { name: '总进球', order: 4, tag: 'info' },
  HAFU: { name: '半全场', order: 5, tag: 'danger' },
}

const ordered = computed(() => {
  if (!props.results?.length) return []
  const out: { item: MatchResultItem; meta: { name: string; order: number; tag: string } }[] = []
  for (const r of props.results) {
    const meta = POOL_META[r.code]
    if (meta) out.push({ item: r, meta })
  }
  out.sort((a, b) => a.meta.order - b.meta.order)
  return out
})

function refundNote(r: MatchResultItem) {
  return r.refundStatus === '1' ? '退' : ''
}
</script>

<template>
  <div v-if="ordered.length" class="result-grid" :class="{ compact }">
    <div v-for="{ item, meta } in ordered" :key="item.code" class="result-cell" :class="meta.tag">
      <span class="pool">{{ meta.name }}</span>
      <span class="desc">
        {{ item.combinationDesc }}
        <small v-if="refundNote(item)" class="refund" title="该玩法退奖">·退</small>
      </span>
      <span v-if="!compact && item.odds" class="odds">赔率 {{ item.odds }}</span>
      <span v-else-if="compact && item.odds" class="odds-sm">{{ item.odds }}</span>
    </div>
  </div>
</template>

<style scoped>
.result-grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 8px;
}
.result-grid.compact {
  gap: 6px;
}
.result-cell {
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  padding: 6px 4px;
  text-align: center;
  background: #fff;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  min-width: 0;
}
.result-grid.compact .result-cell {
  padding: 4px 2px;
}
.pool {
  font-size: 11px;
  color: #6b7280;
  white-space: nowrap;
}
.desc {
  font-size: 14px;
  font-weight: 700;
  color: #111827;
  line-height: 1.2;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}
.result-grid.compact .desc {
  font-size: 13px;
}
.odds {
  font-size: 11px;
  color: #6b7280;
}
.odds-sm {
  font-size: 11px;
  color: #9ca3af;
}
.refund {
  color: #b45309;
  font-weight: 400;
}
/* 玩法色彩左边条 */
.result-cell.primary { border-left: 3px solid #2563eb; }
.result-cell.success { border-left: 3px solid #16a34a; }
.result-cell.warning { border-left: 3px solid #d97706; }
.result-cell.info { border-left: 3px solid #0891b2; }
.result-cell.danger { border-left: 3px solid #dc2626; }
@media (max-width: 560px) {
  .result-grid {
    grid-template-columns: repeat(3, 1fr);
  }
}
</style>
