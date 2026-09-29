---
module: chart
category: dom/rendering
dependencies: [dom, animate, stats, linalg]
returns: object
worker-safe: false
status: complete
---

# chart

> Minimal Canvas 2D charts for internal observability — line, area, bar, sparkline.

**Module** `chart` | **Source** `packages/front/fw/src/dom/rendering/chart.js` | **Deps** `dom`, `animate`, `stats`, `linalg` | **Worker-safe** no

Lightweight visualisation module designed for the task manager and internal dashboards. All instances return a handle with a uniform API `{ update, resize, setOpts, dispose }`. Rendering is DPR-aware (Device Pixel Ratio). No tooltip or PNG export in the MVP — for those use cases, use an external library (Chart.js, D3…).

## Resolve

```js
const chart = runtime.resolve('chart');
// Returns: { line, area, bar, sparkline }
```

## API

| Method | Signature | Returns |
|---------|-----------|---------|
| `line` | `(opts: LineOpts) => ChartHandle` | Update / dispose handle |
| `area` | `(opts: LineOpts) => ChartHandle` | Handle with fill under the curve |
| `bar` | `(opts: BarOpts) => ChartHandle` | Vertical bar handle |
| `sparkline` | `(opts: SparkOpts) => ChartHandle` | Minimal line without axes |

### Common options

| Option | Type | Default | Description |
|--------|------|--------|-------------|
| `el` | `HTMLCanvasElement \| HTMLElement` | — | Canvas or container (canvas auto-created) |
| `data` | `number[] \| {x:number,y:number}[]` | `[]` | Data to display |
| `color` | `string` | `'#4a9eff'` | Primary CSS colour |
| `animate` | `number \| false` | `false` | Animation duration in ms, or `false` |

### `line` / `area` options

| Option | Type | Default | Description |
|--------|------|--------|-------------|
| `xAxis` | `AxisOpts?` | auto | X-axis configuration |
| `yAxis` | `AxisOpts?` | auto | Y-axis configuration |
| `smoothing` | `'none' \| 'monotone'` | `'none'` | Fritsch-Carlson curve smoothing |

### `AxisOpts` options

| Option | Type | Default | Description |
|--------|------|--------|-------------|
| `label` | `string?` | — | Axis label (not displayed in MVP) |
| `ticks` | `number[]?` | auto (5) | Tick values |
| `format` | `(v: number) => string` | `String(round(v))` | Tick formatter |
| `domain` | `[min, max]?` | auto-fit | Explicit domain |

### `ChartHandle` interface

| Method | Signature | Description |
|---------|-----------|-------------|
| `update` | `(data: number[] \| {x,y}[]) => void` | Replaces data and redraws |
| `resize` | `() => void` | Recalculates dimensions and redraws |
| `setOpts` | `(opts: Partial<Opts>) => void` | Merges options and redraws |
| `dispose` | `() => void` | Detaches ResizeObserver, cancels rAF, releases resources |

## Examples

### Real-time line chart

```js
const chart = runtime.resolve('chart');

const canvas = document.querySelector('#cpu-canvas');
const handle = chart.line({
    el: canvas,
    data: [10, 20, 35, 28, 40],
    color: '#4a9eff',
    yAxis: { domain: [0, 100], format: v => v + '%' },
});

// Update every second
setInterval(() => {
    handle.update(getCpuHistory());
}, 1000);

// Cleanup
handle.dispose();
```

### Area with animation

```js
const chart = runtime.resolve('chart');

const h = chart.area({
    el: document.querySelector('#mem'),
    data: memHistory,
    color: '#22c55e',
    animate: 400,
    smoothing: 'monotone',
});
```

### Bar chart

```js
const chart = runtime.resolve('chart');

const h = chart.bar({
    el: document.querySelector('#io'),
    data: [{ x: 0, y: 120 }, { x: 1, y: 340 }, { x: 2, y: 88 }],
    color: '#f59e0b',
    yAxis: { format: v => v + ' MB/s' },
});
```

### Sparkline (mini graph without axes)

```js
const chart = runtime.resolve('chart');

const h = chart.sparkline({
    el: document.querySelector('#spark'),
    data: [1, 3, 2, 5, 4, 6],
    color: '#a78bfa',
});

h.update([2, 4, 3, 7, 5]);
h.dispose();
```

## Notes

- DPR-aware: `canvas.width = displayWidth * devicePixelRatio` + `ctx.scale(dpr, dpr)` — rendering stays sharp on Retina displays.
- Auto-fit domain: if `domain` is not provided, the domain is computed from `stats.min/max` with 5% padding. If all values are identical, the domain is widened by ±1.
- `sparkline` displays no axes or ticks — ideal for compact inline trend indicators.
- No tooltip, no interactivity, no PNG export in the MVP — deliberately out of scope to stay lightweight.
- `ResizeObserver` is attached only when `el` is an HTML container (not a `<canvas>`) — call `resize()` manually if the canvas is resized directly.
- `dispose()` is idempotent: multiple successive calls are safe.

## See also

- [virtualScroll](./virtualScroll.md) — high-performance virtualised list
- [animate](../display/animate.md) — rAF animations with easing
- [stats](../../io/math/stats.md) — descriptive statistics (min, max, mean…)
- [themeTokens](./themeTokens.md) — CSS tokens for chart colours
