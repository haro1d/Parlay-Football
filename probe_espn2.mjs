const cases = [
  ['eng.1 20240519', 'eng.1', '20240519'],
  ['bra.1 20250713', 'bra.1', '20250713'],
  ['chi.1 20250719', 'chi.1', '20250719'],
  ['esp.1 20240519', 'esp.1', '20240519'],
  ['uefa.champions 20240519', 'uefa.champions', '20240519'],
];
async function probe(name, lg, date) {
  const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/${lg}/scoreboard?dates=${date}`;
  try {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 9000);
    const r = await fetch(url, { signal: ac.signal, headers: { 'User-Agent': 'Mozilla/5.0' } });
    const j = await r.json();
    clearTimeout(t);
    const ev = j.events || [];
    const fin = ev.filter(e => e.status?.type?.completed === true);
    console.log(`\n### ${name} | HTTP ${r.status} | events=${ev.length} finished=${fin.length}`);
    fin.slice(0, 5).forEach(e => {
      const c = e.competitions?.[0];
      const h = c?.competitors?.find(x => x.homeAway === 'home');
      const a = c?.competitors?.find(x => x.homeAway === 'away');
      console.log(`  - ${h?.team?.displayName} ${h?.score}-${a?.score} ${a?.team?.displayName}`);
    });
  } catch (e) {
    console.log(`\n### ${name} | ERROR ${e.message}`);
  }
}
for (const [n, l, d] of cases) await probe(n, l, d);
