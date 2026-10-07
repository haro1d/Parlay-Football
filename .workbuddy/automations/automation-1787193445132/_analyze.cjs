const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..', '..', '..');
const dataPath = path.join(root, 'public', 'data', 'matches.json');
const raw = fs.readFileSync(dataPath, 'utf-8');
const d = JSON.parse(raw);
const matches = Array.isArray(d) ? d : (d.matches || d.data || []);
const today = new Date();
const pad = n => String(n).padStart(2, '0');
const todayStr = pad(today.getMonth() + 1) + '-' + pad(today.getDate());
const yd = new Date(today.getTime() - 86400000);
const yStr = pad(yd.getMonth() + 1) + '-' + pad(yd.getDate());
const dist = {};
let finishedCount = 0;
for (const m of matches) {
  const fin = m.finished || m.isFinished || m.status === 'finished' || m.matchStatus === 'finished';
  if (!fin) continue;
  finishedCount++;
  let md = m.matchDate || m.date || m.matchTime || '';
  if (md.length >= 10) md = md.slice(5, 10);
  else if (md.length >= 5) md = md.slice(0, 5);
  dist[md] = (dist[md] || 0) + 1;
}
const keys = Object.keys(dist).sort();
console.log('已完赛总数:', finishedCount);
console.log('日期分布:');
for (const k of keys) console.log('  ' + k + ': ' + dist[k]);
console.log('今天(' + todayStr + '):', dist[todayStr] || 0);
console.log('昨天(' + yStr + '):', dist[yStr] || 0);
