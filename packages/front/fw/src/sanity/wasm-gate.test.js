// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { describe, test, expect } from 'bun:test';
import { join, resolve } from 'path';

/**
 * sanity/wasm-gate — the FINDINGS §d.5 direction matrix, executed in
 * DISPOSABLE realms.
 *
 * ⚠️ Test-isolation hazard (memory 2026-06-15): `lockdown()` freezes the
 * *running realm's* shared intrinsics and this gate poisons the realm's
 * `WebAssembly.Module`/`Instance` slots — both are irreversible and would
 * corrupt every subsequent test in the same process. Each scenario therefore
 * runs in a throwaway `bun -e` subprocess that prints ONE JSON line
 * (`{ ok, checks, info }`); the parent asserts on the parsed result.
 *
 * Two realms:
 *   P — PRE-LOCKDOWN: no behaviour change before `lockdown()`. The gate is not
 *       armed, `opts.fetchBytes` is still the documented test seam, and the
 *       direct `WebAssembly.*` surface is untouched.
 *   L — LOCKED: both directions of the invariant. fw's OWN vendored bytes still
 *       compile, instantiate and produce the FIPS 180-4 SHA-256 vector through
 *       the gate, while every caller-supplied-bytes route throws.
 */

const HERE = import.meta.dir;
const GATE = JSON.stringify(join(HERE, 'wasm-gate.js'));
const LOCKDOWN = JSON.stringify(join(HERE, 'lockdown.js'));
// Tracked, colocated vendored `@awacloud/fw-wasm-crypto` build artifact (22 `.wasm`
// files live here; runtime.js §Provenance). Read BEFORE lockdown(): freezing
// intrinsics breaks Bun internals that lazily initialise primordials, so the
// harness must not touch node:fs afterwards.
const SHA2_WASM = JSON.stringify(resolve(HERE, '..', 'crypto', 'wasm', 'sha2.scalar.wasm'));

// FIPS 180-4 SHA-256("abc").
const SHA256_ABC = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';

// The exact, ratified neutralisation message (FINDINGS §d.4).
const FETCHBYTES_MSG =
    'lockdown: wasmRuntime opts.fetchBytes is neutralised under lockdown '
    + '(test-only seam); thread an absolute base URL instead';

const PRELUDE = `
const out = process.stdout; const write = out.write.bind(out); write('');
const checks = {}; const info = {};
function T(l, v) { checks[l] = v === true; }
function THROWS(l, fn) {
  let t = false, m = null;
  try { fn(); } catch (e) { t = true; m = String(e && e.message); }
  checks[l] = t; info[l + '_msg'] = m;
}
async function THROWS_ASYNC(l, fn) {
  let t = false, m = null;
  try { await fn(); } catch (e) { t = true; m = String(e && e.message); }
  checks[l] = t; info[l + '_msg'] = m;
}
function hex(u8) { return Array.from(u8).map((b) => b.toString(16).padStart(2, '0')).join(''); }
function finish() { write(JSON.stringify({ ok: Object.values(checks).every(Boolean), checks, info })); }

// A VALID caller-supplied module (magic + version). Being well-formed, a
// rejection can only come from the guard, never from a decode error.
const CALLER_BYTES = new Uint8Array([0x00,0x61,0x73,0x6d,0x01,0x00,0x00,0x00]);
// A RUNNABLE caller-supplied module: (func (export "f") (result i32) i32.const 42).
// Proves arbitrary-wasm EXECUTION, not merely compilation.
const EVIL_BYTES = new Uint8Array([
  0x00,0x61,0x73,0x6d,0x01,0x00,0x00,0x00,
  0x01,0x05,0x01,0x60,0x00,0x01,0x7f,
  0x03,0x02,0x01,0x00,
  0x07,0x05,0x01,0x01,0x66,0x00,0x00,
  0x0a,0x06,0x01,0x04,0x00,0x41,0x2a,0x0b,
]);
function runEvilSync() {
  const m = new WebAssembly.Module(EVIL_BYTES);
  const i = new WebAssembly.Instance(m, {});
  return i.exports.f();
}
// runtime.js's simd128 probe, copied verbatim — it depends on WebAssembly.validate.
const SIMD_PROBE = new Uint8Array([
  0x00,0x61,0x73,0x6d,0x01,0x00,0x00,0x00, 0x01,0x04,0x01,0x60,0x00,0x00,
  0x03,0x02,0x01,0x00, 0x0a,0x17,0x01,0x15,0x00, 0xfd,0x0c,
  0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00, 0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,
  0x1a, 0x0b,
]);
function capabilityLeaked() {
  return Object.getOwnPropertyNames(globalThis).some((k) => {
    try { const v = globalThis[k]; return !!(v && v.__brand === 'fw.wasm.capability'); }
    catch { return false; }
  });
}
`;

// ── Realm P — PRE-LOCKDOWN: nothing changes before lockdown() ────────────────
const PROBE_PRE = `
import * as gate from ${GATE};
${PRELUDE}

const CAP = gate.issueCapability();
T('issueCapability_is_idempotent_identity', gate.issueCapability() === CAP);
T('capability_absent_from_globalThis', !capabilityLeaked());

// The gate is NOT armed: fetchBytes remains the documented test seam.
let seamOk = true;
try { gate.assertByteSource({ fetchBytes: () => {} }); } catch { seamOk = false; }
T('unarmed_assertByteSource_allows_fetchBytes', seamOk);

// Fails CLOSED before the originals are captured (never lazily reads a global).
await THROWS_ASYNC('gate_compile_before_capture_throws', () => gate.compile(CAP, CALLER_BYTES));
T('gate_not_initialised_message',
  String(info.gate_compile_before_capture_throws_msg).indexOf('not initialised') !== -1);

// No behaviour change on the global surface before lockdown().
const direct = await WebAssembly.compile(CALLER_BYTES);
T('direct_WebAssembly_compile_still_live', direct instanceof WebAssembly.Module);
T('sync_constructor_still_live_before_lockdown', runEvilSync() === 42);
T('validate_answers_before_lockdown', typeof WebAssembly.validate(SIMD_PROBE) === 'boolean');

// After an explicit capture (no lockdown), the gate serves the real evaluators.
T('captureRealEvaluators_reports_wasm_present', gate.captureRealEvaluators() === true);
T('captureRealEvaluators_is_idempotent', gate.captureRealEvaluators() === true);
const mod = await gate.compile(CAP, CALLER_BYTES);
T('gate_compile_works_without_lockdown', mod instanceof WebAssembly.Module);
T('gate_moduleImports_returns_empty', gate.moduleImports(CAP, mod).length === 0);
await THROWS_ASYNC('gate_compile_without_capability_throws_pre_lockdown',
  () => gate.compile({}, CALLER_BYTES));

finish();
`;

// ── Realm L — LOCKED: the full FINDINGS §d.5 direction matrix ────────────────
const PROBE_LOCKED = `
import { readFileSync } from 'node:fs';
import * as gate from ${GATE};
import { lockdown } from ${LOCKDOWN};
${PRELUDE}

// fw's own vendored binary, read while intrinsics are still mutable. The bytes
// are fw-internal; the SECURITY claim under test is the CALL SITE, not the I/O.
const FW_BYTES = new Uint8Array(readFileSync(${SHA2_WASM}));
info.fw_wasm_bytes = FW_BYTES.length;

const CAP = gate.issueCapability();

// Before lockdown the seam is open (proves arm() is what closes it).
let seamOpenBefore = true;
try { gate.assertByteSource({ fetchBytes: () => {} }); } catch { seamOpenBefore = false; }
T('assertByteSource_open_before_lockdown', seamOpenBefore);

lockdown();

// ── DIRECTION 1 — fw's own bytes still work, through the gate only ──────────
const module = await gate.compile(CAP, FW_BYTES);
// NOTE: \`module instanceof WebAssembly.Module\` is NOT usable here — the global
// binding is a throwing shim after the poison, which is exactly the reason
// runtime.js must stop type-checking against it (FINDINGS §d.6).
T('gated_compile_of_fw_bytes_succeeds', !!module && typeof module === 'object');
T('gated_moduleImports_zero_import_invariant', gate.moduleImports(CAP, module).length === 0);
const result = await gate.instantiate(CAP, module, {});
const instance = result && result.instance ? result.instance : result;
const ex = instance.exports;
T('gated_instance_exposes_wasm_abi',
  !!ex.memory && typeof ex.alloc === 'function' && typeof ex.free === 'function'
  && typeof ex.sha2 === 'function');
const ptrIn = ex.alloc(3);
const ptrOut = ex.alloc(32);
new Uint8Array(ex.memory.buffer, ptrIn, 3).set([0x61, 0x62, 0x63]); // "abc"
const status = ex.sha2(256, ptrIn, 3, ptrOut);
const digest = hex(new Uint8Array(ex.memory.buffer, ptrOut, 32));
ex.free(ptrIn); ex.free(ptrOut);
info.digest = digest;
T('gated_sha2_status_ok', status === 0);
T('gated_sha256_abc_matches_FIPS_vector', digest === ${JSON.stringify(SHA256_ABC)});

// ── DIRECTION 2 — every caller-supplied-bytes route throws ──────────────────
// The four async globals stay poisoned: nothing was re-opened.
THROWS('global_compile_still_poisoned', () => WebAssembly.compile(CALLER_BYTES));
THROWS('global_instantiate_still_poisoned', () => WebAssembly.instantiate(CALLER_BYTES));
THROWS('global_compileStreaming_still_poisoned', () => WebAssembly.compileStreaming(null));
THROWS('global_instantiateStreaming_still_poisoned', () => WebAssembly.instantiateStreaming(null));

// The §d.2 hole: the SYNCHRONOUS constructors now throw too.
THROWS('sync_new_Module_throws', () => new WebAssembly.Module(CALLER_BYTES));
THROWS('sync_new_Instance_throws', () => new WebAssembly.Instance(module, {}));
THROWS('sync_constructor_escape_is_CLOSED', () => runEvilSync());

// The gate itself refuses anyone who is not the capability holder.
await THROWS_ASYNC('gate_compile_without_capability_throws', () => gate.compile({}, CALLER_BYTES));
await THROWS_ASYNC('gate_compile_with_forged_brand_throws',
  () => gate.compile(Object.freeze({ __brand: 'fw.wasm.capability' }), CALLER_BYTES));
await THROWS_ASYNC('gate_instantiate_without_capability_throws',
  () => gate.instantiate({}, module, {}));
await THROWS_ASYNC('gate_instantiate_with_forged_brand_throws',
  () => gate.instantiate(Object.freeze({ __brand: 'fw.wasm.capability' }), module, {}));
THROWS('gate_moduleImports_without_capability_throws', () => gate.moduleImports({}, module));

// opts.fetchBytes is neutralised once armed — with the exact ratified message.
THROWS('fetchBytes_is_neutralised_under_lockdown',
  () => gate.assertByteSource({ fetchBytes: async () => CALLER_BYTES }));
T('fetchBytes_message_is_exact',
  info.fetchBytes_is_neutralised_under_lockdown_msg === ${JSON.stringify(FETCHBYTES_MSG)});
// An options object WITHOUT fetchBytes is still accepted while armed.
let plainOptsOk = true;
try { gate.assertByteSource({ variant: 'scalar' }); gate.assertByteSource(); } catch { plainOptsOk = false; }
T('armed_assertByteSource_allows_plain_opts', plainOptsOk);

// ── Untouched surface — do not "open" what is not closed, nor close it ──────
T('validate_still_answers_under_the_seam', typeof WebAssembly.validate(SIMD_PROBE) === 'boolean');
T('WebAssembly_Memory_untouched', typeof WebAssembly.Memory === 'function');
T('WebAssembly_Table_untouched', typeof WebAssembly.Table === 'function');
T('WebAssembly_Global_untouched', typeof WebAssembly.Global === 'function');
const mem = new WebAssembly.Memory({ initial: 1 });
T('WebAssembly_Memory_instanceof_ABI_check_works', mem instanceof WebAssembly.Memory);

// ── The capability never leaks ──────────────────────────────────────────────
T('capability_absent_from_globalThis', !capabilityLeaked());
T('issueCapability_still_same_identity', gate.issueCapability() === CAP);

// lockdown() stays idempotent with the gate wired in.
let secondOk = true;
try { lockdown(); } catch { secondOk = false; }
T('idempotent_second_lockdown', secondOk);

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

describe('sanity/wasm-gate', () => {
    describe('realm P — pre-lockdown (no behaviour change)', () => {
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

        test('the gate is unarmed: opts.fetchBytes is still the documented test seam', () => {
            expect(r.parsed?.checks.unarmed_assertByteSource_allows_fetchBytes).toBe(true);
        });

        test('the global WebAssembly surface is untouched before lockdown()', () => {
            expect(r.parsed?.checks.direct_WebAssembly_compile_still_live).toBe(true);
            expect(r.parsed?.checks.sync_constructor_still_live_before_lockdown).toBe(true);
            expect(r.parsed?.checks.validate_answers_before_lockdown).toBe(true);
        });

        test('the gate fails closed until the real evaluators are captured', () => {
            expect(r.parsed?.checks.gate_compile_before_capture_throws).toBe(true);
            expect(r.parsed?.checks.gate_not_initialised_message).toBe(true);
        });

        test('the capability is an idempotent identity, absent from globalThis', () => {
            expect(r.parsed?.checks.issueCapability_is_idempotent_identity).toBe(true);
            expect(r.parsed?.checks.capability_absent_from_globalThis).toBe(true);
        });
    });

    describe('realm L — under lockdown (FINDINGS §d.5 direction matrix)', () => {
        const r = runProbe(PROBE_LOCKED);

        test('disposable-realm probe exits cleanly and emits JSON', () => {
            assertRealmRan(r, 'L');
            expect(r.exitCode).toBe(0);
        });

        test('every in-realm assertion passed (both directions)', () => {
            assertRealmRan(r, 'L');
            expect(failedChecks(r.parsed)).toEqual([]);
            expect(r.parsed.ok).toBe(true);
        });

        test("direction 1: fw's vendored sha2.scalar.wasm digests \"abc\" to the FIPS 180-4 vector", () => {
            expect(r.parsed?.checks.gated_compile_of_fw_bytes_succeeds).toBe(true);
            expect(r.parsed?.checks.gated_moduleImports_zero_import_invariant).toBe(true);
            expect(r.parsed?.checks.gated_instance_exposes_wasm_abi).toBe(true);
            expect(r.parsed?.checks.gated_sha2_status_ok).toBe(true);
            expect(r.parsed?.info.digest).toBe(SHA256_ABC);
        });

        test('direction 2: the four ambient async evaluators stay poisoned', () => {
            expect(r.parsed?.checks.global_compile_still_poisoned).toBe(true);
            expect(r.parsed?.checks.global_instantiate_still_poisoned).toBe(true);
            expect(r.parsed?.checks.global_compileStreaming_still_poisoned).toBe(true);
            expect(r.parsed?.checks.global_instantiateStreaming_still_poisoned).toBe(true);
        });

        test('direction 2: the synchronous constructor hole (§d.2) is closed', () => {
            expect(r.parsed?.checks.sync_new_Module_throws).toBe(true);
            expect(r.parsed?.checks.sync_new_Instance_throws).toBe(true);
            expect(r.parsed?.checks.sync_constructor_escape_is_CLOSED).toBe(true);
        });

        test('direction 2: the gate refuses a missing or forged capability', () => {
            expect(r.parsed?.checks.gate_compile_without_capability_throws).toBe(true);
            expect(r.parsed?.checks.gate_compile_with_forged_brand_throws).toBe(true);
            expect(r.parsed?.checks.gate_instantiate_without_capability_throws).toBe(true);
            expect(r.parsed?.checks.gate_instantiate_with_forged_brand_throws).toBe(true);
            expect(r.parsed?.checks.gate_moduleImports_without_capability_throws).toBe(true);
        });

        test('direction 2: opts.fetchBytes is neutralised with the exact ratified message', () => {
            expect(r.parsed?.checks.fetchBytes_is_neutralised_under_lockdown).toBe(true);
            expect(r.parsed?.info.fetchBytes_is_neutralised_under_lockdown_msg).toBe(FETCHBYTES_MSG);
            expect(r.parsed?.checks.armed_assertByteSource_allows_plain_opts).toBe(true);
        });

        test('validate / Memory / Table / Global are untouched by the seam', () => {
            expect(r.parsed?.checks.validate_still_answers_under_the_seam).toBe(true);
            expect(r.parsed?.checks.WebAssembly_Memory_untouched).toBe(true);
            expect(r.parsed?.checks.WebAssembly_Table_untouched).toBe(true);
            expect(r.parsed?.checks.WebAssembly_Global_untouched).toBe(true);
            expect(r.parsed?.checks.WebAssembly_Memory_instanceof_ABI_check_works).toBe(true);
        });

        test('the capability never reaches globalThis; lockdown() stays idempotent', () => {
            expect(r.parsed?.checks.capability_absent_from_globalThis).toBe(true);
            expect(r.parsed?.checks.issueCapability_still_same_identity).toBe(true);
            expect(r.parsed?.checks.idempotent_second_lockdown).toBe(true);
        });
    });
});
