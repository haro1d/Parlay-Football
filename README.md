# 竞彩足球数据分析中心 (Vue 3)

一个基于 Vue 3 + Element Plus + ECharts 的竞彩足球赔率数据查看与分析前端，配合本地轻量
Node 后端（复用中国体育彩票竞彩网官方接口逻辑 + 计算引擎）提供数据。

## 功能

- **比赛列表（主从布局）**：左侧为比赛卡片列表，右侧点选后展开该场详情。
  - 按玩法（胜平负 / 让球 / 比分 / 总进球 / 半全场）多选筛选。
  - 按联赛筛选（英超 / 欧冠 / 世界杯 / 西甲 / 意甲 / 德甲 / 法甲 / 中超 …，下拉自动列出数据中所有联赛）。
  - 球队关键词搜索；支持「最新优先 / 最早优先」排序；分页浏览。
  - 离线兜底数据覆盖 8 个联赛、共 64 场，便于演示与离线分析。
- **球队战绩与交锋（右侧面板）**：选中一场后，展示主队近期战绩、客队近期战绩、两队历史交锋记录（含日期 / 对手 / 主客 / 比分 / 胜负）。
  - 注：竞彩官方接口不提供历史战绩，该数据为确定性合成的演示数据，用于呈现分析面板。接入真实数据源（如 football-data.org / 火星数据）即可替换为真实战绩。
- **凯利 / 价值分析（只读）**：不再有可编辑输入，直接展示所有场次的庄家抽水 / 返还率，可按抽水高低排序高亮，
  点击某场查看其各玩法（胜平负 / 让球等）的含水概率、去水概率与真实赔率。竞彩为单一博彩方赔率，价值以抽水衡量。
- **串关计算器**：M串N 组合、倍数、单注/实际派奖计算，内置官方串关表与 500 万封顶规则。
- **公式与说明**：赔率推导公式、玩法说明、API 端点一览。

## 目录结构

```
src/
  api/sporttery.js        # 后端 API 客户端
  components/
    OddsTable.vue         # 赔率表组件
    ProbabilityChart.vue  # ECharts 概率图
  views/
    MatchListView.vue     # 比赛列表
    MatchDetailView.vue   # 比赛详情
    AnalysisView.vue      # 凯利/价值分析
    ParlayView.vue        # 串关计算器
    MetaView.vue          # 公式与说明
  types.ts                # 数据类型定义
server/
  server.js               # 本地 API 服务（端口 8787）
  lib/                    # derive / parlay / labels / parse 计算引擎
  sample.json             # 离线兜底示例数据
```

## 运行

后端（端口 8787）与前端（端口 5173，Vite 代理 /api → 8787）需同时运行。

```bash
# 1. 安装依赖
npm install

# 2. 启动后端（另开一个终端）
npm run server

# 3. 启动前端（另开一个终端）
npm run dev
```

或一行启动两者（后端 + 前端）：

```bash
npm run dev:all
```

打开 http://localhost:5173 即可。

> 后端会先尝试直连竞彩官方接口，若被地域封锁/离线则自动回退到内置的多联赛示例数据（由 `server/lib/sampleData.js` 生成），
> 计算类功能（凯利、串关、推导）完全离线可用。

## 后端 API

| 端点 | 说明 |
| --- | --- |
| `GET /api/matches` | 比赛列表，支持 `pools` / `league` / `keyword` / `sort`(desc\|asc) / `page` / `pageSize` |
| `GET /api/match/:id` | 单场比赛详情 |
| `GET /api/team-insight?home=&away=` | 两队近期战绩 + 历史交锋（演示数据） |
| `POST /api/derive` | 赔率推导（隐含/去水概率、返还率、抽水） |
| `POST /api/value` | 凯利 / 价值对比（offered vs reference） |
| `POST /api/parlay` | 串关派奖计算 |
| `GET /api/parlay/types` | 串关组合类型表 |
| `GET /api/meta` | 玩法、公式、参数常量 |

> 修改后端代码后需**重启** `npm run server` 才能生效（Node 不会热更新）。

## 数据来源与免责声明

数据来自中国体育彩票竞彩网公开 Web 接口（非官方读取），全部知识产权归中国体育彩票所有。
**仅供分析参考，不构成任何投注建议。博彩有风险，请理性购彩。**
