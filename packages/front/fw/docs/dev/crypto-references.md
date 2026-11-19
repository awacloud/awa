# Crypto references and generators

## Why

The fast crypto modules of `@awacloud/fw` are unrolled (straight-line code on locals) or bitsliced: quick, but hard to read against the standard they implement. Each flattened module keeps its logical form beside it, in git only, so a reader can check the algorithm in its textbook shape and a test can prove the fast code equal to it.

## The rule

- One `<module>.reference.js` per flattened module, co-located with the fast module.
- One export: `create<X>Reference`. The reference has no import and does no work at load.
- It is never registered: no entry in `src/core/modules.js`, the catalog, the typed registry or the API surface.
- A differential test `<module>.reference.test.js` imports it (it is its only importer) and compares it with the fast module.
- It is excluded from the npm tarball by `!src/**/*.reference.js` in `files[]`, from the exports map by `null` keys, and from the declaration tree by `tsconfig.types.json`.

"Published only in the monorepo" means exactly this: the files are in git and absent from the npm package. This page ships in the package, so it links them by absolute repository URL.

The integration test `tests/crypto-references.integration.test.js` holds these properties.

## Ledger

| Module | Flattened by | Reference | What the reference is | Generated region (crypto-gen id) | Differential test |
|---|---|---|---|---|---|
| `aes` | `240fc703a` (T21) | [`aes.reference.js`](https://github.com/awacloud/awa/blob/main/packages/front/fw/src/crypto/cipher/aes.reference.js) | The pre-bitsliced constant-time round AES (masked-lookup S-box, branchless xtime MixColumns) with its T-table path, plus the loop form of the generated GF(2^8) product | `aes-gf` | [`aes.reference.test.js`](https://github.com/awacloud/awa/blob/main/packages/front/fw/src/crypto/cipher/aes.reference.test.js) |
| `ed25519` | `ecd1c5e7f` (T25) | [`ed25519.reference.js`](https://github.com/awacloud/awa/blob/main/packages/front/fw/src/crypto/pkc/ed25519.reference.js) | Ed25519 (RFC 8032) in loop form: TweetNaCl multiply accumulation, square-and-multiply inversion, bit-by-bit double-and-add | `field25519-ed` | [`ed25519.reference.test.js`](https://github.com/awacloud/awa/blob/main/packages/front/fw/src/crypto/pkc/ed25519.reference.test.js) |
| `x25519` | `ecd1c5e7f` (T25) | [`x25519.reference.js`](https://github.com/awacloud/awa/blob/main/packages/front/fw/src/crypto/pkc/x25519.reference.js) | X25519 (RFC 7748) in loop form: Montgomery ladder over the TweetNaCl multiply loop | `field25519-x` | [`x25519.reference.test.js`](https://github.com/awacloud/awa/blob/main/packages/front/fw/src/crypto/pkc/x25519.reference.test.js) |
| `chacha20` | `6ffb948ef` (T26) | [`chacha20.reference.js`](https://github.com/awacloud/awa/blob/main/packages/front/fw/src/crypto/cipher/chacha20.reference.js) | ChaCha20 (RFC 8439): state as an array of 16 words, a quarter-round function, 10 double rounds as a loop, byte-by-byte XOR | `chacha20-block` | [`chacha20.reference.test.js`](https://github.com/awacloud/awa/blob/main/packages/front/fw/src/crypto/cipher/chacha20.reference.test.js) |
| `poly1305` | `6ffb948ef` (T26) | [`poly1305.reference.js`](https://github.com/awacloud/awa/blob/main/packages/front/fw/src/crypto/hash/poly1305.reference.js) | Poly1305 (RFC 8439 section 2.5) as the `BigInt` evaluation of section 2.5.1 (not constant-time) | `poly1305-blocks` | [`poly1305.reference.test.js`](https://github.com/awacloud/awa/blob/main/packages/front/fw/src/crypto/hash/poly1305.reference.test.js) |
| `blake2b` | `c71ad9989` (T26) | [`blake2b.reference.js`](https://github.com/awacloud/awa/blob/main/packages/front/fw/src/crypto/hash/blake2b.reference.js) | BLAKE2b (RFC 7693): the rolled compression, G mixing over (hi, lo) halves with 64-bit helpers, 12 rounds as a loop over `SIGMA` | `blake2b-compress` | [`blake2b.reference.test.js`](https://github.com/awacloud/awa/blob/main/packages/front/fw/src/crypto/hash/blake2b.reference.test.js) |
| `sha3` | `abf082855` (T26) | [`sha3.reference.js`](https://github.com/awacloud/awa/blob/main/packages/front/fw/src/crypto/hash/sha3.reference.js) | SHA-3 and SHAKE (FIPS 202): the rolled Keccak-f[1600] (theta, rho + pi, chi, iota as loops over 25 lanes) and a byte-by-byte sponge | `keccak-f1600` | [`sha3.reference.test.js`](https://github.com/awacloud/awa/blob/main/packages/front/fw/src/crypto/hash/sha3.reference.test.js) |
| `sha256` | `9e89e3d06` (T26) | [`sha256.reference.js`](https://github.com/awacloud/awa/blob/main/packages/front/fw/src/crypto/hash/sha256.reference.js) | SHA-256 (FIPS 180-4): the rolled compression, a rolling 16-word schedule and a 64-round loop, no byte fast path | `sha256-compress` | [`sha256.reference.test.js`](https://github.com/awacloud/awa/blob/main/packages/front/fw/src/crypto/hash/sha256.reference.test.js) |

`sha512` (`683022cec`) moved to int32 arrays and a byte fast path, but its compression is still a loop, so it has no reference.

## Generators

`tools/crypto-gen.js` regenerates the straight-line regions of the fast modules. The committed module is the oracle: when a fragment differs, the generator is corrected, never the module. From `packages/front/fw`:

- `bun tools/crypto-gen.js --check` compares every committed region with its regenerated fragment (exit 0 when all are `OK`);
- `bun tools/crypto-gen.js --write` replaces each region by its fragment;
- `bun tools/crypto-gen.js --print <id>` prints one fragment.

The eight targets: `aes-gf`, `field25519-ed`, `field25519-x`, `chacha20-block`, `poly1305-blocks`, `sha256-compress`, `keccak-f1600`, `blake2b-compress`.

## Changing a fast module

1. Edit the fast module.
2. Run its differential test (`bun test ./src/crypto/<dir>/<module>.reference.test.js`).
3. Run `bun tools/crypto-gen.js --check`.

A generated region is not edited by hand: change the generator in `tools/crypto-gen.js`, then run `--write`.

## No reference yet

`pbkdf2` (flattened by `9e89e3d06`, T26) has no reference file, by the owner's amendment OP-B35-1116: `pbkdf2.js` still carries the general RFC 8018 loop, so a copy would duplicate it. Its differential test, [`pbkdf2.differential.test.js`](https://github.com/awacloud/awa/blob/main/packages/front/fw/src/crypto/hash/pbkdf2.differential.test.js), compares the two-compression fast path with that loop.
