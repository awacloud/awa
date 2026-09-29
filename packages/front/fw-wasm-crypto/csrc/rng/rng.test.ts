// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * rng.test.ts — toolchain-free unit test for the zero-import entropy seam.
 *
 * Two execution legs, BOTH of which assert the SAME drain/exhaustion invariants
 * (the test never silently skips):
 *
 *   1. Native-compile leg (when a host C compiler `cc`/`clang`/`gcc` is
 *      discoverable): compiles `rng.c` to a tiny native harness with the same
 *      package-relative include resolution the real builder uses (`-I<pkgDir>`),
 *      runs it, and asserts the staged-entropy ordering + underflow behaviour
 *      against the genuine C object code.
 *   2. TS-mirror leg (when NO host compiler is found): runs a faithful TypeScript
 *      mirror of the exact C arithmetic in `rng.c` and asserts the identical
 *      ordering/underflow invariants. The compiler-absent mode is recorded in
 *      the test name so a green run is never mistaken for a skip.
 *
 * The seam is C23 build-asset; this test exercises its logic with no WASI SDK.
 */

import { afterAll, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

// Package root: csrc/rng/ → ../.. → packages/front/fw-wasm-crypto
const PKG_DIR = resolve(import.meta.dir, "..", "..");
const RNG_C = join(PKG_DIR, "csrc", "rng", "rng.c");

// Contract constant — must mirror RNG_STAGE_CAP in rng.c.
const RNG_STAGE_CAP = 256 * 1024;

/** Discover a host C compiler. Returns its absolute path or null. */
function discoverCc(): string | null {
    for (const name of ["cc", "clang", "gcc"]) {
        const p = Bun.which(name);
        if (p) return p;
    }
    return null;
}

// ─── Native-compile leg ─────────────────────────────────────────────────────

/**
 * A native harness that drives the seam through the prescribed scenario and
 * prints one result token per line on stdout. Compiled together with rng.c.
 * Uses the package-relative include the same way the shim TUs do.
 */
const HARNESS_C = `
#include <stdio.h>
#include <stdint.h>
#include <stddef.h>
#include "csrc/rng/rng.h"

int main(void) {
    uint8_t seed[64];
    for (int i = 0; i < 64; i++) seed[i] = (uint8_t)i;

    /* stage 64 bytes; two 32-byte draws return the two halves in order */
    if (rng_stage(seed, 64) != 0) { printf("STAGE_FAIL\\n"); return 1; }
    uint8_t a[32], b[32], c[32];
    randombytes(a, 32);
    randombytes(b, 32);
    printf("UNDER_AFTER_TWO=%d\\n", rng_underflowed());

    int ok_a = 1, ok_b = 1;
    for (int i = 0; i < 32; i++) { if (a[i] != (uint8_t)i) ok_a = 0; }
    for (int i = 0; i < 32; i++) { if (b[i] != (uint8_t)(i + 32)) ok_b = 0; }
    printf("HALF_A_OK=%d\\n", ok_a);
    printf("HALF_B_OK=%d\\n", ok_b);

    /* third draw underflows: zero-filled + sticky flag raised */
    randombytes(c, 32);
    int c_zero = 1;
    for (int i = 0; i < 32; i++) { if (c[i] != 0) c_zero = 0; }
    printf("THIRD_ZERO=%d\\n", c_zero);
    printf("UNDER_AFTER_THREE=%d\\n", rng_underflowed());

    /* reset re-arms the cursor and clears underflow */
    rng_reset();
    printf("UNDER_AFTER_RESET=%d\\n", rng_underflowed());
    uint8_t d[8];
    randombytes(d, 8);
    printf("DRAW_AFTER_RESET_ZERO=%d\\n", d[0] == 0 ? 1 : 0);
    printf("UNDER_AFTER_RESET_DRAW=%d\\n", rng_underflowed());

    /* staging twice replaces (not appends): restage 4 bytes, draw 4 */
    uint8_t s2[4] = { 100, 101, 102, 103 };
    rng_stage(s2, 4);
    uint8_t e[4];
    randombytes(e, 4);
    int replaced = (e[0] == 100 && e[1] == 101 && e[2] == 102 && e[3] == 103) ? 1 : 0;
    printf("RESTAGE_REPLACED=%d\\n", replaced);
    printf("UNDER_AFTER_RESTAGE=%d\\n", rng_underflowed());

    /* over-cap staging returns -1 (use length only; src may be NULL since the
     * bound check happens before any read) */
    printf("OVERCAP_RET=%d\\n", rng_stage((const uint8_t*)0, ${RNG_STAGE_CAP + 1}u));

    return 0;
}
`;

let workDir: string | null = null;

afterAll(() => {
    if (workDir) {
        try { rmSync(workDir, { recursive: true, force: true }); } catch { /* best effort */ }
    }
});

function compileAndRun(cc: string): Record<string, number> {
    workDir = mkdtempSync(join(tmpdir(), "awa-rng-"));
    const harnessPath = join(workDir, "harness.c");
    writeFileSync(harnessPath, HARNESS_C);
    const exeName = process.platform === "win32" ? "rng_harness.exe" : "rng_harness";
    const exePath = join(workDir, exeName);

    const proc = Bun.spawnSync({
        cmd: [cc, "-std=c11", `-I${PKG_DIR}`, "-o", exePath, harnessPath, RNG_C],
        stdout: "pipe",
        stderr: "pipe",
    });
    if (proc.exitCode !== 0) {
        throw new Error(`compile failed (exit ${proc.exitCode}):\n${proc.stderr.toString()}`);
    }

    const run = Bun.spawnSync({ cmd: [exePath], stdout: "pipe", stderr: "pipe" });
    if (run.exitCode !== 0) {
        throw new Error(`harness run failed (exit ${run.exitCode}):\n${run.stderr.toString()}`);
    }

    const out: Record<string, number> = {};
    for (const line of run.stdout.toString().split("\n")) {
        const m = line.trim().match(/^([A-Z_]+)=(-?\d+)$/);
        if (m) out[m[1]] = Number(m[2]);
    }
    return out;
}

// ─── TS mirror of the exact C arithmetic in rng.c ────────────────────────────

class RngMirror {
    private buf = new Uint8Array(RNG_STAGE_CAP);
    private len = 0;
    private cur = 0;
    private under = 0;

    stage(src: Uint8Array, n: number): number {
        if (n > RNG_STAGE_CAP) return -1;
        for (let i = 0; i < n; i++) this.buf[i] = src[i];
        this.len = n;
        this.cur = 0;
        this.under = 0;
        return 0;
    }

    reset(): void {
        this.len = 0;
        this.cur = 0;
        this.under = 0;
    }

    randombytes(out: Uint8Array, n: number): void {
        let i = 0;
        let avail = this.len - this.cur;
        while (i < n && avail > 0) {
            out[i] = this.buf[this.cur];
            this.cur++;
            avail--;
            i++;
        }
        if (i < n) {
            while (i < n) { out[i] = 0; i++; }
            this.under = 1;
        }
    }

    underflowed(): number {
        return this.under;
    }
}

/** Run the same scenario as HARNESS_C through the TS mirror. */
function runMirror(): Record<string, number> {
    const r = new RngMirror();
    const seed = new Uint8Array(64);
    for (let i = 0; i < 64; i++) seed[i] = i & 0xff;

    const out: Record<string, number> = {};
    out.STAGE_RET = r.stage(seed, 64);

    const a = new Uint8Array(32);
    const b = new Uint8Array(32);
    const c = new Uint8Array(32);
    r.randombytes(a, 32);
    r.randombytes(b, 32);
    out.UNDER_AFTER_TWO = r.underflowed();

    let okA = 1, okB = 1;
    for (let i = 0; i < 32; i++) if (a[i] !== (i & 0xff)) okA = 0;
    for (let i = 0; i < 32; i++) if (b[i] !== ((i + 32) & 0xff)) okB = 0;
    out.HALF_A_OK = okA;
    out.HALF_B_OK = okB;

    r.randombytes(c, 32);
    let cZero = 1;
    for (let i = 0; i < 32; i++) if (c[i] !== 0) cZero = 0;
    out.THIRD_ZERO = cZero;
    out.UNDER_AFTER_THREE = r.underflowed();

    r.reset();
    out.UNDER_AFTER_RESET = r.underflowed();
    const d = new Uint8Array(8);
    r.randombytes(d, 8);
    out.DRAW_AFTER_RESET_ZERO = d[0] === 0 ? 1 : 0;
    out.UNDER_AFTER_RESET_DRAW = r.underflowed();

    const s2 = new Uint8Array([100, 101, 102, 103]);
    r.stage(s2, 4);
    const e = new Uint8Array(4);
    r.randombytes(e, 4);
    out.RESTAGE_REPLACED =
        e[0] === 100 && e[1] === 101 && e[2] === 102 && e[3] === 103 ? 1 : 0;
    out.UNDER_AFTER_RESTAGE = r.underflowed();

    out.OVERCAP_RET = r.stage(new Uint8Array(0), RNG_STAGE_CAP + 1);
    return out;
}

// ─── Shared assertions over a result map (native OR mirror) ──────────────────

function assertInvariants(out: Record<string, number>): void {
    // Two 32-byte draws return the two staged halves, in order.
    expect(out.HALF_A_OK).toBe(1);
    expect(out.HALF_B_OK).toBe(1);
    // No underflow after exactly draining the staged length.
    expect(out.UNDER_AFTER_TWO).toBe(0);
    // Third draw underflows: zero-filled + sticky flag.
    expect(out.THIRD_ZERO).toBe(1);
    expect(out.UNDER_AFTER_THREE).toBe(1);
    // reset() re-arms the cursor and clears the underflow flag.
    expect(out.UNDER_AFTER_RESET).toBe(0);
    // Drawing from an empty (post-reset) buffer underflows to zeros.
    expect(out.DRAW_AFTER_RESET_ZERO).toBe(1);
    expect(out.UNDER_AFTER_RESET_DRAW).toBe(1);
    // Staging twice replaces (not appends): the new bytes are returned.
    expect(out.RESTAGE_REPLACED).toBe(1);
    expect(out.UNDER_AFTER_RESTAGE).toBe(0);
    // Over-cap staging returns -1.
    expect(out.OVERCAP_RET).toBe(-1);
}

// ─── Test legs ───────────────────────────────────────────────────────────────

const CC = discoverCc();

describe("csrc/rng seam — drain/exhaustion invariants", () => {
    const leg = CC ? `native compile (${CC.split(/[\\/]/).pop()})` : "TS mirror (no host C compiler)";

    it(`enforces ordering + underflow + reset + restage — ${leg}`, () => {
        const out = CC ? compileAndRun(CC) : runMirror();
        assertInvariants(out);
    });
});

// The TS mirror is ALWAYS asserted (even when a native compiler exists) so the
// reference arithmetic is exercised on every host — the seam logic is never left
// unchecked, and the native leg is validated against the same expectations.
describe("csrc/rng seam — TS-mirror reference (always run)", () => {
    it("mirrors the C arithmetic and satisfies the same invariants", () => {
        assertInvariants(runMirror());
    });

    it("stage replaces rather than appends, and reset empties the buffer", () => {
        const r = new RngMirror();
        expect(r.stage(new Uint8Array([1, 2, 3, 4]), 4)).toBe(0);
        // Restage shorter content: cursor resets, only the new bytes are drained.
        expect(r.stage(new Uint8Array([9, 8]), 2)).toBe(0);
        const o = new Uint8Array(2);
        r.randombytes(o, 2);
        expect(Array.from(o)).toEqual([9, 8]);
        expect(r.underflowed()).toBe(0);

        r.reset();
        const o2 = new Uint8Array(1);
        r.randombytes(o2, 1);
        expect(o2[0]).toBe(0);
        expect(r.underflowed()).toBe(1);
    });

    it("over-cap stage returns -1 and exact-cap stage returns 0", () => {
        const r = new RngMirror();
        expect(r.stage(new Uint8Array(0), RNG_STAGE_CAP + 1)).toBe(-1);
        expect(r.stage(new Uint8Array(RNG_STAGE_CAP), RNG_STAGE_CAP)).toBe(0);
    });
});
