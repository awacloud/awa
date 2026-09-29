/*
 * Copyright (c) 2026 AwaCloud SAS
 * Author: Matthieu Bouilloux
 * SPDX-License-Identifier: Apache-2.0
 */

/*
 * mlkem768.c — ML-KEM-768 translation unit of the multilevel mlkem-native build.
 *
 * The "with shared" leg of the three-TU multilevel monolithic build: it emits
 * the level-independent code (FIPS-202 SHA3/SHAKE, generic poly/compress, etc.)
 * shared by all three parameter sets, plus the ML-KEM-768 level-dependent
 * functions. The 512 and 1024 TUs set MLK_CONFIG_MULTILEVEL_NO_SHARED so they
 * do NOT re-emit those shared definitions (avoids duplicate-symbol link errors).
 *
 * See mlkem512.c for the full build-contract rationale.
 */

#define MLK_CONFIG_FILE "vendor/mlkem-native/mlkem_native_config.h"
#define MLK_CONFIG_PARAMETER_SET 768
#define MLK_CONFIG_NAMESPACE_PREFIX mlkem
#define MLK_CONFIG_MULTILEVEL_BUILD
#define MLK_CONFIG_MULTILEVEL_WITH_SHARED
#define MLK_CONFIG_NO_SUPERCOP
#define MLK_CONFIG_NO_RANDOMIZED_API

#include "csrc/mlkem/mlkem_freestanding.h"
#include "vendor/mlkem-native/mlkem_native.c"
