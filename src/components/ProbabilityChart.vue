<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch } from 'vue'
import * as echarts from 'echarts'

const props = defineProps<{
  // [{ label, impliedProb, noVigProb }]
  data: { label: string; impliedProb: number; noVigProb: number }[]
  title?: string
}>()

const el = ref<HTMLElement>()
let chart: echarts.ECharts | null = null

function render() {
  if (!chart) return
  const labels = props.data.map((d) => d.label)
  chart.setOption({
    title: props.title ? { text: props.title, left: 'center', textStyle: { fontSize: 14 } } : undefined,
    tooltip: { trigger: 'axis', valueFormatter: (v: number) => (v * 100).toFixed(2) + '%' },
    legend: { bottom: 0, data: ['含水概率', '去水概率'] },
    grid: { top: 40, left: 10, right: 10, bottom: 50, containLabel: true },
    xAxis: { type: 'category', data: labels, axisLabel: { interval: 0, rotate: labels.length > 4 ? 30 : 0 } },
    yAxis: {
      type: 'value',
      axisLabel: { formatter: (v: number) => (v * 100).toFixed(0) + '%' },
    },
    series: [
      {
        name: '含水概率',
        type: 'bar',
        data: props.data.map((d) => d.impliedProb),
        itemStyle: { color: '#93c5fd' },
      },
      {
        name: '去水概率',
        type: 'bar',
        data: props.data.map((d) => d.noVigProb),
        itemStyle: { color: '#2563eb' },
      },
    ],
  })
}

function resize() {
  chart?.resize()
}

onMounted(() => {
  chart = echarts.init(el.value!)
  render()
  window.addEventListener('resize', resize)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', resize)
  chart?.dispose()
})

watch(() => props.data, render, { deep: true })
</script>

<template>
  <div ref="el" class="prob-chart"></div>
</template>

<style scoped>
.prob-chart {
  width: 100%;
  height: 280px;
}
</style>
