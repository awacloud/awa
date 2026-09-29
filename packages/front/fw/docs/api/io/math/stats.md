---
module: stats
category: io/math
dependencies: []
returns: object
worker-safe: true
status: complete
---

# stats

> Descriptive statistics — mean, median, quantile, variance, histogram, normalize.

**Module** `stats` | **Source** `packages/front/fw/src/io/math/stats.js` | **Deps** none | **Worker-safe** yes

Basic statistical computations on arrays of numbers. Single-pass where possible (mean, sum); sorting required for median, quantile, iqr. All functions throw on empty arrays or arrays with NaN.

## Resolve

```js
const stats = runtime.resolve('stats');
// Returns: { mean, median, mode, geomean, harmean, variance, stddev, range, iqr, mad, min, max, sum, product, quantile, percentile, histogram, zscore, normalize, standardize }
```

## API

| Method | Signature | Returns |
|--------|-----------|---------|
| `mean` | `(arr: number[]) => number` | Arithmetic mean |
| `median` | `(arr) => number` | Median value |
| `mode` | `(arr) => number` | Most frequent value |
| `geomean` | `(arr) => number` | Geometric mean |
| `harmean` | `(arr) => number` | Harmonic mean |
| `variance` | `(arr, sample?) => number` | Population or sample variance |
| `stddev` | `(arr, sample?) => number` | Standard deviation |
| `range` | `(arr) => number` | max - min |
| `iqr` | `(arr) => number` | Q3 - Q1 |
| `mad` | `(arr) => number` | Median absolute deviation |
| `min` / `max` | `(arr) => number` | Extreme values |
| `sum` / `product` | `(arr) => number` | Sum / product |
| `quantile` | `(arr, q: [0,1]) => number` | Type 7 quantile (R standard) |
| `percentile` | `(arr, p: [0,100]) => number` | Alias `quantile(arr, p/100)` |
| `histogram` | `(arr, bins: number \| edges[]) => {edges, counts}` | Distribution by bins |
| `zscore` | `(value, arr) => number` | Z-score |
| `normalize` | `(arr, {min?, max?}) => number[]` | Remap to [min, max] |
| `standardize` | `(arr) => number[]` | (x - mean) / stddev |

## Examples

### Basic statistics

```js
const stats = runtime.resolve('stats');

const data = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

console.log(stats.mean(data));      // 5.5
console.log(stats.median(data));    // 5.5
console.log(stats.variance(data));  // 8.25 (population)
console.log(stats.stddev(data, true)); // ~3.03 (sample)
```

### Quantiles and distribution

```js
const scores = [45, 52, 61, 71, 75, 80, 85, 90, 95, 100];

const q1 = stats.quantile(scores, 0.25);
const q3 = stats.quantile(scores, 0.75);
console.log(`IQR: ${stats.iqr(scores)}`);

const { edges, counts } = stats.histogram(scores, 5);
```

### Normalization

```js
const normalized = stats.normalize([0, 5, 10], { min: 0, max: 1 });
// [0, 0.5, 1]

const standardized = stats.standardize(data);
// mean ≈ 0, stddev ≈ 1
```

## Worker Usage

```js
const worker = fw.createWorker(
    function ({ libs, args }) {
        return {
            mean: libs.stats.mean(args.data),
            stddev: libs.stats.stddev(args.data),
        };
    },
    { dependencies: ['stats'], args: { data: [1, 2, 3, 4, 5] } }
);
```

## Notes

- `quantile` Type 7 (R default method, Excel `PERCENTILE`) — linear interpolation between sorted values.
- `mean([])` and any call on an empty array throws `'stats: empty array'` — no silent `NaN` return.
- `variance(arr, true)` divides by `n-1` (sample); `false` (default) divides by `n` (population).
- `histogram` with a bin count: evenly distributed bins over `[min, max]`. With explicit edges: bins between successive edges.

## See also

- [interp](./interp.md) — spatial interpolation
- [linalg](./linalg.md) — linear algebra
