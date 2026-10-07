---
module: pdfLinearization
category: pdf/linearization
dependencies: [pdfErrors, pdfParser]
returns: object
worker-safe: true
status: complete
---

# pdfLinearization

> Linearization parameter dict — ISO 32000-2 Annex F.

**Module** `pdfLinearization` | **Source** `packages/front/office/pdf/src/linearization/linearization.js` | **Deps** `pdfErrors`, `pdfParser` | **Worker-safe** yes

The "Linearized" parameter dict is the very first object of a file optimized for progressive (Fast Web View) download. Fields: `/Linearized` (version, usually 1.0), `/L` (file length), `/H` (hint-stream offsets/lengths — array of at least 2 numbers), `/O` (first-page object number), `/E` (end-of-first-page offset), `/N` (page count), `/T` (offset of the first entry in the main xref table), `/P` (optional, first page number).

Read-only: `pdf.write` does not linearize (no writer module references this module), and `extra/linearization-write` only builds the `/Linearized` dictionary and a zero-length hint-stream placeholder.

## Resolve

```js
const lin = runtime.resolve('pdfLinearization');
// Returns: { typeLinearizationDict }
```

## API

| Method | Signature | Returns |
|---------|-----------|----------|
| `typeLinearizationDict` | `(dict) => Linearization` | Strict typing; throws if invalid. |

### Shape

```js
{
    version: number,              // /Linearized
    length: number,                // /L — total file length
    hintOffsets: number[],         // /H — at least 2 numbers
    firstPageObject: number,       // /O
    endOfFirstPage: number,        // /E
    numberOfPages: number,         // /N
    mainXrefOffset: number,        // /T
    firstPageNumber?: number,      // /P, when present
    raw, _extras
}
```

## Examples

### Fast Web View detection

```js
const lin = runtime.resolve('pdfLinearization');
try {
    const l = lin.typeLinearizationDict(firstObject.value);
    console.log('linearized,', l.numberOfPages, 'pages, hint at', l.hintOffsets[0]);
} catch (e) {
    console.log('not linearized');
}
```

### Reading just the first page

```js
const firstPageBytes = bytes.subarray(0, l.endOfFirstPage);
```

## Errors

| Code | Class | When |
|------|--------|------|
| `pdf/linearization/not-dict` | `ParseError` | Argument is not a dict. |
| `pdf/linearization/not-linearized` | `ParseError` | `/Linearized` absent. |
| `pdf/linearization/missing-h` | `ParseError` | `/H` absent or not an array. |
| `pdf/linearization/bad-h` | `ParseError` | `/H` has fewer than 2 numeric elements. |
| `pdf/linearization/missing-l`, `-o`, `-e`, `-n`, `-t` | `ParseError` | The corresponding required key is absent or non-numeric. |

## See also

- [`pdfDocument`](../document/document.md) · [`pdfXref`](../syntax/xref.md)
