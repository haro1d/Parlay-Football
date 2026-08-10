import { calcParlay } from './server/lib/parlay.js'
function run(label, legs, passType, multiplier=1){
  const r = calcParlay({legs, passType, multiplier})
  console.log(`\n=== ${label} ===`)
  console.log('过关方式:', r.passType, '| 注数:', r.bets, '| 倍数:', r.multiplier)
  console.log('总投入:', r.totalStake, '元 | 理论最高奖金:', r.maxPayoutCapped, '元 | 实际派奖:', r.realizedPayout, '元')
  console.log('byFold:', JSON.stringify(r.byFold))
}
const four2 = [
  {label:'A',odds:2.0,result:'win'},
  {label:'B',odds:2.0,result:'win'},
  {label:'C',odds:2.0,result:'win'},
  {label:'D',odds:2.0,result:'win'},
]
run('4场各2.0赔率 · 4串1 · 倍数1', four2, '4串1', 1)
run('4场各2.0赔率 · 4串1 · 倍数2', four2, '4串1', 2)
run('4场各2.0赔率 · 4串11(全包)', four2, '4串11', 1)
