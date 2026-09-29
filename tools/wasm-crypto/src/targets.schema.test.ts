// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { describe, test, expect } from "bun:test";
import { validateTargets, cStdFor, type Target } from "./targets.schema.ts";

// A minimal well-formed target conforming to the frozen schema.
const WELL_FORMED: Target = {
    algo: "argon2",
    wasmModule: "argon2",
    exportName: "argon2Wasm",
    source: "argon2-20190702",
    sourceKind: "vendored-fork",
    shim: "shims/argon2.c",
    cSources: ["vendor/argon2.c", "csrc/glue.c"],
    cflags: ["-O3"],
    simd: false,
    exports: ["memory", "alloc", "free", "argon2id_hash_raw"],
    vectors: ["references/argon2-vectors.json"],
};

// ─── sourceKind ────────────────────────────────────────────────────────────────

describe("validateTargets — sourceKind", () => {
    test("accepts each of the three literals", () => {
        for (const sourceKind of ["own", "vendored-fork", "vendored"] as const) {
            const t = { ...WELL_FORMED, sourceKind };
            expect(validateTargets([t])).toHaveLength(1);
        }
    });

    test("rejects a missing sourceKind with the documented message", () => {
        const { sourceKind: _drop, ...rest } = WELL_FORMED;
        void _drop;
        expect(() => validateTargets([rest])).toThrow(
            /sourceKind: expected one of own\|vendored-fork\|vendored/,
        );
    });

    test("rejects a non-literal sourceKind value", () => {
        const bad = { ...WELL_FORMED, sourceKind: "external" };
        expect(() => validateTargets([bad])).toThrow(
            /sourceKind: expected one of own\|vendored-fork\|vendored, got "external"/,
        );
    });
});

// ─── cStd ──────────────────────────────────────────────────────────────────────

describe("validateTargets — cStd", () => {
    test("accepts an absent cStd", () => {
        expect(validateTargets([WELL_FORMED])).toHaveLength(1);
    });

    test("accepts a string cStd", () => {
        const t = { ...WELL_FORMED, cStd: "c11" };
        expect(validateTargets([t])).toHaveLength(1);
    });

    test("rejects a non-string cStd", () => {
        const bad = { ...WELL_FORMED, cStd: 11 };
        expect(() => validateTargets([bad])).toThrow(/cStd: expected string/);
    });
});

// ─── source-root convention ────────────────────────────────────────────────────

describe("validateTargets — source-root convention", () => {
    test("accepts shim and cSources under csrc/ shims/ vendor/", () => {
        const t = {
            ...WELL_FORMED,
            shim: "csrc/shim.c",
            cSources: ["csrc/a.c", "shims/b.c", "vendor/c.c"],
        };
        expect(validateTargets([t])).toHaveLength(1);
    });

    test("rejects a shim outside the allowed roots", () => {
        const bad = { ...WELL_FORMED, shim: "lib/argon2.c" };
        expect(() => validateTargets([bad])).toThrow(
            /\.shim: must be under csrc\/ shims\/ or vendor\/, got "lib\/argon2\.c"/,
        );
    });

    test("rejects a cSources entry outside the allowed roots", () => {
        const bad = { ...WELL_FORMED, cSources: ["vendor/ok.c", "src/bad.c"] };
        expect(() => validateTargets([bad])).toThrow(
            /\.cSources\[1\]: must be under csrc\/ shims\/ or vendor\/, got "src\/bad\.c"/,
        );
    });
});

// ─── ABI-exports check (still enforced) ────────────────────────────────────────

describe("validateTargets — ABI exports", () => {
    test("still rejects a target whose exports miss 'memory'", () => {
        const bad = { ...WELL_FORMED, exports: ["alloc", "free"] };
        expect(() => validateTargets([bad])).toThrow(/memory/);
    });

    test("still rejects a target whose exports miss 'alloc'", () => {
        const bad = { ...WELL_FORMED, exports: ["memory", "free"] };
        expect(() => validateTargets([bad])).toThrow(/alloc/);
    });

    test("still rejects a target whose exports miss 'free'", () => {
        const bad = { ...WELL_FORMED, exports: ["memory", "alloc"] };
        expect(() => validateTargets([bad])).toThrow(/free/);
    });
});

// ─── cStdFor helper ────────────────────────────────────────────────────────────

describe("cStdFor", () => {
    test('"csrc/x.c" → "c23"', () => {
        expect(cStdFor("csrc/x.c", {})).toBe("c23");
    });

    test('"shims/x.c" → "c23"', () => {
        expect(cStdFor("shims/x.c", {})).toBe("c23");
    });

    test('"vendor/u/y.c" with cStd "c11" → "c11"', () => {
        expect(cStdFor("vendor/u/y.c", { cStd: "c11" })).toBe("c11");
    });

    test('"vendor/u/y.c" with no cStd → null', () => {
        expect(cStdFor("vendor/u/y.c", {})).toBeNull();
    });

    test('"other/z.c" → throws (invalid source root)', () => {
        expect(() => cStdFor("other/z.c", {})).toThrow(
            /must be under csrc\/ shims\/ or vendor\/, got "other\/z\.c"/,
        );
    });

    test("csrc/shims override ignores a present cStd", () => {
        expect(cStdFor("csrc/x.c", { cStd: "c11" })).toBe("c23");
        expect(cStdFor("shims/x.c", { cStd: "c11" })).toBe("c23");
    });
});
