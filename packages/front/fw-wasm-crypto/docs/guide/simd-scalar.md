# simd128 + scalar dual-build

Every wasm target is built in two variants; which targets gain simd128 and why.

## How the dual build works

`tools/wasm-crypto build --pkg` emits two artifacts per module:

- `dist/<module>.simd.wasm` — compiled with `-msimd128` (WebAssembly simd128 proposal).
- `dist/<module>.scalar.wasm` — compiled without `-msimd128`.

Both variants share all other compile and link flags (`-mbulk-memory`, LTO,
`--gc-sections`, `--strip-all`). The choice of variant at runtime is made by
`src/loader.js`: `supportsSimd()` validates a minimal `v128.const` probe module
via `WebAssembly.validate` (no crypto instantiation); the result is memoized.
Callers may override the selection per `loadWasmModule` call via `opts.variant`.

## Parity guarantee

Where `simd: true` in `targets.json`, both variants produce identical output
for any given input. The simd128 path is a lane-parallel acceleration of the
same algorithm; it is never a different algorithm or a different implementation
with distinct test vectors. The KAT evidence confirmed simd-vs-scalar
byte-equality for all five `simd: true` targets across the full RFC/ACVP test
suites.

## simd: true targets

Five of the 17 modules have `simd: true` in `targets.json`:

| Module | Algorithm | Why simd128 helps |
|---|---|---|
| `chacha20poly1305` | ChaCha20-Poly1305 AEAD | ChaCha20 quarter-round vectorizes across four 32-bit lanes; Poly1305 message blocks can be batched |
| `sha3` | SHA-3 + SHAKE | Keccak-f[1600] theta/rho/pi/chi steps vectorize across the 25-lane state |
| `blake2b` | BLAKE2b | BLAKE2b G mixing uses the same 32-bit rotation pattern as ChaCha20; four-column + four-diagonal parallelism |
| `ml_kem` | ML-KEM (FIPS-203) | NTT butterfly operations and polynomial arithmetic benefit from SIMD lanes |
| `ml_dsa` | ML-DSA (FIPS-204) | NTT/polynomial operations over the Dilithium lattice accelerate with vector lanes |

## simd: false targets

Twelve of the 17 modules have `simd: false`:

| Module | Algorithm | Reason |
|---|---|---|
| `argon2` | Argon2id | Memory-hard by design; latency is dominated by memory access, not arithmetic throughput |
| `slh_dsa` | SLH-DSA (FIPS-205) | Hash-bound; inner loops are sequential hash invocations, not lane-parallel arithmetic |
| `cmac` | AES-CMAC | AES bitsliced `aes_ct64` has no simd128 path; SIMD gains negligible for single-block MAC |
| `sha2` | SHA-2 | SHA-2 round function is scalar-sequential; no inner parallelism to exploit in the standard form |
| `hmac` | HMAC-SHA2 | Inherits scalar SHA-2 |
| `pbkdf2` | PBKDF2 | Inherits scalar HMAC-SHA2 |
| `hkdf` | HKDF | Inherits scalar HMAC-SHA2 |
| `aes` | AES-GCM/CBC/CTR | `aes_ct64` bitsliced core; no SIMD acceleration without hardware AES-NI (unavailable in WASM) |
| `rsa` | RSA | Big-integer `rsa_i31` is sequential; no lane-parallel operations |
| `ecc` | ECDSA + ECDH | Field arithmetic is scalar sequential (`i31`/fiat-crypto); SIMD does not help |
| `ed25519` | Ed25519 | libsodium `ref10` implementation; scalar-only |
| `x25519` | X25519 | libsodium `ref10` implementation; scalar-only |
