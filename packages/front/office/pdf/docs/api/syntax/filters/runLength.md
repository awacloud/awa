---
module: pdfRunLength
category: pdf/syntax/filters
dependencies: [pdfErrors]
returns: object
worker-safe: true
status: complete
---

# pdfRunLength

> `RunLengthDecode` ISO 32000-2 §7.4.5 — run-length coding.

**Module** `pdfRunLength` | **Source** `packages/front/office/pdf/src/syntax/filters/runLength.js` | **Deps** `pdfErrors` | **Worker-safe** yes

Each control byte `n` is read as:

- `0..127` → copy the next `n + 1` bytes literally (1..128 bytes);
- `128` → end of data (EOD), decoding stops;
- `129..255` → repeat the next byte `257 - n` times (2..128 repetitions).

The encoder is greedy: it first tries a repeat run when 3 or more identical
bytes are available, otherwise it accumulates up to 128 literal bytes, stopping
just before a productive run.

## Resolve

```js
const rl = runtime.resolve('pdfRunLength');
// Returns: { decode, encode }
```

## API

| Method | Signature | Returns |
|--------|-----------|---------|
| `decode` | `(bytes: Uint8Array) => Uint8Array` | Expanded bytes. |
| `encode` | `(bytes: Uint8Array) => Uint8Array` | Encoded bytes plus the EOD (`128`). |

## Examples

### Decode a repeat run

```js
const rl = runtime.resolve('pdfRunLength');
// 0xFB = 251 → repeat the next byte (257-251 = 6) times; 128 = EOD
const src = new Uint8Array([0xFB, 0x41, 0x80]);
rl.decode(src);   // [0x41, 0x41, 0x41, 0x41, 0x41, 0x41]  ('AAAAAA')
```

### Decode a literal run

```js
// 0x02 → copy (2+1=3) literal bytes
rl.decode(new Uint8Array([0x02, 0x48, 0x69, 0x21, 0x80]));   // 'Hi!'
```

### Round trip

```js
const bin = new Uint8Array([1, 1, 1, 1, 1, 2, 3, 4]);
const enc = rl.encode(bin);
const back = rl.decode(enc);
// back equals bin.
```

## Errors

| Code | Class | When |
|------|-------|------|
| `pdf/runLength/bad-input` | `ParseError` | Argument is not a `Uint8Array`. |
| `pdf/runLength/truncated-literal` | `ParseError` | Literal run announced but the payload is truncated. |
| `pdf/runLength/truncated-repeat` | `ParseError` | Repeat run announced but no value byte follows. |

## See also

- [`pdfFilterDispatch`](./dispatch.md)
- [Filters index](./README.md)
