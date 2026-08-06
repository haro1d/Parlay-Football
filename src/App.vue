<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()
const activeIndex = computed(() => route.path)
const collapsed = ref(false)
</script>

<template>
  <el-container class="app-root">
    <el-aside :width="collapsed ? '64px' : '220px'" class="app-aside">
      <div v-show="!collapsed" class="brand">
        <span class="brand-logo">⚽</span>
        <span class="brand-name">竞彩数据中心</span>
      </div>
      <el-menu :default-active="activeIndex" router :collapse="collapsed" class="app-menu">
        <el-menu-item index="/">
          <el-icon><List /></el-icon>
          <span>比赛列表</span>
        </el-menu-item>
        <el-menu-item index="/analysis">
          <el-icon><TrendCharts /></el-icon>
          <span>凯利 / 价值分析</span>
        </el-menu-item>
        <el-menu-item index="/parlay">
          <el-icon><Coin /></el-icon>
          <span>串关计算器</span>
        </el-menu-item>
        <el-menu-item index="/meta">
          <el-icon><Document /></el-icon>
          <span>公式与说明</span>
        </el-menu-item>
      </el-menu>
      <div v-show="!collapsed" class="aside-foot">
        数据来源：中国体育彩票竞彩网<br />仅供分析参考 · 理性购彩
      </div>
    </el-aside>

    <el-container>
      <el-header class="app-header">
        <el-button text class="collapse-btn" @click="collapsed = !collapsed" :title="collapsed ? '展开菜单' : '收起菜单'">
          <el-icon size="20"><Expand v-if="collapsed" /><Fold v-else /></el-icon>
        </el-button>
        <span class="header-title">{{ route.meta.title || '竞彩数据' }}</span>
      </el-header>
      <el-main class="app-main">
        <router-view />
      </el-main>
    </el-container>
  </el-container>
</template>

<style scoped>
.app-root {
  height: 100vh;
}
.app-aside {
  background: #1f2937;
  color: #e5e7eb;
  display: flex;
  flex-direction: column;
  transition: width 0.2s ease;
  overflow: hidden;
}
.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 18px 20px;
  font-weight: 700;
  font-size: 18px;
  color: #fff;
  white-space: nowrap;
}
.brand-logo {
  font-size: 24px;
}
.app-menu {
  flex: 1;
  background: transparent;
  border-right: none;
}
.app-menu :deep(.el-menu-item) {
  color: #cbd5e1;
}
.app-menu :deep(.el-menu-item.is-active) {
  background: #374151;
  color: #fff;
}
.app-menu :deep(.el-menu-item:hover) {
  background: #374151;
}
.aside-foot {
  padding: 16px 20px;
  font-size: 12px;
  color: #94a3b8;
  line-height: 1.6;
  border-top: 1px solid #374151;
  white-space: nowrap;
}
.app-header {
  display: flex;
  align-items: center;
  gap: 12px;
  background: #fff;
  border-bottom: 1px solid #e5e7eb;
  padding: 0 16px;
}
.collapse-btn {
  padding: 6px;
}
.header-title {
  font-size: 18px;
  font-weight: 600;
  color: #111827;
}
.app-main {
  background: #f5f7fa;
  padding: 16px;
}
</style>

<style>
/* 去掉页面四周的浏览器默认白边 */
html,
body,
#app {
  height: 100%;
  margin: 0;
  padding: 0;
}
</style>
