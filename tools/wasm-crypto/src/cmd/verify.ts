// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * verify — KAT/ACVP/RFC byte-for-byte gate on produced *.wasm.js modules.
 *
 * For each target (all by default, one with --target <wasmModule>):
 *   1. Loads `<outDir>/<wasmModule>.wasm.js` via dynamic import.
 *   2. Instantiates the module through abi-host (mirrors fw wasmRuntime ABI).
 *   3. Runs official KAT/ACVP/RFC vectors declared in `targets.json` and
 *      asserts byte-for-byte equality.
 *   4. For AEAD/signature targets, also asserts tamper → reject.
 *
 * Exit 0 only if ALL vectors pass for ALL selected targets; else 1.
 *
 * Output:
 *   stdout — pass/fail table (target | vectors run | result)
 *   stderr — mismatches with first differing byte offset; load errors
 *
 * References:
 *   ACVP JSON format: references/NIST/ACVP-Server-X.Y.Z/gen-val/json-files/<ALG>/
 *     prompt.json  — input fields (msg, key, iv, pt, aad, …)
 *     expectedResults.json — expected fields (md, ct, tag, …)
 *   RFC vectors: references/SPEC/RFC/… (algorithm-specific plain text / JSON)
 */

import { join, isAbsolute, dirname, basename } from "node:path";
import { AbiHost, type LoadedWasm, type WasmDataModule } from "../abi-host.ts";
import { validateTargets, type Target } from "../targets.schema.ts";
import type { WasmCryptoConfig } from "../index.ts";

/**
 * Resolve a path that may be absolute or relative.
 * Relative paths are resolved from `process.cwd()`.
 */
function resolvePath(p: string): string {
    return isAbsolute(p) ? p : join(process.cwd(), p);
}

/**
 * Resolve a `Target.vectors[]` entry to the ACVP vector *directory* holding
 * both `prompt.json` and `expectedResults.json`.
 *
 * Two shapes are accepted (task 03 investigation, BL-1219):
 *   - a bare directory (the shape this file's own tests use), or
 *   - a path ending in `prompt.json` — the shape every real ACVP-backed
 *     entry in `packages/front/fw-wasm-crypto/targets.json` actually uses
 *     (e.g. `.../SHA2-256-1.0/prompt.json`); `expectedResults.json` is
 *     always its sibling in the same directory.
 */
function resolveVectorDir(vectorPath: string): string {
    const resolved = resolvePath(vectorPath);
    return basename(resolved) === "prompt.json" ? dirname(resolved) : resolved;
}

// ─── Types ────────────────────────────────────────────────────────────────────

/** Result for one target's verification run. */
interface TargetResult {
    wasmModule: string;
    algo: string;
    vectorsRun: number;
    pass: boolean;
    /**
     * True when the target was NOT verified: no vectors declared, the wasm was
     * not built, or no declared vector matched a runner. A skip is not a pass —
     * it is the absence of evidence, and the summary must never count it as one.
     */
    skipped: boolean;
    /** Human-readable reason for failure; empty if pass. */
    reason: string;
}

// ACVP JSON shape (subset; fields are hex strings)
interface AcvpPromptGroup {
    tgId: number;
    testType?: string;
    direction?: string;
    tests: AcvpTest[];
}

interface AcvpTest {
    tcId: number;
    // Hash / XOF
    msg?: string;
    len?: number;
    // AEAD (GCM, CCM, …)
    pt?: string;
    key?: string;
    iv?: string;
    aad?: string;
    // Signature
    [key: string]: unknown;
}

interface AcvpPrompt {
    algorithm: string;
    testGroups: AcvpPromptGroup[];
}

interface AcvpExpectedGroup {
    tgId: number;
    tests: AcvpExpectedTest[];
}

interface AcvpExpectedTest {
    tcId: number;
    // Hash
    md?: string;
    // AEAD encrypt
    ct?: string;
    tag?: string;
    // AEAD decrypt
    testPassed?: boolean;
    // Signature verify
    [key: string]: unknown;
}

interface AcvpExpected {
    testGroups: AcvpExpectedGroup[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Decode a hex string to Uint8Array. */
function fromHex(hex: string): Uint8Array {
    if (hex.length === 0) return new Uint8Array(0);
    if (hex.length % 2 !== 0) {
        throw new Error(`fromHex: odd-length hex string (${hex.length} chars)`);
    }
    const out = new Uint8Array(hex.length / 2);
    for (let i = 0; i < out.length; i++) {
        out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    }
    return out;
}

/** Compare two Uint8Arrays byte-for-byte; returns -1 if equal, else first differing index. */
function firstMismatch(a: Uint8Array, b: Uint8Array): number {
    if (a.length !== b.length) return Math.min(a.length, b.length);
    for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) return i;
    }
    return -1;
}

/** Encode Uint8Array to uppercase hex string. */
function toHex(bytes: Uint8Array): string {
    return Array.from(bytes)
        .map(b => b.toString(16).padStart(2, "0").toUpperCase())
        .join("");
}

/** Load and parse a JSON file. */
async function readJson<T>(path: string): Promise<T> {
    const file = Bun.file(path);
    if (!(await file.exists())) {
        throw new Error(`File not found: ${path}`);
    }
    return JSON.parse(await file.text()) as T;
}

// ─── Target loading ───────────────────────────────────────────────────────────

/**
 * Load and instantiate a *.wasm.js data module from outDir.
 *
 * The wasm.js module must export `const <exportName> = { name, type, bytes, abi, simd }`.
 * Returns null if the file does not exist (so the caller can skip/report).
 */
async function loadWasmModule(
    wasmModuleName: string,
    exportName: string,
    outDir: string,
    host: AbiHost,
): Promise<LoadedWasm | null> {
    const wasmJsPath = join(resolvePath(outDir), `${wasmModuleName}.wasm.js`);
    const file = Bun.file(wasmJsPath);
    if (!(await file.exists())) {
        return null;
    }

    // Dynamic import of the data module (ESM)
    const mod = await import(wasmJsPath) as Record<string, WasmDataModule>;
    const dataModule = mod[exportName];
    if (!dataModule || typeof dataModule !== "object" || !("bytes" in dataModule)) {
        throw new Error(
            `verify: exported '${exportName}' from '${wasmJsPath}' is missing or not a data module`,
        );
    }

    return host.load(dataModule);
}

// ─── Vector runners ───────────────────────────────────────────────────────────

/**
 * Run hash (SHA-2, SHA-3, etc.) ACVP AFT vectors.
 *
 * ACVP format (SHA):
 *   prompt.json  → testGroups[].tests[].{ tcId, msg (hex), len (bits) }
 *   expectedResults.json → testGroups[].tests[].{ tcId, md (hex) }
 *
 * Wasm export expected:  hash(msgPtr, msgLen, outPtr) -> i32 status
 * Output pointer must be pre-allocated to the digest size.
 */
async function runHashVectors(
    loaded: LoadedWasm,
    host: AbiHost,
    vectorPath: string,
    exportFn: string,
    digestLen: number,
    /**
     * Builds the wasm-call argument list from `(inPtr, inLen, outPtr, outLen)`.
     * Defaults to the legacy 3-arg per-size shape `(inPtr, inLen, outPtr)`.
     * A combined multi-variant export (the frozen `sha2`/`sha3` ABI) needs a
     * leading `variantId` instead of a dedicated per-size export — see the
     * bare-family branches in `runTargetVectors` (task 03, BL-1219).
     */
    buildArgs: (inPtr: number, inLen: number, outPtr: number, outLen: number) => number[]
        = (inPtr, inLen, outPtr) => [inPtr, inLen, outPtr],
): Promise<{ run: number; failMsg: string }> {
    const basePath = resolveVectorDir(vectorPath);
    let prompt: AcvpPrompt;
    let expected: AcvpExpected;

    try {
        prompt = await readJson<AcvpPrompt>(join(basePath, "prompt.json"));
        expected = await readJson<AcvpExpected>(join(basePath, "expectedResults.json"));
    } catch (e: unknown) {
        return { run: 0, failMsg: `failed to load vectors: ${(e as Error).message}` };
    }

    // Build a lookup: tgId → tcId → expectedTest
    const expectedMap = new Map<number, Map<number, AcvpExpectedTest>>();
    for (const g of expected.testGroups) {
        const tcMap = new Map<number, AcvpExpectedTest>();
        for (const t of g.tests) {
            tcMap.set(t.tcId, t);
        }
        expectedMap.set(g.tgId, tcMap);
    }

    const allocFn = loaded.exports["alloc"] as (n: number) => number;
    const freeFn = loaded.exports["free"] as (ptr: number, n: number) => void;
    let run = 0;

    for (const group of prompt.testGroups) {
        // ACVP hash files interleave THREE test-group shapes under one
        // algorithm: AFT (a plain single hash — the only shape this runner
        // implements), MCT (Monte Carlo: 1000 chained rounds per test case,
        // seeded rather than hashed directly), and LDT (Large Data Test: a
        // compact repeated-pattern encoding, not a literal `msg` hex string).
        // Measured on the real SHA2/SHA3 files (task 03, BL-1219): treating
        // an MCT/LDT group's `test.msg` as a plain message silently hashes
        // the wrong bytes and reports a false FAIL. Skip anything that is
        // not (or does not declare itself) AFT rather than mis-verify it.
        if (group.testType !== undefined && group.testType !== "AFT") continue;

        const tcMap = expectedMap.get(group.tgId);
        if (!tcMap) continue;

        for (const test of group.tests) {
            const exp = tcMap.get(test.tcId);
            if (!exp || typeof exp.md !== "string") continue;

            // The wasm export's `inLen` is a BYTE count (`int inLen`) — it has
            // no bit-length concept. ACVP hash AFT groups routinely include
            // bit-oriented messages whose true `len` (bits) is not a multiple
            // of 8 (measured on the real files: 0/512 for SHA2-256-1.0's AFT
            // group, but 892/1024 for SHA2-384-1.0 and 1043/1194 for
            // SHA3-256-2.0 — task 03 investigation, BL-1219). Such a test
            // cannot be represented through this ABI at all; skip it rather
            // than hash the wrong (byte-rounded) bit width and report a false
            // mismatch.
            if (typeof test.len === "number" && test.len % 8 !== 0) continue;

            const msgBytes = fromHex(test.msg ?? "");
            const expectedDigest = fromHex(exp.md);

            // Allocate output buffer
            const outPtr = allocFn(digestLen);
            try {
                const inAlloc = host.withBytes(loaded, msgBytes);
                let status: number;
                try {
                    status = host.run(loaded, exportFn, buildArgs(inAlloc.ptr, inAlloc.len, outPtr, digestLen));
                } finally {
                    inAlloc.free();
                }

                if (status !== 0) {
                    return {
                        run,
                        failMsg: `tg=${group.tgId} tc=${test.tcId}: export returned status ${status}`,
                    };
                }

                const actual = host.readBytes(loaded, outPtr, digestLen);
                const mismatch = firstMismatch(actual, expectedDigest);
                if (mismatch !== -1) {
                    return {
                        run,
                        failMsg:
                            `tg=${group.tgId} tc=${test.tcId}: byte mismatch at offset ${mismatch} ` +
                            `(got ${toHex(actual.slice(mismatch, mismatch + 4))}… ` +
                            `expected ${toHex(expectedDigest.slice(mismatch, mismatch + 4))}…)`,
                    };
                }

                run++;
            } finally {
                freeFn(outPtr, digestLen);
            }
        }
    }

    return { run, failMsg: "" };
}

/**
 * Run AEAD (AES-GCM, ChaCha20-Poly1305, etc.) ACVP AFT vectors.
 *
 * ACVP format (AEAD encrypt):
 *   prompt  → testGroups[]{direction:'encrypt', tests[]{tcId, pt, key, iv, aad}}
 *   expected → testGroups[]{tests[]{tcId, ct, tag}}
 *
 * Also runs tamper-reject: flips one bit in ct and expects the verify
 * export to return non-zero (reject).
 *
 * Wasm exports expected:
 *   aead_encrypt(keyPtr, keyLen, ivPtr, ivLen, aadPtr, aadLen,
 *                ptPtr, ptLen, ctOutPtr, tagOutPtr, tagLen) -> i32 status
 *   aead_decrypt(keyPtr, keyLen, ivPtr, ivLen, aadPtr, aadLen,
 *                ctPtr, ctLen, tagPtr, tagLen, ptOutPtr) -> i32 status (0=ok, 1=tag mismatch)
 */
async function runAeadVectors(
    loaded: LoadedWasm,
    host: AbiHost,
    vectorPath: string,
    encryptFn: string,
    decryptFn: string,
): Promise<{ run: number; failMsg: string }> {
    const basePath = resolveVectorDir(vectorPath);
    let prompt: AcvpPrompt;
    let expected: AcvpExpected;

    try {
        prompt = await readJson<AcvpPrompt>(join(basePath, "prompt.json"));
        expected = await readJson<AcvpExpected>(join(basePath, "expectedResults.json"));
    } catch (e: unknown) {
        return { run: 0, failMsg: `failed to load vectors: ${(e as Error).message}` };
    }

    const expectedMap = new Map<number, Map<number, AcvpExpectedTest>>();
    for (const g of expected.testGroups) {
        const tcMap = new Map<number, AcvpExpectedTest>();
        for (const t of g.tests) {
            tcMap.set(t.tcId, t);
        }
        expectedMap.set(g.tgId, tcMap);
    }

    const allocFn = loaded.exports["alloc"] as (n: number) => number;
    const freeFn = loaded.exports["free"] as (ptr: number, n: number) => void;
    let run = 0;

    for (const group of prompt.testGroups) {
        if (group.direction !== "encrypt") continue;
        const tcMap = expectedMap.get(group.tgId);
        if (!tcMap) continue;

        for (const test of group.tests) {
            const exp = tcMap.get(test.tcId);
            if (!exp || typeof exp.ct !== "string" || typeof exp.tag !== "string") continue;

            const keyBytes = fromHex(test.key ?? "");
            const ivBytes = fromHex(test.iv ?? "");
            const aadBytes = fromHex(test.aad ?? "");
            const ptBytes = fromHex(test.pt ?? "");
            const expectedCt = fromHex(exp.ct);
            const expectedTag = fromHex(exp.tag);
            const tagLen = expectedTag.length;

            // Allocate output buffers
            const ctOutPtr = allocFn(Math.max(ptBytes.length, 1));
            const tagOutPtr = allocFn(tagLen);

            try {
                const keyAlloc = host.withBytes(loaded, keyBytes);
                const ivAlloc = host.withBytes(loaded, ivBytes);
                const aadAlloc = host.withBytes(loaded, aadBytes);
                const ptAlloc = host.withBytes(loaded, ptBytes);

                let status: number;
                try {
                    status = host.run(loaded, encryptFn, [
                        keyAlloc.ptr, keyAlloc.len,
                        ivAlloc.ptr, ivAlloc.len,
                        aadAlloc.ptr, aadAlloc.len,
                        ptAlloc.ptr, ptAlloc.len,
                        ctOutPtr,
                        tagOutPtr, tagLen,
                    ]);
                } finally {
                    ptAlloc.free();
                    aadAlloc.free();
                    ivAlloc.free();
                    keyAlloc.free();
                }

                if (status !== 0) {
                    return {
                        run,
                        failMsg: `tg=${group.tgId} tc=${test.tcId}: encrypt returned status ${status}`,
                    };
                }

                const actualCt = host.readBytes(loaded, ctOutPtr, ptBytes.length);
                const mismatchCt = firstMismatch(actualCt, expectedCt);
                if (mismatchCt !== -1) {
                    return {
                        run,
                        failMsg:
                            `tg=${group.tgId} tc=${test.tcId}: ct mismatch at offset ${mismatchCt}`,
                    };
                }

                const actualTag = host.readBytes(loaded, tagOutPtr, tagLen);
                const mismatchTag = firstMismatch(actualTag, expectedTag);
                if (mismatchTag !== -1) {
                    return {
                        run,
                        failMsg:
                            `tg=${group.tgId} tc=${test.tcId}: tag mismatch at offset ${mismatchTag}`,
                    };
                }

                // Tamper-reject: flip one bit in the ciphertext
                const tamperedCt = new Uint8Array(actualCt);
                const firstCtByte = tamperedCt[0];
                if (firstCtByte !== undefined) {
                    tamperedCt[0] = firstCtByte ^ 0x01;
                }

                // Allocate plaintext output buffer for decrypt
                const ptOutPtr = allocFn(Math.max(ptBytes.length, 1));
                try {
                    const keyAlloc2 = host.withBytes(loaded, keyBytes);
                    const ivAlloc2 = host.withBytes(loaded, ivBytes);
                    const aadAlloc2 = host.withBytes(loaded, aadBytes);
                    const tamperedCtAlloc = host.withBytes(loaded, tamperedCt);
                    const tagAlloc = host.withBytes(loaded, actualTag);

                    let decryptStatus: number;
                    try {
                        decryptStatus = host.run(loaded, decryptFn, [
                            keyAlloc2.ptr, keyAlloc2.len,
                            ivAlloc2.ptr, ivAlloc2.len,
                            aadAlloc2.ptr, aadAlloc2.len,
                            tamperedCtAlloc.ptr, tamperedCtAlloc.len,
                            tagAlloc.ptr, tagAlloc.len,
                            ptOutPtr,
                        ]);
                    } finally {
                        tagAlloc.free();
                        tamperedCtAlloc.free();
                        aadAlloc2.free();
                        ivAlloc2.free();
                        keyAlloc2.free();
                    }

                    if (decryptStatus === 0) {
                        return {
                            run,
                            failMsg:
                                `tg=${group.tgId} tc=${test.tcId}: tamper-reject FAILED — ` +
                                `decrypt accepted tampered ciphertext (status 0)`,
                        };
                    }
                } finally {
                    freeFn(ptOutPtr, Math.max(ptBytes.length, 1));
                }

                run++;
            } finally {
                freeFn(tagOutPtr, tagLen);
                freeFn(ctOutPtr, Math.max(ptBytes.length, 1));
            }
        }
    }

    return { run, failMsg: "" };
}

/**
 * Run AES-GCM ACVP AFT vectors against the FROZEN wasm-crypto ABI actually
 * shipped by `shims/aes.c` (task 03 investigation, BL-1219 — `runAeadVectors`
 * above was written against a call shape that does not match it):
 *
 *   aes_gcm_seal(keyPtr, keyLen, ivPtr, dataPtr, dataLen, aadPtr, aadLen, outPtr) -> i32
 *   aes_gcm_open(keyPtr, keyLen, ivPtr, dataPtr, dataLen, aadPtr, aadLen, outPtr) -> i32
 *
 * Differences from `runAeadVectors`'s shape:
 *   - ONE combined output buffer: `outPtr` receives `ct(dataLen) || tag(16)`
 *     contiguously (seal), and `open` expects that SAME layout at `dataPtr`
 *     (`dataLen` excludes the tag; the tag is read from `dataPtr + dataLen`).
 *   - No `ivLen`/`tagLen` arguments — the IV is a fixed 96-bit (12-byte)
 *     nonce and the tag is always 16 bytes; `br_gcm_reset` only ever reads
 *     12 bytes from `ivPtr`. A test group outside that shape (measured on
 *     `ACVP-AES-GCM-1.0/prompt.json`: a 120-bit-IV/32-bit-tag group exists
 *     alongside the standard 96-bit-IV/128-bit-tag one) cannot be run
 *     through this export and is SKIPPED per test, not failed — the earlier
 *     96-bit-IV/128-bit-tag group still verifies for real.
 */
async function runAeadSealOpenVectors(
    loaded: LoadedWasm,
    host: AbiHost,
    vectorPath: string,
    encryptFn: string,
    decryptFn: string,
): Promise<{ run: number; failMsg: string }> {
    const basePath = resolveVectorDir(vectorPath);
    let prompt: AcvpPrompt;
    let expected: AcvpExpected;

    try {
        prompt = await readJson<AcvpPrompt>(join(basePath, "prompt.json"));
        expected = await readJson<AcvpExpected>(join(basePath, "expectedResults.json"));
    } catch (e: unknown) {
        return { run: 0, failMsg: `failed to load vectors: ${(e as Error).message}` };
    }

    const expectedMap = new Map<number, Map<number, AcvpExpectedTest>>();
    for (const g of expected.testGroups) {
        const tcMap = new Map<number, AcvpExpectedTest>();
        for (const t of g.tests) {
            tcMap.set(t.tcId, t);
        }
        expectedMap.set(g.tgId, tcMap);
    }

    const allocFn = loaded.exports["alloc"] as (n: number) => number;
    const freeFn = loaded.exports["free"] as (ptr: number, n: number) => void;

    const IV_LEN = 12;
    const TAG_LEN = 16;
    let run = 0;
    let warnedShape = false;

    for (const group of prompt.testGroups) {
        if (group.direction !== "encrypt") continue;
        const tcMap = expectedMap.get(group.tgId);
        if (!tcMap) continue;

        for (const test of group.tests) {
            const exp = tcMap.get(test.tcId);
            if (!exp || typeof exp.ct !== "string" || typeof exp.tag !== "string") continue;

            const keyBytes = fromHex(test.key ?? "");
            const ivBytes = fromHex(test.iv ?? "");
            const aadBytes = fromHex(test.aad ?? "");
            const ptBytes = fromHex(test.pt ?? "");
            const expectedCt = fromHex(exp.ct);
            const expectedTag = fromHex(exp.tag);

            if (ivBytes.length !== IV_LEN || expectedTag.length !== TAG_LEN) {
                if (!warnedShape) {
                    process.stderr.write(
                        "verify: aes — skipping test group(s) outside the fixed " +
                        `96-bit-IV/128-bit-tag ABI shape (e.g. iv=${ivBytes.length * 8}b ` +
                        `tag=${expectedTag.length * 8}b)\n`,
                    );
                    warnedShape = true;
                }
                continue;
            }

            const ptLen = ptBytes.length;
            const sealOutPtr = allocFn(ptLen + TAG_LEN);
            try {
                const keyAlloc = host.withBytes(loaded, keyBytes);
                const ivAlloc = host.withBytes(loaded, ivBytes);
                const aadAlloc = host.withBytes(loaded, aadBytes);
                const ptAlloc = host.withBytes(loaded, ptBytes);

                let status: number;
                try {
                    status = host.run(loaded, encryptFn, [
                        keyAlloc.ptr, keyAlloc.len,
                        ivAlloc.ptr,
                        ptAlloc.ptr, ptAlloc.len,
                        aadAlloc.ptr, aadAlloc.len,
                        sealOutPtr,
                    ]);
                } finally {
                    ptAlloc.free();
                    aadAlloc.free();
                    ivAlloc.free();
                    keyAlloc.free();
                }

                if (status !== 0) {
                    return {
                        run,
                        failMsg: `tg=${group.tgId} tc=${test.tcId}: encrypt returned status ${status}`,
                    };
                }

                const sealed = host.readBytes(loaded, sealOutPtr, ptLen + TAG_LEN);
                const actualCt = sealed.slice(0, ptLen);
                const actualTag = sealed.slice(ptLen);

                const mismatchCt = firstMismatch(actualCt, expectedCt);
                if (mismatchCt !== -1) {
                    return {
                        run,
                        failMsg:
                            `tg=${group.tgId} tc=${test.tcId}: ct mismatch at offset ${mismatchCt}`,
                    };
                }

                const mismatchTag = firstMismatch(actualTag, expectedTag);
                if (mismatchTag !== -1) {
                    return {
                        run,
                        failMsg:
                            `tg=${group.tgId} tc=${test.tcId}: tag mismatch at offset ${mismatchTag}`,
                    };
                }

                // Tamper-reject: flip one bit anywhere in the sealed buffer
                // (ct||tag — a single contiguous allocation) and expect
                // open() to reject it.
                const tampered = new Uint8Array(sealed);
                const firstByte = tampered[0];
                if (firstByte !== undefined) {
                    tampered[0] = firstByte ^ 0x01;
                }

                const openOutPtr = allocFn(Math.max(ptLen, 1));
                try {
                    const keyAlloc2 = host.withBytes(loaded, keyBytes);
                    const ivAlloc2 = host.withBytes(loaded, ivBytes);
                    const aadAlloc2 = host.withBytes(loaded, aadBytes);
                    const tamperedAlloc = host.withBytes(loaded, tampered);

                    let decryptStatus: number;
                    try {
                        decryptStatus = host.run(loaded, decryptFn, [
                            keyAlloc2.ptr, keyAlloc2.len,
                            ivAlloc2.ptr,
                            tamperedAlloc.ptr, ptLen,
                            aadAlloc2.ptr, aadAlloc2.len,
                            openOutPtr,
                        ]);
                    } finally {
                        tamperedAlloc.free();
                        aadAlloc2.free();
                        ivAlloc2.free();
                        keyAlloc2.free();
                    }

                    if (decryptStatus === 0) {
                        return {
                            run,
                            failMsg:
                                `tg=${group.tgId} tc=${test.tcId}: tamper-reject FAILED — ` +
                                `decrypt accepted tampered ciphertext (status 0)`,
                        };
                    }
                } finally {
                    freeFn(openOutPtr, Math.max(ptLen, 1));
                }

                run++;
            } finally {
                freeFn(sealOutPtr, ptLen + TAG_LEN);
            }
        }
    }

    return { run, failMsg: "" };
}

/**
 * Extract the fixed digest size (bits) an ACVP vector-folder name encodes,
 * e.g. `.../SHA2-384-1.0/prompt.json` -> 384, `.../SHA3-256-2.0/...` -> 256.
 * Returns `null` for a folder that names no fixed size — the one real case
 * on this tree is a SHAKE (XOF) folder, whose per-test `outLen` varies and
 * is not representable as a single fixed digest length (task 03
 * investigation, BL-1219: not yet supported by this runner).
 */
function parseFixedDigestBits(vectorPath: string, familyPrefix: "SHA2" | "SHA3"): number | null {
    const m = new RegExp(`${familyPrefix}-(\\d+)-`, "i").exec(vectorPath);
    return m && m[1] ? Number(m[1]) : null;
}

/**
 * Whether `runTargetVectors` has a runner for this algo spelling. Used only
 * to print the honest "these families have no runner yet" summary line
 * (task 03, item 3; BL-1219) — mirrors the branch conditions in
 * `runTargetVectors` exactly, kept side-by-side rather than refactored into
 * it to avoid touching the already-tested per-size dispatch paths.
 */
function hasRunner(algo: string): boolean {
    const a = algo.toLowerCase();
    return (
        a === "sha256" || a === "sha2-256" ||
        a === "sha384" || a === "sha2-384" ||
        a === "sha512" || a === "sha2-512" ||
        a === "sha2" ||
        a === "sha3-256" || a === "sha3_256" ||
        a === "sha3-384" || a === "sha3_384" ||
        a === "sha3-512" || a === "sha3_512" ||
        a === "sha3" ||
        a === "aes_gcm" || a === "aes-gcm" ||
        a === "aes"
    );
}

/**
 * Dispatch vector runner for a single target based on its algo family.
 *
 * Each algorithm's vector mapping (which ACVP file, which fields, which exports)
 * is documented inline below.
 *
 * Supported families:
 *   sha256, sha384, sha512, sha3_256, sha3_384, sha3_512 (legacy per-size
 *   spellings — kept dispatching for any target still spelled this way)
 *     → hash AFT vectors; export: `sha256_hash` / `sha384_hash` / etc.
 *   aes_gcm / aes-gcm (legacy per-size spelling)
 *     → AEAD AFT vectors; exports: `aes_gcm_encrypt`, `aes_gcm_decrypt`
 *   sha2, sha3, aes (the BARE family names `targets.json` actually declares
 *   — task 03, BL-1219)
 *     → sha2: one combined export `sha2(variantId, inPtr, inLen, outPtr)`;
 *       the variant (256/384/512) is read from the VECTOR FOLDER name, not
 *       from `algo` (constant "sha2" across all three vector paths).
 *     → sha3: one combined export `sha3(variantId, inPtr, inLen, outPtr,
 *       outLen)`; fixed-digest folders (SHA3-224/256/384/512) dispatch the
 *       same way as sha2. A SHAKE (XOF) folder is recognized and skipped
 *       honestly — its per-test variable output length is not yet supported.
 *     → aes: real exports are `aes_gcm_seal`/`aes_gcm_open` with a combined
 *       ct||tag output buffer and a fixed 96-bit IV/128-bit tag — see
 *       `runAeadSealOpenVectors`.
 *
 * Unknown families (the 14 without any runner): skip with a note; also
 * named once, in aggregate, by `run()`'s coverage line.
 */
async function runTargetVectors(
    target: Target,
    loaded: LoadedWasm,
    host: AbiHost,
): Promise<{ run: number; failMsg: string }> {
    let totalRun = 0;

    for (const vectorPath of target.vectors) {
        let result: { run: number; failMsg: string };

        const algo = target.algo.toLowerCase();

        if (
            algo === "sha256" ||
            algo === "sha2-256" ||
            algo === "sha384" ||
            algo === "sha2-384" ||
            algo === "sha512" ||
            algo === "sha2-512"
        ) {
            // Hash family: SHA-2
            // ACVP path: references/NIST/ACVP-Server-*/gen-val/json-files/SHA2-256-1.0/
            // Fields: prompt.testGroups[].tests[].{msg, len}
            //         expected.testGroups[].tests[].{md}
            // Wasm export: `hash(msgPtr, msgLen, outPtr) -> i32`
            const digestLenMap: Record<string, number> = {
                sha256: 32, "sha2-256": 32,
                sha384: 48, "sha2-384": 48,
                sha512: 64, "sha2-512": 64,
            };
            const digestLen = digestLenMap[algo] ?? 32;
            const exportFn = target.exports.find(e => e !== "memory" && e !== "alloc" && e !== "free") ?? `${algo}_hash`;
            result = await runHashVectors(loaded, host, vectorPath, exportFn, digestLen);
        } else if (
            algo === "sha3-256" ||
            algo === "sha3_256" ||
            algo === "sha3-384" ||
            algo === "sha3_384" ||
            algo === "sha3-512" ||
            algo === "sha3_512"
        ) {
            // Hash family: SHA-3
            const digestLenMap: Record<string, number> = {
                "sha3-256": 32, "sha3_256": 32,
                "sha3-384": 48, "sha3_384": 48,
                "sha3-512": 64, "sha3_512": 64,
            };
            const digestLen = digestLenMap[algo] ?? 32;
            const exportFn = target.exports.find(e => e !== "memory" && e !== "alloc" && e !== "free") ?? `${algo}_hash`;
            result = await runHashVectors(loaded, host, vectorPath, exportFn, digestLen);
        } else if (algo === "aes_gcm" || algo === "aes-gcm") {
            // AEAD family: AES-GCM
            // ACVP path: references/NIST/ACVP-Server-*/gen-val/json-files/ACVP-AES-GCM-1.0/
            // Fields: prompt.testGroups[]{direction, tests[]{key, iv, aad, pt}}
            //         expected.testGroups[]{tests[]{ct, tag}}
            // Wasm exports: `aes_gcm_encrypt`, `aes_gcm_decrypt`
            result = await runAeadVectors(loaded, host, vectorPath, "aes_gcm_encrypt", "aes_gcm_decrypt");
        } else if (algo === "sha2") {
            // Bare family (targets.json's real spelling). One combined wasm
            // export `sha2(variantId, inPtr, inLen, outPtr)` covers all three
            // sizes — the size is selected by variantId (== bits), not
            // inferred from `algo` (constant "sha2" for all three vector
            // paths). task 03 investigation (BL-1219): the runner keys off
            // the VECTOR FOLDER name here, not the algo string.
            const bits = parseFixedDigestBits(vectorPath, "SHA2");
            if (bits === null || (bits !== 256 && bits !== 384 && bits !== 512)) {
                process.stderr.write(
                    `verify: sha2 vector path names no recognized size — skipping '${vectorPath}'\n`,
                );
                result = { run: 0, failMsg: "" };
            } else {
                const exportFn = target.exports.find(e => e !== "memory" && e !== "alloc" && e !== "free") ?? "sha2";
                result = await runHashVectors(loaded, host, vectorPath, exportFn, bits / 8,
                    (inPtr, inLen, outPtr) => [bits, inPtr, inLen, outPtr]);
            }
        } else if (algo === "sha3") {
            // Bare family. One combined export `sha3(variantId, inPtr, inLen,
            // outPtr, outLen)` — fixed-digest variants (SHA3-224/256/384/512,
            // variantId 0..3) ignore outLen; SHAKE128/256 (variantId 4/5) are
            // XOFs whose output length is declared PER TEST (ACVP `outLen`,
            // variable), not by the vector folder — this runner does not
            // implement that yet (task 03 investigation, BL-1219) and skips
            // such a vector path honestly rather than guessing a length.
            const bits = parseFixedDigestBits(vectorPath, "SHA3");
            const fixedVariantId = bits === null
                ? undefined
                : ({ 224: 0, 256: 1, 384: 2, 512: 3 } as Record<number, number>)[bits];
            if (bits === null || fixedVariantId === undefined) {
                process.stderr.write(
                    "verify: skipping variable-length (XOF) vector path for sha3 — " +
                    `not yet supported: '${vectorPath}'\n`,
                );
                result = { run: 0, failMsg: "" };
            } else {
                const exportFn = target.exports.find(e => e !== "memory" && e !== "alloc" && e !== "free") ?? "sha3";
                const digestLen = bits / 8;
                result = await runHashVectors(loaded, host, vectorPath, exportFn, digestLen,
                    (inPtr, inLen, outPtr, outLen) => [fixedVariantId, inPtr, inLen, outPtr, outLen]);
            }
        } else if (algo === "aes") {
            // Bare family. Real exports are `aes_gcm_seal`/`aes_gcm_open`
            // (NOT `aes_gcm_encrypt`/`aes_gcm_decrypt` — the legacy 'aes_gcm'
            // spelling above predates this discovery and keeps dispatching to
            // its own, unchanged runner). The frozen ABI takes ONE combined
            // output buffer (ct || 16-byte tag) and a fixed 96-bit IV with no
            // ivLen argument — see runAeadSealOpenVectors.
            result = await runAeadSealOpenVectors(loaded, host, vectorPath, "aes_gcm_seal", "aes_gcm_open");
        } else {
            // Unknown algo family — skip with a note (no failure)
            process.stderr.write(
                `verify: skipping vectors for unknown algo family '${algo}' (target ${target.wasmModule})\n`,
            );
            result = { run: 0, failMsg: "" };
        }

        if (result.failMsg) {
            return { run: totalRun + result.run, failMsg: result.failMsg };
        }
        totalRun += result.run;
    }

    return { run: totalRun, failMsg: "" };
}

// ─── Table rendering ──────────────────────────────────────────────────────────

/** Print a fixed-column results table to stdout. */
function printTable(results: TargetResult[]): void {
    const cols = { target: 20, vectors: 12, result: 8 };
    const header =
        "target".padEnd(cols.target) +
        "vectors".padEnd(cols.vectors) +
        "result";
    const sep = "-".repeat(header.length);

    process.stdout.write(`${header}\n${sep}\n`);
    for (const r of results) {
        const line =
            r.wasmModule.padEnd(cols.target) +
            String(r.vectorsRun).padEnd(cols.vectors) +
            (r.pass ? (r.skipped ? "SKIP" : "PASS") : "FAIL");
        process.stdout.write(`${line}\n`);
    }
    process.stdout.write(`${sep}\n`);

    // Three counts, never a bare "N/N passed": a skipped target verified
    // nothing, so folding it into the pass count reports evidence that
    // does not exist.
    const skipped = results.filter(r => r.skipped).length;
    const failed = results.filter(r => !r.pass).length;
    const verified = results.length - skipped - failed;
    const total = results.length;
    process.stdout.write(
        `${verified} verified / ${skipped} skipped / ${failed} failed of ${total} targets\n`,
    );
    if (verified === 0 && total > 0) {
        process.stdout.write(
            "verify: NOTHING VERIFIED — every selected target was skipped or failed\n",
        );
    }
}

// ─── Main entry point ─────────────────────────────────────────────────────────

/**
 * Run the verify subcommand.
 *
 * Usage: verify [--target <wasmModule>]
 *
 * @param args - Remaining CLI arguments after "verify".
 * @param cfg  - Resolved tool configuration.
 * @returns Exit code: 0 if all vectors pass, 1 on any mismatch or error.
 */
export async function run(args: string[], cfg: WasmCryptoConfig): Promise<number> {
    // Parse --target flag
    let filterTarget: string | null = null;
    for (let i = 0; i < args.length; i++) {
        if ((args[i] === "--target" || args[i] === "-t") && i + 1 < args.length) {
            filterTarget = args[i + 1] ?? null;
            i++;
        }
    }

    // Load targets.json
    const targetsPath = resolvePath(cfg.targetsFile);
    const targetsFile = Bun.file(targetsPath);
    if (!(await targetsFile.exists())) {
        process.stderr.write(
            `verify: targets file not found: ${targetsPath}\n` +
            `  Pass --pkg <dir>, or set 'targetsFile' in config.\n`,
        );
        return 1;
    }

    let targets: Target[];
    try {
        const json: unknown = JSON.parse(await targetsFile.text());
        targets = validateTargets(json);
    } catch (e: unknown) {
        process.stderr.write(`verify: invalid targets file: ${(e as Error).message}\n`);
        return 1;
    }

    // Apply --target filter
    if (filterTarget !== null) {
        targets = targets.filter(t => t.wasmModule === filterTarget);
        if (targets.length === 0) {
            process.stderr.write(
                `verify: no target named '${filterTarget}' in ${cfg.targetsFile}\n`,
            );
            return 1;
        }
    }

    if (targets.length === 0) {
        process.stdout.write("verify: no targets defined — nothing to verify\n");
        return 0;
    }

    // Honesty: name every family among the SELECTED targets that has no
    // runner yet, so the operator sees the gap instead of inferring it from
    // a bare count (task 03, item 3; BL-1219). `verify` covers 3 of the 17
    // declared families — the publication gate's evidence is the KAT shims
    // (task 02), not this command.
    const noRunnerFamilies = Array.from(
        new Set(targets.filter(t => !hasRunner(t.algo)).map(t => t.algo)),
    ).sort();
    if (noRunnerFamilies.length > 0) {
        process.stderr.write(
            `verify: no runner for ${noRunnerFamilies.length} algo famil${noRunnerFamilies.length === 1 ? "y" : "ies"}` +
            ` — reported as skipped: ${noRunnerFamilies.join(", ")}\n`,
        );
    }

    const host = new AbiHost();
    const results: TargetResult[] = [];

    for (const target of targets) {
        // Skip targets that have no vectors declared
        if (target.vectors.length === 0) {
            process.stderr.write(
                `verify: target '${target.wasmModule}' has no vectors — skipping\n`,
            );
            results.push({
                wasmModule: target.wasmModule,
                algo: target.algo,
                vectorsRun: 0,
                pass: true,
                skipped: true,
                reason: "no vectors",
            });
            continue;
        }

        // Try to load the compiled wasm module
        let loaded: LoadedWasm | null;
        try {
            loaded = await loadWasmModule(target.wasmModule, target.exportName, cfg.outDir, host);
        } catch (e: unknown) {
            process.stderr.write(
                `verify: failed to load '${target.wasmModule}.wasm.js': ${(e as Error).message}\n`,
            );
            results.push({
                wasmModule: target.wasmModule,
                algo: target.algo,
                vectorsRun: 0,
                pass: false,
                skipped: false,
                reason: `load error: ${(e as Error).message}`,
            });
            continue;
        }

        if (loaded === null) {
            // wasm.js not built yet — skip with message (gate real binaries on presence)
            process.stderr.write(
                `verify: '${target.wasmModule}.wasm.js' not found in '${cfg.outDir}' — skipping ` +
                `(run 'build' first)\n`,
            );
            results.push({
                wasmModule: target.wasmModule,
                algo: target.algo,
                vectorsRun: 0,
                pass: true,
                skipped: true,
                reason: "wasm not built (skipped)",
            });
            continue;
        }

        // Run vectors
        const { run: vectorsRun, failMsg } = await runTargetVectors(target, loaded, host);

        if (failMsg) {
            process.stderr.write(`verify: FAIL ${target.wasmModule}: ${failMsg}\n`);
            results.push({
                wasmModule: target.wasmModule,
                algo: target.algo,
                vectorsRun,
                pass: false,
                skipped: false,
                reason: failMsg,
            });
        } else if (vectorsRun === 0) {
            // Vectors declared but none matched the runner (unknown algo, or vector file empty)
            results.push({
                wasmModule: target.wasmModule,
                algo: target.algo,
                vectorsRun: 0,
                pass: true,
                skipped: true,
                reason: "no vectors matched",
            });
        } else {
            results.push({
                wasmModule: target.wasmModule,
                algo: target.algo,
                vectorsRun,
                pass: true,
                skipped: false,
                reason: "",
            });
        }
    }

    printTable(results);

    const allPass = results.every(r => r.pass);
    const verified = results.filter(r => r.pass && !r.skipped).length;

    // Fail closed on a vacuous run: targets WERE selected, yet none of them was
    // actually verified. Reporting 0 with exit 0 is a gate printing a pass it
    // did not earn — `pkg-export`'s `freshness:wasm-crypto-verify` consumes this
    // exit code. The "no targets defined" branch above is a different case and
    // keeps its exit 0: nothing was asked for, so nothing is owed.
    if (verified === 0) {
        process.stderr.write(
            "verify: nothing was verified — 0 of " +
            `${results.length} selected target(s) ran a vector\n`,
        );
        return 1;
    }

    return allPass ? 0 : 1;
}
