import { getFinishedMatches } from './server/lib/results.js';
const r = await getFinishedMatches(2);
console.log('source =', r.source, '| available =', r.available, '| count =', r.matches.length, '| error =', r.error);
const byLeague = {};
for (const m of r.matches) byLeague[m.league.abbName] = (byLeague[m.league.abbName] || 0) + 1;
console.log('byLeague =', JSON.stringify(byLeague, null, 0));
console.log('--- samples ---');
r.matches.slice(0, 10).forEach((m) =>
  console.log(`${m.league.abbName} | ${m.home.abbName} ${m.finalScore} ${m.away.abbName} | ${m.matchDate} ${m.matchTime}`),
);
