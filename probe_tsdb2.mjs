const candidates = [
  ['2024-05-19 EPL final day', 'https://www.thesportsdb.com/api/v1/json/3/eventsday.php?d=2024-05-19&s=Soccer'],
  ['2024-08-17 EPL opening', 'https://www.thesportsdb.com/api/v1/json/3/eventsday.php?d=2024-08-17&s=Soccer'],
  ['2025-11-25 (recent EPL)', 'https://www.thesportsdb.com/api/v1/json/3/eventsday.php?d=2025-11-25&s=Soccer'],
];
const MAJOR = ['Premier League','英超','La Liga','西甲','Serie A','意甲','Bundesliga','德甲','Ligue 1','法甲','Champions League','欧冠','Europa League','欧联','Brazilian','巴甲','Chinese Super','中超','J1','J League','日职','K League','韩','Copa Libertadores','解放者'];
async function probe(name, url) {
  try {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 9000);
    const r = await fetch(url, { signal: ac.signal });
    const j = await r.json();
    clearTimeout(t);
    const arr = j.events || [];
    const major = arr.filter(e => MAJOR.some(m => (e.strLeague||'').includes(m)));
    console.log(`\n### ${name}\nHTTP ${r.status} total=${arr.length} majorLeagueMatches=${major.length}`);
    major.slice(0,6).forEach(s => console.log('  -', s.strLeague, '|', s.strHomeTeam, s.intHomeScore+'-'+s.intAwayScore, s.strAwayTeam));
  } catch (e) {
    console.log(`\n### ${name}\nERROR ${e.message}`);
  }
}
for (const [n, u] of candidates) await probe(n, u);
