/*
 * Copyright (c) 2026 AwaCloud SAS
 * Author: Matthieu Bouilloux
 * SPDX-License-Identifier: Apache-2.0
 */

/*
 * argon2.c — RFC 9106 Argon2id (C23, freestanding wasm32) over the OWN
 * csrc/blake2 BLAKE2b lib (task 04).
 *
 * Reference: RFC 9106 "Argon2 Memory-Hard Function for Password Hashing and
 * Proof-of-Work Applications". This is the Argon2id variant (y=2):
 *   - H0 = BLAKE2b(LE32(p) ∥ LE32(T) ∥ LE32(m) ∥ LE32(t) ∥ LE32(v) ∥ LE32(y)
 *               ∥ LE32(|P|) ∥ P ∥ LE32(|S|) ∥ S ∥ LE32(|K|) ∥ K ∥ LE32(|X|) ∥ X)
 *     (RFC 9106 §3.2, "Pre-hashing").
 *   - The first two columns of every lane are H'(H0 ∥ LE32(j) ∥ LE32(i))
 *     (the variable-length hash, §3.3 / §3.4).
 *   - Every other block B[i][j] = G(B[i][j-1], B[i'][j']) where the reference
 *     block index (i',j') is chosen data-INDEPENDENTLY for pass-0 segments
 *     0 and 1 (Argon2i addressing, §3.4.1.2 + §3.4.1.3) and data-DEPENDENTLY
 *     thereafter (Argon2d addressing, §3.4.1.1). This split is the Argon2id
 *     security-defining detail (§3.4.1.3).
 *   - The final tag = H'(B[0][q-1] ⊕ B[1][q-1] ⊕ … ⊕ B[p-1][q-1]) (§3.5).
 *
 * The compression function G (§3.4) applies the BLAKE2b round permutation P to
 * the 1024-byte blocks (column rounds over 8×16 64-bit words, then row rounds),
 * with R = X ⊕ Y feed-forward. P is the BLAKE2b mixing on a 16-word state with
 * the FULL message words (no message schedule / sigma — Argon2's P is the raw
 * round function with m[*] = the 16 state words, applied twice per call).
 *
 * BLAKE2b itself (H0, H') is the OWN core — included read-only:
 *   blake2b_init_param / _update / _final, the 64-byte blake2b_param.
 * The H' variable-output hash for outlen > 64 is built here per RFC 9106 §3.3
 * (the 32-byte block chain), reusing blake2b_long for the ≤64 case.
 *
 * Freestanding wasm32: no libc. Local memcpy/memset are hand-rolled.
 */

#include "csrc/argon2/argon2.h"
#include "csrc/blake2/blake2b.h"

/* ───────────────────────── freestanding helpers ──────────────────────────── */

static inline void a2_memset(uint8_t *p, uint8_t v, size_t n) {
    for (size_t i = 0; i < n; i++) p[i] = v;
}
static inline void a2_memcpy(uint8_t *d, const uint8_t *s, size_t n) {
    for (size_t i = 0; i < n; i++) d[i] = s[i];
}

/* Little-endian 32-bit store. */
static inline void store32_le(uint8_t *p, uint32_t v) {
    p[0] = (uint8_t)(v);
    p[1] = (uint8_t)(v >> 8);
    p[2] = (uint8_t)(v >> 16);
    p[3] = (uint8_t)(v >> 24);
}
/* Little-endian 64-bit load/store. */
static inline uint64_t load64_le(const uint8_t *p) {
    return ((uint64_t)p[0])       | ((uint64_t)p[1] << 8)
         | ((uint64_t)p[2] << 16) | ((uint64_t)p[3] << 24)
         | ((uint64_t)p[4] << 32) | ((uint64_t)p[5] << 40)
         | ((uint64_t)p[6] << 48) | ((uint64_t)p[7] << 56);
}
static inline void store64_le(uint8_t *p, uint64_t v) {
    for (unsigned i = 0; i < 8; i++) p[i] = (uint8_t)(v >> (8u * i));
}

static inline uint64_t rotr64(uint64_t x, int c) {
    return (x >> c) | (x << (64 - c));
}

/* ───────────────────────── H' variable-length hash (RFC 9106 §3.3) ─────────── */

/*
 * H'^T(A) — the Argon2 variable-length hash. For T ≤ 64 it is plain
 * BLAKE2b_T(LE32(T) ∥ A). For T > 64 it produces 32-byte chunks: V1 =
 * BLAKE2b_64(LE32(T) ∥ A), Vi = BLAKE2b_64(V_{i-1}); the output is the first
 * 32 bytes of V1..V_{r-1} followed by the final V_r truncated to (T − 32·r)
 * bytes, where r = ⌈T/32⌉ − 2. (RFC 9106 §3.3.)
 *
 * Returns 0 on success, -1 on a BLAKE2b error.
 */
static int blake2b_long_prefixed(uint8_t *out, uint32_t outlen,
                                 const uint8_t *in, size_t inlen) {
    uint8_t lenbuf[4];
    store32_le(lenbuf, outlen);

    if (outlen <= BLAKE2B_OUTBYTES) {
        /* Single BLAKE2b with the length prefix absorbed first. */
        blake2b_param P;
        a2_memset((uint8_t *)&P, 0, sizeof(P));
        P.digest_length = (uint8_t)outlen;
        P.fanout = 1;
        P.depth  = 1;
        blake2b_ctx ctx;
        if (blake2b_init_param(&ctx, &P) != 0) return -1;
        blake2b_update(&ctx, lenbuf, 4);
        blake2b_update(&ctx, in, inlen);
        blake2b_final(&ctx, out);
        return 0;
    }

    /* outlen > 64: 32-byte chunked chain. V1 = BLAKE2b_64(LE32(T) ∥ A). */
    uint8_t V[BLAKE2B_OUTBYTES];
    {
        blake2b_param P;
        a2_memset((uint8_t *)&P, 0, sizeof(P));
        P.digest_length = (uint8_t)BLAKE2B_OUTBYTES;
        P.fanout = 1;
        P.depth  = 1;
        blake2b_ctx ctx;
        if (blake2b_init_param(&ctx, &P) != 0) return -1;
        blake2b_update(&ctx, lenbuf, 4);
        blake2b_update(&ctx, in, inlen);
        blake2b_final(&ctx, V);
    }

    uint32_t pos = 0;
    /* Emit the first 32 bytes of V1, then re-hash to V2, V3, … */
    a2_memcpy(out + pos, V, 32);
    pos += 32;

    uint32_t remaining = outlen - 32;
    while (remaining > 64) {
        if (blake2b_long(V, BLAKE2B_OUTBYTES, V, BLAKE2B_OUTBYTES) != 0) return -1;
        a2_memcpy(out + pos, V, 32);
        pos += 32;
        remaining -= 32;
    }
    /* Final chunk: BLAKE2b_remaining(V) — `remaining` is in (0,64]. */
    if (blake2b_long(V, remaining, V, BLAKE2B_OUTBYTES) != 0) return -1;
    a2_memcpy(out + pos, V, remaining);
    return 0;
}

/* ───────────────────────── compression function G (RFC 9106 §3.4) ─────────── */

/* The BLAKE2b round on a 16-word vector (the GB / P permutation, §3.4). Unlike
 * the BLAKE2b hash this is the raw mixing — the message words ARE the state. */
#define G_BLAKE2B(a, b, c, d)                                  \
    do {                                                       \
        (a) = (a) + (b) + 2 * ((a) & 0xFFFFFFFFULL) * ((b) & 0xFFFFFFFFULL); \
        (d) = rotr64((d) ^ (a), 32);                           \
        (c) = (c) + (d) + 2 * ((c) & 0xFFFFFFFFULL) * ((d) & 0xFFFFFFFFULL); \
        (b) = rotr64((b) ^ (c), 24);                           \
        (a) = (a) + (b) + 2 * ((a) & 0xFFFFFFFFULL) * ((b) & 0xFFFFFFFFULL); \
        (d) = rotr64((d) ^ (a), 16);                           \
        (c) = (c) + (d) + 2 * ((c) & 0xFFFFFFFFULL) * ((d) & 0xFFFFFFFFULL); \
        (b) = rotr64((b) ^ (c), 63);                           \
    } while (0)

/* Permutation P over 16 state words v[0..15] (RFC 9106 §3.4 / Figure 7). */
static void P_perm(uint64_t *v) {
    G_BLAKE2B(v[0], v[4], v[8],  v[12]);
    G_BLAKE2B(v[1], v[5], v[9],  v[13]);
    G_BLAKE2B(v[2], v[6], v[10], v[14]);
    G_BLAKE2B(v[3], v[7], v[11], v[15]);
    G_BLAKE2B(v[0], v[5], v[10], v[15]);
    G_BLAKE2B(v[1], v[6], v[11], v[12]);
    G_BLAKE2B(v[2], v[7], v[8],  v[13]);
    G_BLAKE2B(v[3], v[4], v[9],  v[14]);
}

#undef G_BLAKE2B

/*
 * G(X, Y) → out (RFC 9106 §3.4). R = X ⊕ Y; apply P row-wise then column-wise
 * over the 8×8 matrix of 16-word registers; out = Z ⊕ R, where Z is the
 * permuted block. All three buffers are ARGON2_BLOCK_SIZE bytes. `out` may
 * alias neither X nor Y (the fill uses a distinct scratch / dst).
 */
static void fill_block_G(const uint64_t *x, const uint64_t *y,
                         uint64_t *out, int with_xor) {
    uint64_t R[ARGON2_QWORDS];
    uint64_t Z[ARGON2_QWORDS];
    for (size_t i = 0; i < ARGON2_QWORDS; i++) { R[i] = x[i] ^ y[i]; Z[i] = R[i]; }

    /* Apply P to each of the 8 rows (16 words each = 2 registers of 8). The
     * block is 128 words = 8 rows × 16 words. */
    for (int i = 0; i < 8; i++) {
        uint64_t *r = &Z[16 * i];
        P_perm(r);
    }
    /* Apply P to each of the 8 columns. Column i gathers words
     * (2i, 2i+1) from each of the 8 rows → 16 words. */
    for (int i = 0; i < 8; i++) {
        uint64_t col[16];
        for (int j = 0; j < 8; j++) {
            col[2 * j]     = Z[16 * j + 2 * i];
            col[2 * j + 1] = Z[16 * j + 2 * i + 1];
        }
        P_perm(col);
        for (int j = 0; j < 8; j++) {
            Z[16 * j + 2 * i]     = col[2 * j];
            Z[16 * j + 2 * i + 1] = col[2 * j + 1];
        }
    }

    /* out = Z ⊕ R  (and on pass>0 with_xor, the caller has already folded the
     * previous block into `out` before calling — see fill loop). */
    if (with_xor) {
        for (size_t i = 0; i < ARGON2_QWORDS; i++) out[i] ^= Z[i] ^ R[i];
    } else {
        for (size_t i = 0; i < ARGON2_QWORDS; i++) out[i] = Z[i] ^ R[i];
    }
}

/* ───────────────────────── block matrix helpers ──────────────────────────── */

/* Pointer to block (lane, idx) in the m'-block matrix, as uint64_t words. */
static inline uint64_t *block_at(uint8_t *mem, uint32_t lane, uint32_t idx,
                                 uint32_t lane_length) {
    return (uint64_t *)(mem + (size_t)(lane * lane_length + idx) * ARGON2_BLOCK_SIZE);
}

/* Load LE block bytes → 16/128 word vector is implicit: on wasm32 (LE) the
 * matrix is stored as native uint64 words throughout (we only emit LE at H0 /
 * H' boundaries), so block_at returns directly usable words. */

/* ───────────────────────── data-independent address generation ────────────── */

/*
 * For Argon2i / the data-independent phase, the pseudo-random J1,J2 stream is
 * produced by G applied twice to a zero block whose words encode
 * (pass, lane, slice, m', t, y, ctr). RFC 9106 §3.4.1.2.
 */
typedef struct {
    uint64_t pass;
    uint64_t lane;
    uint64_t slice;
    uint64_t mblocks;
    uint64_t total_passes;
    uint64_t type;       /* 2 for Argon2id */
    uint64_t counter;
    uint64_t addr[ARGON2_QWORDS];   /* current 1024-byte address block (words) */
    uint64_t input[ARGON2_QWORDS];  /* the encoding input block                */
    uint32_t idx;        /* which of the 128 addresses in `addr` is next       */
} addr_state;

static void next_addr_block(addr_state *st) {
    uint64_t zero[ARGON2_QWORDS];
    for (size_t i = 0; i < ARGON2_QWORDS; i++) zero[i] = 0;

    st->counter++;
    for (size_t i = 0; i < ARGON2_QWORDS; i++) st->input[i] = 0;
    st->input[0] = st->pass;
    st->input[1] = st->lane;
    st->input[2] = st->slice;
    st->input[3] = st->mblocks;
    st->input[4] = st->total_passes;
    st->input[5] = st->type;
    st->input[6] = st->counter;

    /* address_block = G( zero, G(zero, input) ) (two passes of the compression,
     * RFC 9106 §3.4.1.2). */
    uint64_t tmp[ARGON2_QWORDS];
    fill_block_G(zero, st->input, tmp, 0);
    fill_block_G(zero, tmp, st->addr, 0);
}

/* ───────────────────────── reference index mapping (RFC §3.4.1.1) ──────────── */

/*
 * Map a 32-bit pseudo-random value J1 to a reference block index within the
 * candidate set, per RFC 9106 §3.4.1.1 (the "relative position" formula). The
 * candidate area size W depends on (pass, slice, position-in-segment, same_lane).
 */
static uint32_t index_alpha(uint32_t pass, uint32_t slice, uint32_t index,
                            uint32_t segment_length, uint32_t lane_length,
                            uint32_t pseudo_rand, int same_lane) {
    uint32_t reference_area_size;
    if (pass == 0) {
        if (slice == 0) {
            reference_area_size = index - 1;                    /* first slice */
        } else if (same_lane) {
            reference_area_size = slice * segment_length + index - 1;
        } else {
            reference_area_size = slice * segment_length - (index == 0 ? 1 : 0);
        }
    } else {
        if (same_lane) {
            reference_area_size = lane_length - segment_length + index - 1;
        } else {
            reference_area_size = lane_length - segment_length - (index == 0 ? 1 : 0);
        }
    }

    /* Relative position: x = J1^2 / 2^32; y = (area·x)/2^32; rel = area-1-y. */
    uint64_t rel = pseudo_rand;
    rel = (rel * rel) >> 32;
    rel = ((uint64_t)reference_area_size * rel) >> 32;
    rel = (uint64_t)reference_area_size - 1 - rel;

    uint32_t start_position = 0;
    if (pass != 0) {
        start_position = (slice == ARGON2_SYNC_POINTS - 1)
                             ? 0
                             : (slice + 1) * segment_length;
    }
    return (uint32_t)((start_position + rel) % lane_length);
}

/* ───────────────────────── segment fill (RFC §3.4) ────────────────────────── */

static void fill_segment(uint8_t *mem, uint32_t pass, uint32_t lane,
                         uint32_t slice, uint32_t lanes,
                         uint32_t segment_length, uint32_t lane_length,
                         uint32_t passes) {
    /* Argon2id: pass 0, slices 0 and 1 use data-INDEPENDENT addressing. */
    const int data_independent =
        (pass == 0) && (slice < (ARGON2_SYNC_POINTS / 2));

    addr_state st;
    if (data_independent) {
        st.pass = pass;
        st.lane = lane;
        st.slice = slice;
        st.mblocks = (uint64_t)lanes * lane_length;
        st.total_passes = passes;
        st.type = ARGON2_TYPE_ID;
        st.counter = 0;
        st.idx = 0;
        next_addr_block(&st);  /* prime the first address block */
    }

    /* Starting index within the segment: pass 0 / slice 0 already has blocks
     * [0],[1] (the H' columns); start filling at index 2 there, else 0. */
    uint32_t starting_index = (pass == 0 && slice == 0) ? 2u : 0u;

    for (uint32_t i = starting_index; i < segment_length; i++) {
        uint32_t curr_offset = slice * segment_length + i;
        uint32_t prev_offset = (curr_offset % lane_length == 0)
                                   ? curr_offset + lane_length - 1
                                   : curr_offset - 1;

        /* Pseudo-random value J1,J2: from the address block (independent) or
         * from the previous block's first word (dependent). */
        uint64_t pseudo_rand;
        if (data_independent) {
            if (st.idx == ARGON2_QWORDS) {
                next_addr_block(&st);
                st.idx = 0;
            }
            pseudo_rand = st.addr[st.idx++];
        } else {
            pseudo_rand = block_at(mem, lane, prev_offset % lane_length, lane_length)[0];
        }

        uint32_t ref_lane = (uint32_t)((pseudo_rand >> 32) % lanes);
        /* On pass 0 slice 0 the reference lane is forced to the current lane. */
        if (pass == 0 && slice == 0) ref_lane = lane;

        uint32_t ref_index = index_alpha(
            pass, slice, i, segment_length, lane_length,
            (uint32_t)(pseudo_rand & 0xFFFFFFFFULL),
            ref_lane == lane);

        uint64_t *ref_block = block_at(mem, ref_lane, ref_index, lane_length);
        uint64_t *prev_block = block_at(mem, lane, prev_offset % lane_length, lane_length);
        uint64_t *curr_block = block_at(mem, lane, curr_offset % lane_length, lane_length);

        /* pass 0: B = G(prev, ref); pass > 0: B ^= G(prev, ref) (XOR fold). */
        fill_block_G(prev_block, ref_block, curr_block, pass != 0);
    }
}

/* ───────────────────────── core entry (RFC 9106) ──────────────────────────── */

int argon2id_core(
    const uint8_t *pwd,    uint32_t pwdlen,
    const uint8_t *salt,   uint32_t saltlen,
    const uint8_t *secret, uint32_t secretlen,
    const uint8_t *ad,     uint32_t adlen,
    uint32_t t, uint32_t m, uint32_t p,
    uint8_t *out, uint32_t outlen,
    uint8_t *mem, uint32_t mem_blocks)
{
    /* Parameter validation (RFC 9106 §3.1 bounds, freestanding subset). */
    if (p == 0 || t == 0 || outlen < 4) return ARGON2_ERR_PARAM;
    if (m < 8u * p) return ARGON2_ERR_PARAM;

    /* m' = 4·p·⌊m/(4p)⌋ (RFC 9106 §3.2 step 2). */
    uint32_t segment_length = m / (ARGON2_SYNC_POINTS * p);
    uint32_t lane_length = segment_length * ARGON2_SYNC_POINTS;
    uint32_t mprime = lane_length * p;
    if (mprime > mem_blocks) return ARGON2_ERR_PARAM;

    /* ── H0 = BLAKE2b-512 of the parameter pre-hash (RFC 9106 §3.2). ── */
    uint8_t H0[ARGON2_PREHASH_LEN + 8];  /* 64 + LE32(j) + LE32(i) slack */
    {
        blake2b_param P;
        a2_memset((uint8_t *)&P, 0, sizeof(P));
        P.digest_length = (uint8_t)BLAKE2B_OUTBYTES;
        P.fanout = 1;
        P.depth  = 1;
        blake2b_ctx ctx;
        if (blake2b_init_param(&ctx, &P) != 0) return ARGON2_ERR_PARAM;

        uint8_t le[4];
        store32_le(le, p);            blake2b_update(&ctx, le, 4);
        store32_le(le, outlen);       blake2b_update(&ctx, le, 4);
        store32_le(le, m);            blake2b_update(&ctx, le, 4);
        store32_le(le, t);            blake2b_update(&ctx, le, 4);
        store32_le(le, ARGON2_VERSION_13); blake2b_update(&ctx, le, 4);
        store32_le(le, ARGON2_TYPE_ID);    blake2b_update(&ctx, le, 4);
        store32_le(le, pwdlen);       blake2b_update(&ctx, le, 4);
        if (pwdlen) blake2b_update(&ctx, pwd, pwdlen);
        store32_le(le, saltlen);      blake2b_update(&ctx, le, 4);
        if (saltlen) blake2b_update(&ctx, salt, saltlen);
        store32_le(le, secretlen);    blake2b_update(&ctx, le, 4);
        if (secretlen) blake2b_update(&ctx, secret, secretlen);
        store32_le(le, adlen);        blake2b_update(&ctx, le, 4);
        if (adlen) blake2b_update(&ctx, ad, adlen);
        blake2b_final(&ctx, H0);
    }

    /* ── Initial two columns of every lane: B[i][0]=H'(H0∥0∥i),
     *    B[i][1]=H'(H0∥1∥i)  (RFC 9106 §3.4, 1024-byte blocks). ── */
    uint8_t blk[ARGON2_BLOCK_SIZE];
    for (uint32_t lane = 0; lane < p; lane++) {
        for (uint32_t col = 0; col < 2; col++) {
            store32_le(H0 + ARGON2_PREHASH_LEN, col);
            store32_le(H0 + ARGON2_PREHASH_LEN + 4, lane);
            if (blake2b_long_prefixed(blk, ARGON2_BLOCK_SIZE, H0,
                                      ARGON2_PREHASH_LEN + 8) != 0)
                return ARGON2_ERR_PARAM;
            uint64_t *dst = block_at(mem, lane, col, lane_length);
            for (size_t w = 0; w < ARGON2_QWORDS; w++)
                dst[w] = load64_le(blk + 8 * w);
        }
    }

    /* ── Fill all blocks, t passes × 4 slices × p lanes (single-lane loop;
     *    the segment dependency within a slice is satisfied because lanes are
     *    independent per slice and we complete each slice before the next). ── */
    for (uint32_t pass = 0; pass < t; pass++) {
        for (uint32_t slice = 0; slice < ARGON2_SYNC_POINTS; slice++) {
            for (uint32_t lane = 0; lane < p; lane++) {
                fill_segment(mem, pass, lane, slice, p,
                             segment_length, lane_length, t);
            }
        }
    }

    /* ── Finalize: C = B[0][q-1] ⊕ … ⊕ B[p-1][q-1]; tag = H'^outlen(C). ── */
    uint64_t C[ARGON2_QWORDS];
    {
        uint64_t *b0 = block_at(mem, 0, lane_length - 1, lane_length);
        for (size_t w = 0; w < ARGON2_QWORDS; w++) C[w] = b0[w];
        for (uint32_t lane = 1; lane < p; lane++) {
            uint64_t *bl = block_at(mem, lane, lane_length - 1, lane_length);
            for (size_t w = 0; w < ARGON2_QWORDS; w++) C[w] ^= bl[w];
        }
    }
    uint8_t Cbytes[ARGON2_BLOCK_SIZE];
    for (size_t w = 0; w < ARGON2_QWORDS; w++) store64_le(Cbytes + 8 * w, C[w]);

    if (blake2b_long_prefixed(out, outlen, Cbytes, ARGON2_BLOCK_SIZE) != 0)
        return ARGON2_ERR_PARAM;

    return ARGON2_OK;
}
