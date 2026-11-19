# tests/_vectors/

NIST CAVP/ACVP vectors **vendored** from
[`references/NIST/ACVP-Server-1.1.0.42/gen-val/json-files/`](../../../../../references/NIST/ACVP-Server-1.1.0.42/gen-val/json-files).

## Why this copy

The monorepo folder [`references/NIST/`](../../../../../references/NIST) is
an **optional, read-only** external resource (see
[`references/NIST.md`](../../../../../references/NIST.md)). It must not be
read at runtime by the tests: a consumer of the `@awacloud/fw` package has
no reason to have this tree on disk.

`src/crypto/`'s extended tests (gated behind `CRYPTO_FULL=1` for ML-KEM,
ML-DSA, SLH-DSA; permanent for `ctrDRBG`) rely on large **ACVP vectors**
(~50 MB combined): embedding them as JS literals in the `.test.js` files is
not viable. The targeted copy into `tests/_vectors/` makes the tests
**self-contained** without bloating the sources and without publishing these
files (the `tests/` folder is excluded from the npm tarball — see
`package.json` `files`).

## Contents

For each required ACVP folder, only the files actually read by the tests
are copied (no `prompt.json`, `registration.json`, `validation.json`):

| Folder | Files |
|---|---|
| `ctrDRBG-1.0/` | `internalProjection.json` |
| `ML-KEM-keyGen-FIPS203/` | `internalProjection.json`, `expectedResults.json` |
| `ML-KEM-encapDecap-FIPS203/` | `internalProjection.json`, `expectedResults.json` |
| `ML-DSA-keyGen-FIPS204/` | `internalProjection.json`, `expectedResults.json` |
| `ML-DSA-sigGen-FIPS204/` | `internalProjection.json`, `expectedResults.json` |
| `ML-DSA-sigVer-FIPS204/` | `internalProjection.json`, `expectedResults.json` |
| `SLH-DSA-keyGen-FIPS205/` | `internalProjection.json`, `expectedResults.json` |
| `SLH-DSA-sigVer-FIPS205/` | `internalProjection.json`, `expectedResults.json` |
| `ECDSA-SigVer-FIPS186-5/` | `internalProjection.json` (SHA-256 `45f9e9425e68b099d9c029e0e75ec04e9cc5943b60fa24cdb4d5af778f350b63`) — read by `src/crypto/webcrypto/ecc.test.js`, the 6 groups WebCrypto runs |
| `RSA-SigVer-FIPS186-5/` | `internalProjection.json` (SHA-256 `86088be5f46b3b10794357495c6d914af4a4c03b97bd3d185482f2d47d338578`) — read by `src/crypto/webcrypto/rsa.test.js`, the 2 PKCS#1 v1.5 SHA2-256 groups with a public exponent of at most 32 bits |

## Generated here: `zip-foreign/`

Not vendored: eleven zip archives written by **foreign writers** from this
lane's own contents — CPython's `zipfile`, .NET's
`System.IO.Compression.ZipFile`, 7-Zip and libarchive (Windows' `tar.exe`)
— so fw's reader meets layouts it did not write (stored + comment, deflated +
UTF-8 name, ZIP64 extra fields, data descriptors — on stored entries too —,
.NET's `\` separators, NTFS and Unix extras, a Deflate64 archive fw must
refuse). `generate.py.txt` (a Python script — run it as
`python generate.py.txt [writer…]`; Python stdlib, Windows PowerShell,
7-Zip) writes them with `manifest.json` (the expected contents and the
writer versions); naming writers regenerates only theirs and keeps the other
archives byte for byte. The archives are stored base64-encoded in
`archives.json` (the repository ignores `*.zip`), and the tests read that
file and never run the script. Read by `src/io/compress/zip-foreign.test.js`.

## Generated here: `lzw-foreign/`

Not vendored: two GIF and two TIFF images written by **GDI+**
(`System.Drawing`, Windows PowerShell 5.1) from this lane's own
deterministic pixel pattern, with the pixel bytes each must decode to (for
a GIF, the indices GDI+ reads back from the file). `generate.py.txt` writes
`images.json`; the tests read it and never run the script. Read by
`src/io/compress/lzw-foreign.test.js`.

## Vendored: `msgpack-test-suite/`

[kawanet/msgpack-test-suite](https://github.com/kawanet/msgpack-test-suite)
(MIT, owner ruling 2026-11-11), copied unchanged at commit `e04f6ede` with
its `LICENSE`; the provenance, digests and retrieval are in
`msgpack-test-suite/PROVENANCE.md`. Read by
`src/io/codec/msgpack-suite.test.js`.

## Updating

When an extended test needs a new ACVP vector:

1. Identify the folder `references/NIST/ACVP-Server-1.1.0.42/gen-val/json-files/<DIR>/`.
2. Copy only the needed files into `tests/_vectors/<DIR>/`.
3. Cite the source in the test's header comment
   (`// Source: references/NIST/ACVP-Server-1.1.0.42/gen-val/json-files/<DIR>/`).
4. Do **not** modify the copied content — any correction goes through the
   upstream source (see [`references/NIST.md`](../../../../../references/NIST.md)).

Pinned ACVP server version: **1.1.0.42**.
