// 净化队名 / 联赛名。
//
// 体彩 / ESPN 偶发会在队名后追加阶段 / 分组标记，例如：
//   「波特诺[[解放者杯1]]」「帕梅拉斯[[解放者杯2]]」
// 这些中括号是附加的阶段信息，并非队名本身，展示前必须剔除，否则既不美观、
// 又会影响后端的队名匹配（主客识别、胜负判定）。
//
// 统一在解析层做清洗，前端展示层再兜底一次，确保任意来源都干净。

// 匹配：[[xxx]]、[xxx]、【xxx】、〔xxx〕
const BRACKET_RE = /\[\[[^\]]*\]\]|\[[^\]]*\]|【[^】]*】|〔[^〕]*〕/g

export function cleanName(name) {
  if (name === null || name === undefined) return name
  return String(name)
    .replace(BRACKET_RE, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export const cleanTeamName = cleanName
export const cleanLeagueName = cleanName
