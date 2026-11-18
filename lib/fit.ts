export interface Protocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

export const quantile = (values: number[], p: number) => {
  const sorted = [...values].sort((a, b) => a - b);
  const i = (sorted.length - 1) * p;
  return sorted[Math.floor(i)] * (1 - i % 1) + sorted[Math.ceil(i)] * (i % 1);
};
const clamp = (x: number, min: number, max: number) => Math.min(max, Math.max(min, x));
export const size = (p: Protocol) => Math.log10(p.tvl_usd);
const target = (p: Protocol) => Math.log10(p.mcap_usd!);
export function age(p: Protocol, date: string) {
  const days = (Date.parse(date) - Date.parse(p.listed_at ?? '')) / 86400000;
  return Number.isFinite(days) ? Math.max(0, days) : null;
}
const names = ['Size baseline', 'Size', '7-day TVL change', 'Listing age', 'Chain breadth', 'Growth missing', 'Age missing', 'Size above $100M'];
type Spec = { name: string; signals: boolean; hinge?: boolean; robust?: boolean; peer?: boolean; sector?: boolean };
const specs: Spec[] = [
  {name: 'Size only', signals: false},
  {name: 'Size + category', signals: false, peer: true},
  {name: 'Shrinkage + category', signals: true, peer: true},
  {name: 'Robust shrinkage + category', signals: true, peer: true, robust: true},
  {name: 'Piecewise shrinkage + category', signals: true, peer: true, hinge: true},
  {name: 'Shrinkage without category', signals: true},
  {name: 'Robust size + sector', signals: false, robust: true, sector: true},
  {name: 'Shrinkage + sector', signals: true, sector: true},
  {name: 'Robust shrinkage + sector', signals: true, robust: true, sector: true},
];

function sector(p: Protocol) {
  const c = (p.category ?? '').toLowerCase();
  if (/bridge|chain|privacy/.test(c)) return 'Infrastructure';
  if (/stak|index|allocator|yield aggregat/.test(c)) return 'Managed exposure';
  if (/dex|derivative|perpetual|option|prediction|basis|liquidity/.test(c)) return 'Trading';
  if (/lend|cdp|collateral|credit/.test(c)) return 'Credit';
  return p.category;
}

function features(p: Protocol, date: string, spec: Spec) {
  const x = size(p) - 8;
  const days = age(p, date);
  return [1, x, ...(spec.signals ? [
    Math.asinh(clamp(p.change_7d ?? 0, -100, 200) / 15),
    days === null ? 0 : Math.log10(1 + days / 365) - 0.5,
    Math.log2(Math.max(1, p.chains.length)),
    Number(p.change_7d === null), Number(days === null),
  ] : []), ...(spec.hinge ? [Math.max(0, x)] : [])];
}

function solve(matrix: number[][]) {
  const n = matrix.length;
  for (let i = 0; i < n; i++) {
    let pivot = i;
    for (let j = i + 1; j < n; j++) if (Math.abs(matrix[j][i]) > Math.abs(matrix[pivot][i])) pivot = j;
    [matrix[i], matrix[pivot]] = [matrix[pivot], matrix[i]];
    const d = matrix[i][i];
    if (Math.abs(d) < 1e-10) throw new Error('Singular valuation fit');
    matrix[i] = matrix[i].map(v => v / d);
    for (let j = 0; j < n; j++) if (j !== i) {
      const k = matrix[j][i];
      matrix[j] = matrix[j].map((v, col) => v - k * matrix[i][col]);
    }
  }
  return matrix.map(row => row[n]);
}

const dot = (a: number[], b: number[]) => a.reduce((s, v, i) => s + v * b[i], 0);
function fit(rows: Protocol[], date: string, spec: Spec) {
  const data = rows.map(p => ({p, x: features(p, date, spec), y: target(p)}));
  const n = data[0].x.length;
  let beta = Array(n).fill(0) as number[];
  let peers = new Map<string | null, {shift: number; count: number}>();
  const key = (p: Protocol) => spec.sector ? sector(p) : p.category;
  for (let pass = 0; pass < (spec.robust ? 6 : spec.peer || spec.sector ? 3 : 1); pass++) {
    const m = Array.from({length: n}, (_, i) => Array.from({length: n + 1}, (_, j) =>
      i === j && i > 0 ? (i === 1 ? 1e-8 : 6) : 0));
    for (const {p, x, y} of data) {
      const shift = peers.get(key(p))?.shift ?? 0;
      const err = Math.abs(y - shift - dot(x, beta));
      const w = spec.robust && pass ? Math.min(1, 0.55 / Math.max(1e-9, err)) : 1;
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) m[i][j] += w * x[i] * x[j];
        m[i][n] += w * x[i] * (y - shift);
      }
    }
    beta = solve(m);
    if (spec.peer || spec.sector) {
      const groups = new Map<string | null, number[]>();
      for (const {p, x, y} of data) {
        const group = groups.get(key(p)) ?? [];
        group.push(clamp(y - dot(x, beta), -1.25, 1.25));
        groups.set(key(p), group);
      }
      peers = new Map([...groups].map(([key, group]) => [key, {
        shift: quantile(group, 0.5) * group.length / (group.length + 4), count: group.length,
      }]));
    }
  }
  return (p: Protocol) => {
    const x = features(p, date, spec);
    const peer = peers.get(key(p));
    const parts = x.map((v, i) => ({label: names[i], log: v * beta[i]}));
    // Keep additive contributions so the browser can reconstruct the price.
    parts.push({label: spec.sector ? 'Sector peers' : 'Category peers', log: peer?.shift ?? 0});
    return {log: parts.reduce((s, part) => s + part.log, 0), parts, peers: peer?.count ?? 0};
  };
}

// Inner folds are assigned by slug order, independent of cap. The outer held-out
// protocol is absent from both model choice and fit.
function choose(rows: Protocol[], date: string) {
  const groups = Array.from({length: 5}, (_, fold) => ({
    train: rows.filter((_, i) => i % 5 !== fold),
    valid: rows.filter((_, i) => i % 5 === fold),
  }));
  const trials = specs.map(spec => {
    const errors = groups.flatMap(({train, valid}) => {
      const predict = fit(train, date, spec);
      return valid.map(p => Math.abs(target(p) - predict(p).log));
    });
    // Soft threefold loss trades a narrow threshold for a smooth neighborhood.
    return {spec, loss: errors.reduce((a, b) => a + b / (Math.log10(3) + b), 0) / errors.length};
  }).sort((a, b) => a.loss - b.loss);
  return trials;
}

function baseline(rows: Protocol[], p: Protocol) {
  const x = rows.map(size);
  const y = rows.map(target);
  const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
  const a = mean(x), b = mean(y);
  const slope = dot(x.map(v => v - a), y.map(v => v - b)) / dot(x.map(v => v - a), x.map(v => v - a));
  const round = (v: number) => Math.round(1e4 * v) / 1e4;
  return round(b - slope * a) + round(slope) * size(p);
}

const metrics = (errors: number[]) => {
  const hits = errors.filter(e => Math.abs(e) <= Math.log10(3)).length;
  return {median: 10 ** quantile(errors.map(Math.abs), 0.5), hits, n: errors.length};
};

export function calibrate(protocols: Protocol[], date: string) {
  const rows = protocols.filter(p => (p.mcap_usd ?? 0) > 0 && p.tvl_usd > 0 && p.category !== 'CEX')
    .sort((a, b) => a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0);
  const folds = rows.map((p, i) => {
    const train = rows.filter((_, j) => j !== i);
    const spec = choose(train, date)[0].spec;
    const log = fit(train, date, spec)(p).log;
    return {slug: p.slug, size: size(p), actual: p.mcap_usd!, predicted: 10 ** log,
      error: target(p) - log, baseline: target(p) - baseline(train, p), selected: spec.name};
  });
  const trials = choose(rows, date);
  const model = trials[0].spec;
  const errors = folds.map(f => f.error);
  return {
    model: model.name, predict: fit(rows, date, model), folds,
    radar4: metrics(errors), radar3: metrics(folds.map(f => f.baseline)),
    bounds: [quantile(errors, 0.25), quantile(errors, 0.75)],
    sizeRange: [Math.min(...rows.map(size)), Math.max(...rows.map(size))],
    trials: trials.map(t => ({name: t.spec.name, loss: t.loss})),
  };
}
