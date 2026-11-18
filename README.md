# Soundings / token radar 04

## Why radar-4 beats radar-3

Radar-3 tested its TVL curve alone but deployed additional multipliers. Its
band used training residuals, and its farm slice assumed a distribution.
Radar-4 checks the full fit and selection pipeline and exposes its assumptions
before anyone reads a dollar figure as a payoff estimate.

The public dev performance leaderboard confirmed nyx77, sudhan and
brisk-kestrel-93 in the top three. All top ten had blank repo URLs and marked
their source withheld. Nyx77's title gives no technical details. Sudhan advertises
fitted prices, 66 plans and whole-snapshot accounting; Undercurrent advertises a
walk-forward test and deposit-sized plans. Launchscope and calm-owl-82 advertise
blind comparisons and timed plans; rstrike and tidy-meteor-25 give only titles;
ronigrv advertises a held-out fit and net verdicts; hazel-harbor-63 advertises
one comparable per ticker; lufi-aq advertises two validation protocols and rank
ranges. These titles establish a high bar for evidence and usability, not a
technical audit of withheld entries.

## Why radar-4 beats the top ranks

The portfolio lab lets readers split a single budget across five launches or
five farms, change the assumed chance and hold, and see how per-leg fixed fees
change the result. Bands move together in its low and high scenarios; it makes
no diversification or probability claim about those endpoints. A simultaneous
no-distribution result shows the cost if every position comes up empty.

The liquidity screen puts a separate set of observable flags beside every pick:
single-chain exposure, a seven-day TVL drawdown of at least 20%, and TVL below
$10M. It shows the checks and identifies missing fields in the detail view.
These are simple exposure flags, not a contract audit or a measure of executable
liquidity. Neither feature is advertised by the top three; their withheld source
prevents stronger claims.
The snapshot has no owner privileges, holder data, launch dates, social metrics,
revenue, historical TVL series or gas quotes. It contains exactly 758 protocols.

## Validation

| Same leave-one-out comparable set | Median multiplicative miss | Within 3× |
| --- | ---: | ---: |
| Radar-3 published size-only test, reproduced | ×3.36 | 52/119 (43.7%) |
| Radar-4 nested model selection | ×3.11 | 59/119 (49.6%) |

In each outer fold a single protocol is left out, using the original rule:
positive cap and TVL, excluding CEX. Radar-3 refits the rounded log-log OLS
curve. Radar-4 partitions the remaining rows into five folds by slug order and
selects a model by mean soft threefold loss: `e / (log10(3) + e)`, with
`e = abs(log10(actual / predicted))`. It then refits on those 118 rows to
predict the one held out. The same selection procedure over all 119 rows chooses
the production fit, robust shrinkage with broad sector adjustments. The model
audit exposes all nine trial families and all 119 held-out predictions.

The first experiment with narrow categories and absolute log loss did not
improve either metric. The revised candidate menu pools related product
categories and uses a bounded loss aligned with the requested threefold test.
Those choices were developed on this snapshot; nesting prevents each held-out
target from entering its own fit or model selection, but does not create an
independent test of the research process. Rows can share projects or underlying
tokens. This is a test of transfer to other live caps on one date; it does not
validate future launches, airdrop odds or token supply.

The price is the exponential of additive log10 contributions: TVL, clipped
weekly change, listing age, chain count, missingness indicators and a shrunk
sector residual. A Huber threshold of 0.55 log units downweights extremes.
The band uses the outer signed error quartiles; it describes the middle half
of comparable misses, with no per-launch coverage guarantee. Each row labels
thin peer support, missing inputs or extrapolation where applicable.

## Farm and coverage

The 30-day $1,000 reference ticket uses a hypothetical 10% depositor pool, a
25% scenario chance of a launch with a qualifying distribution, four modeled
transactions and 4% annual carry. **FARM** clears gas and carry; **THIN** clears
gas only; **SKIP** clears neither. Gas assumptions are $12 on Ethereum, $0.05
on Solana, $0.30 on listed lower-cost networks, and $1 otherwise. Product
availability, executable fees, asset losses and eligibility are unverified.
Every plan lists actions, timing and modeled cost, with a break-even chance and
30/60/90-day sensitivity. The universe audit accounts for all 758 protocols:
198 ranked (including all 40 house watchlist entries), 144 set aside, and 416
with a recorded token marker, including those without a cap.

Run with Node 22 and no dependencies:

```sh
node main.ts --input /path/to/snapshot.json --output /tmp/soundings
```

Open `/tmp/soundings/dashboard/index.html` offline. `captures/` contains text
encodings of the actual Chromium captures, decoded to JPEG for the scorer.
