import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'matches',
      component: () => import('@/views/MatchListView.vue'),
      meta: { title: '比赛列表' },
    },
    {
      path: '/match/:id',
      name: 'match-detail',
      component: () => import('@/views/MatchDetailView.vue'),
      meta: { title: '比赛详情' },
    },
    {
      path: '/analysis',
      name: 'analysis',
      component: () => import('@/views/AnalysisView.vue'),
      meta: { title: '凯利 / 价值分析' },
    },
    {
      path: '/parlay',
      name: 'parlay',
      component: () => import('@/views/ParlayView.vue'),
      meta: { title: '串关计算器' },
    },
    {
      path: '/meta',
      name: 'meta',
      component: () => import('@/views/MetaView.vue'),
      meta: { title: '公式与说明' },
    },
  ],
})

export default router
