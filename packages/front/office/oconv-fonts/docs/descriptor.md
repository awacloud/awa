---
module: oconvDefaultFaces
category: office/oconv-fonts
dependencies: []
returns: object
worker-safe: partial
status: complete
---

# oconvDefaultFaces

> Frozen default face pack `oconv` resolves by name.

**Module** `oconvDefaultFaces` | **Source** `packages/front/office/oconv-fonts/src/faces.js` (+ `src/loader.js`) | **Deps** none | **Worker-safe** partial (the payload yes, the descriptor no — see Worker Usage)

**Prerequisites**: package `@awacloud/oconv-fonts` (sub-paths `.`, `./faces.js`,
`./loader.js`), an `@awacloud/fw` `ModuleRuntime`, and one of: Bun or a browser
(the faces load through `fetch`), or Node.js 20+ (`fetch` refuses `file:` URLs
there, so the package-relative faces load through `node:fs/promises`).

This page is the **frozen contract** of the default face pack. The `oconv`
default-route wiring binds to it immutably: nothing listed under "Frozen
surface" or "Precedence rule" changes without a deliberate, documented
contract change, because every application that registered the pack depends on
those names and shapes.

## Resolve

```js
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { registerDefaultFaces } from '@awacloud/oconv-fonts';

const runtime = new ModuleRuntime();
await registerDefaultFaces(runtime);

const api = runtime.resolve('oconvDefaultFaces');
// Returns: { defaultFaces, family: 'Liberation', release: '2.1.5' }
```

## Frozen surface

| Property | Frozen value |
|---|---|
| Descriptor name | the string literal `'oconvDefaultFaces'` — the only token `oconv`'s source ever knows; never renamed |
| `version` | a literal equal to `package.json` `version` (pinned by this package's own tests) |
| `dependencies` / `deps` | `[]` / `[]` — the payload is bytes, no fw dependency |
| Resolved API | `{ defaultFaces, family: 'Liberation', release: '2.1.5' }` |
| `defaultFaces` | a **function**, not a property, returning a **frozen** object |
| Face-map keys | exactly `regular \| bold \| italic \| boldItalic \| mono` — the spelling of the font option keys of `oconv`'s PDF writer, so no translation layer exists |
| Face-map values | `Uint8Array` of a whole, unmodified font program |
| Import side effects | none — no byte is read at module evaluation |

The surface is built by a function, not exported as a module constant: a browser
cannot read font files synchronously, and embedding the payload as base64 in a
JS module was rejected for weight, so the bytes are loaded by an awaited
`fetch` and handed to `createOconvDefaultFaces(faces)`. Every property above
holds as it would for a constant.

Face mapping (Sans for the four text classes, Mono for `code` — the
Liberation metric twins of the PDF Standard 14's Helvetica x4 + Courier):

| Face key | Style class | Vendored file | Bytes |
|---|---|---|---|
| `regular` | `regular` | `vendor/liberation/LiberationSans-Regular.ttf` | 410 712 |
| `bold` | `bold` | `vendor/liberation/LiberationSans-Bold.ttf` | 414 456 |
| `italic` | `italic` | `vendor/liberation/LiberationSans-Italic.ttf` | 415 816 |
| `boldItalic` | `boldItalic` | `vendor/liberation/LiberationSans-BoldItalic.ttf` | 408 996 |
| `mono` | `code` | `vendor/liberation/LiberationMono-Regular.ttf` | 319 508 |

No other face is ever returned; the Serif family and the other Mono styles
stay vendored but unused by this descriptor.

## API

| Export | Signature | Returns |
|---|---|---|
| `createOconvDefaultFaces` | `(faces: FaceMap) => Descriptor` | the `oconvDefaultFaces` fw descriptor around a validated, frozen copy of `faces`; throws `oconv-fonts: bad faces <key>` on an unknown key, a missing key or a non-`Uint8Array` value (a non-object input reports `regular`) |
| `loadDefaultFaces` | `(opts?: { baseUrl?: string \| URL }) => Promise<FaceMap>` | the frozen five-face map, fetched relative to `src/loader.js` (`../vendor/liberation/`) or from `opts.baseUrl`; rejects with `oconv-fonts: cannot load <url> (...)` |
| `registerDefaultFaces` | `(runtime: ModuleRuntime, opts?) => Promise<ModuleRuntime>` | `runtime.register(createOconvDefaultFaces(await loadDefaultFaces(opts)))`; nothing is registered when loading fails |
| `api.defaultFaces` | `() => Readonly<FaceMap>` | the same frozen map on every call |
| `api.family` | `string` | `'Liberation'` |
| `api.release` | `string` | `'2.1.5'` |

`FaceMap` = `{ regular, bold, italic, boldItalic, mono }`, each a `Uint8Array`.

## Precedence rule

**Four sources, resolved PER STYLE CLASS between explicit and default.**

```
explicit opts.pdf.fonts[<class>]  >  default map[<class>]  >  Standard 14

default map  =  posted defaultFaces          when the request carries one — wins WHOLE
             |  registered oconvDefaultFaces  otherwise
```

For each of the five style classes independently (`code` reads the `mono`
key on every map), the writer takes the caller's `opts.pdf.fonts` entry if
present; otherwise the default map's entry; otherwise the Standard 14 face.
A partial explicit map therefore overrides only the classes it names. A
per-map rule would send the unsupplied classes straight back to Standard 14
— the reason the rule is per class.

The default map is chosen once per call, before the per-class rule runs:

1. **A posted map** — the `defaultFaces` field of an `oconv` `fromMd` or
   `convert` request (target `pdf` only), forwarded to the PDF writer. It
   exists because a worker cannot resolve the host's runtime: the descriptor
   closes over its bytes and never crosses a worker boundary (see Worker
   Usage), so the host resolves `oconvDefaultFaces` on its own thread and
   posts the bytes with the request.
2. **The registered `oconvDefaultFaces`** — used only when no map is posted
   (the field is absent). A posted `defaultFaces` must be a map of
   `Uint8Array`: `null` or any other value is rejected by `oconv` with
   `oconv: bad default faces`.

A posted map **wins whole**: it replaces the registered map, it is not
merged with it class by class. A class missing from a posted map therefore
falls to Standard 14 (unless supplied explicitly), even when the registered
pack carries that class. Post the complete five-key map that
`runtime.resolve('oconvDefaultFaces').defaultFaces()` returns.

Two invariants ride with the rule:

- **A caller who supplies bytes gets byte-identical output.** An explicit
  `opts.pdf.fonts[<class>]` wins unconditionally, so registering this package
  or posting a default map never changes the output of a call that already
  supplies every face (two runs of that route are byte-identical).
- **`oconv`'s source never imports `@awacloud/oconv-fonts`.** The descriptor is
  reached by NAME only: `oconv`'s PDF writer declares an ordinary fw
  dependency on the name `oconvDefaultFaces`, and `@awacloud/oconv`'s entry
  point registers a name-only stand-in under that name at version `0.0.0`.
  A registered pack carries a higher version (`1.0.0`) and displaces the
  stand-in in either registration order, so an application that does not
  ship this package still links.

### Resolving the name

What `has` and `resolve` answer depends on how the runtime was built:

- On a bare `ModuleRuntime` with nothing registered,
  `runtime.has('oconvDefaultFaces')` is `false` and
  `runtime.resolve('oconvDefaultFaces')` throws
  `Module not found: oconvDefaultFaces`.
- On a runtime built from `@awacloud/oconv`'s entry point (`fw_require` +
  `modules`) neither ever happens: the stand-in is always registered, so
  `has()` is `true` and `resolve()` returns
  `{ defaultFaces: () => null, family: null, release: null }` until the real
  pack displaces it. `has()` therefore cannot tell whether the pack is
  registered; test `runtime.resolve('oconvDefaultFaces').defaultFaces() !== null`
  (or `family === 'Liberation'`) instead.

## Examples

### Worked example — partial override of `regular` only

The descriptor is registered and the caller supplies one face:

```js
import { readFile } from 'node:fs/promises';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { fw_require, modules } from '@awacloud/oconv';
import { registerDefaultFaces } from '@awacloud/oconv-fonts';

const runtime = new ModuleRuntime();
runtime.registerAll(fw_require);
runtime.registerAll(modules);
await registerDefaultFaces(runtime);          // before the first resolve of 'oconv'
const oconv = runtime.resolve('oconv');

// Any whole TrueType program works; here, a vendored face this descriptor does not use.
const serifUrl = new URL('../vendor/liberation/LiberationSerif-Regular.ttf',
    import.meta.resolve('@awacloud/oconv-fonts'));
const liberationSerifRegularBytes = new Uint8Array(await readFile(serifUrl));

const markdown = 'Regular text, **bold**, *italic*, ***bold italic*** and `code`.';
const pdf = await oconv.fromMd({
    markdown,
    target: 'pdf',
    opts: { pdf: { fonts: { regular: liberationSerifRegularBytes } } }
});
// pdf.bytes — a PDF whose regular text is LiberationSerif
```

| Style class | Frozen per-class result |
|---|---|
| `regular` | explicit — LiberationSerif |
| `bold` | registered — LiberationSans-Bold |
| `italic` | registered — LiberationSans-Italic |
| `boldItalic` | registered — LiberationSans-BoldItalic |
| `code` | registered — LiberationMono-Regular |

A caller who registered the face pack and overrides only `regular` keeps the
four registered faces for the other classes.

### The explicit byte path, without registering

```js
import { loadDefaultFaces } from '@awacloud/oconv-fonts';

const faces = await loadDefaultFaces();                       // frozen FaceMap
const faces2 = await loadDefaultFaces({ baseUrl: '/assets/liberation/' });
// Either map can be passed as opts.pdf.fonts directly (explicit route).
```

## Worker Usage

The face map is structured-cloneable (plain object of `Uint8Array`, lengths
preserved — pinned by this package's tests), so it can cross a worker
boundary. The **descriptor** is not serializable through
`ModuleRuntime#serialize()`: its factory closes over the loaded map, so a
`factory.toString()` copy would lose it. Resolve on the owning thread and
post the bytes:

```js
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { registerDefaultFaces } from '@awacloud/oconv-fonts';

const runtime = new ModuleRuntime();
await registerDefaultFaces(runtime);

const faces = runtime.resolve('oconvDefaultFaces').defaultFaces();
const copy = structuredClone(faces);   // what worker.postMessage({ faces }) sends
```

On the `oconv` side, the posted bytes travel as the `defaultFaces` field of a
`fromMd` or `convert` request (target `pdf` only) and take the default-map
slot of the precedence rule — whole, in place of anything registered on the
worker's runtime.

## Notes

- Loading is explicit and asynchronous because a browser cannot read font
  files synchronously; the same `fetch` path runs under Bun (`file:` URLs,
  measured on Bun 1.3.13) and in a browser. Bun answers a missing `file:`
  URL with status 200 and fails only on the body read, so the loader treats
  a body-read error or an empty body as a load failure.
- Node.js's `fetch` rejects every `file:` URL. Whenever the `fetch` path
  fails for a `file:` URL (rejection, non-2xx status, unreadable or empty
  body), the loader reads the file through `node:fs/promises` instead,
  imported dynamically on that path only, so a browser never loads it. A
  failed or empty read rejects with the same
  `oconv-fonts: cannot load <url> (...)` error (with `cause` when the read
  itself failed).
- `opts.baseUrl` is resolved against `src/loader.js`'s own URL: pass an
  absolute or root-relative directory URL; a missing trailing `/` is added.
- The vendored faces are never modified or pre-subset (OFL 1.1 Reserved Font
  Name clause); `oconv` subsets at PDF-embed time.

## See also

- [`../README.md`](../README.md) — package overview, coverage and licence.
- [`./api/README.md`](./api/README.md) — one reference page per exported function.
- [`oconv`'s PDF writer page](https://github.com/awacloud/awa/blob/@awacloud/oconv-fonts@1.0.0/packages/front/office/oconv/docs/pdf-writer.md) — the
  `opts.pdf` block, including `opts.pdf.fonts`.
