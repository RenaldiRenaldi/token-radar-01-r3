const D = window.SOUNDINGS;
const screen = document.querySelector('#screen');
const $ = id => document.getElementById(id);
const compact = Intl.NumberFormat('en-US', {notation: 'compact', maximumFractionDigits: 1});
const exact = Intl.NumberFormat('en-US', {style:'currency', currency:'USD'});
const usd = n => (n < 0 ? '−$' : '$') + compact.format(Math.abs(n));
const pct = n => (100 * n).toFixed(1) + '%';
const factor = log => '×' + (10 ** log).toFixed(2);
const esc = x => String(x ?? 'Unknown').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const options = (items, current) => items.map(i => `<option ${i === current ? 'selected' : ''}>${esc(i)}</option>`).join('');
const V = D.validation;
const indexed = new Map(D.rows.map(r => [r.slug, r]));
const filters = {search:'', category:'All categories', scope:'All candidates', sort:'Implied value', verdict:'Any verdict'};
let ledgerFilter = 'All protocols';
const hero = (k, title, deck) => `<div class="eyebrow">${k}</div><h1>${title}</h1><p class="lede">${deck}</p>`;
const tag = (value, cls = '') => `<span class="tag ${cls}">${esc(value)}</span>`;
const dollarRange = r => usd(r.low) + ' – ' + usd(r.high);
const txNote = 'Gas is a scenario estimate, not a quote. Asset losses, product fees, bridges and slippage are outside the net.';
function recompute(row) {
  return Math.max(1, Math.round(10 ** row.parts.reduce((sum, part) => sum + part.log, 0)));
}
const match = r => recompute(r) === r.implied_value_usd;
const card = (value, label) => `<div class="metric"><strong>${value}</strong><small>${label}</small></div>`;
const metrics = () => `<div class="metrics">${card(D.rows.length, 'launch candidates')}${card(D.rows.filter(r => r.watch).length, 'of 40 watchlist covered')}${card('×' + V.radar4.median.toFixed(2), 'median held-out miss')}${card(pct(V.radar4.hits / V.radar4.n), 'within 3× · ' + V.radar4.n + ' comps')}</div>`;
const table = (heads, body) => `<div class="scroll"><table><thead><tr>${heads.map(h => `<th scope="col">${h}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table></div>`;

function launch() {
  screen.innerHTML = hero('01 / Launch board', 'Price the launch. Test the farm.', 'Implied circulating cap if a token launches. Open any name for the math, the break-even hurdle and a timed plan.')
    + metrics() + `<div class="tools">
      <input id="search" type="search" placeholder="Find a protocol or chain" aria-label="Find a protocol or chain" value="${esc(filters.search)}">
      <label>Universe <select id="scope">${options(['All candidates','House watchlist','Outside watchlist'],filters.scope)}</select></label>
      <label>Category <select id="category">${options(['All categories', ...new Set(D.rows.map(r => r.category ?? 'Unknown').sort())],filters.category)}</select></label>
      <label>Farm <select id="verdict">${options(['Any verdict','FARM','THIN','SKIP'],filters.verdict)}</select></label>
      <label>Sort <select id="sort">${options(['Implied value','TVL','30d net','7d change'],filters.sort)}</select></label>
    </div><div id="results"></div>`;
  for (const key of Object.keys(filters)) $(key).addEventListener(key === 'search' ? 'input' : 'change', e => {
    filters[key] = e.target.value;
    list(10);
  });
  list(10);
}

function list(limit) {
  const q = filters.search.trim().toLowerCase();
  const results = D.rows.filter(r => [r.name,r.slug,...r.chains].join(' ').toLowerCase().includes(q) &&
    (filters.category === 'All categories' || (r.category ?? 'Unknown') === filters.category) &&
    (filters.verdict === 'Any verdict' || r.farm.verdict === filters.verdict) &&
    (filters.scope === 'All candidates' || r.watch === (filters.scope === 'House watchlist')));
  const sorts = {'TVL':r => r.tvl_usd, '30d net':r => r.farm.net, '7d change':r => r.change_7d ?? -Infinity};
  const key = sorts[filters.sort];
  if (key) results.sort((a,b) => key(b) - key(a) || a.rank - b.rank);
  const rows = results.slice(0,limit);
  $('results').innerHTML = `<p class="eyebrow" aria-live="polite">${rows.length} shown / ${results.length} matching · ${D.rows.filter(match).length}/${D.rows.length} value checks pass</p>` +
    table(['#','Protocol','Implied cap','P25–P75 cap','Top valuation drivers','30d farm','Liquidity flags'],
      rows.map(r => `<tr><td class="rank">${String(r.rank).padStart(2,'0')}</td>
      <td><button class="bare" data-row="${esc(r.slug)}">${esc(r.name)}</button><small>${esc(r.category)} · ${usd(r.tvl_usd)} TVL${r.watch ? ' · House' : ''}</small></td>
      <td><strong>${usd(r.implied_value_usd)}</strong><small class="${match(r) ? 'good' : 'bad'}">${match(r) ? '✓ match' : 'Mismatch'}</small></td>
      <td>${dollarRange(r)}<div class="range" aria-hidden="true"><i style="left:${100 * (-V.bounds[0])/(V.bounds[1]-V.bounds[0])}%"></i></div></td>
      <td>${r.drivers.slice(0,2).map(d => esc(d.label) + ' ' + factor(d.log)).join(' · ')}<small>${esc(r.evidence)}</small></td>
      <td>${tag(r.farm.verdict, r.farm.verdict)} <span class="mono">${exact.format(r.farm.net)}</span><small>${esc(r.farm.chain)}</small></td>
      <td>${tag(r.risk.label, r.risk.score >= 2 ? 'bad' : r.risk.score ? 'watch' : '')}</td></tr>`).join(''))
    + (results.length > limit ? '<div class="tools"><button id="more">Show all matching candidates</button></div>' : '');
  $('more')?.addEventListener('click', () => list(results.length));
}

function detail(r) {
  const f = r.farm;
  const review = r.evidence === 'Beyond comparable TVL' ? 'Find priced peers at this TVL before relying on the extrapolation.' :
    r.peers < 4 ? 'A new priced sector peer would make the sector adjustment more defensible.' :
    r.risk.drawdown ? 'Wait for the drawdown to stabilize and verify withdrawals on the proposed chain.' :
    'Revisit after a fresh TVL print or official eligibility and circulating supply terms.';
  screen.innerHTML = `<div class="tools"><button data-view="launch">← Return to launch board</button><span class="stamp">Protocol field note / ${r.rank} of ${D.rows.length}</span></div>` +
    hero(esc(r.category ?? 'Unclassified') + ' / ' + esc(r.slug), esc(r.name), esc(r.chains.join(' · ')) + ' · ' + usd(r.tvl_usd) + ' TVL · ' + (r.change_7d === null ? '7d change unknown' : r.change_7d + '% over 7d') + ' · ' + (r.listedDays ?? '?') + ' listed days') +
    `<div class="metrics">${card(usd(r.implied_value_usd),'implied cap')}${card(dollarRange(r),'P25–P75')}${card(tag(f.verdict,f.verdict),'30-day scenario')}${card(match(r) ? 'Verified' : 'Mismatch','browser ⇄ board')}</div>
    <div class="grid detailgrid"><section class="panel">
    <h2>Price anatomy</h2><p class="muted">${esc(r.evidence)} · ${r.peers} priced sector peers</p>
    <div class="factors">${r.parts.map(d => `<span>${esc(d.label)}</span><span class="mono">${d.label === 'Size baseline' ? usd(10 ** d.log) : factor(d.log)}</span>`).join('')}</div>
    <p class="mono">10 ^ Σ log contributions = ${exact.format(recompute(r))}</p>
    <h3>Liquidity screen · ${r.risk.score}/3 · ${esc(r.risk.label)}</h3>
    <p class="muted">+1 for TVL below $10M; +1 for one listed chain; +1 for a weekly TVL drop of 20% or more. ${r.risk.observed ? 'Growth and chains observed.' : 'Growth or chain data missing.'} Checks: ${[r.risk.small,r.risk.single,r.risk.drawdown].map(v => v ? 'flag' : '—').join(' / ')}. Contract safety and executable liquidity are unknown.</p>
    <div class="callout"><b>What would change this view?</b> ${review}</div></section>
    <section class="panel"><h2>$1,000 farm plan · ${esc(f.chain)}</h2><ol>${r.farm_steps.map(p => '<li>' + esc(p) + '</li>').join('')}</ol>
    <p class="callout">Conditional slice ${exact.format(f.slice)} × ${pct(f.chance)} assumed launch + eligibility − ${exact.format(f.fees)} gas − ${exact.format(f.carry)} carry = <strong>${exact.format(f.net)}</strong>.</p>
    <p>Break-even chance: <b>${pct(f.hurdle)}</b> · If no drop: <b>${exact.format(f.noDrop)}</b></p>
    ${table(['Hold','Low net','Base net','High net','Call'],r.scenarios.map(s => `<tr><td>${s.days}d</td><td>${exact.format(s.floor)}</td><td>${exact.format(s.net)}</td><td>${exact.format(s.ceiling)}</td><td>${tag(s.verdict,s.verdict)}</td></tr>`).join(''))}
    <p class="muted">${txNote}</p></section></div>`;
}

function portfolio() {
  screen.innerHTML = hero('02 / Portfolio lab','Five launches, one budget.', 'Stress the same ticket across five picks. All legs hit their low or high valuation together; the endpoints are scenarios without a confidence level.')
    + `<section class="panel scenario">
    <label>Capital $ <input id="capital" type="number" min="0" max="1000000" value="1000"></label>
    <label>Chance % <input id="chance" type="number" min="0" max="100" value="25"></label>
    <label>Hold <select id="days">${options(['30','60','90'],'30')}</select> days</label>
    <label>Allocation <select id="preset">${options(['Top 5 by cap','Top 5 by 30d net'],'Top 5 by cap')}</select></label>
    <p class="muted">Edit relative weights; set zero to drop a leg. Every active leg pays its own four transactions. Chance combines a launch and a qualifying distribution.</p>
    <div id="alloc"></div><div id="totals" aria-live="polite"></div></section>`;
  let picks;
  const active = () => {
    picks = ($('preset').value === 'Top 5 by cap' ? D.rows : [...D.rows].sort((a,b) => b.farm.net - a.farm.net)).slice(0,5);
    $('alloc').innerHTML = picks.map((r,i) => `<label>${esc(r.name)} <input class="weight" id="w${i}" aria-label="${esc(r.name)} weight" type="number" value="1" min="0" max="100"></label>`).join('');
    $('alloc').addEventListener('input', update);
    update();
  };
  function update() {
    const bound = (id,max) => Math.min(max,Math.max(0,Number($(id).value) || 0));
    const weights = picks.map((_,i) => bound('w'+i,100));
    const sum = weights.reduce((a,b) => a+b,0);
    const capital = bound('capital',1000000), chance = bound('chance',100)/100, days = Number($('days').value);
    const legs = picks.map((r,i) => {
      const cash = sum ? capital * weights[i] / sum : 0;
      const fee = cash ? r.farm.fees : 0;
      const carry = cash * .04 * days / 365;
      const payoff = x => x * Math.min(1,cash/r.tvl_usd) * r.farm.share * chance - fee - carry;
      return {r,cash,fee,carry,low:payoff(r.low),base:payoff(r.implied_value_usd),high:payoff(r.high)};
    });
    const total = k => legs.reduce((a,b) => a+b[k],0);
    $('totals').innerHTML = `<div class="metrics">${card(exact.format(total('low')),'joint low net')}${card(exact.format(total('base')),'base net')}${card(exact.format(total('high')),'joint high net')}${card(exact.format(-total('fee')-total('carry')),'no distribution')}</div>`
      + '<div class="exposure" aria-hidden="true">' + legs.map(l => `<i style="flex:${l.cash}"></i>`).join('') + '</div>'
      + table(['Protocol','Capital','Gas','Carry','Low net','Base net','High net'],legs.map(l => '<tr><td>'+esc(l.r.name)+'</td>'+
        ['cash','fee','carry','low','base','high'].map(k => '<td>'+exact.format(l[k])+'</td>').join('')+'</tr>').join(''))
      + '<p class="muted">Every leg assumes a 10% pro rata depositor pool. ' + txNote + '</p>';
  }
  $('preset').onchange = active;
  for (const id of ['capital','chance','days']) $(id).oninput = update;
  active();
}

function validation() {
  screen.innerHTML = hero('03 / Model audit','One protocol out. Refit everything.', 'Cross-sectional transfer to priced tokens on one frozen date. This is not validation against realized launch prices.') + metrics() +
    `<div class="grid"><section class="panel"><h2>Same 119 comparables</h2>
    ${table(['Pipeline','Median miss','Within 3×'],[['Radar-3 TVL curve',V.radar3],['Radar-4 nested selection',V.radar4]].map(([n,m]) =>
      `<tr><td>${n}</td><td>×${m.median.toFixed(2)}</td><td>${m.hits}/${m.n} · ${pct(m.hits/m.n)}</td></tr>`).join(''))}
    <p class="callout">Band: actual/predicted residual quartiles ${factor(V.bounds[0])} to ${factor(V.bounds[1])}. Sparse sectors and TVL extrapolation are marked on each row.</p></section>
    <section class="panel"><h2>${esc(V.model)}</h2><p>Each outer fold leaves one positive-cap, non-CEX protocol out. Five inner folds choose among prespecified feature sets for that run; the outer target does not enter selection or fitting.</p>
    <p>Inputs: log TVL, clipped weekly growth, DefiLlama listing age, deployment breadth and pooled sector peers. Huber weighting limits outlier pull. Candidate prices use a fit on all priced peers.</p>
    <p class="muted">Candidate families were explored on this snapshot. Repeated projects or shared tokens may make row-level validation optimistic. No forward series or launch caps available.</p></section></div>
    <details><summary>Inner model comparison and all ${V.folds.length} outer predictions</summary>
    ${table(['Family','Inner soft loss'],V.trials.map(t => `<tr><td>${esc(t.name)}</td><td>${t.loss.toFixed(4)}</td></tr>`).join(''))}
    ${table(['Held out','Observed cap','Predicted','Miss','Inner winner'],V.folds.map(f => `<tr><td>${esc(f.slug)}</td><td>${usd(f.actual)}</td><td>${usd(f.predicted)}</td><td>${factor(Math.abs(f.error))}</td><td>${esc(f.selected)}</td></tr>`).join(''))}</details>`;
}

function ledger() {
  const states = ['All protocols','Launch candidate','Token recorded','Set aside'];
  screen.innerHTML = hero('04 / Universe audit','Where every row went.', 'The snapshot records a token identity or cap for some rows. Product exclusions are shown separately from priced launch candidates.') +
    `<div class="metrics">${states.map(c => card(c === 'All protocols' ? D.ledger.length : D.ledger.filter(p=>p.status===c).length,c)).join('')}</div>
    <div class="tools"><label>Show <select id="ledger-filter">${options(states,ledgerFilter)}</select></label><input id="ledger-query" type="search" aria-label="Find in universe" placeholder="Find in universe"></div><div id="ledger-rows"></div>`;
  function render() {
    ledgerFilter = $('ledger-filter').value;
    const query = $('ledger-query').value.trim().toLowerCase();
    const rows = D.ledger.filter(p => (ledgerFilter === states[0] || p.status === ledgerFilter) &&
      (p.slug+' '+p.name).toLowerCase().includes(query)).sort((a,b) => b.tvl_usd-a.tvl_usd);
    $('ledger-rows').innerHTML = table(['Protocol','Category','TVL','Token cap','Disposition'], rows.map(p => `<tr><td>${indexed.has(p.slug) ?
      '<button class="bare" data-row="'+esc(p.slug)+'">'+esc(p.name)+'</button>' : esc(p.name)}</td>
      <td>${esc(p.category)}</td><td>${usd(p.tvl_usd)}</td><td>${p.mcap_usd === null ? '—' : usd(p.mcap_usd)}</td>
      <td>${esc(p.status)}${p.reason ? ' · '+esc(p.reason) : ''}</td></tr>`).join(''));
  }
  $('ledger-filter').onchange = $('ledger-query').oninput = render;
  render();
}

function navigate() {
  const params = new URLSearchParams(location.hash.slice(1));
  const r = indexed.get(params.get('row'));
  const mode = r ? 'launch' : params.get('view') ?? 'launch';
  for (const b of document.querySelectorAll('nav button')) {
    if (b.dataset.view === mode) b.setAttribute('aria-current','page');
    else b.removeAttribute('aria-current');
  }
  if (r) detail(r);
  else if (mode === 'portfolio') portfolio();
  else if (mode === 'validation') validation();
  else if (mode === 'ledger') ledger();
  else {
    if (params.has('farm')) filters.verdict = params.get('farm');
    launch();
  }
  scrollTo(0,0);
}
document.addEventListener('click', e => {
  const button = e.target.closest('button');
  if (button?.dataset.row) location.hash = 'row=' + encodeURIComponent(button.dataset.row);
  else if (button?.dataset.view) location.hash = 'view=' + button.dataset.view;
});
window.addEventListener('hashchange',navigate);
$('date').textContent = 'SNAPSHOT / ' + D.asOf;
navigate();
