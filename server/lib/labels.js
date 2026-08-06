// Outcome-code decoding and pool metadata for 竞彩足球 pools.

export const POOL_NAME_ZH = {
  had: "胜平负",
  hhad: "让球胜平负",
  crs: "比分",
  ttg: "总进球",
  hafu: "半全场",
};

export const POOL_MAX_ALLUP = {
  had: 8,
  hhad: 8,
  crs: 6,
  ttg: 6,
  hafu: 6,
};

const META_KEYS = new Set(["goalLine", "goalLineValue", "updateDate", "updateTime", "id"]);

export function isOutcomeKey(key) {
  if (META_KEYS.has(key)) return false;
  if (key.endsWith("f")) return false;
  return true;
}

export function toTrend(flag) {
  const v = String(flag ?? "").trim();
  if (v === "1") return "up";
  if (v === "0") return "flat";
  if (v === "-1") return "down";
  return "unknown";
}

const HAD_LABELS = {
  h: { key: "home", labelZh: "主胜" },
  d: { key: "draw", labelZh: "平" },
  a: { key: "away", labelZh: "主负" },
};

const HAFU_CHAR = { h: "胜", d: "平", a: "负" };

function decodeCrs(code) {
  const m = /^s(\d{2})s(\d{2})$/.exec(code);
  if (m) {
    const home = Number(m[1]);
    const away = Number(m[2]);
    return { key: `${home}:${away}`, labelZh: `${home}:${away}` };
  }
  if (code === "s1sh") return { key: "win-other", labelZh: "胜其它" };
  if (code === "s1sd") return { key: "draw-other", labelZh: "平其它" };
  if (code === "s1sa") return { key: "loss-other", labelZh: "负其它" };
  return { key: code, labelZh: code };
}

function decodeTtg(code) {
  const m = /^s(\d)$/.exec(code);
  if (m) {
    const n = Number(m[1]);
    if (n >= 7) return { key: "7+", labelZh: "7球+" };
    return { key: String(n), labelZh: `${n}球` };
  }
  return { key: code, labelZh: code };
}

function decodeHafu(code) {
  if (code.length === 2 && HAFU_CHAR[code[0]] && HAFU_CHAR[code[1]]) {
    return { key: code.toUpperCase(), labelZh: `${HAFU_CHAR[code[0]]}/${HAFU_CHAR[code[1]]}` };
  }
  return { key: code, labelZh: code };
}

export function decodeOutcome(pool, code) {
  switch (pool) {
    case "had":
    case "hhad":
      return HAD_LABELS[code] ?? { key: code, labelZh: code };
    case "crs":
      return decodeCrs(code);
    case "ttg":
      return decodeTtg(code);
    case "hafu":
      return decodeHafu(code);
    default:
      return { key: code, labelZh: code };
  }
}

const CRS_ORDER = [
  "s01s00", "s02s00", "s02s01", "s03s00", "s03s01", "s03s02",
  "s04s00", "s04s01", "s04s02", "s05s00", "s05s01", "s05s02", "s1sh",
  "s00s00", "s01s01", "s02s02", "s03s03", "s1sd",
  "s00s01", "s00s02", "s01s02", "s00s03", "s01s03", "s02s03",
  "s00s04", "s01s04", "s02s04", "s00s05", "s01s05", "s02s05", "s1sa",
];

const ORDER = {
  had: ["h", "d", "a"],
  hhad: ["h", "d", "a"],
  crs: CRS_ORDER,
  ttg: ["s0", "s1", "s2", "s3", "s4", "s5", "s6", "s7"],
  hafu: ["hh", "hd", "ha", "dh", "dd", "da", "ah", "ad", "aa"],
};

export function orderedOutcomeCodes(pool, raw) {
  const present = Object.keys(raw).filter(isOutcomeKey);
  const presentSet = new Set(present);
  const canonical = ORDER[pool] ?? [];
  const ordered = canonical.filter((c) => presentSet.has(c));
  const extras = present.filter((c) => !canonical.includes(c));
  return [...ordered, ...extras];
}
