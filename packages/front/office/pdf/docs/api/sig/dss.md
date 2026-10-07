---
module: pdfDssBuilder
category: pdf/sig
dependencies: [pdfErrors, pdfSha1, bitArray]
returns: object
worker-safe: true
status: complete
---

# pdfDssBuilder

> PAdES-LT Document Security Store builder — ETSI EN 319 142-1 §5.4 / ISO 32000-2:2020 §12.8.4.3.

**Module** `pdfDssBuilder` | **Source** `packages/front/office/pdf/src/sig/dss.js` | **Deps** `pdfErrors`, `pdfSha1`, `bitArray` | **Worker-safe** yes

Produces the indirect objects (cert/OCSP/CRL streams, the `/DSS` dict, and
optionally a `/VRI` dict) that a level-LT/LTA signer appends to an
already-signed PDF via [`pdfIncrementalWriter`](../document/incrementalWriter.md).
The factory **does not touch the byte buffer** — it returns a plan of
`{ num, gen, value }` updates plus the allocated DSS object number, so the
caller can also append an updated Catalog carrying `/DSS dssNum 0 R`.
`pdfSha1` is used solely for VRI key derivation (ISO 32000-2 §12.8.4.3
mandates SHA-1 of the signature value as the `/VRI` dict key — legacy
requirement, unrelated to signature strength).

## Resolve

```js
const dss = runtime.resolve('pdfDssBuilder');
// Returns: { buildDss }
```

## API

| Method | Signature | Returns |
|--------|-----------|---------|
| `buildDss` | `(args: BuildDssArgs) => BuildDssResult` | The update plan for an incremental append. It returns plaintext typed objects; when signing an encrypted document `pdfSign` encrypts the streams and strings before writing them. |
| `_refObj` / `_intObj` / `_nameObj` / `_strHexObj` / `_arrayObj` / `_dictObj` / `_streamObj` / `_sha1` / `_toHexUpper` / `_scanSignatureContentsHex` / `_pdfDate` | internal helpers | Returned for white-box tests only; not a stable contract — use `buildDss`. |

### `BuildDssArgs`

```js
{
    startNum: number,          // required, >= 2 — first free object number
    certs?:  Uint8Array[],     // DER-encoded certificates
    ocsps?:  Uint8Array[],     // DER-encoded OCSP responses
    crls?:   Uint8Array[],     // DER-encoded CRLs
    vri?:    { [sigHashHex: string]: {
        certs?: number[] | Uint8Array[],   // indices into certs[], or raw DER to promote
        ocsps?: number[] | Uint8Array[],
        crls?:  number[] | Uint8Array[],
        tu?:    string,        // PDF date string — validation-data-obtained time
        ts?:    Uint8Array     // TimeStampToken DER, promoted to a /TS stream
    } },
    autoVri?:  boolean,        // scan parentBytes for every signature and synthesise VRI entries
    parentBytes?: Uint8Array,  // required when autoVri is true
    vriTime?:  Date            // overrides `new Date()` for autoVri's /TU (tests: deterministic value)
}
```

### `BuildDssResult`

```js
{
    updates: Array<{ num, gen, value }>,  // ready for pdfIncrementalWriter.appendIncremental
    dssNum: number,
    lastNum: number,
    certNums: number[], ocspNums: number[], crlNums: number[]
}
```

## Examples

### Explicit VRI keyed by signature-value SHA-1

```js
const dss = runtime.resolve('pdfDssBuilder');
const built = dss.buildDss({
    startNum: 10,
    certs: [leafDer, caDer],
    vri: { 'A1B2C3...': { certs: [0, 1], tu: '(D:20260803120000+00\'00\')' } }
});
```

### Auto-populated VRI over every signature in the parent bytes

```js
const built = dss.buildDss({
    startNum: 10,
    certs: [leafDer, caDer], ocsps: [ocspDer],
    autoVri: true, parentBytes: signedBytes
});
built.dssNum;      // object number to reference from the updated Catalog
built.updates;      // feed straight into pdfIncrementalWriter.appendIncremental
```

## Errors

All thrown as `ContractError`.

| Code | When |
|------|------|
| `pdf/dss/bad-startNum` | `startNum` missing or `< 2`. |
| `pdf/dss/bad-cert` / `bad-ocsp` / `bad-crl` | An entry in `certs`/`ocsps`/`crls` is not a `Uint8Array`. |
| `pdf/dss/vri-bad-index` | A `vri.<hex>.certs/ocsps/crls` numeric index is out of bounds of the corresponding parent list. |

## See also

- [`pdfSign`](./sign.md) — the only caller, for PAdES levels LT/LTA.
- [`pdfIncrementalWriter`](../document/incrementalWriter.md) — consumes `buildDss`'s `updates`.
- [`pdfSha1`](./sha1.md) — VRI key hash.
