// Offline fallback dataset with multiple leagues so the UI demonstrates
// league filtering, pagination and sorting even when the upstream
// (webapi.sporttery.cn) is unreachable or geo-blocked.
//
// The output shape mirrors the upstream payload consumed by parseUpstream:
//   { value: { lastUpdateTime, matchInfoList: [ { matchNumDate, subMatchList: [ ... ] } ] } }

function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const MARGIN = 0.089; // ~8.9% 竞彩 typical vig
const lo = (x, m) => Math.max(m, x);
const r2 = (x) => Math.round(x * 100) / 100;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

function oddsFromProbs(probs) {
  const sum = probs.reduce((a, b) => a + b, 0) || 1;
  return probs.map((p) => r2(1 / ((p / sum) * (1 - MARGIN))));
}

function fact(n) {
  let r = 1;
  for (let i = 2; i <= n; i++) r *= i;
  return r;
}

// 胜平负
function genHad(sd) {
  let h = 0.42 + 0.2 * sd;
  let d = 0.27;
  let a = 1 - h - d;
  h = lo(h, 0.12);
  d = lo(d, 0.12);
  a = lo(a, 0.12);
  const s = h + d + a;
  return oddsFromProbs([h / s, d / s, a / s]);
}

// 让球胜平负
function genHhad(sd, rng) {
  let gl;
  if (sd > 0.28) gl = rng() < 0.5 ? -1 : -2;
  else if (sd < -0.28) gl = rng() < 0.5 ? 1 : 2;
  else gl = rng() < 0.5 ? 0 : -1;
  let hp = 1 / (1 + Math.exp(-(sd * 2.2 - gl * 0.4)));
  let d = 0.27;
  let a = 1 - hp - d;
  hp = lo(hp, 0.1);
  d = lo(d, 0.1);
  a = lo(a, 0.1);
  const s = hp + d + a;
  return { goalLine: gl, odds: oddsFromProbs([hp / s, d / s, a / s]) };
}

// 总进球
function genTtg(sd, rng) {
  const lambda = 2.2 + sd * 0.6;
  const ps = [];
  for (let g = 0; g <= 6; g++) {
    ps.push(Math.pow(lambda, g) * Math.exp(-lambda) / fact(g));
  }
  ps.push(1 - ps.reduce((a, b) => a + b, 0)); // 7+
  return oddsFromProbs(ps);
}

// 半全场
function genHafu(sd) {
  let h = 0.42 + 0.2 * sd;
  let d = 0.27;
  let a = 1 - h - d;
  h = lo(h, 0.12);
  d = lo(d, 0.12);
  a = lo(a, 0.12);
  const s = h + d + a;
  h /= s; d /= s; a /= s;
  return oddsFromProbs([
    h * 0.7 + 0.05, h * 0.1, h * 0.2,
    d * 0.1, d * 0.7 + 0.05, d * 0.2,
    a * 0.2, a * 0.1, a * 0.7 + 0.05,
  ]);
}

// 比分
function genCrs(sd, rng) {
  const scores = [
    [1, 0], [2, 0], [2, 1], [3, 0], [3, 1], [3, 2], [4, 0], [4, 1], [4, 2],
    [0, 0], [1, 1], [2, 2], [3, 3],
    [0, 1], [0, 2], [1, 2], [0, 3], [1, 3], [2, 3],
    [0, 4], [1, 4], [2, 4],
  ];
  const ps = scores.map(([gh, ga]) => {
    let w = Math.exp(-Math.abs(gh - ga) * 0.4);
    if (gh > ga) w *= 1 + 0.3 * sd;
    else if (ga > gh) w *= 1 - 0.2 * sd;
    return Math.max(0.05, w);
  });
  const odds = oddsFromProbs(ps);
  const codes = [
    "s01s00", "s02s00", "s02s01", "s03s00", "s03s01", "s03s02", "s04s00", "s04s01", "s04s02",
    "s00s00", "s01s01", "s02s02", "s03s03",
    "s00s01", "s00s02", "s01s02", "s00s03", "s01s03", "s02s03",
    "s00s04", "s01s04", "s02s04",
  ];
  const obj = {};
  codes.forEach((c, i) => (obj[c] = String(odds[i])));
  obj["s1sh"] = String(r2(odds[0] * 1.6 + 4));
  obj["s1sd"] = String(r2(odds[10] * 1.5 + 3));
  obj["s1sa"] = String(r2(odds[13] * 1.6 + 4));
  return obj;
}

const LEAGUES = [
  {
    code: "gj", abb: "世界杯", all: "国际足联世界杯",
    teams: ["阿根廷", "法国", "巴西", "英格兰", "葡萄牙", "西班牙", "德国", "荷兰", "比利时", "克罗地亚", "意大利", "乌拉圭"],
  },
  {
    code: "yc", abb: "英超", all: "英格兰足球超级联赛",
    teams: ["曼城", "阿森纳", "利物浦", "切尔西", "曼联", "热刺", "纽卡斯尔", "阿斯顿维拉", "布莱顿", "西汉姆", "埃弗顿", "水晶宫"],
  },
  {
    code: "xy", abb: "西甲", all: "西班牙足球甲级联赛",
    teams: ["皇家马德里", "巴塞罗那", "马德里竞技", "塞维利亚", "毕尔巴鄂", "瓦伦西亚", "比利亚雷亚尔", "赫罗纳", "皇家社会", "贝蒂斯"],
  },
  {
    code: "yj", abb: "意甲", all: "意大利足球甲级联赛",
    teams: ["国际米兰", "AC米兰", "尤文图斯", "那不勒斯", "罗马", "拉齐奥", "亚特兰大", "佛罗伦萨", "博洛尼亚", "都灵"],
  },
  {
    code: "dg", abb: "德甲", all: "德国足球甲级联赛",
    teams: ["拜仁慕尼黑", "多特蒙德", "勒沃库森", "莱比锡", "法兰克福", "柏林联合", "斯图加特", "门兴", "沃尔夫斯堡", "弗赖堡"],
  },
  {
    code: "fj", abb: "法甲", all: "法国足球甲级联赛",
    teams: ["巴黎圣日耳曼", "马赛", "摩纳哥", "里昂", "里尔", "尼斯", "雷恩", "朗斯"],
  },
  {
    code: "cg", abb: "欧冠", all: "欧洲冠军联赛",
    teams: ["曼城", "皇家马德里", "拜仁慕尼黑", "国际米兰", "巴黎圣日耳曼", "阿森纳", "巴塞罗那", "利物浦", "多特蒙德", "本菲卡"],
  },
  {
    code: "zc", abb: "中超", all: "中国足球协会超级联赛",
    teams: ["上海海港", "上海申花", "北京国安", "山东泰山", "成都蓉城", "武汉三镇", "浙江队", "河南队", "天津津门虎", "沧州雄狮"],
  },
];

const TIMES = ["22:00", "19:35", "03:00", "23:30", "20:00", "00:30", "21:00", "18:00", "02:45", "01:00"];
const WEEKDAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

function fmtDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function weekdayOf(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  return WEEKDAYS[d.getDay()];
}

function strengthOf(name) {
  return ((hashStr(name) % 100) / 100) * 2 - 1; // -1..1
}

function buildSub(lg, homeName, awayName, hi, ai, sd, rng, num, date, time, now) {
  const [h, d, a] = genHad(sd);
  const hh = genHhad(sd, rng);
  const ttg = genTtg(sd, rng);
  const hafu = genHafu(sd);
  const crs = genCrs(sd, rng);
  return {
    matchId: 100000 + num,
    matchNum: num,
    matchNumStr: String(num).padStart(3, "0"),
    businessDate: date,
    matchDate: date,
    matchTime: time,
    leagueId: hashStr(lg.code),
    leagueCode: lg.code,
    leagueAbbName: lg.abb,
    leagueAllName: lg.all,
    homeTeamCode: "t" + (hashStr(homeName) % 99999),
    homeTeamAbbName: homeName,
    homeTeamAllName: homeName,
    homeRank: String(hi + 1),
    awayTeamCode: "t" + (hashStr(awayName) % 99999),
    awayTeamAbbName: awayName,
    awayTeamAllName: awayName,
    awayRank: String(ai + 1),
    matchStatus: "Selling",
    bettingSingle: rng() < 0.4 ? "1" : "0",
    bettingAllUp: "1",
    had: { h: String(h), d: String(d), a: String(a), updateTime: now },
    hhad: { h: String(hh.odds[0]), d: String(hh.odds[1]), a: String(hh.odds[2]), goalLineValue: String(hh.goalLine), updateTime: now },
    ttg: {
      s0: String(ttg[0]), s1: String(ttg[1]), s2: String(ttg[2]), s3: String(ttg[3]),
      s4: String(ttg[4]), s5: String(ttg[5]), s6: String(ttg[6]), s7: String(ttg[7]), updateTime: now,
    },
    hafu: {
      hh: String(hafu[0]), hd: String(hafu[1]), ha: String(hafu[2]),
      dh: String(hafu[3]), dd: String(hafu[4]), da: String(hafu[5]),
      ah: String(hafu[6]), ad: String(hafu[7]), aa: String(hafu[8]), updateTime: now,
    },
    crs,
  };
}

export function buildSampleMatches() {
  const rng = mulberry32(20260806);
  const groups = new Map();
  const NOW = new Date();
  const now = NOW.toISOString();
  // 日期相对“今天”生成：覆盖过去 14 天到未来 3 天，保证任何时间运行都贴近当前日期
  const DATES = [];
  for (let off = -14; off <= 3; off++) {
    const dt = new Date(NOW);
    dt.setDate(dt.getDate() + off);
    DATES.push(fmtDate(dt));
  }
  let num = 0;

  for (const lg of LEAGUES) {
    const teams = lg.teams;
    const count = Math.min(8, teams.length);
    const used = new Set();
    let made = 0;
    let guard = 0;
    while (made < count && guard < 300) {
      guard++;
      const i = Math.floor(rng() * teams.length);
      let j = Math.floor(rng() * teams.length);
      if (j === i) continue;
      const key = i < j ? `${i}-${j}` : `${j}-${i}`;
      if (used.has(key)) continue;
      used.add(key);
      const home = teams[i];
      const away = teams[j];
      const sd = clamp((strengthOf(home) - strengthOf(away)) * 0.8 + (rng() - 0.5) * 0.1, -1, 1);
      const date = DATES[num % DATES.length];
      const time = TIMES[Math.floor(rng() * TIMES.length)];
      num++;
      const sub = buildSub(lg, home, away, i, j, sd, rng, num, date, time, now);
      if (!groups.has(date)) {
        groups.set(date, { matchNumDate: date, businessDate: date, weekday: weekdayOf(date), subMatchList: [] });
      }
      groups.get(date).subMatchList.push(sub);
      made++;
    }
  }

  return {
    value: {
      lastUpdateTime: now,
      matchInfoList: Array.from(groups.values()),
    },
  };
}
