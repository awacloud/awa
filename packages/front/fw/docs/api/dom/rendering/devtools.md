---
module: devtools
category: dom/rendering
dependencies: [clock]
returns: object
worker-safe: false
status: complete
---

# devtools

> Read-only introspection of a uiSession + lightweight profiler + readable elm-array dump.

**Module** `devtools` | **Source** `packages/front/fw/src/dom/rendering/devtools.js` | **Deps** `clock` | **Worker-safe** no

Exposes data only (snapshots, strings, durations) — no UI. The `sde/sdc` layer can build a debug panel or console on top. Standalone usage: pipe the outputs to `console.log` / `console.table`.

## Resolve

```js
const dev = runtime.resolve('devtools');
// Returns: { inspect, summarize, dumpTemplate, profile, profileAsync, timer }
```

## API

| Method | Signature | Returns |
|---------|-----------|---------|
| `inspect` | `(session: UISession) => Snapshot` | Plain-JSON snapshot of the session |
| `summarize` | `(session: UISession) => string` | Single-line summary |
| `dumpTemplate` | `(input: ParseResult \| ElmNode[], opts?) => string` | Readable indented tree |
| `profile` | `(fn: () => T) => { result: T, durationMs: number }` | Sync profile |
| `profileAsync` | `(fn: () => Promise<T>) => Promise<{ result: T, durationMs: number }>` | Async profile |
| `timer` | `() => { mark(label), end() }` | Multi-segment profiler |

### `dev.inspect(session)` → Snapshot

Photographs the logical state of the session without capturing live DOM nodes. All missing internal fields are tolerated (returned as `null` or `[]`) — useful on a partially disposed session.

Returned shape:

```ts
{
  container:    string | null,
  blocks:       Array<{ id: string, logicalIds: string[], isLoop: boolean }>,
  attaches:     Array<{ blockId: string, slots: string[] }>,
  children:     Array<{ parent: string, children: string[] }>,
  listeners:    Array<{ blockId: string, logicalId: string, names: string[] }>,
  mountHooks:   string[],
  unmountHooks: string[],
  lists:        Array<{ parent: string, slot: string, size: number, disposed: boolean }>,
  portals:      Array<{ name: string, container: any }>,
}
```

Throws `Error` if `session` is `null` / not an object.

### `dev.summarize(session)` → string

Returns a space-separated string, one token per mounted block: `id(logicalIds…)`. Loops: `id(loop×N)`. Convenient for quick `console.log`.

### `dev.dumpTemplate(input, opts?)` → string

Indented render of the tree of an elm-array or a full `ParseResult`. Each line: `<tag#id> [text=…] [slot=…] [attrs=…] [map=…]`. The `iterates` of a `ParseResult` are displayed in separate sections.

| Option | Type | Default | Description |
|--------|------|--------|-------------|
| `indent` | `string` | `'  '` (2 spaces) | Indentation string per level |

### `dev.profile(fn)` → `{ result, durationMs }`

Executes `fn()` synchronously and returns its result + the duration via `clock.monotonic` (~1 ms resolution). Throws `Error` if `fn` is not a function.

### `dev.profileAsync(fn)` → `Promise<{ result, durationMs }>`

Async variant. Throws `Error` if `fn` is not a function.

### `dev.timer()` → `{ mark(name), end() }`

Multi-segment profiler. `mark(name)` opens a segment and closes the previous one. `end()` closes the last open segment and returns:

```ts
{
  total:    number,  // ms since the timer was created
  segments: Array<{ name: string, durationMs: number }>
}
```

## Examples

### Inspecting a session in the console

```js
const dev = runtime.resolve('devtools');
const ui  = runtime.resolve('uiSession')('app');

// … mount some blocks …

console.table(dev.inspect(ui).blocks);
console.log(dev.summarize(ui));
// e.g.: "header(h1,nav) content(body) sidebar(menu)"
```

### Dumping a parsed template

```js
const parser = runtime.resolve('parser');
const result = parser.fromHTML('<ul><li>#{text}</li></ul>');

console.log(dev.dumpTemplate(result));
// <ul#root>
//   <li#item> map=[$text=#{text}=]
```

### Synchronous profile

```js
const { result, durationMs } = dev.profile(() => render.full(items));
console.log(`render: ${durationMs.toFixed(2)} ms`, result);
```

### Async profile

```js
const { result, durationMs } = await dev.profileAsync(async () => {
    const resp = await fetch('/api/data');
    return resp.json();
});
console.log(`fetch+parse: ${durationMs.toFixed(2)} ms`);
```

### Multi-segment timer

```js
const t = dev.timer();
t.mark('parse');  const parsed = parser.fromHTML(html);
t.mark('render'); const elms   = render.full(parsed, data);
t.mark('insert'); template.elms('app', elms);
const { total, segments } = t.end();
console.table(segments);
// parse: 1.2 ms, render: 0.8 ms, insert: 2.1 ms, total: 4.1 ms
```

## Notes

- `inspect()` reads the internal fields `_map`, `_attach`, `_children`, `_listeners`, `_mount`, `_unmount`, `_lists`, `_portals`, `_container` of `uiSession`. These are implementation details — the snapshot may change between major versions.
- `worker-safe: false` — `devtools` is not designed for Worker use; the `clock` module itself does not impose this restriction.
- `profile` / `profileAsync` use `clock.monotonic` (sanity-safe, not direct `performance.now`) — resolution is ~1 ms on most platforms.
- **`devtools.factory(clock)` takes the clock INSTANCE, not the `clock` module descriptor**. `runtime.resolve('devtools')` injects it correctly — `def.factory.apply({}, deps)` in `src/core/runtime.js` calls dependency factories for you before injection. Hand-wiring outside `resolve()` must do the same call itself: `devtools.factory(clock.factory())`, never `devtools.factory(clock)`.
- `dumpTemplate` does not capture live DOM nodes — only the static elm-array structure. For live DOM state, use `dev.inspect()`.
- **Internals**: `uiSession` is composed of three internal mixins (`uiSession-core.js`, `uiSession-direct.js`, `uiSession-list.js`) that are not documented separately; `inspect()` reflects their combined structure.

## See also

- [uiSession](./uiSession.md) — the inspected session
- [parser](./parser.md) — produces the `ParseResult` objects passed to `dumpTemplate`
- [clock](../../io/timing/clock.md) — time base used by the profiler
