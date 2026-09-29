/*
 * Copyright (c) 2026 AwaCloud SAS
 * Author: Matthieu Bouilloux
 * SPDX-License-Identifier: Apache-2.0
 */

/*
 * slh_support.c — freestanding `memcmp` + `strcmp` backing symbols for the
 * vendored OpenSSL SLH-DSA core (task 06, OpenSSL re-source).
 *
 * The vendored core calls `memcmp` (slh_hypertree.c root compare) and `strcmp`
 * (slh_params.c parameter-set lookup by name). The SLH-DSA compat `<string.h>`
 * (csrc/slhdsa/compat/string.h) maps both call sites to `__builtin_*`, but under
 * `-flto` clang lowers a variable-size memcmp / a variable strcmp to an external
 * libcall rather than inlining, so wasm-ld needs real definitions. Freestanding
 * wasm32 (`-nostdlib`) has no libc, so we provide them here. (memcpy/memset/
 * memmove stay builtins -> wasm `memory.copy`/`memory.fill` via `-mbulk-memory`;
 * only memcmp/strcmp need backing symbols.)
 *
 * This lives in a task-06-owned file rather than the shared task-05 support TU
 * (csrc/pqclean/pqcl_support.c, read-only here) — ML-DSA never referenced these.
 *
 * The comparisons are over public values (Merkle roots, algorithm-name literals)
 * — constant-time is not a requirement, so plain byte loops are correct and
 * import-free. C23 (csrc/ -> c23 via cStdFor). Zero imports, no <stdbit.h>,
 * no global ctor, no side effects.
 */

#include <stddef.h>

int memcmp(const void *a, const void *b, size_t n) {
    const unsigned char *pa = (const unsigned char *)a;
    const unsigned char *pb = (const unsigned char *)b;
    for (size_t i = 0; i < n; i++) {
        if (pa[i] != pb[i]) {
            return (int)pa[i] - (int)pb[i];
        }
    }
    return 0;
}

int strcmp(const char *a, const char *b) {
    const unsigned char *pa = (const unsigned char *)a;
    const unsigned char *pb = (const unsigned char *)b;
    while (*pa != 0 && *pa == *pb) {
        pa++;
        pb++;
    }
    return (int)*pa - (int)*pb;
}
