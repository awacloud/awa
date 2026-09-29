---
module: errors
category: io/utils
dependencies: []
returns: object
worker-safe: true
status: complete
---

# errors

> Standalone fw error handling primitives: structured logger, guard, UI boundary.

**Module** `errors` | **Source** `packages/front/fw/src/io/utils/errors.js` | **Deps** none | **Worker-safe** yes

Designed for **fw standalone** consumers. Under sde/sdc, these primitives are replaced by the host reporting tools (logger → service workers + remote sink, boundary → error overlay). This module provides a minimal baseline: structured console output and guarded execution.

## Resolve

```js
const errors = runtime.resolve('errors');
// Returns: { logger, guard, boundary }
```

## API

| Method | Signature | Returns |
|--------|-----------|---------|
| `logger` | `(opts?: LoggerOpts) => Logger` | Structured logger instance |
| `guard` | `(opts?: GuardOpts) => (fn: Function, ctx?: any) => any` | Guarded execution wrapper (sync + async) |
| `boundary` | `(ui: UISession, blockId: string, opts?: BoundaryOpts) => (fn: Function) => any` | Guard bound to a UI block with fallback |

### `errors.logger(opts)` → Logger

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `level` | `'debug'\|'info'\|'warn'\|'error'\|'silent'` | `'info'` | Severity threshold; records below are ignored |
| `prefix` | `string` | `''` | Tag displayed in brackets before each message |
| `sink` | `(record: LogRecord) => void` | `null` | Overrides `console.*` output; useful for tests/redirection |

**Logger methods:**

| Method | Signature | Description |
|--------|-----------|-------------|
| `debug` | `(msg: string, ctx?: object) => void` | Debug level |
| `info` | `(msg: string, ctx?: object) => void` | Info level |
| `warn` | `(msg: string, ctx?: object) => void` | Warn level |
| `error` | `(msg: string, ctx?: object) => void` | Error level |
| `child` | `(subPrefix: string) => Logger` | Child logger — prefixes concatenated (`parent:child`) |
| `level` | getter/setter `string` | Change threshold at runtime |

**`LogRecord` structure:**

```ts
{ level: string, prefix: string, time: number, message: string, context: object }
```

### `errors.guard(opts)` → guardFn

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `onError` | `(err: Error, ctx: any) => void` | `null` | Called with the caught error and optional context |
| `rethrow` | `boolean` | `false` | If `true`, re-throws after `onError` |

The returned function `guardFn(fn, ctx?)`:
- Calls `fn()`.
- If `fn` throws (sync) → calls `onError(err, ctx)`.
- If `fn` returns a rejected Promise → chains a `.catch` that calls `onError(err, ctx)`.
- Swallows by default (`rethrow: false`).

### `errors.boundary(ui, blockId, opts)` → boundaryGuard

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `onError` | `(err: Error) => void` | `null` | Called before rendering the fallback |
| `fallback` | `string` | `null` | Text injected into the block via `ui.text(blockId, fallback)` |
| `render` | `(err, ui, blockId) => void` | `null` | Custom renderer (overrides `fallback`) |
| `clear` | `boolean` | `false` | Calls `ui.clear(blockId)` after the fallback |

- `ui` must expose `text`, `get`, and `clear` (UISession).
- `blockId` must be a non-empty string.
- The boundary never throws — all internal exceptions are swallowed.

## Examples

### Structured logger

```js
const errors = runtime.resolve('errors');
const log = errors.logger({ level: 'info', prefix: 'auth' });

log.info('login ok', { user: 'alice' });
// [auth] login ok { user: 'alice' }

log.warn('suspicious attempt', { ip: '1.2.3.4' });

// Child logger
const reqLog = log.child('request');
reqLog.error('timeout', { url: '/api/data' });
// [auth:request] timeout { url: '/api/data' }
```

### Guarded execution

```js
const errors = runtime.resolve('errors');
const log = errors.logger({ prefix: 'render' });

const guarded = errors.guard({
    onError: (err, ctx) => log.error('render failed', { err: err.message, ctx }),
});

guarded(() => render.full(items));

// Async guard
guarded(async () => {
    const data = await fetchData();
    await renderAsync(data);
}, 'fetchAndRender');
```

### UI boundary

```js
const errors = runtime.resolve('errors');

const boundary = errors.boundary(ui, 'panel', {
    fallback: 'An error occurred — please refresh the page.',
    onError: (err) => log.error(err.message),
});

boundary(() => mountComplexThing(ui));

// Async boundary
await boundary(async () => fetchAndRender());
```

## Worker Usage

```js
const worker = fw.createWorker(
    async function ({ libs, args }) {
        const log = libs.errors.logger({ prefix: 'worker', level: 'warn' });
        const guarded = libs.errors.guard({
            onError: (err) => log.error('task failed', { err: err.message }),
        });
        const result = guarded(() => heavyComputation(args.data));
        self.postMessage(result);
    },
    { dependencies: ['errors'], args: { data: [1, 2, 3] } }
);
```

## Notes

- `boundary` requires a `UISession` with `text`, `get`, `clear` — do not use in worker context (no DOM); prefer `guard` in workers.
- Exceptions thrown in `onError` or `sink` are swallowed — the boundary/guard must never break its caller.
- `child(subPrefix)` inherits `level` and `sink` from the parent at creation time; the parent's `level` setter does not retroactively affect children.
- `silent` as the level mutes all output, including `error` — useful in tests to reduce console noise.

## See also

- [signal](./signal.md) — reactive state for coordinating errors across components
- [eventBus](./eventBus.md) — propagate error events cross-module
- [cancellable](../sync/cancellable.md) — orchestrated cleanup during async task cancellation
