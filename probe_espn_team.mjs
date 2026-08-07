const UA = { "User-Agent": "Mozilla/5.0" };
async function fj(url) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 10000);
  try {
    const r = await fetch(url, { signal: ac.signal, headers: UA });
    if (!r.ok) { console.log("HTTP", r.status, url.slice(0, 90)); return null; }
    return await r.json();
  } catch (e) { console.log("ERR", e.message, url.slice(0, 90)); return null; }
  finally { clearTimeout(t); }
}
// 1) find Union (Santa Fe) vs Lanus event on 2026-08-06 arg.1, grab team ids
const sb = await fj("https://site.api.espn.com/apis/site/v2/sports/soccer/arg.1/scoreboard?dates=20260806");
const ev = (sb?.events || []).find(e => {
  const cs = e.competitions?.[0]?.competitors || [];
  return cs.some(c => (c.team?.displayName||"").includes("Uni")) && cs.some(c => (c.team?.displayName||"").includes("Lan"));
});
if (!ev) { console.log("event not found"); process.exit(0); }
const cs = ev.competitions[0].competitors;
const h = cs.find(c => c.homeAway === "home");
const a = cs.find(c => c.homeAway === "away");
console.log("HOME", h.team?.id, h.team?.displayName, "| AWAY", a.team?.id, a.team?.displayName);

// 2) team schedule (recent) for home
const sched = await fj(`https://site.api.espn.com/apis/site/v2/sports/soccer/arg.1/teams/${h.team.id}/schedule?limit=8`);
const events = (sched?.events || []).filter(e => e.status?.type?.completed);
console.log("\n=== HOME recent (from team schedule) count=", events.length);
events.slice(0, 5).forEach(e => {
  const cc = e.competitions?.[0]?.competitors || [];
  const hh = cc.find(c=>c.homeAway==="home"); const aa = cc.find(c=>c.homeAway==="away");
  console.log(" ", e.date?.slice(0,10), hh.team.displayName, hh.score, "-", aa.score, aa.team.displayName, "|", e.competitions?.[0]?.type?.type || "");
});

// 3) head to head
const h2h = await fj(`https://site.api.espn.com/apis/site/v2/sports/soccer/arg.1/teams/${h.team.id}/headtohead?teamId=${a.team.id}`);
const he = (h2h?.events || []).filter(e => e.status?.type?.completed);
console.log("\n=== H2H count=", he.length);
he.slice(0, 5).forEach(e => {
  const cc = e.competitions?.[0]?.competitors || [];
  const hh = cc.find(c=>c.homeAway==="home"); const aa = cc.find(c=>c.homeAway==="away");
  console.log(" ", e.date?.slice(0,10), hh.team.displayName, hh.score, "-", aa.score, aa.team.displayName);
});
