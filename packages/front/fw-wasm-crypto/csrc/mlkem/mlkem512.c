/*
 * Copyright (c) 2026 AwaCloud SAS
 * Author: Matthieu Bouilloux
 * SPDX-License-Identifier: Apache-2.0
 */

/*
 * mlkem512.c — ML-KEM-512 translation unit of the multilevel mlkem-native build.
 *
 * This is one of three thin compilation units (512/768/1024) that together form
 * mlkem-native's documented "multilevel monolithic" build: the single-compilation
 * unit aggregator `vendor/mlkem-native/mlkem_native.c` is #included once per
 * parameter set, each with its own MLK_CONFIG_PARAMETER_SET, so all three ML-KEM
 * security levels coexist in one freestanding wasm32 module with non-colliding,
 * level-namespaced symbols (mlkem512_*, mlkem768_*, mlkem1024_*).
 *
 * Build contract (see vendor/mlkem-native/mlkem_native_config.h):
 *   - MLK_CONFIG_MULTILEVEL_BUILD       set on ALL three TUs;
 *   - MLK_CONFIG_MULTILEVEL_NO_SHARED   on 512 and 1024 (no level-independent code);
 *   - MLK_CONFIG_MULTILEVEL_WITH_SHARED on exactly 768 (emits FIPS-202 + shared);
 *   - MLK_CONFIG_NAMESPACE_PREFIX=mlkem fixes the prefix (level-dependent
 *     functions become mlkem512_… / mlkem768_… / mlkem1024_…);
 *   - MLK_CONFIG_NO_SUPERCOP            drops the ambiguous crypto_kem_* aliases;
 *   - MLK_CONFIG_NO_RANDOMIZED_API      drops keypair()/enc() (and the
 *     randombytes() dependency); the shim feeds the FIPS-203 derandomized API
 *     (keypair_derand/enc_derand) from the staged-entropy seam instead.
 *
 * Compiled with -std=c23 (csrc/ → c23 via cStdFor); mlkem-native is C90/C99 but
 * compiles cleanly under C23. Freestanding: memcpy/memset are clang builtins
 * lowered to memory.copy/memory.fill by -mbulk-memory (no libc import).
 */

/* Resolve the config header via the builder's -I<pkgDir>: the vendored SCU's
 * internal `#include "mlkem_native_config.h"` (from src/common.h) would only
 * resolve against the SCU's own directory, but the builder runs clang from the
 * repo root, so we point MLK_CONFIG_FILE at the package-relative path that
 * -I<pkgDir> makes findable. */
#define MLK_CONFIG_FILE "vendor/mlkem-native/mlkem_native_config.h"
#define MLK_CONFIG_PARAMETER_SET 512
#define MLK_CONFIG_NAMESPACE_PREFIX mlkem
#define MLK_CONFIG_MULTILEVEL_BUILD
#define MLK_CONFIG_MULTILEVEL_NO_SHARED
#define MLK_CONFIG_NO_SUPERCOP
#define MLK_CONFIG_NO_RANDOMIZED_API

#include "csrc/mlkem/mlkem_freestanding.h"
#include "vendor/mlkem-native/mlkem_native.c"
