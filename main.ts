import {copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from './lib/radar.ts';
import {buildDossier} from './vendor/makefun-board.ts';

function flag(name: string, fallback: string) {
  const i = process.argv.indexOf('--' + name);
  return i >= 0 ? process.argv[i + 1] ?? fallback : fallback;
}
const root = fileURLToPath(new URL('.', import.meta.url));
const input = flag('input', '/input');
const output = flag('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');
const snapshot = JSON.parse(readFileSync(input.endsWith('.json') ? input : join(input, 'snapshot.json'), 'utf8'));
const data = build(snapshot);
const write = (file: string, content: string | Buffer) => writeFileSync(join(output, file), content);
mkdirSync(join(output, 'dashboard'), {recursive: true});
for (const name of readdirSync(join(root, 'dashboard')).sort()) {
  copyFileSync(join(root, 'dashboard', name), join(output, 'dashboard', name));
}
write('board.json', JSON.stringify({rows: data.rows}) + '\n');
write('data.js', 'window.SOUNDINGS = ' + JSON.stringify(data) + ';\n');
const counts = ['Launch candidate', 'Token recorded', 'Set aside'].map(status =>
  status + ': ' + data.ledger.filter(row => row.status === status).length);
write('dashboard/evidence.txt', [
  'Generated from the same sealed-input rows as board.json and data.js.',
  ...counts, 'Watchlist: ' + data.rows.filter(row => row.watch).length,
  'Model: ' + data.validation.model,
  'Cross-sectional leave-one-out: ' + JSON.stringify({radar3: data.validation.radar3, radar4: data.validation.radar4}),
  'Rank | slug | TVL | implied circulating cap | P25 | P75 | 30-day farm | signed log10 contributions',
  ...data.rows.slice(0,10).map(r => [r.rank, r.slug, r.tvl_usd, r.implied_value_usd, r.low, r.high,
    r.farm.verdict, r.parts.map(p => p.label + '=' + p.log.toFixed(5)).join('; ')].join(' | ')),
].join('\n') + '\n');
const captures = join(root, 'captures');
if (existsSync(captures)) {
  mkdirSync(join(output, 'screenshots'), {recursive: true});
  for (const name of readdirSync(captures).filter(s => s.endsWith('.jpg.b64')).sort()) {
    write('screenshots/' + name.slice(0, -4), Buffer.from(readFileSync(join(captures, name), 'utf8'), 'base64'));
  }
  write('dossier.json', buildDossier(output, {text_max_bytes: 65_536, screenshots: {max:4, max_bytes:524_288}}));
} else if (!process.argv.includes('--preview')) {
  throw new Error('Missing committed dashboard captures');
}
const {radar3, radar4} = data.validation;
console.log(JSON.stringify({ranked: data.rows.length, universe: data.ledger.length,
  setAside: data.ledger.filter(r => r.status === 'Set aside').length, radar3, radar4, model: data.validation.model}));
