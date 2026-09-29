// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { describe, test, expect } from 'bun:test';
import { join } from 'path';

/**
 * sanity/lockdown — escape-closed proof, executed in a DISPOSABLE realm.
 *
 * ⚠️ Test-isolation hazard: `lockdown()` freezes the *running realm's* shared
 * intrinsics. Calling it inside the main `bun test` process would corrupt every
 * subsequent test. So the lockdown + assertions run in a throwaway subprocess
 * (`Bun.spawn`) that imports `lockdown.js`, applies it, runs the checks, and
 * prints a single JSON line: `{ ok: boolean, checks: {...}, error?: string }`.
 * The parent test asserts on the parsed result and the subprocess exit code.
 */

const HERE = import.meta.dir;
const LOCKDOWN_URL = JSON.stringify(join(HERE, 'lockdown.js'));

// The integrity probe runs in its own Bun process (no DOM => integrity-only
// path; the DOM composition is browser-gated and covered by PROBE_DOM below).
// It records each assertion as a boolean so the parent gets a precise failure map.
const PROBE = `
import { lockdown, harden } from ${LOCKDOWN_URL};

// Pre-resolve every output dependency BEFORE lockdown(). Freezing intrinsics
// can break Bun internals that lazily initialise their primordials after the
// freeze (e.g. node:fs / process.stdout). Touch process.stdout.write now (which
// forces that lazy module graph to load while primordials are still mutable),
// then call the bound copy at the end.
const out = process.stdout;
const write = out.write.bind(out);
write(''); // force lazy node:fs/stream init while intrinsics are still mutable

const checks = {};
function expectThrow(label, fn) {
  let threw = false;
  try { fn(); } catch { threw = true; }
  checks[label] = threw;
}
function expectTrue(label, v) { checks[label] = v === true; }

lockdown();

// 1. Headline: the f.constructor ACCESS PATH no longer yields a working
//    evaluator, for all four constructor kinds. Threat model: lockdown runs at
//    startup, before attacker code; we prove the reachable path is severed:
//    the object/function constructor chain resolves to the throwing shim.
expectThrow('objCtorCtor_throws', () => ({}).constructor.constructor('return 1'));
expectThrow('fnCtor_throws', () => (function(){}).constructor('return 1'));
expectThrow('asyncCtor_throws', () => (async()=>{}).constructor('return 1'));
expectThrow('genCtor_throws', () => (function*(){}).constructor('return 1'));
expectThrow('asyncGenCtor_throws', () => (async function*(){}).constructor('return 1'));
// Reached via an object literal's prototype chain too (Object.prototype path).
expectThrow('captured_objCtorCtor_throws', () => ({}).constructor.constructor('return 1'));

// 2. Ambient evaluators removed.
expectThrow('global_eval_throws', () => globalThis.eval('1'));
expectThrow('global_Function_throws', () => globalThis.Function('return 1'));

// 2b. WebAssembly: the capability seam is wired into lockdown() (capture →
//     poison sync constructors → arm). Full direction matrix lives in
//     wasm-gate.test.js; these assertions pin the INTEGRATION.
const WASM_BYTES = new Uint8Array([0x00,0x61,0x73,0x6d,0x01,0x00,0x00,0x00]);
// The four async evaluator slots (unchanged behaviour).
expectThrow('wasm_compile_throws', () => WebAssembly.compile(WASM_BYTES));
expectThrow('wasm_instantiate_throws', () => WebAssembly.instantiate(WASM_BYTES));
expectThrow('wasm_compileStreaming_throws', () => WebAssembly.compileStreaming(null));
expectThrow('wasm_instantiateStreaming_throws', () => WebAssembly.instantiateStreaming(null));
// The synchronous constructors — the hole lockdown() left open until now.
expectThrow('wasm_new_Module_throws', () => new WebAssembly.Module(WASM_BYTES));
expectThrow('wasm_new_Instance_throws', () => new WebAssembly.Instance({}, {}));
// Deliberately NOT poisoned: validate (the simd128 probe) and the non-evaluator
// Memory/Table/Global (runtime.js does "ex.memory instanceof WebAssembly.Memory").
expectTrue('wasm_validate_survives', typeof WebAssembly.validate(WASM_BYTES) === 'boolean');
expectTrue('wasm_Memory_untouched', typeof WebAssembly.Memory === 'function');
expectTrue('wasm_Table_untouched', typeof WebAssembly.Table === 'function');
expectTrue('wasm_Global_untouched', typeof WebAssembly.Global === 'function');
expectTrue('wasm_Memory_instanceof_still_works',
  new WebAssembly.Memory({ initial: 1 }) instanceof WebAssembly.Memory);
// The capability is never published on a global.
expectTrue('wasm_capability_absent_from_globalThis',
  !Object.getOwnPropertyNames(globalThis).some((k) => {
    try { const v = globalThis[k]; return !!(v && v.__brand === 'fw.wasm.capability'); }
    catch { return false; }
  }));

// 3. Intrinsics frozen.
expectTrue('frozen_Object_proto', Object.isFrozen(Object.prototype));
expectTrue('frozen_Array_proto', Object.isFrozen(Array.prototype));
expectTrue('frozen_Function_proto', Object.isFrozen(Function.prototype));
expectTrue('frozen_Promise_proto', Object.isFrozen(Promise.prototype));
expectTrue('frozen_Map_proto', Object.isFrozen(Map.prototype));
expectTrue('frozen_String_proto', Object.isFrozen(String.prototype));
expectTrue('frozen_Error_proto', Object.isFrozen(Error.prototype));
expectTrue('frozen_TypeError_proto', Object.isFrozen(TypeError.prototype));
// %TypedArray% (hidden intrinsic).
const TAproto = Object.getPrototypeOf(Int8Array.prototype);
expectTrue('frozen_TypedArray_proto', Object.isFrozen(TAproto));
// %IteratorPrototype% (hidden intrinsic).
const IterProto = Object.getPrototypeOf(Object.getPrototypeOf([][Symbol.iterator]()));
expectTrue('frozen_IteratorPrototype', Object.isFrozen(IterProto));

// Mutating a frozen intrinsic throws (strict mode is on for ES modules).
expectThrow('assign_Object_proto_throws', () => { 'use strict'; Object.prototype.x = 1; });
expectThrow('replace_Array_push_throws', () => { 'use strict'; Array.prototype.push = function(){}; });

// 4. harden() on a small graph: freezes target + nested + prototype, returns it.
const proto = { p: 1 };
const nested = { n: 2 };
const graph = Object.create(proto);
graph.child = nested;
const ret = harden(graph);
expectTrue('harden_returns_target', ret === graph);
expectTrue('harden_freezes_target', Object.isFrozen(graph));
expectTrue('harden_freezes_nested', Object.isFrozen(nested));
expectTrue('harden_freezes_proto', Object.isFrozen(proto));

// 5. Idempotence: a second lockdown() does not throw.
let secondOk = true;
try { lockdown(); } catch { secondOk = false; }
expectTrue('idempotent_second_call', secondOk);

const ok = Object.values(checks).every(Boolean);
write(JSON.stringify({ ok, checks }));
`;

/**
 * DOM-composition probe — the step-6 regression guard.
 *
 * `base.js` is an explicit-call ES module: a BARE side-effect import of it is
 * INERT, so a `lockdown()` that merely imports it would silently ship a realm
 * with NO DOM/XSS hardening while every build and test stayed green. This probe
 * exists so that regression can never be silent again: it asserts an OBSERVABLE
 * base-layer effect in a browser realm, before vs after.
 *
 * Host-interaction rules (measured, fw-sanity W0 §a):
 *   - happy-dom's teardown crashes once base is applied (`new Event()` reads the
 *     `performance.now` slot base replaces with a throwing getter) — so the
 *     verdict is written on a pre-bound `stdout.write` and the probe calls
 *     `process.exit(0)` explicitly, never riding the exit code;
 *   - a frozen `Error.prototype` makes happy-dom's `DOMException` constructor
 *     throw, so `querySelector` is unusable post-lock — the innerHTML redirect
 *     is asserted via `textContent` + `childElementCount` only;
 *   - step 6 is asynchronous by contract (dynamic `import`), so the probe polls
 *     for the `Element.prototype.innerHTML` setter to change identity rather
 *     than assuming a fixed number of ticks. A poll that times out leaves the
 *     behavioural checks failing, which is the intended loud failure.
 */
const PROBE_DOM = `
const out = process.stdout; const write = out.write.bind(out); write('');
const rawSetTimeout = globalThis.setTimeout;
const sleep = (ms) => new Promise((r) => rawSetTimeout(r, ms));
const checks = {};
function expectTrue(label, v) { checks[label] = v === true; }
function expectThrow(label, fn) { let t = false; try { fn(); } catch { t = true; } checks[label] = t; }

const { GlobalRegistrator } = await import('@happy-dom/global-registrator');
GlobalRegistrator.register({ url: 'https://fw.test/' });

const { lockdown } = await import(${LOCKDOWN_URL});

// Elements are created BEFORE the lock: post-lock DOM construction is
// unreliable under happy-dom (DOMException's constructor throws on a frozen
// Error.prototype). The redirect is installed on Element.prototype, so a
// pre-created element is still subject to it.
const before = document.createElement('div');
const after = document.createElement('div');
const beforeDesc = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML');
const beforeSetter = beforeDesc && beforeDesc.set; // may be undefined (host puts it lower)

// ── "Before": the realm is a normal browser realm. ──
before.innerHTML = '<b>x</b>';
expectTrue('before_innerHTML_parses_markup', before.childElementCount === 1);
expectTrue('before_document_write_allowed', typeof document.write === 'function');

lockdown();

// Step 6 lands on a later microtask (dynamic import). Poll on the identity of
// the innerHTML setter — non-mutating, unlike calling document.write.
let composed = false;
for (let i = 0; i < 200 && !composed; i++) {
  await sleep(10);
  const d = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML');
  composed = !!d && d.set !== beforeSetter;
}
expectTrue('step6_composed_base_layer', composed);

// ── "After": the documented base DOM/XSS guarantees are in force. ──
after.innerHTML = '<img src=x onerror=alert(1)>';
expectTrue('after_innerHTML_redirected_no_elements', after.childElementCount === 0);
const afterText = after.textContent || after.innerText || '';
expectTrue('after_innerHTML_redirected_to_text', afterText.indexOf('<img') !== -1);
expectThrow('after_document_write_throws', () => document.write('<b>x</b>'));

write(JSON.stringify({ ok: Object.values(checks).every(Boolean), checks }));
process.exit(0);
`;

/**
 * @param {string} [src] probe program (defaults to the integrity probe)
 * @returns {{exitCode: number|null, stdout: string, stderr: string}}
 */
function runProbe(src = PROBE) {
    const proc = Bun.spawnSync(['bun', '-e', src], {
        stdout: 'pipe',
        stderr: 'pipe',
    });
    return {
        exitCode: proc.exitCode,
        stdout: proc.stdout?.toString() ?? '',
        stderr: proc.stderr?.toString() ?? '',
    };
}

describe('sanity/lockdown', () => {
    // One subprocess for the whole suite (lockdown is realm-global; re-running
    // it per assertion would re-pay the freeze cost without added coverage).
    const result = runProbe();
    let parsed = null;
    let parseError = null;
    try {
        parsed = JSON.parse(result.stdout);
    } catch (e) {
        parseError = e;
    }

    test('disposable-realm probe exits cleanly and emits JSON', () => {
        if (result.exitCode !== 0 || parsed === null) {
            // Surface the subprocess diagnostics on failure.
            throw new Error(
                `probe failed (exit ${result.exitCode})\n` +
                `stdout: ${result.stdout}\nstderr: ${result.stderr}\n` +
                (parseError ? `parseError: ${parseError.message}` : '')
            );
        }
        expect(result.exitCode).toBe(0);
        expect(parsed).not.toBeNull();
    });

    test('every in-realm assertion passed (escape closed, intrinsics frozen, idempotent)', () => {
        expect(parsed).not.toBeNull();
        const checks = parsed.checks;
        // Report exactly which checks failed, if any.
        const failed = Object.entries(checks)
            .filter(([, v]) => v !== true)
            .map(([k]) => k);
        expect(failed).toEqual([]);
        expect(parsed.ok).toBe(true);
    });

    // Spot-check the headline guarantees explicitly so a regression names itself.
    test('headline: ({}).constructor.constructor evaluator escape is closed', () => {
        expect(parsed?.checks.objCtorCtor_throws).toBe(true);
        expect(parsed?.checks.captured_objCtorCtor_throws).toBe(true);
        expect(parsed?.checks.asyncCtor_throws).toBe(true);
        expect(parsed?.checks.genCtor_throws).toBe(true);
        expect(parsed?.checks.asyncGenCtor_throws).toBe(true);
    });

    test('ambient eval / Function evaluators removed', () => {
        expect(parsed?.checks.global_eval_throws).toBe(true);
        expect(parsed?.checks.global_Function_throws).toBe(true);
    });

    test('WebAssembly: async evaluators AND the sync constructors are removed', () => {
        expect(parsed?.checks.wasm_compile_throws).toBe(true);
        expect(parsed?.checks.wasm_instantiate_throws).toBe(true);
        expect(parsed?.checks.wasm_compileStreaming_throws).toBe(true);
        expect(parsed?.checks.wasm_instantiateStreaming_throws).toBe(true);
        // The §d.2 hole closed by the wasm capability seam: without these, the
        // whitelist would be security theatre (caller bytes still executed).
        expect(parsed?.checks.wasm_new_Module_throws).toBe(true);
        expect(parsed?.checks.wasm_new_Instance_throws).toBe(true);
    });

    test('WebAssembly: validate / Memory / Table / Global stay untouched', () => {
        expect(parsed?.checks.wasm_validate_survives).toBe(true);
        expect(parsed?.checks.wasm_Memory_untouched).toBe(true);
        expect(parsed?.checks.wasm_Table_untouched).toBe(true);
        expect(parsed?.checks.wasm_Global_untouched).toBe(true);
        expect(parsed?.checks.wasm_Memory_instanceof_still_works).toBe(true);
    });

    test('WebAssembly: the gate capability is never published on a global', () => {
        expect(parsed?.checks.wasm_capability_absent_from_globalThis).toBe(true);
    });

    test('intrinsics (incl. %TypedArray%, %IteratorPrototype%) frozen', () => {
        expect(parsed?.checks.frozen_Object_proto).toBe(true);
        expect(parsed?.checks.frozen_TypedArray_proto).toBe(true);
        expect(parsed?.checks.frozen_IteratorPrototype).toBe(true);
        expect(parsed?.checks.assign_Object_proto_throws).toBe(true);
    });

    test('harden() deep-freezes a graph and returns it; lockdown() is idempotent', () => {
        expect(parsed?.checks.harden_returns_target).toBe(true);
        expect(parsed?.checks.harden_freezes_nested).toBe(true);
        expect(parsed?.checks.harden_freezes_proto).toBe(true);
        expect(parsed?.checks.idempotent_second_call).toBe(true);
    });

    describe('step 6 — DOM/XSS composition in a browser realm', () => {
        const domResult = runProbe(PROBE_DOM);
        let domParsed = null;
        try {
            domParsed = JSON.parse(domResult.stdout);
        } catch { /* surfaced by the first test below */ }

        test('browser-realm probe exits cleanly and emits JSON', () => {
            if (domResult.exitCode !== 0 || domParsed === null) {
                throw new Error(
                    `DOM probe failed (exit ${domResult.exitCode})\n`
                    + `stdout: ${domResult.stdout}\nstderr: ${domResult.stderr}`
                );
            }
            expect(domResult.exitCode).toBe(0);
        });

        test('every in-realm assertion passed', () => {
            const failed = Object.entries(domParsed?.checks ?? {})
                .filter(([, v]) => v !== true)
                .map(([k]) => k);
            expect(failed).toEqual([]);
            expect(domParsed?.ok).toBe(true);
        });

        // The regression guard. `base.js` is explicit-call ESM: a BARE
        // side-effect import composes NOTHING, silently shipping a realm with no
        // DOM/XSS hardening while the whole suite stays green. lockdown() must
        // CALL applyBase().
        test('lockdown() actually APPLIES base.js (a bare import would be inert)', () => {
            expect(domParsed?.checks.step6_composed_base_layer).toBe(true);
        });

        test('after lockdown(), innerHTML is redirected to text (no elements parsed)', () => {
            // Asserted via textContent + childElementCount — never querySelector:
            // happy-dom's DOMException constructor throws on a frozen Error.prototype.
            expect(domParsed?.checks.before_innerHTML_parses_markup).toBe(true);
            expect(domParsed?.checks.after_innerHTML_redirected_no_elements).toBe(true);
            expect(domParsed?.checks.after_innerHTML_redirected_to_text).toBe(true);
        });

        test('after lockdown(), document.write throws', () => {
            expect(domParsed?.checks.before_document_write_allowed).toBe(true);
            expect(domParsed?.checks.after_document_write_throws).toBe(true);
        });
    });
});
