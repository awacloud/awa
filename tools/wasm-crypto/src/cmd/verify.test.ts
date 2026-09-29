// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * Tests for verify.ts and abi-host.ts.
 *
 * Uses an inline fixture WASM binary (hand-crafted bytes, no external toolchain)
 * that exports the canonical ABI (memory, alloc, free) plus:
 *   - identity_byte(inPtr, inLen, outPtr) -> i32  (copy first byte; status 0)
 *   - negate_byte(inPtr, inLen, outPtr) -> i32    (XOR first byte with 0xFF; status 0)
 *   - simple_check(dataPtr, dataLen, expectedPtr, expectedLen) -> i32
 *                                                  (0 if equal, 1 if not — simulates AEAD verify)
 *
 * Any test that requires a real compiled *.wasm.js is gated behind its
 * presence and skipped with a message when absent.
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { AbiHost } from "../abi-host.ts";
import { run as runVerify } from "./verify.ts";
import { applyPkgDir } from "../index.ts";
import type { WasmCryptoConfig } from "../index.ts";

// ─── Fixture WASM ─────────────────────────────────────────────────────────────
//
// Hand-crafted WASM binary.  Verified with WebAssembly.validate() at build
// time.  Source (pseudo-WAT):
//
//   (module
//     (memory (export "memory") 1)
//     (func (export "alloc") (param i32) (result i32) i32.const 1024)
//     (func (export "free") (param i32) (param i32))
//     (func (export "identity_byte") (param $inPtr i32) (param $inLen i32)
//                                    (param $outPtr i32) (result i32)
//       local.get $outPtr
//       local.get $inPtr
//       i32.load8_u
//       i32.store8
//       i32.const 0)
//     (func (export "negate_byte") (param $inPtr i32) (param $inLen i32)
//                                  (param $outPtr i32) (result i32)
//       local.get $outPtr
//       local.get $inPtr
//       i32.load8_u
//       i32.const 0x7F   ;; -1 signed, XOR gives bitwise NOT of low 7 bits
//       i32.xor          ;; Note: use 0xFF for full byte negate: 0x41 0xFF 0x01 0x73
//       i32.store8
//       i32.const 0)
//     (func (export "simple_check") (param $dPtr i32) (param $dLen i32)
//                                   (param $ePtr i32) (param $eLen i32) (result i32)
//       local.get $dPtr
//       i32.load8_u
//       local.get $ePtr
//       i32.load8_u
//       i32.ne))         ;; 0 if equal, 1 if not
//
// Note: alloc always returns 1024.  Tests must use disjoint out-pointers.

// Bytes produced by the generator script (see dev notes in verify.test.ts header).
// DO NOT EDIT by hand — regenerate if the WAT above changes.
const FIXTURE_WASM_BYTES = new Uint8Array([
    0, 97, 115, 109, 1, 0, 0, 0,   // magic + version
    // type section (4 types)
    1, 26, 4,
    96, 1, 127, 1, 127,             // type0: (i32)->i32
    96, 2, 127, 127, 0,             // type1: (i32,i32)->void
    96, 3, 127, 127, 127, 1, 127,   // type2: (i32,i32,i32)->i32
    96, 4, 127, 127, 127, 127, 1, 127, // type3: (i32,i32,i32,i32)->i32
    // function section (5 funcs)
    3, 6, 5, 0, 1, 2, 2, 3,
    // memory section (1 page)
    5, 3, 1, 0, 1,
    // export section (6 exports)
    7, 70, 6,
    6, 109, 101, 109, 111, 114, 121, 2, 0,   // "memory"
    5, 97, 108, 108, 111, 99, 0, 0,           // "alloc"
    4, 102, 114, 101, 101, 0, 1,              // "free"
    13, 105, 100, 101, 110, 116, 105, 116, 121, 95, 98, 121, 116, 101, 0, 2, // "identity_byte"
    11, 110, 101, 103, 97, 116, 101, 95, 98, 121, 116, 101, 0, 3,            // "negate_byte"
    12, 115, 105, 109, 112, 108, 101, 95, 99, 104, 101, 99, 107, 0, 4,       // "simple_check"
    // code section (5 function bodies)
    10, 57, 5,
    5, 0, 65, 128, 8, 11,                              // alloc: return 1024
    2, 0, 11,                                          // free: nop
    14, 0, 32, 2, 32, 0, 45, 0, 0, 58, 0, 0, 65, 0, 11, // identity_byte
    17, 0, 32, 2, 32, 0, 45, 0, 0, 65, 127, 115, 58, 0, 0, 65, 0, 11, // negate_byte
    13, 0, 32, 0, 45, 0, 0, 32, 2, 45, 0, 0, 71, 11,  // simple_check
]);

/** The data-module shape that verify/abi-host expect (mirrors *.wasm.js convention). */
const FIXTURE_DATA_MODULE = {
    name: "fixtureWasm",
    type: "fw.crypto.wasm.data",
    bytes: FIXTURE_WASM_BYTES,
    abi: "1",
    simd: false,
} as const;

// ─── Temp directory for fixture files ────────────────────────────────────────

let tmpDir: string;

beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wasm-crypto-test-"));
});

afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ─── AbiHost unit tests ───────────────────────────────────────────────────────

describe("AbiHost", () => {
    test("FIXTURE_WASM_BYTES is a valid WASM module", () => {
        expect(WebAssembly.validate(FIXTURE_WASM_BYTES)).toBe(true);
    });

    test("load() validates abi version '1'", async () => {
        const host = new AbiHost();
        const loaded = await host.load(FIXTURE_DATA_MODULE);
        expect(loaded).toBeDefined();
        expect(loaded.mem).toBeInstanceOf(WebAssembly.Memory);
        expect(loaded.exports["alloc"]).toBeTypeOf("function");
        expect(loaded.exports["free"]).toBeTypeOf("function");
    });

    test("load() throws on unsupported ABI version", async () => {
        const host = new AbiHost();
        const badModule = { ...FIXTURE_DATA_MODULE, abi: "2" };
        await expect(host.load(badModule)).rejects.toThrow("unsupported ABI version");
    });

    test("load() throws when 'memory' is not exported", async () => {
        const host = new AbiHost();
        // Minimal wasm without memory export
        const noMem = new Uint8Array([
            0, 97, 115, 109, 1, 0, 0, 0,
            // type: () -> void
            1, 4, 1, 96, 0, 0,
            // func: type 0
            3, 2, 1, 0,
            // export: 'alloc' (missing memory & free)
            7, 8, 1, 5, 97, 108, 108, 111, 99, 0, 0,
            // code: just end
            10, 4, 1, 2, 0, 11,
        ]);
        if (!WebAssembly.validate(noMem)) {
            // skip if binary is somehow invalid in this runtime
            return;
        }
        const badModule = { ...FIXTURE_DATA_MODULE, bytes: noMem };
        await expect(host.load(badModule)).rejects.toThrow(/memory/);
    });

    test("withBytes() copies input into wasm linear memory", async () => {
        const host = new AbiHost();
        const loaded = await host.load(FIXTURE_DATA_MODULE);
        const input = new Uint8Array([0x11, 0x22, 0x33]);
        const { ptr, len, free } = host.withBytes(loaded, input);

        expect(ptr).toBe(1024); // fixture alloc always returns 1024
        expect(len).toBe(3);

        // Verify bytes landed in wasm memory
        const view = new Uint8Array(loaded.mem.buffer, ptr, len);
        expect(view[0]).toBe(0x11);
        expect(view[1]).toBe(0x22);
        expect(view[2]).toBe(0x33);

        free();
    });

    test("readBytes() copies bytes out of wasm linear memory", async () => {
        const host = new AbiHost();
        const loaded = await host.load(FIXTURE_DATA_MODULE);

        // Write known bytes directly into wasm memory
        const testPtr = 2048;
        const testData = new Uint8Array([0xDE, 0xAD, 0xBE, 0xEF]);
        new Uint8Array(loaded.mem.buffer, testPtr, 4).set(testData);

        const result = host.readBytes(loaded, testPtr, 4);
        expect(result).toEqual(testData);

        // Verify it is a copy, not a view
        result[0] = 0xFF;
        expect(new Uint8Array(loaded.mem.buffer, testPtr, 1)[0]).toBe(0xDE);
    });

    test("run() invokes identity_byte and returns status 0", async () => {
        const host = new AbiHost();
        const loaded = await host.load(FIXTURE_DATA_MODULE);

        const view = new Uint8Array(loaded.mem.buffer);
        view[1024] = 0x7B; // put input at alloc ptr

        const outPtr = 2048;
        const status = host.run(loaded, "identity_byte", [1024, 1, outPtr]);

        expect(status).toBe(0);
        expect(view[outPtr]).toBe(0x7B);
    });

    test("run() throws on unknown export name", async () => {
        const host = new AbiHost();
        const loaded = await host.load(FIXTURE_DATA_MODULE);
        expect(() => host.run(loaded, "does_not_exist", [])).toThrow("does_not_exist");
    });

    test("call() round-trips: input bytes in, output bytes out", async () => {
        const host = new AbiHost();
        const loaded = await host.load(FIXTURE_DATA_MODULE);

        const input = new Uint8Array([0xAB]);
        const outPtr = 3072;

        // Allocate output pointer
        const allocFn = loaded.exports["alloc"] as (n: number) => number;
        const freeFn = loaded.exports["free"] as (ptr: number, n: number) => void;
        const outAlloced = allocFn(1);
        // We can't easily test using outAlloced since alloc always returns 1024;
        // use a hard-coded out pointer that doesn't overlap
        void outAlloced;
        freeFn(outAlloced, 1);

        const status = host.call(loaded, "identity_byte", [input], [{ ptr: outPtr, len: 1 }]);
        expect(status).toBe(0);

        const result = host.readBytes(loaded, outPtr, 1);
        expect(result[0]).toBe(0xAB);
    });

    test("simple_check returns 0 for equal bytes (tamper-reject base case)", async () => {
        const host = new AbiHost();
        const loaded = await host.load(FIXTURE_DATA_MODULE);

        const view = new Uint8Array(loaded.mem.buffer);
        view[1024] = 0xCC;
        view[2048] = 0xCC;

        const status = host.run(loaded, "simple_check", [1024, 1, 2048, 1]);
        expect(status).toBe(0);
    });

    test("simple_check returns 1 for different bytes (tamper-reject)", async () => {
        const host = new AbiHost();
        const loaded = await host.load(FIXTURE_DATA_MODULE);

        const view = new Uint8Array(loaded.mem.buffer);
        view[1024] = 0xCC;
        view[2048] = 0xDD; // tampered

        const status = host.run(loaded, "simple_check", [1024, 1, 2048, 1]);
        expect(status).toBe(1); // reject
    });
});

// ─── verify.run() tests ───────────────────────────────────────────────────────

/**
 * Capture stdout/stderr written during a `run()` call.
 */
async function captureVerify(
    args: string[],
    cfg: WasmCryptoConfig,
): Promise<{ code: number; stdout: string; stderr: string }> {
    const stdoutChunks: string[] = [];
    const stderrChunks: string[] = [];

    const origOut = process.stdout.write.bind(process.stdout);
    const origErr = process.stderr.write.bind(process.stderr);

    (process.stdout as { write: typeof process.stdout.write }).write = (
        chunk: string | Uint8Array,
    ) => {
        stdoutChunks.push(typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk));
        return true;
    };
    (process.stderr as { write: typeof process.stderr.write }).write = (
        chunk: string | Uint8Array,
    ) => {
        stderrChunks.push(typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk));
        return true;
    };

    let code: number;
    try {
        code = await runVerify(args, cfg);
    } finally {
        (process.stdout as { write: typeof process.stdout.write }).write = origOut;
        (process.stderr as { write: typeof process.stderr.write }).write = origErr;
    }

    return { code, stdout: stdoutChunks.join(""), stderr: stderrChunks.join("") };
}

/** Write a JSON file into tmpDir and return its path relative to tmpDir root. */
function writeJson(relPath: string, obj: unknown): string {
    const abs = path.join(tmpDir, relPath);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, JSON.stringify(obj));
    return abs;
}

/** Config pointing to tmpDir for all paths. */
function makeCfg(overrides: Partial<WasmCryptoConfig> = {}): WasmCryptoConfig {
    return {
        wasiSdkPath: "",
        srcDir: path.join(tmpDir, "src"),
        outDir: path.join(tmpDir, "out"),
        targetsFile: path.join(tmpDir, "targets.json"),
        ...overrides,
    };
}

describe("verify.run() — no targets file", () => {
    test("exits 1 and writes error to stderr when targets.json missing", async () => {
        const cfg = makeCfg({ targetsFile: path.join(tmpDir, "nonexistent.json") });
        const { code, stderr } = await captureVerify([], cfg);
        expect(code).toBe(1);
        expect(stderr).toContain("not found");
    });
});

describe("verify.run() — empty targets array", () => {
    test("exits 0 when targets.json is empty array", async () => {
        const cfg = makeCfg();
        writeJson("targets.json", []);
        const { code, stdout } = await captureVerify([], cfg);
        expect(code).toBe(0);
        expect(stdout).toContain("no targets");
    });
});

describe("verify.run() — wasm.js not present (skipped)", () => {
    test("exits 1 and skips target when wasm.js is not built", async () => {
        // Create targets.json pointing to a wasm that doesn't exist
        const target = {
            algo: "sha256",
            wasmModule: "sha256-fixture-absent",
            exportName: "sha256FixtureAbsentWasm",
            source: "test",
            sourceKind: "own" as const,
            shim: "shims/test.c",
            cSources: ["csrc/sha256.c"],
            cflags: [],
            simd: false,
            exports: ["memory", "alloc", "free", "sha256_hash"],
            vectors: [path.join(tmpDir, "refs/SHA2-256-fixture")],
        };

        const cfg = makeCfg();
        writeJson("targets.json", [target]);
        // outDir exists but sha256-fixture-absent.wasm.js does not
        fs.mkdirSync(path.join(tmpDir, "out"), { recursive: true });

        const { code, stdout, stderr } = await captureVerify([], cfg);
        // A skip verifies NOTHING. With the only selected target skipped, the
        // run is vacuous and must fail closed (BL-1201) — `pkg-export`'s
        // `freshness:wasm-crypto-verify` consumes this exit code.
        expect(code).toBe(1);
        expect(stderr).toContain("sha256-fixture-absent.wasm.js");
        expect(stderr).toContain("skipping");
        expect(stdout).toContain("0 verified / 1 skipped / 0 failed of 1 targets");
        expect(stdout).not.toContain("1/1 targets passed");
    });
});

describe("verify.run() — vacuous green (BL-1201)", () => {
    // The measured defect: every selected target skipped, yet the summary read
    // "N/N targets passed" and the process exited 0.
    test("exits 1 and names the skips when EVERY target is skipped", async () => {
        const mkTarget = (name: string) => ({
            algo: "sha256",
            wasmModule: name,
            exportName: `${name}Wasm`,
            source: "test",
            sourceKind: "own" as const,
            shim: "shims/test.c",
            cSources: [],
            cflags: [],
            simd: false,
            exports: ["memory", "alloc", "free", "sha256_hash"],
            vectors: [path.join(tmpDir, "refs/absent")],
        });

        const cfg = makeCfg();
        writeJson("targets.json", [mkTarget("absent-a"), mkTarget("absent-b")]);
        fs.mkdirSync(path.join(tmpDir, "out"), { recursive: true });

        const { code, stdout, stderr } = await captureVerify([], cfg);
        expect(code).toBe(1);
        expect(stdout).toContain("0 verified / 2 skipped / 0 failed of 2 targets");
        expect(stdout).toContain("NOTHING VERIFIED");
        expect(stdout).toContain("SKIP");
        expect(stdout).not.toContain("PASS");
        expect(stderr).toContain("nothing was verified");
    });

    test("a target with NO vectors declared is a skip, not a pass", async () => {
        const cfg = makeCfg();
        writeJson("targets.json", [{
            algo: "sha256",
            wasmModule: "no-vectors",
            exportName: "noVectorsWasm",
            source: "test",
            sourceKind: "own" as const,
            shim: "shims/test.c",
            cSources: [],
            cflags: [],
            simd: false,
            exports: ["memory", "alloc", "free", "sha256_hash"],
            vectors: [],
        }]);
        fs.mkdirSync(path.join(tmpDir, "out"), { recursive: true });

        const { code, stdout, stderr } = await captureVerify([], cfg);
        expect(code).toBe(1);
        expect(stdout).toContain("0 verified / 1 skipped / 0 failed of 1 targets");
        expect(stderr).toContain("has no vectors");
    });

    test("--target selecting a single skipped target is non-zero too", async () => {
        const cfg = makeCfg();
        writeJson("targets.json", [{
            algo: "sha256",
            wasmModule: "solo-absent",
            exportName: "soloAbsentWasm",
            source: "test",
            sourceKind: "own" as const,
            shim: "shims/test.c",
            cSources: [],
            cflags: [],
            simd: false,
            exports: ["memory", "alloc", "free", "sha256_hash"],
            vectors: [path.join(tmpDir, "refs/absent")],
        }]);
        fs.mkdirSync(path.join(tmpDir, "out"), { recursive: true });

        const { code, stdout } = await captureVerify(["--target", "solo-absent"], cfg);
        expect(code).toBe(1);
        expect(stdout).toContain("0 verified / 1 skipped / 0 failed of 1 targets");
    });
});

describe("verify.run() — fixture wasm + inline vectors (PASS)", () => {
    let fixtureWasmJsPath: string;
    let vectorDir: string;

    beforeAll(() => {
        // Write the fixture wasm.js data module
        const outDir = path.join(tmpDir, "out-fixture-pass");
        fs.mkdirSync(outDir, { recursive: true });
        fixtureWasmJsPath = path.join(outDir, "fixture-identity.wasm.js");

        // The wasm.js module exports a named constant matching exportName
        const base64Bytes = Buffer.from(FIXTURE_WASM_BYTES).toString("base64");
        const wasmJsContent = [
            `// fixture wasm.js — generated by verify.test.ts`,
            `function b64(s){const t=atob(s);const u=new Uint8Array(t.length);`,
            `for(let i=0;i<t.length;i++)u[i]=t.charCodeAt(i);return u;}`,
            `export const fixtureIdentityWasm = {`,
            `  name: 'fixtureIdentityWasm', type: 'fw.crypto.wasm.data',`,
            `  bytes: b64('${base64Bytes}'),`,
            `  abi: '1', simd: false,`,
            `};`,
        ].join("\n");
        fs.writeFileSync(fixtureWasmJsPath, wasmJsContent);

        // Write inline ACVP-style hash vectors
        // identity_byte is hash-like: one byte in, one byte out
        // We'll fake it as a "hash" with digestLen=1
        // prompt.json: msg = "AB" (1 byte = 0xAB)
        // expected.json: md = "AB" (same byte, since identity)
        vectorDir = path.join(tmpDir, "refs/fixture-identity-hash");
        fs.mkdirSync(vectorDir, { recursive: true });

        const prompt = {
            vsId: 1,
            algorithm: "fixture-identity",
            revision: "1.0",
            testGroups: [
                {
                    tgId: 1,
                    testType: "AFT",
                    tests: [
                        { tcId: 1, msg: "AB", len: 8 },
                        { tcId: 2, msg: "FF", len: 8 },
                        { tcId: 3, msg: "00", len: 8 },
                    ],
                },
            ],
        };

        const expected = {
            vsId: 1,
            algorithm: "fixture-identity",
            revision: "1.0",
            testGroups: [
                {
                    tgId: 1,
                    tests: [
                        { tcId: 1, md: "AB" },
                        { tcId: 2, md: "FF" },
                        { tcId: 3, md: "00" },
                    ],
                },
            ],
        };

        fs.writeFileSync(path.join(vectorDir, "prompt.json"), JSON.stringify(prompt));
        fs.writeFileSync(path.join(vectorDir, "expectedResults.json"), JSON.stringify(expected));
    });

    test("exits 0 when all vectors pass (fixture identity wasm)", async () => {
        // The fixture uses identity_byte as its algo export.
        // We register it as a sha256-family with digestLen=1 by pointing
        // the algo to "sha256" but using a 1-byte digest.
        // Since verify.ts dispatches on algo, and the export function
        // is the first non-ABI export, we use a sha256 algo name
        // and rely on the export detection.

        const target = {
            algo: "sha256",
            wasmModule: "fixture-identity",
            exportName: "fixtureIdentityWasm",
            source: "test",
            sourceKind: "own" as const,
            shim: "shims/test.c",
            cSources: [],
            cflags: [],
            simd: false,
            exports: ["memory", "alloc", "free", "identity_byte"],
            vectors: [vectorDir],
        };

        // Adjust the expectedResults to what identity_byte actually produces
        // identity_byte copies first byte of input to output.
        // With digestLen=32 (sha256 default), readBytes reads 32 bytes from outPtr.
        // Our fixture only writes 1 byte, and we need both to match.
        // → We'll use a custom vector approach: write the expected md as 32 hex bytes
        // where first byte matches and rest are zeros (fixture memory is zeroed).

        // Re-write vectors for the fixture's actual behavior with sha256 (digestLen=32)
        const inByte = "AB";
        const expectedMd = inByte + "00".repeat(31); // 32 bytes: 0xAB + 31 zeros

        const prompt2 = {
            vsId: 2, algorithm: "SHA2-256", revision: "1.0",
            testGroups: [{ tgId: 1, testType: "AFT", tests: [{ tcId: 1, msg: inByte, len: 8 }] }],
        };
        const expected2 = {
            vsId: 2,
            testGroups: [{ tgId: 1, tests: [{ tcId: 1, md: expectedMd }] }],
        };

        const v2Dir = path.join(tmpDir, "refs/fixture-sha256-pass");
        fs.mkdirSync(v2Dir, { recursive: true });
        fs.writeFileSync(path.join(v2Dir, "prompt.json"), JSON.stringify(prompt2));
        fs.writeFileSync(path.join(v2Dir, "expectedResults.json"), JSON.stringify(expected2));

        const target2 = { ...target, vectors: [v2Dir] };
        const cfg = makeCfg({ outDir: path.dirname(fixtureWasmJsPath) });
        writeJson("targets.json", [target2]);

        const { code, stdout } = await captureVerify([], cfg);
        expect(code).toBe(0);
        expect(stdout).toContain("PASS");
    });

    test("exits 1 with mismatch offset when expected bytes are wrong", async () => {
        // Use a deliberately wrong expected (negate of actual)
        const inByte = "42";
        // identity_byte copies 0x42 to first byte; rest is zero
        // Wrong expected: first byte 0x43 (off by one)
        const wrongMd = "43" + "00".repeat(31);

        const prompt3 = {
            vsId: 3, algorithm: "SHA2-256", revision: "1.0",
            testGroups: [{ tgId: 1, testType: "AFT", tests: [{ tcId: 1, msg: inByte, len: 8 }] }],
        };
        const expected3 = {
            vsId: 3,
            testGroups: [{ tgId: 1, tests: [{ tcId: 1, md: wrongMd }] }],
        };

        const v3Dir = path.join(tmpDir, "refs/fixture-sha256-fail");
        fs.mkdirSync(v3Dir, { recursive: true });
        fs.writeFileSync(path.join(v3Dir, "prompt.json"), JSON.stringify(prompt3));
        fs.writeFileSync(path.join(v3Dir, "expectedResults.json"), JSON.stringify(expected3));

        const target3 = {
            algo: "sha256",
            wasmModule: "fixture-identity",
            exportName: "fixtureIdentityWasm",
            source: "test",
            sourceKind: "own" as const,
            shim: "shims/test.c",
            cSources: [],
            cflags: [],
            simd: false,
            exports: ["memory", "alloc", "free", "identity_byte"],
            vectors: [v3Dir],
        };
        const cfg = makeCfg({ outDir: path.dirname(fixtureWasmJsPath) });
        // Use a unique targets.json for this test
        const targetsPath = path.join(tmpDir, "targets-fail.json");
        fs.writeFileSync(targetsPath, JSON.stringify([target3]));
        const cfgFail = { ...cfg, targetsFile: targetsPath };

        const { code, stderr } = await captureVerify([], cfgFail);
        expect(code).toBe(1);
        expect(stderr).toContain("FAIL");
        // Should mention the offset
        expect(stderr).toContain("offset 0");
    });
});

describe("verify.run() — --target filter", () => {
    test("exits 1 when --target names a module not in targets.json", async () => {
        const cfg = makeCfg();
        writeJson("targets.json", []);
        // Reuse empty targets.json (empty array)
        const { code, stderr } = await captureVerify(["--target", "nonexistent"], cfg);
        expect(code).toBe(1);
        expect(stderr).toContain("nonexistent");
    });
});

describe("verify.run() — invalid targets.json", () => {
    test("exits 1 when targets.json is malformed", async () => {
        const badPath = path.join(tmpDir, "bad-targets.json");
        fs.writeFileSync(badPath, '{"not": "an array"}');
        const cfg = makeCfg({ targetsFile: badPath });
        const { code, stderr } = await captureVerify([], cfg);
        expect(code).toBe(1);
        expect(stderr).toContain("invalid");
    });
});

// ─── --pkg resolution tests ───────────────────────────────────────────────────
//
// These tests exercise the --pkg model: applyPkgDir derives
//   targetsFile = <pkg>/targets.json
//   outDir      = <pkg>/dist
// The verify command is called with a pre-applied cfg (exactly as index.ts does
// after extractPkgFlag + applyPkgDir).

describe("verify.run() — --pkg resolution (targets.json + dist/ loaded from pkgDir)", () => {
    let pkgDir: string;
    let pkgWasmJsPath: string;
    let pkgVectorDir: string;

    beforeAll(() => {
        // Set up a self-contained fixture package directory:
        //   <pkgDir>/targets.json
        //   <pkgDir>/dist/fixture-pkg.wasm.js
        //   <pkgDir>/refs/fixture-pkg-hash/   (ACVP vectors)
        pkgDir = path.join(tmpDir, "pkg-fixture");
        fs.mkdirSync(path.join(pkgDir, "dist"), { recursive: true });

        // Write the .wasm.js module into <pkgDir>/dist/
        const base64Bytes = Buffer.from(FIXTURE_WASM_BYTES).toString("base64");
        const wasmJsContent = [
            `// fixture wasm.js — generated by verify.test.ts --pkg suite`,
            `function b64(s){const t=atob(s);const u=new Uint8Array(t.length);`,
            `for(let i=0;i<t.length;i++)u[i]=t.charCodeAt(i);return u;}`,
            `export const fixturePkgWasm = {`,
            `  name: 'fixturePkgWasm', type: 'fw.crypto.wasm.data',`,
            `  bytes: b64('${base64Bytes}'),`,
            `  abi: '1', simd: false,`,
            `};`,
        ].join("\n");
        pkgWasmJsPath = path.join(pkgDir, "dist", "fixture-pkg.wasm.js");
        fs.writeFileSync(pkgWasmJsPath, wasmJsContent);

        // Write ACVP-style vectors: identity_byte treated as sha256 (32-byte output)
        pkgVectorDir = path.join(pkgDir, "refs", "fixture-pkg-hash");
        fs.mkdirSync(pkgVectorDir, { recursive: true });

        const inByte = "CD";
        const expectedMd = inByte + "00".repeat(31); // identity_byte writes 1 byte; rest is wasm zeroes
        const prompt = {
            vsId: 10, algorithm: "SHA2-256", revision: "1.0",
            testGroups: [{ tgId: 1, testType: "AFT", tests: [{ tcId: 1, msg: inByte, len: 8 }] }],
        };
        const expected = {
            vsId: 10,
            testGroups: [{ tgId: 1, tests: [{ tcId: 1, md: expectedMd }] }],
        };
        fs.writeFileSync(path.join(pkgVectorDir, "prompt.json"), JSON.stringify(prompt));
        fs.writeFileSync(path.join(pkgVectorDir, "expectedResults.json"), JSON.stringify(expected));

        // Write <pkgDir>/targets.json
        const targets = [
            {
                algo: "sha256",
                wasmModule: "fixture-pkg",
                exportName: "fixturePkgWasm",
                source: "test",
                sourceKind: "own",
                shim: "shims/test.c",
                cSources: [],
                cflags: [],
                simd: false,
                exports: ["memory", "alloc", "free", "identity_byte"],
                vectors: [pkgVectorDir],
            },
        ];
        fs.writeFileSync(path.join(pkgDir, "targets.json"), JSON.stringify(targets));
    });

    test("applyPkgDir sets targetsFile=<pkg>/targets.json and outDir=<pkg>/dist", () => {
        const base: WasmCryptoConfig = {
            wasiSdkPath: "",
            srcDir: "",
            outDir: "old/out",
            targetsFile: "old/targets.json",
        };
        const derived = applyPkgDir(base, pkgDir);
        expect(derived.pkgDir).toBe(pkgDir);
        expect(derived.targetsFile).toBe(path.join(pkgDir, "targets.json"));
        expect(derived.outDir).toBe(path.join(pkgDir, "dist"));
    });

    test("applyPkgDir guards isAbsolute — absolute pkgDir is not re-joined with cwd", () => {
        const base: WasmCryptoConfig = {
            wasiSdkPath: "",
            srcDir: "",
            outDir: "",
            targetsFile: "",
        };
        // Pass an absolute path: applyPkgDir must not prepend cwd
        const derived = applyPkgDir(base, pkgDir);
        expect(derived.pkgDir).toBe(pkgDir);
        // The result must not contain cwd twice
        const cwd = process.cwd();
        const doubled = path.join(cwd, pkgDir);
        expect(derived.pkgDir).not.toBe(doubled);
    });

    test("exits 0 when pkgDir targets.json + dist/ vectors all pass", async () => {
        const base: WasmCryptoConfig = {
            wasiSdkPath: "",
            srcDir: "",
            outDir: "",
            targetsFile: "",
        };
        const cfg = applyPkgDir(base, pkgDir);
        const { code, stdout } = await captureVerify([], cfg);
        expect(code).toBe(0);
        expect(stdout).toContain("PASS");
    });

    test("exits 1 when pkgDir vectors have a wrong expected value (mismatch → byte-offset message)", async () => {
        // Write a targets.json with a wrong expected md (flip first byte)
        const wrongVectorDir = path.join(pkgDir, "refs", "fixture-pkg-wrong");
        fs.mkdirSync(wrongVectorDir, { recursive: true });

        const inByte = "CD";
        const wrongMd = "CE" + "00".repeat(31); // 0xCE != 0xCD
        const prompt = {
            vsId: 11, algorithm: "SHA2-256", revision: "1.0",
            testGroups: [{ tgId: 1, testType: "AFT", tests: [{ tcId: 1, msg: inByte, len: 8 }] }],
        };
        const expected = {
            vsId: 11,
            testGroups: [{ tgId: 1, tests: [{ tcId: 1, md: wrongMd }] }],
        };
        fs.writeFileSync(path.join(wrongVectorDir, "prompt.json"), JSON.stringify(prompt));
        fs.writeFileSync(path.join(wrongVectorDir, "expectedResults.json"), JSON.stringify(expected));

        const wrongTargets = [
            {
                algo: "sha256",
                wasmModule: "fixture-pkg",
                exportName: "fixturePkgWasm",
                source: "test",
                sourceKind: "own",
                shim: "shims/test.c",
                cSources: [],
                cflags: [],
                simd: false,
                exports: ["memory", "alloc", "free", "identity_byte"],
                vectors: [wrongVectorDir],
            },
        ];
        const wrongTargetsPath = path.join(pkgDir, "targets-wrong.json");
        fs.writeFileSync(wrongTargetsPath, JSON.stringify(wrongTargets));

        const base: WasmCryptoConfig = {
            wasiSdkPath: "",
            srcDir: "",
            outDir: "",
            targetsFile: "",
        };
        const cfg = applyPkgDir(base, pkgDir);
        // Override targetsFile to the wrong one while keeping outDir from pkgDir
        const cfgWrong = { ...cfg, targetsFile: wrongTargetsPath };
        const { code, stderr } = await captureVerify([], cfgWrong);
        expect(code).toBe(1);
        expect(stderr).toContain("FAIL");
        expect(stderr).toContain("offset 0");
    });

    test("exits 1 and skips when module absent from pkgDir/dist/", async () => {
        const absentTargets = [
            {
                algo: "sha256",
                wasmModule: "not-built",
                exportName: "notBuiltWasm",
                source: "test",
                sourceKind: "own",
                shim: "shims/test.c",
                cSources: [],
                cflags: [],
                simd: false,
                exports: ["memory", "alloc", "free", "sha256_hash"],
                vectors: [pkgVectorDir],
            },
        ];
        const absentTargetsPath = path.join(pkgDir, "targets-absent.json");
        fs.writeFileSync(absentTargetsPath, JSON.stringify(absentTargets));

        const base: WasmCryptoConfig = {
            wasiSdkPath: "",
            srcDir: "",
            outDir: "",
            targetsFile: "",
        };
        const cfg = applyPkgDir(base, pkgDir);
        const cfgAbsent = { ...cfg, targetsFile: absentTargetsPath };
        const { code, stdout, stderr } = await captureVerify([], cfgAbsent);
        // Absent module → skipped, and a run that skipped its only target
        // verified nothing: fail closed (BL-1201).
        expect(code).toBe(1);
        expect(stderr).toContain("not-built.wasm.js");
        expect(stderr).toContain("skipping");
        expect(stdout).toContain("0 verified / 1 skipped / 0 failed of 1 targets");
    });

    test("--target filter: exits 0 for known target, exits 1 for unknown target", async () => {
        const base: WasmCryptoConfig = {
            wasiSdkPath: "",
            srcDir: "",
            outDir: "",
            targetsFile: "",
        };
        const cfg = applyPkgDir(base, pkgDir);

        // Known target passes
        const { code: codePass } = await captureVerify(["--target", "fixture-pkg"], cfg);
        expect(codePass).toBe(0);

        // Unknown target fails
        const { code: codeFail, stderr: stderrFail } = await captureVerify(
            ["--target", "unknown-module"],
            cfg,
        );
        expect(codeFail).toBe(1);
        expect(stderrFail).toContain("unknown-module");
    });
});

// ─── task 03 (BL-1219) — family-name alignment ────────────────────────────────
//
// The dispatch in `runTargetVectors` used to key on PER-SIZE algo spellings
// (sha256, sha2-256, ...) while the real `targets.json` declares the BARE
// family names (sha2, sha3, aes), so those three runners were unreachable.
// These tests cover: (a) every recognized spelling — legacy per-size AND the
// new bare names — reaches a runner instead of the "unknown algo family"
// path; (b) a target in the still-unrunnable 14-family set stays a SKIP, not
// a pass; (c) end-to-end against the REAL build (gated on its presence).

describe("verify.run() — every recognized algo spelling dispatches (task 03, BL-1219)", () => {
    // A minimal fixture wasm.js (reuses FIXTURE_WASM_BYTES) plus a target
    // whose `vectors` entry points at a directory that does not exist. A
    // RECOGNIZED algo reaches its runner, which tries to load
    // `prompt.json`/`expectedResults.json` there and reports a FAIL
    // ("failed to load vectors: ..."). An UNRECOGNIZED algo never gets that
    // far — it prints "unknown algo family" and is a SKIP instead. This
    // isolates "was the name recognized" from "did the vectors verify",
    // with no real compiled wasm needed.
    //
    // The bare "sha2"/"sha3" branches additionally gate on the VECTOR
    // FOLDER name (not just `algo`), so their probe path embeds a
    // recognized folder token (e.g. "SHA2-256-1.0") even though the
    // directory itself does not exist.
    const recognized: Array<{ algo: string; vectorDirName: string }> = [
        { algo: "sha256", vectorDirName: "legacy-sha256" },
        { algo: "sha2-256", vectorDirName: "legacy-sha2-256" },
        { algo: "sha384", vectorDirName: "legacy-sha384" },
        { algo: "sha2-384", vectorDirName: "legacy-sha2-384" },
        { algo: "sha512", vectorDirName: "legacy-sha512" },
        { algo: "sha2-512", vectorDirName: "legacy-sha2-512" },
        { algo: "sha3-256", vectorDirName: "legacy-sha3-256" },
        { algo: "sha3_256", vectorDirName: "legacy-sha3_256" },
        { algo: "sha3-384", vectorDirName: "legacy-sha3-384" },
        { algo: "sha3_384", vectorDirName: "legacy-sha3_384" },
        { algo: "sha3-512", vectorDirName: "legacy-sha3-512" },
        { algo: "sha3_512", vectorDirName: "legacy-sha3_512" },
        { algo: "aes_gcm", vectorDirName: "legacy-aes-gcm" },
        { algo: "aes-gcm", vectorDirName: "legacy-aes-gcm-2" },
        { algo: "sha2", vectorDirName: "SHA2-256-1.0" },
        { algo: "sha3", vectorDirName: "SHA3-256-2.0" },
        { algo: "aes", vectorDirName: "ACVP-AES-GCM-1.0" },
    ];

    for (const { algo, vectorDirName } of recognized) {
        test(`algo '${algo}' dispatches to a runner (not 'unknown algo family')`, async () => {
            const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wasm-crypto-dispatch-"));
            try {
                const outDir = path.join(dir, "out");
                fs.mkdirSync(outDir, { recursive: true });
                const base64Bytes = Buffer.from(FIXTURE_WASM_BYTES).toString("base64");
                fs.writeFileSync(
                    path.join(outDir, "probe.wasm.js"),
                    [
                        `function b64(s){const t=atob(s);const u=new Uint8Array(t.length);`,
                        `for(let i=0;i<t.length;i++)u[i]=t.charCodeAt(i);return u;}`,
                        `export const probeWasm = {`,
                        `  name: 'probeWasm', type: 'fw.crypto.wasm.data',`,
                        `  bytes: b64('${base64Bytes}'), abi: '1', simd: false,`,
                        `};`,
                    ].join("\n"),
                );

                const target = {
                    algo,
                    wasmModule: "probe",
                    exportName: "probeWasm",
                    source: "test",
                    sourceKind: "own" as const,
                    shim: "shims/test.c",
                    cSources: [],
                    cflags: [],
                    simd: false,
                    exports: ["memory", "alloc", "free", "identity_byte", "aes_gcm_seal", "aes_gcm_open"],
                    vectors: [path.join(dir, "refs", vectorDirName)],
                };
                const targetsPath = path.join(dir, "targets.json");
                fs.writeFileSync(targetsPath, JSON.stringify([target]));

                const cfg: WasmCryptoConfig = {
                    wasiSdkPath: "",
                    srcDir: path.join(dir, "src"),
                    outDir,
                    targetsFile: targetsPath,
                };
                const { stdout, stderr } = await captureVerify([], cfg);

                expect(stderr).not.toContain("unknown algo family");
                expect(stderr).toContain("failed to load vectors");
                expect(stdout).toContain("FAIL");
            } finally {
                fs.rmSync(dir, { recursive: true, force: true });
            }
        });
    }
});

describe("verify.run() — a target in the 14-family unrunnable set stays skipped, never verified (task 03)", () => {
    test("algo 'argon2' (present wasm, real vectors path) is SKIP with 'unknown algo family', not counted as verified", async () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wasm-crypto-unrunnable-"));
        try {
            const outDir = path.join(dir, "out");
            fs.mkdirSync(outDir, { recursive: true });
            const base64Bytes = Buffer.from(FIXTURE_WASM_BYTES).toString("base64");
            fs.writeFileSync(
                path.join(outDir, "argon2.wasm.js"),
                [
                    `function b64(s){const t=atob(s);const u=new Uint8Array(t.length);`,
                    `for(let i=0;i<t.length;i++)u[i]=t.charCodeAt(i);return u;}`,
                    `export const argon2Wasm = {`,
                    `  name: 'argon2Wasm', type: 'fw.crypto.wasm.data',`,
                    `  bytes: b64('${base64Bytes}'), abi: '1', simd: false,`,
                    `};`,
                ].join("\n"),
            );

            const target = {
                algo: "argon2",
                wasmModule: "argon2",
                exportName: "argon2Wasm",
                source: "own-argon2",
                sourceKind: "own" as const,
                shim: "shims/argon2.c",
                cSources: [],
                cflags: [],
                simd: false,
                exports: ["memory", "alloc", "free", "argon2id_hash"],
                // Vectors "exist" (any path) — the dispatch must never even
                // try to read them for an unrunnable family.
                vectors: [path.join(dir, "refs/rfc9106.txt")],
            };
            const targetsPath = path.join(dir, "targets.json");
            fs.writeFileSync(targetsPath, JSON.stringify([target]));

            const cfg: WasmCryptoConfig = {
                wasiSdkPath: "",
                srcDir: path.join(dir, "src"),
                outDir,
                targetsFile: targetsPath,
            };
            const { code, stdout, stderr } = await captureVerify([], cfg);

            expect(stderr).toContain("unknown algo family 'argon2'");
            expect(stdout).toContain("SKIP");
            expect(stdout).not.toContain("PASS");
            expect(stdout).toContain("0 verified / 1 skipped / 0 failed of 1 targets");
            expect(stderr).toContain("no runner for 1 algo family — reported as skipped: argon2");
            // A lone skipped target is a vacuous run — LIGHT_24 fails it closed.
            expect(code).toBe(1);
        } finally {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    });
});

// ─── Real-package integration: bare-family dispatch against the actual build ─
//
// Gated on the REAL `packages/front/fw-wasm-crypto/dist/` being present, per
// this file's own convention (header comment): skipped with a message when
// the tree has not been built.

describe("verify.run() — sha2/sha3/aes bare families against the REAL fw-wasm-crypto build (task 03, BL-1219)", () => {
    const REPO_ROOT = path.join(import.meta.dir, "..", "..", "..", "..");
    const REAL_PKG = path.join(REPO_ROOT, "packages", "front", "fw-wasm-crypto");
    const realDistPresent =
        fs.existsSync(path.join(REAL_PKG, "dist", "sha2.wasm.js")) &&
        fs.existsSync(path.join(REAL_PKG, "dist", "sha3.wasm.js")) &&
        fs.existsSync(path.join(REAL_PKG, "dist", "aes.wasm.js"));

    // `test.if` reports each skipped test by name when `realDistPresent` is
    // false (fresh checkout, `wasm-crypto build` not yet run) — matches this
    // file's header convention ("skipped with a message when absent").
    test.if(realDistPresent)(
        "verified >= 1 on the built tree, exit 0, and the coverage line names exactly the 14 families with no runner",
        async () => {
            // Regression fix (attempt 2, BL-1219 closing audit): targets.json's
            // vectors[] entries are repo-root-relative
            // (e.g. "references/NIST/..."), and verify.ts resolves any relative
            // vector path against `process.cwd()` (see resolvePath(), verify.ts
            // ~L33) rather than against REAL_PKG or the repo root. Run this
            // assertion block from the repo root — exactly how the CLI is
            // actually invoked (`bun cli.ts wasm-crypto verify` runs from the
            // repo root) — so the vectors resolve regardless of the cwd the
            // test runner itself was launched from (e.g. pkg-export's
            // quality:test gate spawns `bun test` with cwd = the package dir).
            // The underlying cwd-sensitivity in verify.ts is a real,
            // pre-existing defect, routed separately (see this task's report,
            // out_of_perimeter_findings) — intentionally not fixed here.
            const prevCwd = process.cwd();
            process.chdir(REPO_ROOT);
            try {
                const base: WasmCryptoConfig = { wasiSdkPath: "", srcDir: "", outDir: "", targetsFile: "" };
                const cfg = applyPkgDir(base, REAL_PKG);
                const { code, stdout, stderr } = await captureVerify([], cfg);

                expect(code).toBe(0);
                expect(stdout).toMatch(/[1-9]\d* verified/);
                expect(stdout).toContain("sha2");
                expect(stdout).toContain("sha3");
                expect(stdout).toContain("aes");

                const coverageLine = stderr.split("\n").find(l => l.includes("no runner for"));
                expect(coverageLine).toBeDefined();
                const line = coverageLine ?? "";
                // sha2/sha3/aes must NOT be named among the "no runner" families
                // (word-boundary check — "aes" must not match inside another name).
                for (const nowRunnable of ["sha2", "sha3", "aes"]) {
                    expect(line).not.toMatch(new RegExp(`(^|[\\s:])${nowRunnable}(,|$)`));
                }
                // The 14 families this task explicitly leaves unrunnable are still named.
                for (const family of [
                    "argon2", "ml_kem", "ml_dsa", "slh_dsa", "blake2b",
                    "chacha20poly1305", "cmac", "hmac", "pbkdf2", "hkdf",
                    "rsa", "ecc", "ed25519", "x25519",
                ]) {
                    expect(line).toContain(family);
                }
            } finally {
                process.chdir(prevCwd);
            }
        },
        60_000,
    );

    test.if(realDistPresent)(
        "LIGHT_24 fail-closed rule survives: --target on an unrunnable family still exits non-zero",
        async () => {
            const base: WasmCryptoConfig = { wasiSdkPath: "", srcDir: "", outDir: "", targetsFile: "" };
            const cfg = applyPkgDir(base, REAL_PKG);
            const { code, stdout } = await captureVerify(["--target", "argon2"], cfg);
            expect(code).toBe(1);
            expect(stdout).toContain("0 verified");
        },
        30_000,
    );
});
