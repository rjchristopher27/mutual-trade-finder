import { DEFAULT_SETTINGS, POSITIONS, runEngine, type RankChange } from '../src/engine';
import { syntheticLeague } from '../src/engine/synthetic';

const seed = Number(process.argv[2] ?? 42);
const { league, ranks } = syntheticLeague(seed);
const start = performance.now();
const result = runEngine(league, ranks, 't1', DEFAULT_SETTINGS);
const ms = Math.round(performance.now() - start);

const name = (id: string) => league.players[id].name;
const moves = (c: RankChange) =>
  [
    ...POSITIONS.filter((p) => c.rooms[p][0] !== c.rooms[p][1]).map(
      (p) => `${p} ${c.rooms[p][0]}→${c.rooms[p][1]}`,
    ),
    `Overall ${c.overall[0]}→${c.overall[1]}`,
  ].join(', ');

console.log(`${league.name}: ${result.trades.length} trades help both teams (${ms} ms). Top ${result.groups.length}:\n`);
result.groups.slice(0, 10).forEach((g, i) => {
  const r = result.reports[i];
  const t = g.head;
  console.log(`${i + 1}. vs ${t.opponentId}  score ${t.score.toFixed(1)}  (+${t.gainMe.toFixed(1)} me / +${t.gainThem.toFixed(1)} them)`);
  console.log(`   give: ${t.give.map(name).join(', ')}`);
  console.log(`   get:  ${t.get.map(name).join(', ')}`);
  console.log(`   me:   ${moves(r.me)}`);
  console.log(`   them: ${moves(r.them)}`);
  if (g.variants.length) console.log(`   (+${g.variants.length} variations)`);
  console.log();
});
