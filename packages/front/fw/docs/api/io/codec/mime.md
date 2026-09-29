---
module: mime
category: io/codec
dependencies: [utf8, random]
returns: object
worker-safe: true
status: complete
---

# mime

> MIME/HTTP helpers — structured headers (RFC 7231 §3.1.1, RFC 5987) and `multipart/*` bodies (form-data, mixed).

**Module** `mime` | **Source** `packages/front/fw/src/io/codec/mime.js` | **Deps** `utf8`, `random` | **Worker-safe** yes

**Scope**: JS web framework. Covers practical client/server-in-browser needs:
- Parse / format header values with parameters (`Content-Type`, `Content-Disposition`, `Accept`…)
- Parse / format a header block (HTTP response, multipart part)
- Encode / decode `multipart/form-data` bodies (upload) and `multipart/mixed` (multi-resource response)
- Random boundary generation

**Out of scope**: quoted-printable, base64 transfer-encoding (→ [b64](./b64.md)), RFC 2047 encoded-word (email).

## Resolve

```js
const mime = runtime.resolve('mime');
// Returns: { parseHeader, formatHeader, parseHeaders, formatHeaders,
//             encode, decode, randomBoundary }
```

## API

| Method | Signature | Returns |
|--------|-----------|---------|
| `parseHeader` | `(s: string) => {value, params}` | Parses a structured header |
| `formatHeader` | `(value \| {value, params}, params?) => string` | Serializes (quotes when needed) |
| `parseHeaders` | `(text: string) => Object` | Parses a CRLF block (name → value, lowercased) |
| `formatHeaders` | `(headers: Object) => string` | Emits `Name: value\r\n` (Title-Case) |
| `encode` | `(parts, options?) => {body, boundary, contentType}` | Builds a multipart body |
| `decode` | `(bytes: Uint8Array, boundary: string) => Part[]` | Decomposes a multipart body |
| `randomBoundary` | `() => string` | Unique random boundary |

**Type `Part`** : `{ headers: Object, body: Uint8Array }`.

## Examples

### Parse a structured header

```js
mime.parseHeader('multipart/form-data; boundary=abc; charset=utf-8');
// { value: 'multipart/form-data', params: { boundary: 'abc', charset: 'utf-8' } }

mime.parseHeader('form-data; name="file"; filename="a.txt"');
// { value: 'form-data', params: { name: 'file', filename: 'a.txt' } }

// RFC 5987 extended param (UTF-8 encoded) — automatically decoded
mime.parseHeader("attachment; filename*=UTF-8''caf%C3%A9.txt");
// { value: 'attachment', params: { filename: 'café.txt' } }
```

Parameter names are lowercased. If both `name*=` and `name=` are present, the extended form (RFC 5987) takes precedence.

### Format a header

```js
mime.formatHeader('text/plain', { charset: 'utf-8' });
// 'text/plain; charset=utf-8'

// Automatic quoting when the value contains a non-token character
mime.formatHeader('form-data', { name: 'a b', filename: 'my "file".txt' });
// 'form-data; name="a b"; filename="my \\"file\\".txt"'
```

### Upload form-data

```js
const { utf8, mime } = fw.runtime.resolveAll(['utf8', 'mime']);

const { body, contentType } = mime.encode([
    {
        headers: { 'content-disposition': 'form-data; name="user"' },
        body: 'alice'
    },
    {
        headers: {
            'content-disposition': 'form-data; name="avatar"; filename="me.png"',
            'content-type': 'image/png'
        },
        body: pngBytes   // Uint8Array
    }
]);

await fetch('/upload', {
    method: 'POST',
    headers: { 'Content-Type': contentType },
    body
});
```

### Parse a multipart response

```js
const response = await fetch('/byteranges-resource');
const ct = mime.parseHeader(response.headers.get('content-type'));
// ct.value === 'multipart/byteranges'
// ct.params.boundary === 'xyz'

const bytes = new Uint8Array(await response.arrayBuffer());
const parts = mime.decode(bytes, ct.params.boundary);

for (const part of parts) {
    const range = part.headers['content-range'];
    console.log(range, part.body.length, 'bytes');
}
```

### Parse a header block

```js
const raw = 'Content-Type: text/plain\r\nContent-Length: 42\r\nX-Foo: a\r\nX-Foo: b';
mime.parseHeaders(raw);
// { 'content-type': 'text/plain', 'content-length': '42', 'x-foo': 'a, b' }
```

Names are always lowercased. Multiple values for the same name are joined with `', '` (RFC 7230 §3.2.2). Folded lines (obsolete line-folding) are tolerated during decoding.

## Worker Usage

```js
const worker = fw.createWorker(
    function ({ libs, args }) {
        const [bytesArray, boundary] = args;
        const parts = libs.mime.decode(new Uint8Array(bytesArray), boundary);
        self.postMessage(parts.map(p => ({
            headers: p.headers,
            bodyLength: p.body.length
        })));
    },
    { dependencies: ['mime'], args: [Array.from(bodyBytes), boundary] }
);
```

## Notes

- The `decode` parser accepts a **preamble** before the first boundary (RFC 2046 spec).
- `decode` tolerates LF or CRLF after a boundary; `encode` always emits CRLF (strict RFC).
- For uploads where native `FormData` suffices, prefer the browser API — `mime.encode` is useful when you need precise control over framing, custom per-part headers, or `multipart/mixed` bodies.
- `randomBoundary` uses the CSPRNG from the [`random`](../../crypto/utils/random.md) module (8 bytes via `random.bytes(8)` → 16 hex chars). If the entropy source is unavailable, `randomBoundary` returns `false`; `encode(parts, { boundary })` lets you supply a custom boundary.
- The `multipart/byteranges` family (HTTP `Range` multi-range response) is decoded with the same `decode` by passing the boundary extracted from `Content-Type`.

## See also

- [utf8](./utf8.md) — dependency (text/bytes conversion)
- [url](./url.md) — querystring (URL-side equivalent)
- [b64](./b64.md) — Base64 encoding used in some MIME transfers
