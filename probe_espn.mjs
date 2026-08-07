const leagues = {
  'eng.1 (EPL)': 'eng.1',
  'esp.1 (LaLiga)': 'esp.1',
  'ita.1 (SerieA)': 'ita.1',
  'ger.1 (Bundes)': 'ger.1',
  'fra.1 (Ligue1)': 'fra.1',
  'uefa.champions': 'uefa.champions',
  'uefa.europa': 'uefa.europa',
  'bra.1 (Brasileirao)': 'bra.1',
  'chi.1 (CSL)': 'chi.1',
  'jpn.1 (J1)': 'jpn.1',
  'kor.1 (KLeague)': 'kor.1',
  'fifa.world (WC)': 'fifa.world',
};
const date = '20260805';
async function probe(name, lg) {
  const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/${lg}/scoreboard?dates=${date}`;
  try {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 9000);
    const r = await fetch(url, { signal: ac.signal, headers: { 'User-Agent': 'Mozilla/5.0' } });
    const j = await r.json();
    clearTimeout(t);
    const ev = j.events || [];
    const fin = ev.filter(e => e.status && e.status.type && e.status.type.completed === true);
    console.log(`\n### ${name} | HTTP ${r.status} | events=${ev.length} finished=${fin.length}`);
    fin.slice(0, 4).forEach(e => {
      const c = e.competitions?.[0];
      const h = c?.competitors?.find(x => x.homeAway === 'home');
      const a = c?.competitors?.find(x => x.homeAway === 'away');
      console.log(`  - ${h?.team?.displayName} ${h?.score}-${a?.score} ${a?.team?.displayName}`);
    });
  } catch (e) {
    console.log(`\n### ${name} | ERROR ${e.message}`);
  }
}
for (const [n, l] of Object.entries(leagues)) await probe(n, l);
