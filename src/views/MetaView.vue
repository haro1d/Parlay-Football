<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { fetchMeta } from '@/api/sporttery'

const meta = ref<any>(null)
const loading = ref(false)

const formulaRows = [
  { name: '隐含概率（含水）', formula: '1 / 赔率' },
  { name: '总概率 overround', formula: 'Σ(1 / 赔率)' },
  { name: '返还率 returnRate', formula: '1 / overround' },
  { name: '庄家抽水 margin', formula: '1 − returnRate' },
  { name: '去水概率 noVigProb', formula: '隐含概率 / overround' },
  { name: '真实赔率 fairOdds', formula: '1 / noVigProb' },
  { name: '凯利指数 kelly', formula: '赔率 × 参考概率' },
  { name: '期望值 EV', formula: 'kelly − 1' },
  { name: '凯利仓位', formula: '(b·p − q) / b，b=赔率−1, p=参考概率, q=1−p' },
]

const apiEndpoints = [
  { method: 'GET', path: '/api/matches', desc: '最新赔率 + 派生指标（支持 pools/date/league/matchId 筛选）' },
  { method: 'GET', path: '/api/match/:id', desc: '按 matchId 取单场全部盘口' },
  { method: 'POST', path: '/api/derive', desc: '从赔率推导隐含/去水概率、返还率、真实赔率' },
  { method: 'POST', path: '/api/value', desc: '凯利指数 / 相对参考赔率的价值' },
  { method: 'POST', path: '/api/parlay', desc: '单关 / 过关奖金计算' },
  { method: 'GET', path: '/api/parlay/types', desc: '完整 M串N 对照表' },
  { method: 'GET', path: '/api/meta', desc: '玩法标签、公式、串关表、数据源说明' },
]

onMounted(async () => {
  loading.value = true
  try {
    meta.value = await fetchMeta()
  } catch {
    /* ignore */
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div v-loading="loading" class="meta">
    <el-alert
      type="warning"
      :closable="false"
      title="数据来源与免责声明"
      :description="meta?.disclaimer || '数据仅供分析参考，请理性购彩。'"
      class="alert"
    />

    <el-card header="赔率推导公式" shadow="never" class="block">
      <el-table :data="formulaRows" size="small">
        <el-table-column prop="name" label="指标" width="200" />
        <el-table-column prop="formula" label="计算公式" />
      </el-table>
    </el-card>

    <el-card header="竞彩玩法说明" shadow="never" class="block">
      <el-descriptions :column="1" border>
        <el-descriptions-item label="胜平负 (HAD)">竞猜 90 分钟主队胜 / 平 / 负</el-descriptions-item>
        <el-descriptions-item label="让球胜平负 (HHAD)">官方设定让球数后再猜胜平负（"+为客让主，-为主让客"）</el-descriptions-item>
        <el-descriptions-item label="比分 (CRS)">精确竞猜 90 分钟最终比分（31 个选项）</el-descriptions-item>
        <el-descriptions-item label="总进球 (TTG)">竞猜总进球区间（0/1/2/3/4/5/6/7+）</el-descriptions-item>
        <el-descriptions-item label="半全场 (HAFU)">同时竞猜上半场 + 全场（9 种组合）</el-descriptions-item>
      </el-descriptions>
    </el-card>

    <el-card header="串关规则（木桶原则）" shadow="never" class="block">
      <p class="rule-text">
        单注金额 = <b>2 元</b>；单关 = 2 × 倍数 × 赔率；M串N 每注 = 2 × 倍数 × Π(各场赔率)。
        混合过关最大关数 = 所选玩法中最小的关数限制（胜平负/让球 = 8 关，比分/总进球/半全场 = 6 关）。
        单张彩票封顶 <b>500 万元</b>。
      </p>
    </el-card>

    <el-card header="API 端点" shadow="never" class="block">
      <el-table :data="apiEndpoints" size="small">
        <el-table-column prop="method" label="Method" width="90" />
        <el-table-column prop="path" label="Path" width="220" />
        <el-table-column prop="desc" label="说明" />
      </el-table>
    </el-card>
  </div>
</template>

<style scoped>
.alert {
  margin-bottom: 16px;
}
.block {
  margin-bottom: 16px;
}
.rule-text {
  color: #374151;
  line-height: 1.7;
}
</style>
