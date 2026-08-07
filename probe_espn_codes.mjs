const candidates = [
  'jpn.1', 'kor.1', 'kor.kleague', 'arg.1', 'mex.1', 'ned.1', 'por.1', 'usa.1',
  'conmebol.libertadores', 'uefa.europa.conf', 'chi.1', 'chn.1', 'chinese.1',
  'eng.2', 'esp.2', 'ita.2', 'ger.2', 'fra.2', 'sco.1', 'tur.1', 'rus.1', 'bel.1', 'ukr.1',
];
const dates = ['20250713', '20240519', '20260504', '20260505'];
async function probe(code) {
  let best = null;
  for (const d of dates) {
    const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/${code}/scoreboard?dates=${d}`;
    try {
      const ac = new AbortController();
      const t = setTimeout(() => ac.abort(), 8000);
      const r = await fetch(url, { signal: ac.signal, headers: { 'User-Agent': 'Mozilla/5.0' } });
      const j = await r.json();
      clearTimeout(t);
      const ev = j.events || [];
      if (ev.length && (!best || ev.length > best.n)) {
        best = { d, n: ev.length, sample: ev.slice(0,2).map(e => (e.competitions?.[0]?.competitors?.find(x=>x.homeAway==='home')?.team?.displayName)||'?') };
      }
    } catch {}
  }
  if (best) console.log(`${code.padEnd(24)} OK  (${best.d}: ${best.n} ev) e.g. ${best.sample.join(', ')}`);
  else console.log(`${code.padEnd(24)} no data on tested dates`);
}
for (const c of candidates) await probe(c);
