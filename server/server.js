// Local 竞彩足球 odds API server.
// Serves data + calculation endpoints. Tries the official upstream, falls back
// to a bundled sample snapshot when the upstream is unreachable (geo-blocked).

import http from "node:http";
import { readFile, readFileSync, existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, extname, normalize, sep } from "node:path";

import { parseUpstream, ALL_POOLS } from "./lib/parse.js";
import { deriveMarket, compareOdds, valueOf, round } from "./lib/derive.js";
import { calcParlay, listParlayTypes, PARLAY_TABLE } from "./lib/parlay.js";
import { POOL_NAME_ZH, POOL_MAX_ALLUP } from "./lib/labels.js";
import { buildSampleMatches } from "./lib/sampleData.js";
import { teamInsight } from "./lib/insight.js";
import { getFinishedMatches } from "./lib/results.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 8787;
const UPSTREAM =
  "https://webapi.sporttery.cn/gateway/jc/football/getMatchCalculatorV1.qry";

// Offline fallback: multi-league synthesized snapshot.
const SAMPLE = buildSampleMatches();
void readFileSync; // keep import for potential future sample.json use

function send(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-API-Key",
  });
  res.end(data);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let buf = "";
    req.on("data", (c) => (buf += c));
    req.on("end", () => {
      if (!buf) return resolve({});
      try {
        resolve(JSON.parse(buf));
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

// 竞彩官方接口需要带浏览器请求头才能绕过 WAF（否则返回 403/567）。
const UPSTREAM_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 " +
    "(KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1",
  Referer: "https://m.sporttery.cn/",
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "zh-CN,zh;q=0.9",
};

// 内存缓存：分页/排序/筛选时不必每次都打官方接口（官方赔率变化不频繁）。
let upstreamCache = { at: 0, payload: null };
const UPSTREAM_TTL = 30_000;

async function fetchUpstream() {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 9000);
  try {
    const r = await fetch(
      `${UPSTREAM}?poolCode=hhad,had,crs,ttg,hafu&channel=c`,
      { signal: ac.signal, headers: UPSTREAM_HEADERS },
    );
    if (!r.ok) throw new Error(`upstream HTTP ${r.status}`);
    const j = await r.json();
    if (!j?.value?.matchInfoList?.length) throw new Error("空数据");
    return j;
  } finally {
    clearTimeout(timer);
  }
}

async function getLivePayload() {
  const now = Date.now();
  if (upstreamCache.payload && now - upstreamCache.at < UPSTREAM_TTL) {
    return upstreamCache.payload;
  }
  const p = await fetchUpstream();
  upstreamCache = { at: now, payload: p };
  return p;
}

async function getMatches(opts) {
  let payload = SAMPLE;
  let source = "sample-snapshot";
  let upstreamError = null;
  // force=sample 可强制使用离线示例（用于排查 / 离线场景）
  if (opts.force !== "sample") {
    try {
      payload = await getLivePayload();
      source = "live-sporttery";
    } catch (e) {
      upstreamError = e.message;
      // 官方接口不可达（地域限制 / 离线 / 被拦截）→ 回退到内置示例
    }
  }
  // Real finished matches (past days) from a third-party results API.
  let finished = { matches: [], available: true, source: null, error: null };
  try {
    finished = await getFinishedMatches(2);
  } catch {
    // ignore — finished matches are optional
  }
  const result = parseUpstream(payload, { ...opts, extraMatches: finished.matches });
  result.source = source;
  result.upstreamError = upstreamError;
  result.finishedSource = finished.source;
  result.finishedAvailable = finished.available;
  if (finished.error) result.finishedError = finished.error;
  if (source === "live-sporttery") result.updatedAt = new Date().toISOString();
  return result;
}

const META = {
  pools: POOL_NAME_ZH,
  poolMaxAllUp: POOL_MAX_ALLUP,
  formulas: {
    impliedProb: "1 / odds",
    overround: "Σ(1/odds)",
    returnRate: "1 / overround",
    margin: "1 - returnRate",
    noVigProb: "impliedProb / overround",
    fairOdds: "1 / noVigProb",
    kelly: "offeredOdds × refProb",
    kellyFraction: "(b·p - q) / b  其中 b=odds-1, p=refProb, q=1-p",
  },
  parlayTable: PARLAY_TABLE,
  unitPrice: 2,
  ticketCap: 5_000_000,
  dataSource: "中国体育彩票竞彩网 webapi.sporttery.cn（非官方读取）",
  disclaimer: "数据仅供分析参考，请理性购彩。",
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const p = url.pathname;

  if (req.method === "OPTIONS") return send(res, 204, {});

  try {
    // GET /api/health
    if (p === "/api/health") return send(res, 200, { ok: true });

    // GET /api/meta
    if (p === "/api/meta") return send(res, 200, { success: true, data: META });

    // GET /api/matches
    if (p === "/api/matches" && req.method === "GET") {
      const pools = url.searchParams.get("pools")?.split(",").filter(Boolean);
      const date = url.searchParams.get("date");
      const league = url.searchParams.get("league");
      const keyword = url.searchParams.get("keyword");
      const sort = url.searchParams.get("sort") || "near";
      const page = url.searchParams.get("page");
      const pageSize = url.searchParams.get("pageSize");
      const matchId = url.searchParams.get("matchId");
      const force = url.searchParams.get("force");
      const data = await getMatches({
        pools: pools?.length ? pools : ALL_POOLS,
        date: date || undefined,
        league: league || undefined,
        keyword: keyword || undefined,
        sort,
        force: force || undefined,
        page: page ? Number(page) : undefined,
        pageSize: pageSize ? Number(pageSize) : undefined,
        matchId: matchId ? Number(matchId) : undefined,
      });
      return send(res, 200, { success: true, data });
    }

    // GET /api/team-insight?matchId=<id>&home=<name>&away=<name>
    //   &source=third-party:espn&homeId=<id>&awayId=<id>&league=<espn-code>
    // matchId → real 体彩 feature data; ESPN params → real ESPN team data.
    if (p === "/api/team-insight" && req.method === "GET") {
      const matchId = url.searchParams.get("matchId");
      const home = url.searchParams.get("home");
      const away = url.searchParams.get("away");
      const data = await teamInsight(matchId ? Number(matchId) : null, home, away, {
        source: url.searchParams.get("source") || undefined,
        homeId: url.searchParams.get("homeId") ? Number(url.searchParams.get("homeId")) : undefined,
        awayId: url.searchParams.get("awayId") ? Number(url.searchParams.get("awayId")) : undefined,
        league: url.searchParams.get("league") || undefined,
      });
      return send(res, 200, { success: true, data });
    }

    // GET /api/match/:id
    const m = /^\/api\/match\/(\d+)$/.exec(p);
    if (m && req.method === "GET") {
      const data = await getMatches({ matchId: Number(m[1]) });
      if (!data.matches.length) return send(res, 404, { success: false, error: "match not found" });
      return send(res, 200, { success: true, data: data.matches[0] });
    }

    // POST /api/derive
    if (p === "/api/derive" && req.method === "POST") {
      const body = await readBody(req);
      let oddsList = body.odds;
      if (!oddsList && (body.h || body.d || body.a)) {
        oddsList = [body.h, body.d, body.a].map(Number);
      } else {
        oddsList = (oddsList || []).map(Number);
      }
      const labels = body.labels || oddsList.map((_, i) => `选项${i + 1}`);
      const d = deriveMarket(oddsList);
      const out = {
        overround: round(d.overround, 6),
        returnRate: round(d.returnRate, 6),
        margin: round(d.margin, 6),
        outcomes: d.perOutcome.map((o, i) => ({
          label: labels[i],
          odds: o.odds,
          impliedProb: round(o.impliedProb, 6),
          noVigProb: round(o.noVigProb, 6),
          fairOdds: round(o.fairOdds, 4),
        })),
      };
      return send(res, 200, { success: true, data: out });
    }

    // POST /api/value
    if (p === "/api/value" && req.method === "POST") {
      const body = await readBody(req);
      const offered = (body.offered || []).map(Number);
      const reference = (body.reference || []).map(Number);
      const labels = body.labels || offered.map((_, i) => `选项${i + 1}`);
      const analyses = compareOdds(offered, reference);
      return send(res, 200, {
        success: true,
        data: {
          outcomes: analyses.map((a, i) => ({
            label: labels[i],
            odds: a.odds,
            refProb: round(a.refProb, 6),
            kelly: round(a.kelly, 4),
            ev: round(a.ev, 4),
            kellyFraction: round(a.kellyFraction, 4),
            isValue: a.isValue,
          })),
        },
      });
    }

    // POST /api/parlay
    if (p === "/api/parlay" && req.method === "POST") {
      const body = await readBody(req);
      const result = calcParlay(body);
      return send(res, 200, { success: true, data: result });
    }

    // GET /api/parlay/types
    if (p === "/api/parlay/types" && req.method === "GET") {
      const matches = url.searchParams.get("matches");
      const data = listParlayTypes(matches ? Number(matches) : undefined);
      return send(res, 200, { success: true, data });
    }

    // Serve built frontend (dist/) so this single Node process can host the
    // whole app (same-origin /api + static). Used for PaaS deploys.
    if (req.method === "GET") {
      if (serveStatic(p, res)) return;
    }

    return send(res, 404, { success: false, error: "not found" });
  } catch (e) {
    return send(res, 400, { success: false, error: e.message });
  }
});

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".map": "application/json",
};
const DIST = join(__dirname, "..", "dist");

function serveStatic(pathname, res) {
  let rel = decodeURIComponent(pathname.split("?")[0]);
  if (rel === "/") rel = "/index.html";
  const target = normalize(join(DIST, rel));
  // block path traversal outside dist/
  if (target !== DIST && !target.startsWith(DIST + sep)) return false;
  try {
    const st = statSync(target);
    if (st.isDirectory()) {
      const idx = join(target, "index.html");
      if (existsSync(idx)) return streamFile(idx, res);
      return false;
    }
    if (st.isFile()) return streamFile(target, res);
  } catch {
    // fall through to SPA fallback
  }
  // SPA fallback: unknown route without a file extension → index.html
  if (!extname(rel)) {
    const idx = join(DIST, "index.html");
    if (existsSync(idx)) return streamFile(idx, res);
  }
  return false;
}

function streamFile(filePath, res) {
  const ext = extname(filePath).toLowerCase();
  res.writeHead(200, {
    "Content-Type": MIME[ext] || "application/octet-stream",
    "Cache-Control": ext === ".html" ? "no-cache" : "public, max-age=86400",
  });
  res.end(readFileSync(filePath));
  return true;
}

server.listen(PORT, "0.0.0.0", () => {
  console.log(`[竞彩API] listening on http://localhost:${PORT}`);
  console.log(`[竞彩API] sample fallback ${SAMPLE ? "loaded" : "MISSING"}`);
  console.log(`[竞彩API] static dist ${existsSync(DIST) ? "enabled" : "not built (run npm run build)"}`);
});
