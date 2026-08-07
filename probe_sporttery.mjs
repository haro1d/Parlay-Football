const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
  Referer: 'https://m.sporttery.cn/',
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'zh-CN,zh;q=0.9',
};
const BASE = 'https://webapi.sporttery.cn/gateway/uniform/football';
const candidates = [
  ['getMatchResultNewV1 (web source)', `${BASE}/getMatchResultNewV1.qry?source=web&matchDate=2026-08-05`],
  ['getMatchResultNewV1 (app source)', `${BASE}/getMatchResultNewV1.qry?source=app&matchDate=2026-08-05`],
  ['getMatchResultV1 (no id)', `${BASE}/getMatchResultV1.qry?source=web`],
  ['getMatchResultV1 (date)', `${BASE}/getMatchResultV1.qry?source=web&matchDate=2026-08-05`],
];
async function probe(name, url) {
  try {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 9000);
    const r = await fetch(url, { signal: ac.signal, headers: HEADERS });
    const txt = await r.text();
    clearTimeout(t);
    console.log(`\n### ${name}\nHTTP ${r.status}\n${txt.slice(0, 320)}`);
  } catch (e) {
    console.log(`\n### ${name}\nERROR ${e.message}`);
  }
}
for (const [n, u] of candidates) await probe(n, u);
