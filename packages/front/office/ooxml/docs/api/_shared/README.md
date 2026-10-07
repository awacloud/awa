---
module: ooxmlShared
category: _shared
dependencies: []
returns: object
worker-safe: true
status: complete
---

# ooxmlShared

> Canonical OOXML constants and stateless helpers — one source for all factories.

**Module** `ooxmlShared` | **Source** `packages/front/office/ooxml/src/_shared/index.js` | **Deps** _(none)_ | **Worker-safe** yes

## Resolve

```js
const shared = runtime.resolve('ooxmlShared');
// → { NS, REL_TYPE, CT,
//     EMU_PER_INCH, EMU_PER_CM, EMU_PER_PT, EMU_PER_PX_96,
//     toEmu, inchesToEmu, cmToEmu, ptToEmu,
//     readBoolAttr, writeBoolAttr,
//     partExt, lookupCT, trackUnmodelledParts,
//     wordRootAttrs,
//     encodeText, decodeText,
//     createRidAllocator,
//     createDmlColorCodec, createXlsxColorCodec }
```

## API

| Member | Type | Description |
|--------|------|-------------|
| `NS` | `object<string, string>` | ECMA-376 XML namespaces (`W`, `A`, `R`, `SS`, `P`, `C`, `M`, `MC`, `WP`, `PIC`, `XDR`, `DS`, `TC`, `ACTIVEX`, plus the key of the Word 2012 `w15` namespace). Frozen. |
| `REL_TYPE` | `object<string, string>` | `…/relationships/<type>` URIs (`DOC`, `IMAGE`, `STYLES`, …). Frozen. |
| `CT` | `object<string, string>` | Official OOXML MIME content-types (`DOCUMENT`, `WORKBOOK`, `PRESENTATION`, `CHART`, …). Frozen. |
| `EMU_PER_INCH` / `EMU_PER_CM` / `EMU_PER_PT` / `EMU_PER_PX_96` | `number` | Canonical EMU constants. |
| `toEmu(value)` | `(value: number\|string) => number` | Converts `'1in'` / `'2.54cm'` / `'10mm'` / `'72pt'` / `'96px'` to EMU. Numbers are rounded and passed through. Unparseable input → `0`. |
| `inchesToEmu(v)` / `cmToEmu(v)` / `ptToEmu(v)` | `(number) => number` | Targeted conversions. |
| `readBoolAttr(v)` | `(string\|null) => boolean\|undefined` | Decodes the OOXML `1`/`0`/`true`/`false` attribute. `null`/`undefined` → `undefined`. |
| `writeBoolAttr(b)` | `(boolean) => '1'\|'0'` | Serialises it back. |
| `partExt(partName)` | `(string) => string` | Lower-case OPC extension, without the dot. Empty string when there is no dot. |
| `lookupCT(pkg, partName)` | `(pkg, string) => string\|null` | Content-type of a part from a whole `pkg`: overrides first, then per-extension defaults. `null` when nothing matches. |
| `trackUnmodelledParts(pkg, consume)` | `(pkg, (pkg) => T) => { value: T, unmodelledParts: Array<{ partName, contentType }> }` | Runs `consume(pkg)` while recording which entries of `pkg.parts` it looks up; returns its value plus every part never looked up, sorted by `partName`, with its declared content type (`null` when undeclared). The original parts map is restored before it returns or throws. Used by the `docx` / `xlsx` / `pptx` readers to fill `unmodelledParts`. |
| `wordRootAttrs(nodes)` | `(nodes: XmlNode[]) => object` | The root namespace attributes of a WordprocessingML part whose root holds `nodes`: `w` and `r` always; `mc`, the Word 2012 namespace and `mc:Ignorable` when the nodes hold a `w15:` element (searched at any depth; non-element entries ignored). Returns a new object, keys in the order `xmlns:w`, `xmlns:r`, `xmlns:mc`, `xmlns:w15`, `mc:Ignorable`. Used by the `w:document`, header, footer, footnotes, endnotes and comments writers. |
| `encodeText(s)` | `(string) => Uint8Array` | UTF-8 encode through the instance's shared `TextEncoder`. |
| `decodeText(bytes)` | `(Uint8Array) => string` | UTF-8 decode through the instance's shared `TextDecoder`. |
| `createRidAllocator(opts?)` | `({prefix?, start?, existing?}) => allocator` | Fresh relationship-id allocator; returns `{ next, peek, reset, usedIds, claim, register }`. |
| `createDmlColorCodec(xml)` | `(xml) => codec` | DrawingML colour codec; returns `{ COLOR_TAGS, parseColor, renderColor, parseColorMod, renderColorMod, parseColorMods, findFirstColor, srgbClr }`. |
| `createXlsxColorCodec(xml)` | `(xml) => codec` | SpreadsheetML colour codec; returns `{ parseColor, renderColor }`. |

### `createRidAllocator(opts)`

| Option | Default | Description |
|--------|---------|-------------|
| `prefix` | `'rId'` | String prepended to every id. |
| `start` | `1` | Starting numeric suffix. |
| `existing` | `[]` | Pre-existing rel objects (`{ Id, … }`) or plain id strings; the allocator never reissues those ids. |

`next()` consumes the next free id, `peek()` returns it without consuming,
`claim(preferred)` returns `preferred` untouched when still free (otherwise
allocates), `register(id)` marks a foreign id as used, `usedIds()` lists every
id produced plus every pre-registered one, and `reset()` re-arms the counter to
`start`.

### `createDmlColorCodec(xml)`

`parseColor(el, opts)` accepts `{ withMods: true }` to preserve the child
colour transforms (`lumMod`, `lumOff`, `tint`, `shade`, `alphaMod`, `lum`,
`grayscl`, `duotone`, `clrChange`, `clrRepl`, `biLevel`, …) on `mods`; without
the flag they are dropped, which is the flat-reference semantics used by fill
handling. Both modes round-trip identically.

## Examples

```js
const shared = runtime.resolve('ooxmlShared');

// Namespace lookup
const W_NS = shared.NS.W; // 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'

// Build a relationship type URI
const docRel = shared.REL_TYPE.DOC; // …/officeDocument

// Convert a dimension
shared.toEmu('2in');   // 1828800
shared.toEmu('5cm');   // 1800000
shared.toEmu(914400);  // 914400 (passthrough)

// Bool attribute round-trip
shared.readBoolAttr(shared.writeBoolAttr(true)); // true

// Allocate relationship ids without colliding with the existing ones
const rid = shared.createRidAllocator({ existing: [{ Id: 'rId1' }] });
rid.next();            // 'rId2'
rid.claim('rId9');     // 'rId9'
```

## Worker Usage

```js
const worker = fw.createWorker({ modules: [ooxmlShared, /* … */] });
const shared = await worker.resolve('ooxmlShared');
// Constants and helpers are stateless — one instance can be shared freely.
```

## Notes

- **No mutable module state**: `NS`, `REL_TYPE`, `CT` are `Object.freeze`d and the
  helpers are pure. The two `create*ColorCodec` factories and
  `createRidAllocator` return fresh, independent instances whose state lives in
  their own closure — nothing global is shared.
- **No `@awacloud/fw` dependency**: the module is OOXML-specific constants and
  helpers only. `encodeText`/`decodeText` wrap one `TextEncoder`/`TextDecoder`
  pair per instance, replacing the per-factory pairs that were duplicated
  across the package.
- The colour codecs take `xml` as an argument rather than as a declared
  dependency, so `ooxmlShared` itself keeps `dependencies: []`; the caller
  passes its own already-resolved `xml` instance.

## See also

- [ooxmlErrors](../errors.md) — the other shared helper (typed error classes).
- [opcContentTypes](../opc/content-types.md) — runtime content-type registry;
  the `CT` constants here are the VALUES that populate it, and `lookupCT`
  complements `opcContentTypes.lookup(types, partName)` by taking a whole `pkg`.
