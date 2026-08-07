const candidates = [
  ['eventsday all soccer 2026-08-05', 'https://www.thesportsdb.com/api/v1/json/3/eventsday.php?d=2026-08-05&s=Soccer'],
  ['eventsday CSL 2026-08-05', 'https://www.thesportsdb.com/api/v1/json/3/eventsday.php?d=2026-08-05&l=Chinese%20Super%20League'],
  ['eventsday 2024-05-12 (past)', 'https://www.thesportsdb.com/api/v1/json/3/eventsday.php?d=2024-05-12&s=Soccer'],
];
async function probe(name, url) {
  try {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 9000);
    const r = await fetch(url, { signal: ac.signal });
    const j = await r.json();
    clearTimeout(t);
    const arr = j.events || [];
    console.log(`\n### ${name}\nHTTP ${r.status} count=${arr.length}`);
    if (arr.length) {
      const s = arr[0];
      console.log('sample:', JSON.stringify({
        league: s.strLeague, home: s.strHomeTeam, away: s.strAwayTeam,
        hs: s.intHomeScore, as: s.intAwayScore, date: s.dateEvent, time: s.strTime,
      }));
    }
  } catch (e) {
    console.log(`\n### ${name}\nERROR ${e.message}`);
  }
}
for (const [n, u] of candidates) await probe(n, u);
