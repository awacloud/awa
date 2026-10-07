---
module: pdfErrors
category: pdf
dependencies: []
returns: object
worker-safe: true
status: complete
---

# pdfErrors

> Typed error hierarchy for `@awacloud/pdf` — base `PdfError` + 4 subclasses.

**Module** `pdfErrors` | **Source** `packages/front/office/pdf/src/errors.js` | **Deps** none | **Worker-safe** yes

Every error carries a stable kebab-case `code` (`'pdf/xref/truncated'`, `'pdf/page/bad-type'`, …), a human `message`, an optional structured `context`, and a chainable `cause`. No function in the package `throw new Error(...)` raw — everything goes through this hierarchy.

The classes are not exported at the top level from `@awacloud/pdf`: the only export is the `pdfErrors` factory descriptor. Consumers resolve the 5 classes (`PdfError`, `ParseError`, `RenderError`, `ContractError`, `EncryptionError`) + the `isPdfError` helper via `runtime.resolve('pdfErrors')` or `pdfErrors.factory()`. The classes are declared inside the factory body, so **each `factory()` call creates a fresh set of classes**: an error built from one call is not `instanceof` the classes of another, and that call's `isPdfError` returns `false` for it. A `ModuleRuntime` caches the resolved instance, so every module resolved through the same runtime shares one set of classes — catch with the classes resolved from that runtime, or compare `e.code` / `e.name` when the error may come from elsewhere.

## Resolve

```js
const errs = runtime.resolve('pdfErrors');
// Returns: { PdfError, ParseError, RenderError, ContractError, EncryptionError, isPdfError }
```

Stand-alone (without a `ModuleRuntime`):

```js
import { pdfErrors } from '@awacloud/pdf';
const { ParseError, EncryptionError } = pdfErrors.factory();
```

## API

| Class / method | Signature | Returns |
|------------------|-----------|----------|
| `PdfError` | `new (code: string, message: string, opts?: { context?, cause? })` | Instance. |
| `ParseError` | extends `PdfError` | Read-side / malformed bytes. |
| `RenderError` | extends `PdfError` | Invalid model at write time (L1+). |
| `ContractError` | extends `PdfError` | Consumer API contract violation. |
| `EncryptionError` | extends `PdfError` | Crypto / signatures (L3+). |
| `isPdfError` | `(e: any) => boolean` | `true` if `e instanceof PdfError`. |

### `new PdfError(code, message, opts?)`

`code`: kebab-case (e.g. `'pdf/bad-header'`). `opts.context`: arbitrary payload (`{ offset, num, gen, raw }`). `opts.cause`: source `Error` (re-throw).

## Examples

### Typed catch at the root

```js
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { fw_require, modules } from '@awacloud/pdf';

const rt = new ModuleRuntime();
for (const m of fw_require) rt.register(m);
for (const m of modules)    rt.register(m);

const api = rt.resolve('pdf');
const { isPdfError } = rt.resolve('pdfErrors');   // the classes api throws

try {
    api.read(bytes);
} catch (e) {
    if (isPdfError(e)) {
        console.log(e.name, e.code, e.context);
    } else {
        throw e;
    }
}
```

### Disambiguation by subclass

```js
const errs = rt.resolve('pdfErrors');
try { rt.resolve('pdf').read(bytes); }
catch (e) {
    if (e instanceof errs.ParseError)      console.log('malformed input');
    else if (e instanceof errs.ContractError) console.log('API misuse');
    else throw e;
}
```

## Errors

This page **defines** the codes; the modules emit them. Prefixes by domain:

- `pdf/tokenizer/...` — emitted by [`pdfTokenizer`](./syntax/tokenizer.md).
- `pdf/parser/...` — emitted by [`pdfParser`](./syntax/parser.md).
- `pdf/xref/...` — emitted by [`pdfXref`](./syntax/xref.md).
- `pdf/trailer/...` — emitted by [`pdfTrailer`](./syntax/trailer.md).
- `pdf/catalog/...` — emitted by [`pdfCatalog`](./document/catalog.md).
- `pdf/pages/...` — emitted by [`pdfPages`](./document/pages.md).
- `pdf/page/...` — emitted by [`pdfPage`](./document/page.md).
- `pdf/document/...` — emitted by [`pdfDocument`](./document/document.md).
- `pdf/writer/...` — emitted by [`pdfWriter`](./document/writer.md); includes `pdf/writer/unresolvable-objects` (`RenderError`, `context.objects` = `Array<{ num, gen, code }>`), thrown by `assembleIndirects(model, { strict: true })` when an in-use object cannot be resolved.
- `pdf/use/...` — emitted by [`pdf`](./pdf.md).
- `pdf/sig/...` — emitted by [`pdfSignature`](./sig/signature.md), [`pdfByteRange`](./sig/byteRange.md), [`pdfCertChain`](./sig/certChain.md). The public-key verification path is wired and executed by construction — there is no `pdf/sig/pk-verify-not-wired` code; see [`pdfSignature`](./sig/signature.md)'s Errors table for the full `pdf/sig/*` and `pdf/sig/verify-pk/*` set.
- `pdf/ts/...` — emitted by [`pdfTimestamp`](./sig/timestamp.md) (RFC 3161) and by [`pdfSignature`](./sig/signature.md)'s `/DocTimeStamp` verification branch.
- `pdf/cert/...` — emitted by [`pdfCertChain`](./sig/certChain.md).
- `pdf/crypto/...` — emitted by [`pdfStandardV5`](./crypto/standardV5.md), [`pdfStandardV6`](./crypto/standardV6.md), [`pdfPermissions`](./crypto/permissions.md), [`pdfSecurity`](./crypto/security.md), [`pdfAesGcm`](./crypto/aesGcm.md).
- `pdf/sandbox/...` — emitted by the opt-in `pdfSandbox` module (bundle `pdf-full`).

## See also

- [`pdf`](./pdf.md) — emitter of `ContractError` on the `.use()` side.
- [`pdfDocument`](./document/document.md) — propagates `ParseError` for full reads.
