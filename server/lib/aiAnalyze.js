// AI 赛前分析代理（免费大模型，用户自选供应商 + 自带 Key）。
//
// 设计：
// - 后端只负责“拉取真实战绩/交锋 + 拼装中文分析提示词 + 转发到 OpenAI 兼容 /chat/completions”。
// - 不内置任何密钥；DeepSeek / 豆包(火山方舟) / OpenRouter / 硅基流动 的地址与默认模型
//   仅作预填，用户必须自带 API Key（这些厂商都有免费额度/试用，满足“用免费的就可以”）。
// - 历史数据复用 insight.js 的 teamInsight()：体彩在售比赛走 matchId 真实特征接口，
//   第三方(ESPN)已结束比赛走 homeId/awayId/league 真实战绩接口；都取不到则退化为“仅基于知识的分析”。

import { teamInsight } from './insight.js'

// 供应商预设（baseURL 为 OpenAI 兼容网关；model 为默认模型，用户可在前端覆盖）。
export const PROVIDERS = {
  deepseek: {
    label: 'DeepSeek',
    baseURL: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
    doc: 'https://platform.deepseek.com/',
  },
  doubao: {
    label: '豆包（火山方舟）',
    baseURL: 'https://ark.cn-beijing.volces.com/api/v3',
    // 火山方舟的模型 ID 随端点变化，这里给一个常用默认值，用户需替换为自己的 Endpoint ID
    model: 'doubao-seed-1-6-250615',
    doc: 'https://www.volcengine.com/product/ark',
  },
  openrouter: {
    label: 'OpenRouter',
    baseURL: 'https://openrouter.ai/api/v1',
    model: 'deepseek/deepseek-r1-distill-llama-70b:free',
    doc: 'https://openrouter.ai/',
  },
  siliconflow: {
    label: '硅基流动',
    baseURL: 'https://api.siliconflow.cn/v1',
    model: 'deepseek-ai/DeepSeek-V3',
    doc: 'https://siliconflow.cn/',
  },
  custom: {
    label: '自定义',
    baseURL: '',
    model: '',
    doc: '',
  },
}

function fmtMatch(m) {
  if (!m) return ''
  const score = m.score || '-'
  const r = m.result ? `（${m.result}）` : ''
  const tour = m.tournament ? `[${m.tournament}] ` : ''
  return `${m.matchDate || ''} ${tour}${m.homeName} ${score} ${m.awayName}${r}`
}

function buildPrompt(insight, ctx, hadProbs) {
  const { homeName, awayName } = ctx
  const noData =
    !insight ||
    insight.demo ||
    (!insight.recent?.home?.matches?.length &&
      !insight.recent?.away?.matches?.length &&
      !insight.h2h?.matches?.length)

  // 赔率隐含概率（体彩官方 HAD 去水）——最强的市场预测信号，单列给模型参考
  const oddsLine = (hadProbs && hadProbs.home != null && hadProbs.draw != null && hadProbs.away != null)
    ? `官方赔率隐含概率（HAD 去水）：主胜 ${(hadProbs.home * 100).toFixed(0)}% / 平 ${(hadProbs.draw * 100).toFixed(0)}% / 客胜 ${(hadProbs.away * 100).toFixed(0)}%（这是市场综合评估，请作为重要参考，但可与你的判断结合）。`
    : ''

  const outFmt = [
    `请严格按以下结构输出（共约 600-900 字，尽量详细，不要一笔带过）：`,
    `一、两队近期状态：分别点评主队、客队近期战绩与走势，指出攻防特点。`,
    `二、历史交锋：交锋记录说明了什么趋势。`,
    `三、主客场因素：主场优势对结果的影响。`,
    `四、伤停情况：当前无确切伤停数据——必须明确写"无确切伤停数据"，并基于赛程密度、近期是否有轮换、关键球员是否累积黄牌停赛、近几场出场人员变化等合理推断可能影响；切勿编造具体球员伤情。`,
    `五、战意分析：是否存在一方已提前出线/保级无忧/无欲无求从而可能不全力以赴、或为后续更重要赛事留力轮换；结合赛事阶段判断，明确指出"可能不全力以赴"的情形。`,
    `六、胜负倾向：主胜 / 平 / 客胜，并给出置信度（高/中/低）。`,
    `七、比分预测：给出最可能比分 + 1 个次选比分。`,
    `八、综合结论：一句话总结。`,
  ].join('\n')

  if (noData) {
    return [
      `请基于你自己的足球知识，对以下比赛做详细的 AI 赛前分析：`,
      `主队：${homeName}`,
      `客队：${awayName}`,
      ``,
      oddsLine,
      `请综合考虑：两队历史战绩、历史交锋、主客场因素、人员伤病、战意（是否可能不全力以赴）等。`,
      outFmt,
    ].filter(Boolean).join('\n')
  }

  const h = insight.recent.home
  const a = insight.recent.away
  const h2h = insight.h2h
  const L = []
  L.push(`请基于以下真实数据，对足球比赛做详细的 AI 赛前分析。`)
  L.push(``)
  L.push(`主队：${homeName}（近期战绩 ${h.stat.win}胜 ${h.stat.draw}平 ${h.stat.loss}负，胜率 ${h.stat.winPct}）`)
  L.push(`客队：${awayName}（近期战绩 ${a.stat.win}胜 ${a.stat.draw}平 ${a.stat.loss}负，胜率 ${a.stat.winPct}）`)
  if (insight.head?.tournament) L.push(`赛事：${insight.head.tournament}`)
  if (insight.head?.matchDateTime) L.push(`开赛时间：${insight.head.matchDateTime}`)
  if (oddsLine) L.push(oddsLine)
  L.push(``)
  L.push(`【主队近期战绩】`)
  for (const m of h.matches) L.push(' - ' + fmtMatch(m))
  L.push(``)
  L.push(`【客队近期战绩】`)
  for (const m of a.matches) L.push(' - ' + fmtMatch(m))
  L.push(``)
  if (h2h?.matches?.length) {
    L.push(`【历史交锋】${h2h.stat.win}胜 ${h2h.stat.draw}平 ${h2h.stat.loss}负（主队视角，共 ${h2h.stat.total} 场）`)
    for (const m of h2h.matches) L.push(' - ' + fmtMatch(m))
  } else {
    L.push(`【历史交锋】无交锋记录`)
  }
  L.push(``)
  L.push(`注意：当前未接入实时伤停数据——在"四、伤停情况"中必须明确写"无确切伤停数据"，并结合赛程密度/近期轮换/停赛累积等合理推断，不要编造具体球员伤情。`)
  L.push(`在"五、战意分析"中，必须结合赛事阶段判断是否有一方可能不全力以赴（如已出线/保级无忧/为更重要赛事留力等）；如有该情形，需明确点出。`)
  L.push(outFmt)
  return L.join('\n')
}

// ---- 免 Key 规则速算（基于真实战绩/交锋的统计算法，不依赖任何大模型） ----
function teamGoals(m, isHomeTeam) {
  // 比分可能是 "2:0"（冒号）或 "2-0"（横杠）或全角"2：0"，统一按三种分隔符切
  const sc = (m.score || '').split(/[-:：]/)
  const hg = parseInt(sc[0], 10)
  const ag = parseInt(sc[1], 10)
  if (Number.isNaN(hg) || Number.isNaN(ag)) return null
  const selfHome = m.isSelfHome === true
  // 返回该队"自己的进球/失球"，不论其在即将到来的比赛里是主是客（isHomeTeam 仅保留入参兼容，不参与换算）
  const gf = selfHome ? hg : ag
  const ga = selfHome ? ag : hg
  return { gf, ga }
}

// 近期加权平均：越近的比赛权重越高（matches 默认按时间倒序，index 0 = 最近）
function avgGoals(matches, isHomeTeam) {
  const arr = matches || []
  let gf = 0, ga = 0, wsum = 0
  for (let i = 0; i < arr.length; i++) {
    const g = teamGoals(arr[i], isHomeTeam)
    if (!g) continue
    const w = arr.length - i // 最近一场权重最高
    gf += g.gf * w; ga += g.ga * w; wsum += w
  }
  if (!wsum) return null
  return { gf: gf / wsum, ga: ga / wsum }
}

function heuristicAnalysis(insight, ctx, hadProbs) {
  const { homeName, awayName } = ctx
  const h = insight?.recent?.home
  const a = insight?.recent?.away
  const h2h = insight?.h2h
  const hMatches = h?.matches?.length ? h.matches : null
  const aMatches = a?.matches?.length ? a.matches : null

  // 伤停/战意诚实说明（无免费实时数据源）
  const injurySection = `【伤停情况】无确切伤停数据（体彩/ESPN 免费接口不提供实时伤停）。如需基于赛程密度/轮换/停赛累积的推断，请填入大模型 Key 由 AI 分析。`
  const motiveSection = `【战意分析】无积分/出线形势数据，规则速算无法判断是否可能"不全力以赴"（如已出线/保级无忧/留力等）。如需该判断，请填入大模型 Key 由 AI 结合赛事阶段分析。`

  const hasOdds = hadProbs && hadProbs.home != null && hadProbs.draw != null && hadProbs.away != null
  const hasGoalData = !(!insight || insight.demo || (!hMatches && !aMatches))

  // 既无近期战绩又无赔率：不编造比分
  if (!hasGoalData && !hasOdds) {
    return [
      `【规则速算 · 数据不足，不编造比分】`,
      `暂未获取到 ${homeName} 与 ${awayName} 的近期战绩/交锋/赔率数据，无法给出有依据的速算结果。`,
      ``,
      injurySection,
      ``,
      motiveSection,
      ``,
      `建议：在上方填入任意免费大模型 Key（如 DeepSeek 注册即送 500 万 token、OpenRouter 有 :free 模型），由 AI 给出包含伤停/战意的详细 8 节分析。`,
    ].join('\n')
  }

  // 至少一队有数据：另一队用联赛均值兜底并标注
  const baseline = { gf: 1.35, ga: 1.35 }
  const hg = avgGoals(hMatches, true) || baseline
  const ag = avgGoals(aMatches, false) || baseline
  const hMissing = !hMatches
  const aMissing = !aMatches

  // 预期进球（主场优势 +0.15，避免恒为主胜）
  let homeExp = (hg.gf + ag.ga) / 2 + 0.15
  let awayExp = (ag.gf + hg.ga) / 2 - 0.15
  if (awayExp < 0.15) awayExp = 0.15
  // 交锋微调
  if (h2h?.stat && h2h.stat.total) {
    const hw = h2h.stat.win / h2h.stat.total
    const dw = h2h.stat.draw / h2h.stat.total
    homeExp += (hw - 1 / 3) * 0.3
    awayExp += ((1 - hw - dw) - 1 / 3) * 0.3
  }
  homeExp = Math.max(0.15, homeExp)
  awayExp = Math.max(0.15, awayExp)
  // 三项概率：赔率优先（最强预测信号），否则用进球差
  let pHome, pDraw, pAway
  if (hasOdds) {
    const s = hadProbs.home + hadProbs.draw + hadProbs.away
    pHome = s > 0 ? hadProbs.home / s : 1 / 3
    pDraw = s > 0 ? hadProbs.draw / s : 1 / 3
    pAway = s > 0 ? hadProbs.away / s : 1 / 3
    // 用赔率强度调整预期进球：大热方进更多球、冷门方更少
    homeExp += (pHome - pAway) * 0.7
    awayExp += (pAway - pHome) * 0.7
    homeExp = Math.max(0.15, homeExp)
    awayExp = Math.max(0.15, awayExp)
  } else {
    const diff = homeExp - awayExp
    const T = 0.35
    let pHomeF, pDrawF, pAwayF
    if (diff > T) {
      pDrawF = Math.max(0.1, 0.28 - (diff - T) * 0.3)
      pHomeF = (1 - pDrawF) * (1 / (1 + Math.exp(-diff * 1.2)))
      pAwayF = 1 - pDrawF - pHomeF
    } else if (diff < -T) {
      pDrawF = Math.max(0.1, 0.28 - (-diff - T) * 0.3)
      pAwayF = (1 - pDrawF) * (1 / (1 + Math.exp(diff * 1.2)))
      pHomeF = 1 - pDrawF - pAwayF
    } else {
      const closeness = 1 - Math.abs(diff) / T // 0..1，越接近0越可能平局
      pDrawF = 0.3 + closeness * 0.18 // 0.30..0.48
      pHomeF = (1 - pDrawF) / 2 + diff * 0.15
      pAwayF = 1 - pDrawF - pHomeF
    }
    const sumP = pHomeF + pDrawF + pAwayF
    pHome = pHomeF / sumP
    pDraw = pDrawF / sumP
    pAway = pAwayF / sumP
  }
  const pHomeP = Math.round(pHome * 100)
  const pDrawP = Math.round(pDraw * 100)
  const pAwayP = 100 - pHomeP - pDrawP
  // 倾向 = 概率最高项（与概率一致）
  let tend
  if (pHome >= pDraw && pHome >= pAway) tend = `${homeName} 胜（主胜）`
  else if (pAway >= pHome && pAway >= pDraw) tend = `${awayName} 胜（客胜）`
  else tend = '平局'
  // 用泊松分布选最可能比分（随真实预期变化，不再恒为 2-1）
  function pPois(k, lam) {
    lam = Math.max(0.05, lam)
    let f = 1
    for (let x = 1; x <= k; x++) f *= x
    return Math.exp(-lam) * Math.pow(lam, k) / f
  }
  let best = null, second = null
  for (let i = 0; i <= 5; i++) {
    for (let j = 0; j <= 5; j++) {
      const ok = tend === '平局' ? i === j : tend.includes('主胜') ? i > j : i < j
      if (!ok) continue
      const pr = pPois(i, homeExp) * pPois(j, awayExp)
      if (!best || pr > best.p) { second = best; best = { s: `${i}-${j}`, p: pr } }
      else if (!second || pr > second.p) second = { s: `${i}-${j}`, p: pr }
    }
  }
  const scorePred = best ? best.s : '1-1'
  const scoreAlt = second ? second.s : ''

  const L = []
  L.push(`【规则速算结果 · 无需 Key】${hasOdds ? '（基于官方赔率 + 真实战绩）' : '（基于真实近期战绩与交锋）'}${hMissing || aMissing ? ' · 部分队伍缺近期数据' : ''}`)
  L.push(`【胜负倾向】${tend}`)
  L.push(`【比分预测】${scorePred}${scoreAlt ? `（次选 ${scoreAlt}）` : ''}`)
  L.push(`【概率参考】主胜 ${pHomeP}% / 平 ${pDrawP}% / 客胜 ${pAwayP}%${hasOdds ? '（来源：体彩官方 HAD 赔率去水）' : ''}`)
  L.push(`【关键依据】`)
  L.push(`1. 近期状态：${homeName} ${hMissing ? '无近期数据' : `近 ${h.stat.total} 场 ${h.stat.win}胜${h.stat.draw}平${h.stat.loss}负`}；${awayName} ${aMissing ? '无近期数据' : `近 ${a.stat.total} 场 ${a.stat.win}胜${a.stat.draw}平${a.stat.loss}负`}。`)
  if (h2h?.stat?.total) L.push(`2. 历史交锋：${h2h.stat.win}胜${h2h.stat.draw}平${h2h.stat.loss}负（主队视角，共 ${h2h.stat.total} 场），已计入微调。`)
  else L.push(`2. 历史交锋：无直接交锋记录，主要依据近期状态与主客场。`)
  L.push(`3. 主客场：本场为 ${homeName} 主场，给予约 +0.15 球的主场优势。`)
  L.push(`4. 预期进球：主队约 ${homeExp.toFixed(2)} 球，客队约 ${awayExp.toFixed(2)} 球。`)
  L.push(``)
  L.push(injurySection)
  L.push(``)
  L.push(motiveSection)
  L.push(``)
  L.push(`【说明】此为基于真实数据的统计速算，非 AI 大模型生成，无法覆盖伤停/战意；如需包含伤停/战意的详细分析，请在上方填入免费大模型 Key。`)
  return L.join('\n')
}

/**
 * 执行一次 AI 分析。
 * @param {object} body
 *   provider, apiKey, baseURL?, model?,
 *   matchId?, homeName, awayName, source?, homeId?, awayId?, league?
 * @returns {Promise<{success:boolean, analysis?:string, model?:string, source?:string, error?:string}>}
 */
export async function aiAnalyze(body = {}) {
  const {
    provider,
    apiKey,
    baseURL: baseURLIn,
    model: modelIn,
    matchId,
    homeName,
    awayName,
    source,
    homeId,
    awayId,
    league,
    hadProbs,
  } = body

  const cfg = PROVIDERS[provider] || PROVIDERS.custom
  const baseURL = (baseURLIn || cfg.baseURL || '').replace(/\/+$/, '')
  const model = modelIn || cfg.model

  // 1) 拉取真实战绩 / 交锋（无论是否用 Key 都需要，用于速算或拼提示词）
  let insight = null
  try {
    insight = await teamInsight(
      matchId ? Number(matchId) : null,
      homeName,
      awayName,
      {
        source: source || undefined,
        homeId: homeId ? Number(homeId) : undefined,
        awayId: awayId ? Number(awayId) : undefined,
        league: league || undefined,
      },
    )
  } catch {
    insight = null
  }

  // 2) 免 Key 模式：基于真实战绩 + 赔率的规则速算（无需任何 API Key）
  if (!apiKey) {
    console.log('[ai-analysis] 未填 Key → 走免Key规则速算，不调用大模型、不发提示词')
    const analysis = heuristicAnalysis(insight, { homeName, awayName }, hadProbs)
    return {
      success: true,
      analysis,
      model: '规则速算(无需Key)',
      source: insight?.source,
      dataBacked: !!(insight && !insight.demo) || !!hadProbs,
      heuristic: true,
    }
  }

  if (!baseURL) return { success: false, error: '缺少模型接口地址（baseURL）' }
  if (!model) return { success: false, error: '缺少模型名称（model）' }

  const prompt = buildPrompt(insight, { homeName, awayName }, hadProbs)
  // 调试用：在后端终端打印即将发给大模型的完整提示词（不在浏览器 Network 里，因为这是后端→大模型的服务器请求）
  console.log('[ai-analysis] 即将发给大模型的提示词:\n' + prompt)

  // 3) 转发到 OpenAI 兼容接口
  const url = `${baseURL}/chat/completions`
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), 120_000)
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'system',
            content:
              '你是专业的足球赛事分析助手。请给出详细、客观、有依据的赛前分析。特别注意：1) 伤停情况必须单独成节，无确切数据时明确写"无确切伤停数据"并结合赛程密度/轮换/停赛累积等合理推断，绝不编造具体球员伤情；2) 战意分析必须单独成节，若一方可能不全力以赴（已出线/保级无忧/为更重要赛事留力等），必须明确点出；3) 基于给定的真实历史战绩与交锋记录展开，不要编造不存在的比赛数据。',
          },
          { role: 'user', content: prompt },
        ],
        temperature: 0.7,
      }),
      signal: ac.signal,
    })
    if (!r.ok) {
      const txt = await r.text().catch(() => '')
      return { success: false, error: `模型接口返回 ${r.status}：${txt.slice(0, 300)}`, _debugPrompt: prompt, _debugPayload: { url, model } }
    }
    const j = await r.json()
    const content = j?.choices?.[0]?.message?.content || ''
    if (!content) return { success: false, error: '模型未返回内容', _debugPrompt: prompt, _debugPayload: { url, model } }
    return {
      success: true,
      analysis: content,
      model,
      source: insight?.source,
      dataBacked: !!(insight && !insight.demo),
      // 调试用：把发给大模型的完整提示词回带，方便在浏览器 Network→Response 里查看
      _debugPrompt: prompt,
      _debugPayload: { url, model, insightSource: insight?.source, insightDemo: !!insight?.demo },
    }
  } catch (e) {
    return { success: false, error: e?.name === 'AbortError' ? '请求超时（120s）' : e?.message || '请求失败', _debugPrompt: prompt, _debugPayload: { url, model } }
  } finally {
    clearTimeout(timer)
  }
}
