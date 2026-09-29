/*
 * Copyright (c) 2026 AwaCloud SAS
 * Author: Matthieu Bouilloux
 * SPDX-License-Identifier: Apache-2.0
 */

/*
 * Freestanding minimal reimplementation of "internal/packet.h" for the vendored
 * OpenSSL SLH-DSA core — wasm-crypto SLH-DSA (task 06).
 *
 * The full upstream packet.h (~940 lines) pulls <openssl/bn.h>, <openssl/buffer.h>
 * (BUF_MEM growable buffers) and the entire TLS/QUIC length-prefix machinery,
 * none of which is freestanding-clean or used by SLH-DSA. The SLH-DSA core uses
 * only a SMALL, well-defined subset:
 *
 *   PACKET (read cursor over a caller-owned buffer):
 *     PACKET_buf_init, PACKET_get_bytes, PACKET_remaining
 *   WPACKET (append-only writer over a caller-owned FIXED buffer):
 *     WPACKET_init_static_len, WPACKET_memcpy, WPACKET_allocate_bytes,
 *     WPACKET_get_curr, WPACKET_get_total_written, WPACKET_finish
 *
 * No sub-packets, no length prefixes, no growable BUF_MEM, no endfirst. Every
 * WPACKET here is a static fixed-length buffer with lenbytes==0; writes are pure
 * sequential appends that fail (return 0) on overflow — exactly the contract the
 * SLH-DSA core relies on. Semantics are byte-identical to the upstream
 * static-len / non-length-prefixed path that SLH-DSA exercises (verified against
 * packet.c: init_static_len sets staticbuf+maxsize+one zero-length sub, allocate
 * bumps curr/written within maxsize, memcpy = allocate+copy, get_curr returns
 * staticbuf+curr, get_total_written returns written, finish closes the sub).
 *
 * C23 (csrc/ -> c23 via cStdFor). Header-only, all static inline; zero imports,
 * no <stdbit.h>, no heap, no side effects.
 */
#ifndef WASM_CRYPTO_OSSL_INTERNAL_PACKET_H
#define WASM_CRYPTO_OSSL_INTERNAL_PACKET_H

#include <openssl/e_os2.h>
#include <stddef.h>
#include <stdint.h>
#include <string.h> /* package-local compat: memcpy -> __builtin_memcpy */

#include "internal/numbers.h" /* SIZE_MAX */

/* ── PACKET: a read cursor over a const buffer ──────────────────────────────── */

typedef struct {
    const unsigned char *curr; /* current read position */
    size_t remaining;          /* bytes left to read */
} PACKET;

static ossl_inline size_t PACKET_remaining(const PACKET *pkt)
{
    return pkt->remaining;
}

__owur static ossl_inline int PACKET_buf_init(PACKET *pkt,
                                              const unsigned char *buf, size_t len)
{
    if (len > (size_t)(SIZE_MAX / 2))
        return 0;
    pkt->curr = buf;
    pkt->remaining = len;
    return 1;
}

/* Read |len| bytes: point |*data| at the buffer and advance the cursor. */
__owur static ossl_inline int PACKET_get_bytes(PACKET *pkt,
                                               const unsigned char **data,
                                               size_t len)
{
    if (pkt->remaining < len)
        return 0;
    *data = pkt->curr;
    pkt->curr += len;
    pkt->remaining -= len;
    return 1;
}

/* ── WPACKET: an append-only writer over a fixed caller-owned buffer ─────────── */

typedef struct wpacket_st {
    unsigned char *staticbuf; /* the output buffer (not owned) */
    size_t curr;              /* offset of the next write */
    size_t written;           /* bytes written so far (== curr here) */
    size_t maxsize;           /* capacity of staticbuf */
    int finished;             /* set by WPACKET_finish */
} WPACKET;

/* Initialise over |buf| of capacity |len|. |lenbytes| MUST be 0 (no length
 * prefix) — the only mode SLH-DSA uses; a non-zero value is rejected. */
static ossl_inline int WPACKET_init_static_len(WPACKET *pkt, unsigned char *buf,
                                               size_t len, size_t lenbytes)
{
    if (buf == NULL || lenbytes != 0)
        return 0;
    pkt->staticbuf = buf;
    pkt->curr = 0;
    pkt->written = 0;
    pkt->maxsize = len;
    pkt->finished = 0;
    return 1;
}

/* Reserve |len| bytes and return a pointer to them in |*allocbytes|. The bytes
 * are considered written (the caller fills them in place). */
static ossl_inline int WPACKET_allocate_bytes(WPACKET *pkt, size_t len,
                                              unsigned char **allocbytes)
{
    if (pkt->finished)
        return 0;
    if (len > pkt->maxsize - pkt->curr) /* overflow-safe: curr <= maxsize */
        return 0;
    *allocbytes = pkt->staticbuf + pkt->curr;
    pkt->curr += len;
    pkt->written += len;
    return 1;
}

/* Append |len| bytes from |src|. */
static ossl_inline int WPACKET_memcpy(WPACKET *pkt, const void *src, size_t len)
{
    unsigned char *dst;

    if (len == 0)
        return 1;
    if (!WPACKET_allocate_bytes(pkt, len, &dst))
        return 0;
    memcpy(dst, src, len);
    return 1;
}

/* Pointer to the current write position (for length deltas / sub-buffer reads). */
static ossl_inline unsigned char *WPACKET_get_curr(WPACKET *pkt)
{
    return pkt->staticbuf + pkt->curr;
}

static ossl_inline int WPACKET_get_total_written(WPACKET *pkt, size_t *written)
{
    if (written == NULL)
        return 0;
    *written = pkt->written;
    return 1;
}

/* Close the writer. No length prefixes to back-fill, so this just marks done. */
static ossl_inline int WPACKET_finish(WPACKET *pkt)
{
    pkt->finished = 1;
    return 1;
}

#endif /* WASM_CRYPTO_OSSL_INTERNAL_PACKET_H */
