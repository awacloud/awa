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

## Updating

When an extended test needs a new ACVP vector:

1. Identify the folder `references/NIST/ACVP-Server-1.1.0.42/gen-val/json-files/<DIR>/`.
2. Copy only the needed files into `tests/_vectors/<DIR>/`.
3. Cite the source in the test's header comment
   (`// Source: references/NIST/ACVP-Server-1.1.0.42/gen-val/json-files/<DIR>/`).
4. Do **not** modify the copied content — any correction goes through the
   upstream source (see [`references/NIST.md`](../../../../../references/NIST.md)).

Pinned ACVP server version: **1.1.0.42**.
