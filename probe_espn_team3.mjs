const UA = { "User-Agent": "Mozilla/5.0" };
async function fj(url) {
  const ac = new AbortController(); const t = setTimeout(() => ac.abort(), 10000);
  try { const r = await fetch(url, { signal: ac.signal, headers: UA });
    if (!r.ok) { console.log("HTTP", r.status); return null; } return await r.json();
  } catch (e) { console.log("ERR", e.message); return null; } finally { clearTimeout(t); }
}
// Find Arsenal (360) vs Tottenham (565) headtohead in eng.1
console.log("=== headtohead eng.1 Arsenal vs Tottenham ===");
const h2h = await fj("https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/teams/360/headtohead?teamId=565");
console.log("total:", (h2h?.events||[]).length);
(h2h?.events||[]).slice(0,6).forEach(e => {
  const cc = e.competitions?.[0]?.competitors || [];
  const hh = cc.find(c=>c.homeAway==="home"); const aa = cc.find(c=>c.homeAway==="away");
  const sc = (c)=> c?.score?.displayValue ?? "?";
  console.log(" ", e.date?.slice(0,10), "|", hh?.team?.displayName, sc(hh), "-", sc(aa), aa?.team?.displayName);
});

// Confirm recent filtering by score presence for Union (20) arg.1
console.log("\n=== Union (20) recent w/ score filter (no season) ===");
const sb = await fj("https://site.api.espn.com/apis/site/v2/sports/soccer/arg.1/teams/20/schedule?limit=30");
const evs = (sb?.events||[]).filter(e => {
  const cc = e.competitions?.[0]?.competitors || [];
  const hh = cc.find(c=>c.homeAway==="home"); const aa = cc.find(c=>c.homeAway==="away");
  const hasScore = hh?.score?.displayValue != null && aa?.score?.displayValue != null && hh.score.displayValue !== "" && aa.score.displayValue !== "";
  const past = new Date(e.date) <= new Date();
  return hasScore && past;
});
console.log("completed count:", evs.length);
evs.slice(0,6).forEach(e => {
  const cc = e.competitions?.[0]?.competitors || [];
  const hh = cc.find(c=>c.homeAway==="home"); const aa = cc.find(c=>c.homeAway==="away");
  const sc = (c)=> c?.score?.displayValue ?? "?";
  console.log(" ", e.date?.slice(0,10), "|", hh?.team?.displayName, sc(hh), "-", sc(aa), aa?.team?.displayName, "| winnerHome:", hh?.score?.winner);
});
