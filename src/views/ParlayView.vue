<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { calcParlay, fetchParlayTypes } from '@/api/sporttery'

interface Leg {
  label: string
  odds: number
  result: 'win' | 'lose' | 'void'
}

const legs = reactive<Leg[]>([
  { label: '场次1 主胜', odds: 1.44, result: 'win' },
  { label: '场次2 主胜', odds: 2.1, result: 'win' },
])

const multiplier = ref(1)
const passTypes = ref<string[]>([])
const passType = ref('2串1')
const result = ref<any>(null)
const loading = ref(false)

function addLeg() {
  legs.push({ label: `场次${legs.length + 1}`, odds: 1.5, result: 'win' })
  refreshPassTypes()
}
function removeLeg(i: number) {
  legs.splice(i, 1)
  refreshPassTypes()
}

function refreshPassTypes() {
  const n = legs.length
  const types = passTypesByM[n]
  passTypes.value = types ? types.map((t) => t.label) : [`${n}串1`]
  if (!passTypes.value.includes(passType.value)) passType.value = passTypes.value[0] || `${n}串1`
}

const passTypesByM = reactive<Record<number, any[]>>({})

onMounted(async () => {
  try {
    const table = await fetchParlayTypes()
    for (const [m, variants] of Object.entries(table)) {
      passTypesByM[Number(m)] = variants as any[]
    }
  } catch {
    /* ignore */
  }
  refreshPassTypes()
})

async function calculate() {
  if (legs.length < 1) {
    ElMessage.warning('至少添加 1 场')
    return
  }
  const cleanLegs = legs.map((l) => ({
    label: l.label,
    odds: Number(l.odds),
    result: l.result,
  }))
  if (cleanLegs.some((l) => !l.odds || l.odds <= 1)) {
    ElMessage.warning('每场赔率必须 > 1')
    return
  }
  loading.value = true
  try {
    result.value = await calcParlay({
      legs: cleanLegs,
      passType: passType.value,
      multiplier: Number(multiplier.value) || 1,
    })
  } catch (e: any) {
    ElMessage.error(e.message || '计算失败')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div v-loading="loading" class="parlay">
    <el-card header="串关方案设置" shadow="never">
      <el-form label-width="80px">
        <el-form-item label="倍数">
          <el-input-number v-model="multiplier" :min="1" :max="50" />
        </el-form-item>
        <el-form-item label="过关方式">
          <el-select v-model="passType" style="width: 200px">
            <el-option v-for="t in passTypes" :key="t" :label="t" :value="t" />
          </el-select>
          <span class="tip">注：单关玩法需 1 场；2串1、3串4 等为官方 M串N 组合</span>
        </el-form-item>
      </el-form>

      <el-table :data="legs" style="margin-top: 8px">
        <el-table-column label="#" width="50" #default="{ $index }">{{ $index + 1 }}</el-table-column>
        <el-table-column label="场次说明" #default="{ row }">
          <el-input v-model="row.label" />
        </el-table-column>
        <el-table-column label="赔率" width="140" #default="{ row }">
          <el-input v-model="row.odds" type="number" step="0.01" />
        </el-table-column>
        <el-table-column label="赛果" width="140" #default="{ row }">
          <el-select v-model="row.result">
            <el-option label="胜/中" value="win" />
            <el-option label="负/错" value="lose" />
            <el-option label="取消(退" value="void" />
          </el-select>
        </el-table-column>
        <el-table-column label="" width="60" #default="{ $index }">
          <el-button text type="danger" :icon="'Delete'" @click="removeLeg($index)" />
        </el-table-column>
      </el-table>

      <div class="actions">
        <el-button @click="addLeg">+ 添加场次</el-button>
        <el-button type="primary" :loading="loading" @click="calculate">计算奖金</el-button>
      </div>
    </el-card>

    <el-card v-if="result" header="计算结果" shadow="never" class="result-card">
      <el-descriptions :column="3" border>
        <el-descriptions-item label="过关方式">{{ result.passType }}</el-descriptions-item>
        <el-descriptions-item label="注数">{{ result.bets }} 注</el-descriptions-item>
        <el-descriptions-item label="倍数">{{ result.multiplier }}</el-descriptions-item>
        <el-descriptions-item label="总投入">{{ result.totalStake }} 元</el-descriptions-item>
        <el-descriptions-item label="理论最高奖金">
          {{ result.maxPayoutCapped }} 元
          <el-tag v-if="result.capped" type="warning" size="small">封顶 500万</el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="实际派奖(按赛果)">{{ result.realizedPayout }} 元</el-descriptions-item>
      </el-descriptions>

      <el-table :data="result.byFold" style="margin-top: 16px" size="small">
        <el-table-column label="串关关数" #default="{ row }">{{ row.size }} 串</el-table-column>
        <el-table-column prop="bets" label="注数" />
        <el-table-column prop="payout" label="全部命中奖金(元)" />
      </el-table>
      <p class="note">单注 2 元；M串N 每注 = 2 × 倍数 × 各场赔率之积；单张彩票封顶 500 万元（竞彩规则）。</p>
    </el-card>
  </div>
</template>

<style scoped>
.tip {
  color: #9ca3af;
  font-size: 12px;
  margin-left: 12px;
}
.actions {
  margin-top: 16px;
}
.result-card {
  margin-top: 16px;
}
.note {
  font-size: 12px;
  color: #6b7280;
  margin: 10px 0 0;
}
</style>
