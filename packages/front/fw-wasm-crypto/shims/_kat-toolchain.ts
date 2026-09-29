// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * Toolchain-deferral policy for the KAT suites.
 *
 * Default (no AWA_KAT_STRICT): an absent WASI SDK defers the build + KAT
 * legs with a warning, exactly as before — a developer without the toolchain
 * gets a green, honest local run.
 *
 * Strict (AWA_KAT_STRICT=1): an absent toolchain FAILS. A publication gate
 * that consumes these suites must be able to tell "verified" from
 * "deferred", and an early `return` is indistinguishable from a pass to the
 * test runner. See tools/pkg-export freshness:wasm-crypto-verify.
 *
 * @param family  Short family tag used in the message, e.g. "aes".
 * @param present Whether the toolchain was discovered.
 * @param standard KAT label used in the message, e.g. "ACVP KAT" or
 *          "RFC 9106 KAT". Defaults to "ACVP KAT"; pass a family's own
 *          pre-existing label to keep its deferral wording exact — several
 *          families (argon2, blake2b, chacha20poly1305, ed25519, hkdf,
 *          pbkdf2, x25519) have no ACVP vectors and must not claim one.
 * @returns true when the caller should DEFER (return early); false when it
 *          should proceed. Throws in strict mode when `present` is false.
 */
export function katDeferral(family: string, present: boolean, standard = "ACVP KAT"): boolean {
    if (present) return false;
    const strict = process.env["AWA_KAT_STRICT"] === "1";
    const msg =
        `[${family}.kat] WASI SDK not found (WASI_SDK_PATH / discoverWasiSdk); ` +
        `build + ${standard} deferred (no toolchain).`;
    if (strict) {
        throw new Error(
            `${msg} AWA_KAT_STRICT=1 refuses a deferral: this run is evidence ` +
            "for a publication gate and a deferral is not a verification.",
        );
    }
    console.warn(msg);
    return true;
}
