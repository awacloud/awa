/*
 * Copyright (c) 2026 AwaCloud SAS
 * Author: Matthieu Bouilloux
 * SPDX-License-Identifier: Apache-2.0
 */

/*
 * mlkem1024.c — ML-KEM-1024 translation unit of the multilevel mlkem-native build.
 *
 * The third "no shared" leg of the three-TU multilevel monolithic build: emits
 * only the ML-KEM-1024 level-dependent functions; the shared level-independent
 * code is provided by mlkem768.c (the MLK_CONFIG_MULTILEVEL_WITH_SHARED TU).
 *
 * See mlkem512.c for the full build-contract rationale.
 */

#define MLK_CONFIG_FILE "vendor/mlkem-native/mlkem_native_config.h"
#define MLK_CONFIG_PARAMETER_SET 1024
#define MLK_CONFIG_NAMESPACE_PREFIX mlkem
#define MLK_CONFIG_MULTILEVEL_BUILD
#define MLK_CONFIG_MULTILEVEL_NO_SHARED
#define MLK_CONFIG_NO_SUPERCOP
#define MLK_CONFIG_NO_RANDOMIZED_API

#include "csrc/mlkem/mlkem_freestanding.h"
#include "vendor/mlkem-native/mlkem_native.c"
