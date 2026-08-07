const UA = { "User-Agent": "Mozilla/5.0" };
async function fj(url) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 10000);
  try {
    const r = await fetch(url, { signal: ac.signal, headers: UA });
    if (!r.ok) { console.log("HTTP", r.status, url.slice(0, 80)); return null; }
    return await r.json();
  } catch (e) { console.log("ERR", e.message, url.slice(0, 80)); return null; }
  finally { clearTimeout(t); }
}
const HOME = 20, AWAY = 12, LG = "arg.1";

console.log("=== schedule (no season) raw events sample ===");
const sb = await fj(`https://site.api.espn.com/apis/site/v2/sports/soccer/${LG}/teams/${HOME}/schedule?limit=6`);
console.log("season:", JSON.stringify(sb?.season || sb?.seasonInfo || null)?.slice(0,120));
(sb?.events||[]).slice(0,6).forEach(e => {
  const cc = e.competitions?.[0]?.competitors || [];
  const hh = cc.find(c=>c.homeAway==="home"); const aa = cc.find(c=>c.homeAway==="away");
  console.log(" ", e.date?.slice(0,10), "completed?", e.status?.type?.completed, "|", hh?.team?.displayName, hh?.score, "-", aa?.score, aa?.team?.displayName);
});

console.log("\n=== schedule season=2025 raw events sample ===");
const sb2 = await fj(`https://site.api.espn.com/apis/site/v2/sports/soccer/${LG}/teams/${HOME}/schedule?season=2025&limit=8`);
console.log("season:", JSON.stringify(sb2?.season || null)?.slice(0,120));
(sb2?.events||[]).slice(0,8).forEach(e => {
  const cc = e.competitions?.[0]?.competitors || [];
  const hh = cc.find(c=>c.homeAway==="home"); const aa = cc.find(c=>c.homeAway==="away");
  console.log(" ", e.date?.slice(0,10), "completed?", e.status?.type?.completed, "|", hh?.team?.displayName, hh?.score, "-", aa?.score, aa?.team?.displayName);
});

console.log("\n=== headtohead raw (first 6) ===");
const h2h = await fj(`https://site.api.espn.com/apis/site/v2/sports/soccer/${LG}/teams/${HOME}/headtohead?teamId=${AWAY}`);
console.log("total events:", (h2h?.events||[]).length);
(h2h?.events||[]).slice(0,6).forEach(e => {
  const cc = e.competitions?.[0]?.competitors || [];
  const hh = cc.find(c=>c.homeAway==="home"); const aa = cc.find(c=>c.homeAway==="away");
  console.log(" ", e.date?.slice(0,10), "completed?", e.status?.type?.completed, "|", hh?.team?.displayName, hh?.score, "-", aa?.score, aa?.team?.displayName);
});
