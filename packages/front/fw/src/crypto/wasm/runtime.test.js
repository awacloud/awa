// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { describe, test, expect } from 'bun:test';
import { join, resolve } from 'path';
import { wasmRuntime } from './runtime.js';

// ── helpers ──────────────────────────────────────────────────────────────────

/**
 * A pinned, hand-assembled wasm32 module used to exercise the marshalling +
 * ABI handshake WITHOUT any real crypto binary. It is a freestanding (zero
 * import) reactor exporting the canonical ABI triple plus two algo-style
 * functions over linear memory:
 *   - `memory`             — exported WebAssembly.Memory (1 page)
 *   - `alloc(size) -> ptr` — bump allocator (starts at 1024)
 *   - `free(ptr) -> void`  — no-op release boundary
 *   - `sum(ptr, len) -> i32`  — sum of the `len` bytes at `ptr` (proves bytes
 *                                were copied INTO memory by `withBytes`)
 *   - `incr(ptr, len) -> i32` — add 1 to each of the `len` bytes in place,
 *                                returns 0 (lets `readBytes` prove an OUT copy)
 * (Source WAT assembled offline; see the task report for the assembler.)
 */
const ABI_MIN_B64 =
    'AGFzbQEAAAABEANgAX8Bf2ABfwBgAn9/AX8DBQQAAQICBQMBAAEGBwF/AUGACAsHJgUG' +
    'bWVtb3J5AgAFYWxsb2MAAARmcmVlAAEDc3VtAAIEaW5jcgADCnAEEQEBfyMAIQEjACAA' +
    'aiQAIAELAgALKQECfwJAA0AgAiABTw0BIAMgACACai0AAGohAyACQQFqIQIMAAsLIAML' +
    'LwEBfwJAA0AgAiABTw0BIAAgAmogACACai0AAEEBajoAACACQQFqIQIMAAsLQQAL';

/** Decode a base64 string to a Uint8Array (no Buffer dependency in fw). */
function b64ToBytes(b64) {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) {
        out[i] = bin.charCodeAt(i);
    }
    return out;
}

const ABI_MIN = b64ToBytes(ABI_MIN_B64);

/**
 * Build a `{ fetchBytes }` opts seam (the loader's injectable byte source) that
 * always yields the given bytes, regardless of module name / variant. This is
 * how the test loads a module BY NAME through the runtime without touching the
 * real dist binaries.
 */
const give = (bytes) => ({ variant: 'scalar', fetchBytes: async () => bytes });

// ── module-level instance ────────────────────────────────────────────────────

const _rt = wasmRuntime.factory();

// ── module metadata ──────────────────────────────────────────────────────────

describe('wasmRuntime — module metadata', () => {
    test('name', () => {
        expect(wasmRuntime.name).toBe('wasmRuntime');
    });

    test('type', () => {
        expect(wasmRuntime.type).toBe('fw.crypto.wasm');
    });

    test('dependencies is empty array', () => {
        expect(wasmRuntime.dependencies).toEqual([]);
    });

    test('deps is absent (no dependencies)', () => {
        expect(wasmRuntime.deps).toBeUndefined();
    });

    test('factory is a function', () => {
        expect(typeof wasmRuntime.factory).toBe('function');
    });
});

// ── API shape ────────────────────────────────────────────────────────────────

describe('wasmRuntime — API shape', () => {
    test('exposes the prescribed surface, all functions', () => {
        for (const m of ['isAvailable', 'hasSimd', 'load', 'withBytes', 'readBytes', 'run']) {
            expect(typeof _rt[m]).toBe('function');
        }
    });

    test('exposes no caller-bytes compile/instantiate escape hatch', () => {
        // Security invariant: only load-by-NAME is public. Assert no member
        // that would accept raw bytes to compile/instantiate.
        const keys = Object.keys(_rt);
        for (const banned of ['compile', 'instantiate', 'loadBytes', 'fromBytes', 'eval']) {
            expect(keys).not.toContain(banned);
        }
    });
});

// ── availability + simd detection ─────────────────────────────────────────────

describe('wasmRuntime — isAvailable / hasSimd', () => {
    test('isAvailable returns a boolean (true in this runtime)', () => {
        const v = _rt.isAvailable();
        expect(typeof v).toBe('boolean');
        expect(v).toBe(typeof WebAssembly !== 'undefined');
    });

    test('hasSimd resolves a boolean', async () => {
        const v = await _rt.hasSimd();
        expect(typeof v).toBe('boolean');
    });

    test('hasSimd is stable across calls', async () => {
        const a = await _rt.hasSimd();
        const b = await _rt.hasSimd();
        expect(a).toBe(b);
    });
});

// ── load + marshalling round-trip (ABI handshake) ─────────────────────────────

describe('wasmRuntime — load + withBytes/readBytes round-trip', () => {
    test('load by name resolves a handle exposing the ABI triple', async () => {
        const h = await _rt.load('abi-min', ['sum', 'incr'], give(ABI_MIN));
        expect(h).not.toBe(false);
        expect(h.memory).toBeInstanceOf(WebAssembly.Memory);
        expect(typeof h.alloc).toBe('function');
        expect(typeof h.free).toBe('function');
        expect(h.mem).toBe(h.memory); // fw alias
        expect(typeof h.exports.sum).toBe('function');
        expect(h.variant).toBe('scalar');
    });

    test('withBytes copies INTO memory; run reads it back (sum); readBytes copies OUT', async () => {
        const h = await _rt.load('abi-min', ['sum', 'incr'], give(ABI_MIN));
        expect(h).not.toBe(false);

        const input = new Uint8Array([1, 2, 3, 250]);
        const buf = _rt.withBytes(h, input);
        try {
            // sum over the copied-in bytes proves the IN marshalling worked.
            expect(_rt.run(h, 'sum', [buf.ptr, buf.len])).toBe(256);

            // incr mutates memory in place; readBytes must observe the mutation
            // as a fresh copy (proving an OUT copy, not the input array).
            expect(_rt.run(h, 'incr', [buf.ptr, buf.len])).toBe(0);
            const out = _rt.readBytes(h, buf.ptr, buf.len);
            expect(Array.from(out)).toEqual([2, 3, 4, 251]);
            expect(out).toBeInstanceOf(Uint8Array);
        } finally {
            buf.free();
        }
    });

    test('readBytes returns a fresh copy that does NOT alias WASM memory', async () => {
        const h = await _rt.load('abi-min', ['sum', 'incr'], give(ABI_MIN));
        const buf = _rt.withBytes(h, new Uint8Array([10, 20, 30, 40]));
        try {
            const out = _rt.readBytes(h, buf.ptr, buf.len);
            // mutate memory after reading; the returned copy must be unaffected.
            _rt.run(h, 'incr', [buf.ptr, buf.len]);
            expect(Array.from(out)).toEqual([10, 20, 30, 40]);
            // and its backing buffer is not the module's memory buffer.
            expect(out.buffer).not.toBe(h.memory.buffer);
        } finally {
            buf.free();
        }
    });

    test('withBytes rejects a non-Uint8Array input', async () => {
        const h = await _rt.load('abi-min', ['sum'], give(ABI_MIN));
        expect(() => _rt.withBytes(h, [1, 2, 3])).toThrow(TypeError);
    });
});

// ── no-throw failure paths (load resolves false, never rejects) ───────────────

describe('wasmRuntime — load no-throw contract', () => {
    test('an ABI miss (missing expected export) resolves false, does not reject', async () => {
        const r = await _rt.load('abi-min', ['does_not_exist'], give(ABI_MIN));
        expect(r).toBe(false);
    });

    test('a fetch/compile rejection resolves false, does not reject', async () => {
        const r = await _rt.load('whatever', ['sum'], {
            variant: 'scalar',
            fetchBytes: async () => {
                throw new Error('synthetic fetch failure');
            },
        });
        expect(r).toBe(false);
    });

    test('invalid wasm bytes resolve false, do not reject', async () => {
        const r = await _rt.load('garbage', ['sum'], give(new Uint8Array([0, 1, 2, 3])));
        expect(r).toBe(false);
    });
});

// ── run wrapper ───────────────────────────────────────────────────────────────

describe('wasmRuntime — run', () => {
    test('throws TypeError for a non-existent export (caught by the wrapper layer)', async () => {
        const h = await _rt.load('abi-min', ['sum'], give(ABI_MIN));
        expect(() => _rt.run(h, 'nope', [0, 0])).toThrow(TypeError);
    });
});

// ── lockdown gating (disposable-realm subprocess) ──────────────────────────────
//
// task 03 — wasm-runtime-gating: `load()` now routes compile/instantiate/
// module-reflection through the fw wasm capability seam (`sanity/wasm-gate.js`,
// task 02) instead of the bare `WebAssembly.*` globals. `lockdown()` freezes the
// running realm's shared intrinsics and poisons `WebAssembly.Module`/`Instance`
// irreversibly — corrupting every later test in the same process (memory
// 2026-06-15) — so both directions run in a throwaway `bun -e` subprocess that
// prints ONE JSON line (`{ ok, checks, info }`); the parent asserts on the
// parsed result. Realm P is pre-lockdown (regression guard: gating changes
// nothing); realm L is locked (the W1 point: fw's own crypto works again).

const HERE = import.meta.dir;
const RUNTIME = JSON.stringify(join(HERE, 'runtime.js'));
const LOCKDOWN = JSON.stringify(resolve(HERE, '..', '..', 'sanity', 'lockdown.js'));

// FIPS 180-4 SHA-256("abc") — same vector task 02's gate test verifies.
const SHA256_ABC = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';

// The exact, ratified `fetchBytes`-under-lockdown message (FINDINGS §d.4,
// `sanity/wasm-gate.js`'s `assertByteSource`).
const FETCHBYTES_MSG =
    'lockdown: wasmRuntime opts.fetchBytes is neutralised under lockdown '
    + '(test-only seam); thread an absolute base URL instead';

const PRELUDE = `
const out = process.stdout; const write = out.write.bind(out); write('');
const checks = {}; const info = {};
function T(l, v) { checks[l] = v === true; }
function hex(u8) { return Array.from(u8).map((b) => b.toString(16).padStart(2, '0')).join(''); }
function finish() { write(JSON.stringify({ ok: Object.values(checks).every(Boolean), checks, info })); }
async function digestAbc(rt, h) {
  const inBuf = rt.withBytes(h, new TextEncoder().encode('abc'));
  const outPtr = h.alloc(32);
  const status = rt.run(h, 'sha2', [256, inBuf.ptr, inBuf.len, outPtr]);
  const digest = hex(rt.readBytes(h, outPtr, 32));
  inBuf.free();
  h.free(outPtr);
  return { status, digest };
}
`;

// ── Realm P — PRE-LOCKDOWN: regression guard that gating changed nothing ──────
const PROBE_PRE = `
import { wasmRuntime } from ${RUNTIME};
${PRELUDE}

const rt = wasmRuntime.factory();
const h = await rt.load('sha2', ['sha2'], { variant: 'scalar' });
T('load_succeeds_before_lockdown', h !== false);
if (h) {
  const { status, digest } = await digestAbc(rt, h);
  info.digest = digest;
  T('sha2_status_ok', status === 0);
  T('digest_matches_FIPS_vector', digest === ${JSON.stringify(SHA256_ABC)});
  T('handle_instance_is_object', typeof h.instance === 'object' && h.instance !== null);
}

finish();
`;

// ── Realm L — LOCKED: the W1 point (fw crypto un-broken) + the substitutions ──
const PROBE_LOCKED = `
import { wasmRuntime } from ${RUNTIME};
import { lockdown } from ${LOCKDOWN};
${PRELUDE}

lockdown();

const rt = wasmRuntime.factory();

// ── fw's own crypto works again under lockdown (the W1 point) ───────────────
const h = await rt.load('sha2', ['sha2'], { variant: 'scalar' });
T('load_succeeds_under_lockdown', h !== false);
if (h) {
  const { status, digest } = await digestAbc(rt, h);
  info.digest = digest;
  T('sha2_status_ok', status === 0);
  T('digest_matches_FIPS_vector', digest === ${JSON.stringify(SHA256_ABC)});

  // The handle's instance is usable even though the GLOBAL WebAssembly.Instance
  // binding is now a throwing shim — proving load() stopped type-checking
  // against it (ORCHESTRATOR RULING / FINDINGS §d.6): an instanceof check here
  // would have silently returned false rather than throwing.
  T('handle_instance_is_object', typeof h.instance === 'object' && h.instance !== null);
  T('handle_instance_exports_present', typeof h.instance.exports === 'object');

  let instanceofWouldMisfire = false;
  try { instanceofWouldMisfire = !(h.instance instanceof WebAssembly.Instance); }
  catch { /* if it ever throws instead, the misfire claim is false — leave unset */ }
  T('global_instanceof_check_would_silently_misfire_not_throw', instanceofWouldMisfire);
}

let shimThrew = false;
try { new WebAssembly.Instance({}); } catch { shimThrew = true; }
T('global_WebAssembly_Instance_is_a_throwing_shim', shimThrew);

// ── opts.fetchBytes is neutralised, with the exact task-02 message ──────────
let capturedMsg = null;
const origError = console.error;
console.error = (...args) => { capturedMsg = args.join(' '); };
const blocked = await rt.load('sha2', ['sha2'], {
  variant: 'scalar',
  fetchBytes: async () => new Uint8Array([0, 1, 2, 3]),
});
console.error = origError;
T('fetchBytes_under_lockdown_resolves_false_not_throw', blocked === false);
info.fetchBytes_captured_message = capturedMsg;
T('fetchBytes_under_lockdown_message_is_exact',
  capturedMsg !== null && capturedMsg.indexOf(${JSON.stringify(FETCHBYTES_MSG)}) !== -1);

finish();
`;

/**
 * @param {string} src probe program
 * @returns {{exitCode: number|null, parsed: object|null, stdout: string, stderr: string}}
 */
function runProbe(src) {
    const proc = Bun.spawnSync(['bun', '-e', src], { stdout: 'pipe', stderr: 'pipe' });
    const stdout = proc.stdout?.toString() ?? '';
    let parsed = null;
    try {
        parsed = JSON.parse(stdout.trim().split('\n').pop());
    } catch { /* left null — surfaced by the first test of each realm */ }
    return { exitCode: proc.exitCode, parsed, stdout, stderr: proc.stderr?.toString() ?? '' };
}

/**
 * @param {{exitCode: number|null, parsed: object|null, stdout: string, stderr: string}} r
 * @param {string} realm
 */
function assertRealmRan(r, realm) {
    if (r.exitCode !== 0 || r.parsed === null) {
        throw new Error(
            `realm ${realm} probe failed (exit ${r.exitCode})\n`
            + `stdout: ${r.stdout}\nstderr: ${r.stderr}`,
        );
    }
}

/** @param {object|null} parsed */
function failedChecks(parsed) {
    return Object.entries(parsed?.checks ?? {}).filter(([, v]) => v !== true).map(([k]) => k);
}

describe('wasmRuntime — lockdown gating (disposable realms)', () => {
    describe('realm P — pre-lockdown (regression guard: gating changed nothing)', () => {
        const r = runProbe(PROBE_PRE);

        test('disposable-realm probe exits cleanly and emits JSON', () => {
            assertRealmRan(r, 'P');
            expect(r.exitCode).toBe(0);
        });

        test('every pre-lockdown assertion passed', () => {
            assertRealmRan(r, 'P');
            expect(failedChecks(r.parsed)).toEqual([]);
            expect(r.parsed.ok).toBe(true);
        });

        test('happy path TODAY: real sha2.scalar.wasm digests "abc" to the FIPS 180-4 vector', () => {
            expect(r.parsed?.checks.load_succeeds_before_lockdown).toBe(true);
            expect(r.parsed?.checks.sha2_status_ok).toBe(true);
            expect(r.parsed?.info.digest).toBe(SHA256_ABC);
        });
    });

    describe('realm L — under lockdown (fw crypto un-broken; the substitutions hold)', () => {
        const r = runProbe(PROBE_LOCKED);

        test('disposable-realm probe exits cleanly and emits JSON', () => {
            assertRealmRan(r, 'L');
            expect(r.exitCode).toBe(0);
        });

        test('every under-lockdown assertion passed', () => {
            assertRealmRan(r, 'L');
            expect(failedChecks(r.parsed)).toEqual([]);
            expect(r.parsed.ok).toBe(true);
        });

        test('load + digest succeed under lockdown with the same FIPS vector (the W1 point)', () => {
            expect(r.parsed?.checks.load_succeeds_under_lockdown).toBe(true);
            expect(r.parsed?.checks.sha2_status_ok).toBe(true);
            expect(r.parsed?.info.digest).toBe(SHA256_ABC);
        });

        test('the instance/ABI check passes via the captured Instance while the global shim throws', () => {
            expect(r.parsed?.checks.handle_instance_is_object).toBe(true);
            expect(r.parsed?.checks.handle_instance_exports_present).toBe(true);
            expect(r.parsed?.checks.global_WebAssembly_Instance_is_a_throwing_shim).toBe(true);
            expect(r.parsed?.checks.global_instanceof_check_would_silently_misfire_not_throw).toBe(true);
        });

        test('opts.fetchBytes throws the exact task-02 message (resolved to false, not a rejection)', () => {
            expect(r.parsed?.checks.fetchBytes_under_lockdown_resolves_false_not_throw).toBe(true);
            expect(r.parsed?.checks.fetchBytes_under_lockdown_message_is_exact).toBe(true);
            expect(r.parsed?.info.fetchBytes_captured_message).toContain(FETCHBYTES_MSG);
        });
    });
});
