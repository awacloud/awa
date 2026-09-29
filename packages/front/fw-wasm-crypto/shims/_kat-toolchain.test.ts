// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * _kat-toolchain.test.ts — unit tests for the shared KAT toolchain-deferral
 * policy (shims/_kat-toolchain.ts), consumed by all 17 shims/*.kat.test.ts
 * call sites.
 *
 * Pins the default (non-strict) path byte-for-byte against the pre-existing
 * per-shim wording, and falsifies AWA_KAT_STRICT=1 as a real gate: only the
 * exact string "1" arms it, and an absent toolchain under strict mode MUST
 * throw rather than defer.
 */

import { describe, test, expect, afterEach } from "bun:test";

import { katDeferral } from "./_kat-toolchain.ts";

const ENV_KEY = "AWA_KAT_STRICT";

function withEnv<T>(value: string | undefined, fn: () => T): T {
    const prev = process.env[ENV_KEY];
    if (value === undefined) delete process.env[ENV_KEY];
    else process.env[ENV_KEY] = value;
    try {
        return fn();
    } finally {
        if (prev === undefined) delete process.env[ENV_KEY];
        else process.env[ENV_KEY] = prev;
    }
}

afterEach(() => {
    delete process.env[ENV_KEY];
});

describe("katDeferral — present = true", () => {
    test("returns false, never warns, never throws, regardless of the flag", () => {
        for (const flag of [undefined, "0", "1", "true", ""]) {
            withEnv(flag, () => {
                const warnCalls: unknown[][] = [];
                const origWarn = console.warn;
                console.warn = (...args: unknown[]) => warnCalls.push(args);
                try {
                    expect(katDeferral("aes", true)).toBe(false);
                } finally {
                    console.warn = origWarn;
                }
                expect(warnCalls.length).toBe(0);
            });
        }
    });
});

describe("katDeferral — present = false, flag unset (default path)", () => {
    test("returns true, warns once, message byte-identical to the pre-existing wording", () => {
        withEnv(undefined, () => {
            const warnCalls: unknown[][] = [];
            const origWarn = console.warn;
            console.warn = (...args: unknown[]) => warnCalls.push(args);
            let result: boolean;
            try {
                result = katDeferral("aes", false);
            } finally {
                console.warn = origWarn;
            }
            expect(result).toBe(true);
            expect(warnCalls.length).toBe(1);
            expect(warnCalls[0].length).toBe(1);
            // Byte-identical to the wording aes.kat.test.ts printed before extraction.
            expect(warnCalls[0][0]).toBe(
                "[aes.kat] WASI SDK not found (WASI_SDK_PATH / discoverWasiSdk); " +
                    "build + ACVP KAT deferred (no toolchain).",
            );
        });
    });
});

describe("katDeferral — present = false, AWA_KAT_STRICT=1 (strict path)", () => {
    test("throws, naming the family and stating a deferral is not a verification", () => {
        withEnv("1", () => {
            expect(() => katDeferral("aes", false)).toThrow(
                /\[aes\.kat\].*AWA_KAT_STRICT=1 refuses a deferral: this run is evidence for a publication gate and a deferral is not a verification\./,
            );
        });
    });

    test("does not warn (the throw is the whole signal)", () => {
        withEnv("1", () => {
            const warnCalls: unknown[][] = [];
            const origWarn = console.warn;
            console.warn = (...args: unknown[]) => warnCalls.push(args);
            try {
                expect(() => katDeferral("argon2", false)).toThrow();
            } finally {
                console.warn = origWarn;
            }
            expect(warnCalls.length).toBe(0);
        });
    });
});

describe("katDeferral — only the exact string \"1\" arms strict mode", () => {
    test.each(["0", "true", "TRUE", "yes", " 1", "1 ", ""])(
        "AWA_KAT_STRICT=%p stays non-strict (defers, does not throw)",
        (value) => {
            withEnv(value, () => {
                const origWarn = console.warn;
                console.warn = () => {};
                let result: boolean;
                try {
                    result = katDeferral("aes", false);
                } finally {
                    console.warn = origWarn;
                }
                expect(result).toBe(true);
            });
        },
    );
});

describe("katDeferral — third parameter (standard label)", () => {
    test("defaults to \"ACVP KAT\" when omitted (byte-identical to the two-argument call)", () => {
        withEnv(undefined, () => {
            const warnCalls: unknown[][] = [];
            const origWarn = console.warn;
            console.warn = (...args: unknown[]) => warnCalls.push(args);
            let result: boolean;
            try {
                result = katDeferral("aes", false);
            } finally {
                console.warn = origWarn;
            }
            expect(result).toBe(true);
            expect(warnCalls[0][0]).toBe(
                "[aes.kat] WASI SDK not found (WASI_SDK_PATH / discoverWasiSdk); " +
                    "build + ACVP KAT deferred (no toolchain).",
            );
        });
    });

    test("a custom label replaces the default suffix in the default-path warning", () => {
        withEnv(undefined, () => {
            const warnCalls: unknown[][] = [];
            const origWarn = console.warn;
            console.warn = (...args: unknown[]) => warnCalls.push(args);
            let result: boolean;
            try {
                result = katDeferral("argon2", false, "RFC 9106 KAT");
            } finally {
                console.warn = origWarn;
            }
            expect(result).toBe(true);
            expect(warnCalls[0][0]).toBe(
                "[argon2.kat] WASI SDK not found (WASI_SDK_PATH / discoverWasiSdk); " +
                    "build + RFC 9106 KAT deferred (no toolchain).",
            );
        });
    });

    test("strict mode still throws, and the thrown message names the custom label", () => {
        withEnv("1", () => {
            expect(() => katDeferral("argon2", false, "RFC 9106 KAT")).toThrow(
                /\[argon2\.kat\] WASI SDK not found .*build \+ RFC 9106 KAT deferred \(no toolchain\)\. AWA_KAT_STRICT=1 refuses a deferral: this run is evidence for a publication gate and a deferral is not a verification\./,
            );
        });
    });
});

describe("katDeferral — flag is read at call time, not at module load", () => {
    test("set it, call (throws), unset it, call again (defers) — within one process", () => {
        process.env[ENV_KEY] = "1";
        expect(() => katDeferral("aes", false)).toThrow();

        delete process.env[ENV_KEY];
        const origWarn = console.warn;
        let warned = false;
        console.warn = () => {
            warned = true;
        };
        let result: boolean;
        try {
            result = katDeferral("aes", false);
        } finally {
            console.warn = origWarn;
        }
        expect(result).toBe(true);
        expect(warned).toBe(true);
    });
});
