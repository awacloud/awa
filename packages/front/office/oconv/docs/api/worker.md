---
module: worker
category: oconv
dependencies: []
returns: object
worker-safe: true
status: complete
---

# worker

> The `@awacloud/oconv` Worker entry — one conversion per message, three message kinds.

**Module** `worker` (exported as the `./worker.js` sub-path — spawned by URL/path, DOM-free) | **Source** `packages/front/office/oconv/src/worker/entry.js`, bundled into `src/worker.js` | **Deps** — | **Worker-safe** yes

The worker's source, `src/worker/entry.js`, builds its own `ModuleRuntime` from the package manifest; `bun run gen:worker` bundles it (browser, ESM, not minified) into `src/worker.js`, which imports nothing and runs unmodified in a browser `Worker` (no import map needed, as a static page has none for a worker) and a Bun `Worker` — same file, same call. It is exported as the `./worker.js` sub-path (see the [boundary note](./README.md#boundary-note)) and is never reached through `runtime.resolve()`: a host spawns it by URL/path (`/vendor/oconv/worker.js` when the package's `src/` is served at `/vendor/oconv/`), or by the `@awacloud/oconv/worker.js` specifier resolved to a URL.

## Resolve

```js
// By specifier — the same file under an `exports`-aware resolver and under a
// prefix-only import map (`@awacloud/oconv/` → the package root). Never
// through ModuleRuntime.
const worker = new Worker(
    import.meta.resolve('@awacloud/oconv/worker.js'),
    { type: 'module' }
);
```

A host can equally pass the file's real URL or path, e.g.
`new Worker(new URL('./worker.js', import.meta.url), { type: 'module' })`
from a module that sits next to it: a `new URL()` is resolved directly and
never goes through an import map.

## API

Three message kinds, discriminated on the posted data shape — a `toMd` message never carries `markdown`/`target`, so the order is unambiguous: `typeof data.markdown === 'string'` routes to `fromMd` first, then `typeof data.target === 'string'` routes to `convert`, everything else routes to `toMd`.

| Kind | In | Out |
|---|---|---|
| `toMd` | `{id, name, bytes: ArrayBuffer, at?, sha256?}` (`bytes` transferred) | `{id, ms, error, chars, warnings, losses, markdown}` |
| `fromMd` | `{id, name?, markdown, target?, opts?, assets?, defaultFaces?}` | `{id, ms, error, bytes, warnings, losses}` |
| `convert` | `{id, name?, bytes: ArrayBuffer, format?, target, includeNotes?, opts?, defaultFaces?, layout?}` (`layout` forwarded only when present; absent is the facade's default, on for `docx → odt`) | `{id, ms, error, bytes, warnings, losses}` |

`error` is a string, or `null` on success — every failure comes back as DATA, never a thrown exception across the worker boundary. `opts`, `assets` and `defaultFaces` are threaded onto the outgoing facade call only when the caller's message carried the key, so an older message without them produces exactly the call it made before any of the three existed.

The `losses` key (all three replies) is the facade's `{ code, detail }` ledger itself, verbatim, structured-cloned — `[]` when `error` is set. Reader codes carry a string `detail`; the pdf writer's `layout/*`, `text/unencodable` and `inline/*` codes carry an object `detail` (and an `index` / `kind`), and both cross the worker boundary unchanged.

## Examples

### `toMd` — post a document, await the reply

```js
const reply = new Promise((resolve) => { worker.onmessage = (ev) => resolve(ev.data); });
const buffer = docxBytes.slice().buffer;   // a fresh, transferable ArrayBuffer
worker.postMessage(
    { id: 1, name: 'report.docx', bytes: buffer, at: new Date().toISOString() },
    [buffer]
);
const data = await reply;
data.markdown;    // string, or null when data.error is set
```

### `fromMd` — post markdown, get bytes back

```js
const reply = new Promise((resolve) => { worker.onmessage = (ev) => resolve(ev.data); });
worker.postMessage({ id: 2, name: 'out.docx', markdown: '# Title\n\nBody.' });
const data = await reply;
data.bytes;   // Uint8Array (structured-cloned), or null on error
```

### Reading the loss ledger

```js
const reply = new Promise((resolve) => { worker.onmessage = (ev) => resolve(ev.data); });
worker.postMessage({ id: 3, name: 'out.pdf', markdown: '# T

![alt](missing.png)
' });
const data = await reply;
data.warnings;          // 1 — the count, kept for existing callers
data.losses[0].code;    // 'layout/image-dropped'
data.losses[0].detail;  // { index: '1.i0', name: 'missing.png', alt: 'alt', reason: 'no-bytes', bytes: 0 }
```

## Notes

- `warnings` is a count kept for existing callers; `losses` is the ledger itself (`warnings === losses.length` on every reply). Adding `losses` is additive: the three request envelopes are unchanged and no reply key was removed.

- `sha256` is part of the frozen `toMd` envelope but unused: the facade's `toMd` always computes its own `sourceSha256` from the posted bytes and takes no override.
- The `toMd` envelope carries no reader option at all — neither `includeNotes`, `formOpBudget`, `pdfInfer`, `pdfDeclare`, `pdfInclude`, `pdfPassword`, `pdfRecoverXref`, `pdfLineHyphens`, `odtInclude`, `docxInclude`, `sheets`, `sheetCellBudget`, `archiveLimits`, `outputBudget` nor `opts` (so no `frontMatter` form) crosses the worker boundary; a caller needing one calls the facade's `toMd` directly on the main thread.
- The `toMd` envelope stays byte-unchanged across the `fromMd` and `convert` additions — both are additive message kinds; a regression test pins the exact reply key set of all three (`losses` included).
- A registered `oconvDefaultFaces` descriptor is **not** serialized into the worker — its factory closes over its bytes, so `ModuleRuntime#serialize` cannot ship it. The host resolves `oconvDefaultFaces` on its own thread and posts the resulting map as the `defaultFaces` field instead (see [`oconv`](./oconv.md)'s Notes).
- `bytes` on the `fromMd`/`convert` reply is structured-cloned, not transferred on the response — a transfer-list optimisation on the reply path is a documented future concern, not today's contract.
- DOM-free by construction: the file touches no `document`/`window` API, only `self.onmessage`/`self.postMessage` and the module graph it builds.

## See also

- [docs/api/README.md](./README.md) — full module index + `exports` boundary note
- [`oconv`](./oconv.md) — the facade this worker wraps
- [pdf-writer.md](../pdf-writer.md) — `opts.pdf` reference, including the worker-forwarding contract
- [loss matrix](../loss-matrix.md)
