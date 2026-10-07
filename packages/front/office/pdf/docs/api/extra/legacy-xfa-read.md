---
module: pdfLegacyXfaRead
category: pdf/extra
dependencies: [pdfErrors]
returns: object
worker-safe: true
status: complete
---

# pdfLegacyXfaRead

> Opaque read-only reader for `/XFA` (XDP packets) — legacy.

**Module** `pdfLegacyXfaRead` | **Source** `packages/front/office/pdf/src/extra/legacy-xfa-read.js` | **Deps** `pdfErrors` | **Worker-safe** yes

PDF 2.0 forbids writing XFA, but legacy documents must still be parsed. `/XFA` on the AcroForm dict comes in two shapes: (a) a single complete XDP stream, or (b) an array alternating string keys and streams (`['preamble', stream, 'config', stream, …]`). Surfaces the packets as opaque XML bytes on `_legacy.xfa` — no further interpretation.

## Resolve

```js
const ext = runtime.resolve('pdfLegacyXfaRead');
// Returns: { readXfa, isKnownPacket, KNOWN_PACKETS }
```

## API

| Member | Signature | Returns |
|--------|-----------|---------|
| `readXfa` | `(value) => { _legacy: { xfa: { shape, … } } }` | Stream or array shape. |
| `isKnownPacket` | `(name) => boolean` | |
| `KNOWN_PACKETS` | `Set` | `xdp`, `preamble`, `config`, `template`, `localeSet`, `datasets`, `form`, `connectionSet`, `sourceSet`, `stylesheet`, `xmpmeta`, `signature`, `postamble`, `pdf`. |

## Examples

### Read a stream

```js
const ext = runtime.resolve('pdfLegacyXfaRead');
const r = ext.readXfa(xfaStream);
r._legacy.xfa.shape;  // 'stream'
r._legacy.xfa.xdp;    // Uint8Array
```

### Read an array

```js
const r = ext.readXfa(xfaArray);
r._legacy.xfa.packets.template;  // Uint8Array
r._legacy.xfa.order;             // ['preamble','template','datasets']
r._legacy.xfa.unknownPackets;    // []
```

## Errors

| Code | Class | When |
|------|-------|------|
| `pdf/xfa/bad-packet` | `ParseError` | Array item is neither a string key nor a stream. |
| `pdf/xfa/bad-key` | `ParseError` | Array key decoding failed. |
| `pdf/xfa/odd-array` | `ParseError` | Odd item count (key/stream pairs expected). |
| `pdf/xfa/bad-shape` | `ParseError` | Neither a stream nor an array. |

## See also

- [`pdfAcroForm`](../form/acroform.md)
- [Extras index](./README.md)
