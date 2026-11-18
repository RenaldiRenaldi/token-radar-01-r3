import {age, calibrate, size, type Protocol} from './fit.ts';

export interface Snapshot {
  as_of: string;
  floor_usd: number;
  protocols: Protocol[];
  watchlist: string[];
}

const excluded = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);
function setAside(p: Protocol) {
  if (excluded.has(p.category ?? '')) return 'Excluded category: ' + p.category;
  if (/\s(?:v\d+(?:\.\d+)?|\d+\.\d+)$/i.test(p.name)) return 'Versioned product';
  if (/\b(?:wrapped|staked|staking)\b/i.test(p.name)) return 'Wrapped or staking product name';
  if (/^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/.test(p.name)) return 'Exchange product name';
  return null;
}

const tokenMarker = (p: Protocol) => p.mcap_usd !== null || p.gecko_id !== null || p.symbol !== null;
const gas = (chain: string) => chain === 'Ethereum' ? 12 : chain === 'Solana' ? 0.05 :
  /^(Base|Arbitrum|Optimism|BSC|Polygon|Avalanche|Linea|Scroll)$/.test(chain) ? 0.30 : 1;

function playbook(p: Protocol) {
  const c = (p.category ?? '').toLowerCase();
  if (/lend|cdp|collateral/.test(c)) return ['Supply an eligible asset to an unlevered lending market; verify withdrawal liquidity and keep the receipt.', 'Check utilization and withdrawal liquidity; no borrowing required.', 'Withdraw the supply and revoke any remaining approval.'];
  if (/dex|liquidity|leveraged farm/.test(c)) return ['After checking trading fees and price divergence, deposit balanced amounts to an eligible spot pool.', 'Log pool share and compare position value to simply holding the two assets.', 'Remove liquidity and quote conversion fees before consolidating the assets.'];
  if (/perpetual|derivative|option|prediction|leveraged/.test(c)) return ['Check for an eligible collateral vault with documented withdrawals; if participation requires directional exposure, skip this deposit scenario.', 'Read margin or settlement requirements; do not assume trades generate points.', 'Close any exposure before requesting collateral withdrawal; confirm settlement.'];
  if (/rwa|stablecoin|basis/.test(c)) return ['Verify eligibility, custody, redemption rights and minimums before minting or depositing into an eligible position.', 'Check NAV and redemption notices before extending the hold.', 'Request redemption and track any queue and settlement fee separately.'];
  if (/vault|allocator|curator|yield/.test(c)) return ['Choose an eligible unlevered vault, inspect the underlying strategy and enter only if the withdrawal terms fit.', 'Review any strategy changes, fees and withdrawal gates; retain the vault shares.', 'Redeem the shares and verify how much underlying asset you received.'];
  return ['Look for a documented passive deposit route; if the product has no eligible deposit, leave the ticket unspent.', 'Log the position and confirm that the entry and hold still meet the published rules.', 'Use the documented exit, verify balances and revoke any unused approval.'];
}

function economics(p: Protocol, value: number, low: number, high: number, days: number) {
  const names = [...new Set(p.chains)].sort((a, b) => gas(a) - gas(b) || a.localeCompare(b, 'en'));
  const chain = names[0] ?? 'unverified chain';
  const perTx = gas(chain);
  const tx = 4; // Approval, entry, exit and one reserve (claim or revoke).
  const fees = tx * perTx;
  const carry = 1000 * 0.04 * days / 365;
  const share = 0.10;
  const chance = 0.25; // Assumed joint probability of launch and ticket qualifying.
  const slice = Math.min(1, 1000 / p.tvl_usd) * share * value;
  const expected = slice * chance;
  const net = expected - fees - carry;
  return {
    chain, perTx, tx, fees, days, carry, share, chance, slice, expected, net,
    floor: low / value * expected - fees - carry,
    ceiling: high / value * expected - fees - carry,
    noDrop: -fees - carry, hurdle: slice > 0 ? (fees + carry) / slice : null,
    verdict: net > 0 ? 'FARM' : expected > fees ? 'THIN' : 'SKIP',
  };
}

function plan(p: Protocol, farm: ReturnType<typeof economics>) {
  const [enter, watch, exit] = playbook(p);
  const g = '$' + farm.perTx.toFixed(2);
  return [
    `Confirm ${p.name} has a documented eligible product on ${farm.chain}. Compare listed chains for actual fees and withdrawals. Cost: $0 to research. Time: 15 min.`,
    `${enter} Budget: $1,000 capital and up to two modeled transactions at ${g} each. Time: 15 min plus confirmations.`,
    `${watch} Review weekly for ${farm.days} days. Cost: $0 for read-only checks. Time: 5 min per week; eligibility and timing unverified.`,
    `${exit} Budget: one modeled transaction at ${g}. Time: 10 min plus any protocol withdrawal delay.`,
    `Reserve ${g} for a claim or approval revoke; check the official distribution terms first. Cost with carry: $${(farm.fees + farm.carry).toFixed(2)} total modeled. Time: 5–10 min if offered.`,
  ];
}

export function liquidityProxy(p: Protocol) {
  const single = p.chains.length === 1;
  const drawdown = p.change_7d !== null && p.change_7d <= -20;
  const small = p.tvl_usd < 10_000_000;
  const observed = p.change_7d !== null && p.chains.length > 0;
  const score = Number(single) + Number(drawdown) + Number(small);
  return {score, observed, single, drawdown, small,
    label: score >= 2 ? 'Elevated' : !observed ? 'Incomplete' : score ? 'Watch' : 'No flags seen'};
}

export function build(s: Snapshot) {
  if (!s.protocols?.length || !Array.isArray(s.watchlist) || !Number.isFinite(Date.parse(s.as_of))) {
    throw new Error('Unexpected snapshot shape');
  }
  const {predict, ...validation} = calibrate(s.protocols, s.as_of);
  const watch = new Set(s.watchlist);
  const [lowLog, highLog] = validation.bounds;
  const valueOf = (log: number) => Math.max(1, Math.round(10 ** log));
  const ledger = s.protocols.map(p => {
    const reason = tokenMarker(p) ? (p.mcap_usd !== null ? 'Recorded market cap' : 'Token identity; cap unavailable') : setAside(p);
    return {...p, reason: watch.has(p.slug) && !tokenMarker(p) ? null : reason,
      status: tokenMarker(p) ? 'Token recorded' : reason && !watch.has(p.slug) ? 'Set aside' : 'Launch candidate'};
  });
  const rows = ledger.filter(p => p.status === 'Launch candidate').map(p => {
    const {log, parts, peers} = predict(p);
    const implied = valueOf(log);
    const low = valueOf(log + lowLog), high = valueOf(log + highLog);
    const listedDays = age(p, s.as_of);
    const extrapolated = size(p) < validation.sizeRange[0] || size(p) > validation.sizeRange[1];
    const evidence = extrapolated ? 'Beyond comparable TVL' : peers < 4 ? 'Sparse sector evidence' :
      p.change_7d === null || listedDays === null ? 'Missing signal' : 'Comparable support';
    const drivers = parts.slice(1).filter(d => Math.abs(d.log) > 0.001)
      .sort((a, b) => Math.abs(b.log) - Math.abs(a.log)).slice(0, 3);
    const scenarios = [30, 60, 90].map(days => economics(p, implied, low, high, days));
    const farm = scenarios[0];
    return {...p, watch: watch.has(p.slug), listedDays, parts, peers, evidence, drivers,
      implied_value_usd: implied, low, high, farm, scenarios, risk: liquidityProxy(p), farm_steps: plan(p, farm)};
  }).sort((a, b) => b.implied_value_usd - a.implied_value_usd || a.slug.localeCompare(b.slug, 'en'))
    .map((row, i) => ({...row, rank: i + 1}));
  if (rows.length < 100 || [...watch].some(slug => !rows.some(p => p.slug === slug))) {
    throw new Error('Insufficient launch coverage');
  }
  return {asOf: s.as_of, floor: s.floor_usd, rows, ledger, validation};
}
