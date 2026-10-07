---
module: extraDsig
category: extra/dsig
dependencies: [fontErrors, fontReader]
returns: object
worker-safe: true
status: complete
---

# extraDsig

> Table `DSIG` — OpenType Digital Signature (parse only).

**Module** `extraDsig` | **Source** `packages/front/office/fonts/src/extra/dsig.js` | **Deps** `fontErrors`, `fontReader` | **Worker-safe** yes

Parses the DSIG envelope (header + signature records + PKCS#7 blocks) and exposes each raw PKCS#7 blob. Cryptographic verification is out of scope (PKI lives in `@awacloud/fw`).

## Exports

| Symbol | Type | Description |
|--------|------|-------------|
| `DSIG_VERSION` | const | `1`. |
| `DSIG_FORMAT_PKCS7` | const | `1`. |
| `parseDsig` | function | `(bytes) => { version, numSignatures, flags, signatures }`. Each `signatures[i]` is `{ format, length, offset, reserved1, reserved2, signatureLength, signature: Uint8Array }` — not just `{ format, signature }` (`dsig.js` lines 51–86). |
| `extraDsig` | factory | Factory. |

## Usage

```js
import fw from '@awacloud/fw';
import { fw_require, modules, extras } from '@awacloud/fonts';

for (const m of [...fw_require, ...modules, ...extras]) fw.runtime.register(m);
const { parseDsig } = fw.runtime.resolve('extraDsig');
const dsig = parseDsig(sfnt.tables.DSIG.bytes);
```

## Notes

- Bit 0 of `flags` = "cannot-be-resigned".
- Included in `fonts-full`.

## See also

- [extra/woff2-write](./woff2-write.md)
