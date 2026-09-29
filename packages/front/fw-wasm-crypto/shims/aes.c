/*
 * Copyright (c) 2026 AwaCloud SAS
 * Author: Matthieu Bouilloux
 * SPDX-License-Identifier: Apache-2.0
 */

/*
 * aes.c — AES CTR / CBC / GCM ABI adapters (constant-time, BearSSL ct64).
 *
 * ABI source-of-truth:
 *   14-wasm-aes.md   aes_gcm_seal/open(keyPtr, keyLen, ivPtr, dataPtr, dataLen, aadPtr, aadLen, outPtr) -> i32
 *                    aes_cbc_enc/dec(...), aes_ctr(...)
 *   + memory / alloc / free.  (0 = OK.)
 *
 * CONSTANT-TIME: WASM has no AES-NI, so AES uses BearSSL's `br_aes_ct64_*`
 * 64-bit bitsliced implementation (the constant-time vtable
 * `br_aes_ct64_ctr_vtable` / `_cbcenc` / `_cbcdec`). GCM uses the
 * carryless `br_ghash_ctmul64` GHASH. This is the *_ct64 path mandated by the
 * plan. No crypto is reimplemented here — every export marshals buffers and
 * drives the vendored BearSSL primitives.
 *
 * Carved from shims/bearssl.c (W3 Tier-B split). W4-internal surface
 * (sha2, hmac, pbkdf2, hkdf, aes_cmac) stays in shims/bearssl.c.
 *
 * Freestanding header note: BearSSL's inner.h/bearssl_hash.h pull <string.h>
 * (memcpy/memset) and <limits.h> (ULONG_MAX). Under
 * `--target=wasm32 -ffreestanding -nostdlib` with no wasi sysroot, those are
 * provided by the package-local compat shims in csrc/bearssl/compat/, placed
 * ahead on -I via the `aes` target's cflags (not edits to vendored bytes).
 */

#include "_arena.h"
#include "bearssl.h"   /* vendored umbrella header */

#define WC_EBADPARAM (-1)
#define WC_EFAIL     (-2)

/*
 * Freestanding memcmp — under `-flto` a `__builtin_memcmp` of a variable size
 * can lower to an extern `memcmp` libcall (BATCH_21 note (c)). The AES ct64 TUs
 * do not call memcmp, but providing it forecloses that libcall class so the
 * zero-import invariant cannot be broken by an LTO-introduced reference. The
 * compat <string.h> macro-maps `memcmp` to `__builtin_memcmp`; #undef it here so
 * this real definition is emitted as the actual `memcmp` symbol.
 */
#ifdef memcmp
#undef memcmp
#endif
__attribute__((used))
int memcmp(const void* a, const void* b, size_t n) {
    const uint8_t* pa = (const uint8_t*)a;
    const uint8_t* pb = (const uint8_t*)b;
    for (size_t i = 0; i < n; i++) {
        if (pa[i] != pb[i]) return (int)pa[i] - (int)pb[i];
    }
    return 0;
}

/* ── AES — constant-time (ct64) CTR / CBC / GCM ─────────────────────────────── */

__attribute__((used))
int aes_ctr(const uint8_t* keyPtr, int keyLen, const uint8_t* ivPtr,
            const uint8_t* dataPtr, int dataLen, uint8_t* outPtr) {
    if (dataLen < 0) return WC_EBADPARAM;
    br_aes_ct64_ctr_keys bc;
    br_aes_ct64_ctr_init(&bc, keyPtr, (size_t)keyLen);
    /* out is produced in place: copy in then run CTR (XOR keystream). */
    for (int i = 0; i < dataLen; i++) outPtr[i] = dataPtr[i];
    /* iv = 16 bytes; high 12 = nonce, low 4 = block counter start (cc=0). */
    uint8_t iv[12];
    for (int i = 0; i < 12; i++) iv[i] = ivPtr[i];
    br_aes_ct64_ctr_run(&bc, iv, 0, outPtr, (size_t)dataLen);
    return 0;
}

__attribute__((used))
int aes_cbc_enc(const uint8_t* keyPtr, int keyLen, const uint8_t* ivPtr,
                const uint8_t* dataPtr, int dataLen, uint8_t* outPtr) {
    if (dataLen < 0 || (dataLen & 15)) return WC_EBADPARAM;
    br_aes_ct64_cbcenc_keys bc;
    br_aes_ct64_cbcenc_init(&bc, keyPtr, (size_t)keyLen);
    for (int i = 0; i < dataLen; i++) outPtr[i] = dataPtr[i];
    uint8_t iv[16];
    for (int i = 0; i < 16; i++) iv[i] = ivPtr[i];
    br_aes_ct64_cbcenc_run(&bc, iv, outPtr, (size_t)dataLen);
    return 0;
}

__attribute__((used))
int aes_cbc_dec(const uint8_t* keyPtr, int keyLen, const uint8_t* ivPtr,
                const uint8_t* dataPtr, int dataLen, uint8_t* outPtr) {
    if (dataLen < 0 || (dataLen & 15)) return WC_EBADPARAM;
    br_aes_ct64_cbcdec_keys bc;
    br_aes_ct64_cbcdec_init(&bc, keyPtr, (size_t)keyLen);
    for (int i = 0; i < dataLen; i++) outPtr[i] = dataPtr[i];
    uint8_t iv[16];
    for (int i = 0; i < 16; i++) iv[i] = ivPtr[i];
    br_aes_ct64_cbcdec_run(&bc, iv, outPtr, (size_t)dataLen);
    return 0;
}

/*
 * AES-GCM seal: out = ct(dataLen) || tag(16). Uses the constant-time
 * br_aes_ct64 CTR keys + br_ghash_ctmul64 GHASH (no table lookups).
 */
__attribute__((used))
int aes_gcm_seal(const uint8_t* keyPtr, int keyLen, const uint8_t* ivPtr,
                 const uint8_t* dataPtr, int dataLen,
                 const uint8_t* aadPtr, int aadLen, uint8_t* outPtr) {
    if (dataLen < 0 || aadLen < 0) return WC_EBADPARAM;
    br_aes_ct64_ctr_keys bc;
    br_gcm_context gc;
    br_aes_ct64_ctr_init(&bc, keyPtr, (size_t)keyLen);
    br_gcm_init(&gc, &bc.vtable, br_ghash_ctmul64);
    br_gcm_reset(&gc, ivPtr, 12); /* 96-bit IV */
    if (aadLen > 0) br_gcm_aad_inject(&gc, aadPtr, (size_t)aadLen);
    br_gcm_flip(&gc);
    for (int i = 0; i < dataLen; i++) outPtr[i] = dataPtr[i];
    br_gcm_run(&gc, 1 /* encrypt */, outPtr, (size_t)dataLen);
    br_gcm_get_tag(&gc, outPtr + dataLen);
    return 0;
}

/*
 * AES-GCM open: in = ct(dataLen) || tag(16) (i.e. dataLen excludes the tag,
 * tag follows at dataPtr+dataLen). out = pt(dataLen). Non-zero on auth fail.
 */
__attribute__((used))
int aes_gcm_open(const uint8_t* keyPtr, int keyLen, const uint8_t* ivPtr,
                 const uint8_t* dataPtr, int dataLen,
                 const uint8_t* aadPtr, int aadLen, uint8_t* outPtr) {
    if (dataLen < 0 || aadLen < 0) return WC_EBADPARAM;
    br_aes_ct64_ctr_keys bc;
    br_gcm_context gc;
    br_aes_ct64_ctr_init(&bc, keyPtr, (size_t)keyLen);
    br_gcm_init(&gc, &bc.vtable, br_ghash_ctmul64);
    br_gcm_reset(&gc, ivPtr, 12);
    if (aadLen > 0) br_gcm_aad_inject(&gc, aadPtr, (size_t)aadLen);
    br_gcm_flip(&gc);
    for (int i = 0; i < dataLen; i++) outPtr[i] = dataPtr[i];
    br_gcm_run(&gc, 0 /* decrypt */, outPtr, (size_t)dataLen);
    /* tag follows the ciphertext at dataPtr + dataLen (16 bytes). */
    return br_gcm_check_tag(&gc, dataPtr + dataLen) ? 0 : WC_EFAIL;
}
