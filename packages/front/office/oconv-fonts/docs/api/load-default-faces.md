---
module: loadDefaultFaces
category: office/oconv-fonts
dependencies: []
returns: promise
worker-safe: true
status: complete
---

# loadDefaultFaces

> The explicit async byte path — fetches the five vendored Liberation faces
> the default route uses, without registering a descriptor.

**Module** `loadDefaultFaces` | **Source**
`packages/front/office/oconv-fonts/src/loader.js` | **Deps** none |
**Worker-safe** yes — the returned face map structured-clones (see
[Worker Usage](../descriptor.md#worker-usage) in the frozen contract)

This function is the lower-level, explicit byte path documented in full in
[`../descriptor.md`](../descriptor.md) — this page states its signature,
params, return and throws only; it does **not** re-derive the
per-style-class precedence rule, which lives solely in the frozen contract.

## Resolve

```js
import { loadDefaultFaces } from '@awacloud/oconv-fonts';
```

## Signature

```
loadDefaultFaces(opts?: { baseUrl?: string | URL }) => Promise<Readonly<OconvDefaultFaceMap>>
```

## Parameters

| Param | Type | Description |
|---|---|---|
| `opts` | `{baseUrl?: string\|URL}` (optional) | `baseUrl` — the directory serving the five `.ttf` files, for an application that serves `vendor/liberation/` elsewhere (resolved against `src/loader.js`'s own URL, so an absolute or a root-relative value is the expected form; a missing trailing `/` is added). Defaults to `../vendor/liberation/` relative to `src/loader.js`. |

## Returns

`Promise<Readonly<OconvDefaultFaceMap>>` — the frozen `{ regular, bold,
italic, boldItalic, mono }` map of `Uint8Array`, fetched relative to
`src/loader.js` (or `opts.baseUrl`).

## Throws

- `Error` — `` `oconv-fonts: cannot load <url> (...)` `` on a network error,
  a non-2xx status, an unreadable body or an empty body. For a `file:` URL
  the face is first read again from the file system (see below), and the
  error is raised only when that read fails or returns an empty file.

(This is the JSDoc-documented behaviour of the internal `readFace` helper
this function calls once per face, in parallel via `Promise.all`;
`readFace` itself has no page — it is not exported. Bun resolves `fetch()`
of a missing `file:` URL with `ok: true, status: 200` and only rejects on
the body read, so the body-read failure and the empty-body case are both
covered by this same error shape.)

**Runtimes**: Bun and browsers load the faces through `fetch`. Node.js's
`fetch` refuses `file:` URLs, so when the `fetch` path fails for a `file:`
URL the loader reads the file through `node:fs/promises`, imported
dynamically on that path only — the default call works unchanged under
Node.js 20+, and a browser (`http(s):` URLs) never loads `node:fs`.

## Examples

```js
import { loadDefaultFaces } from '@awacloud/oconv-fonts';

const faces = await loadDefaultFaces();                       // frozen FaceMap
const faces2 = await loadDefaultFaces({ baseUrl: '/assets/liberation/' });
// Either map can be passed as opts.pdf.fonts directly (explicit route).
```

## See also

- [`../descriptor.md`](../descriptor.md) — the frozen `oconvDefaultFaces`
  contract: resolved API, frozen surface, the per-style-class precedence
  rule `explicit opts.pdf.fonts[<class>] > default map[<class>] >
  Standard 14`, the default map being a posted `defaultFaces` map (which
  wins whole) else the registered `oconvDefaultFaces`, and worked examples.
- [`register-default-faces`](./register-default-faces.md) — `registerDefaultFaces`
  loads via this function, then registers the descriptor.
- [`create-oconv-default-faces`](./create-oconv-default-faces.md) — builds
  the descriptor around the map this function returns.
- [`./README.md`](./README.md) — the API index.
