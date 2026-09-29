// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { describe, test, expect } from 'bun:test';
import { join } from 'path';

/**
 * sanity/base — behavioural proof, executed in DISPOSABLE realms.
 *
 * ⚠️ Test-isolation hazard: `applyBase()` freezes the *running realm's* shared
 * intrinsics and replaces `Math.random` / `Date.now` / `JSON.parse`. Calling it
 * inside the main `bun test` process would corrupt every subsequent test (and
 * break Bun internals that lazily initialise primordials after the freeze —
 * memory 2026-06-15). Each realm therefore runs in a throwaway Bun subprocess
 * that imports `base.js`, applies it, records a boolean per assertion and
 * prints ONE JSON line.
 *
 * ⚠️ Two measured host-interaction facts (W0 FINDINGS §a) shape the harness:
 *   - happy-dom's teardown CRASHES once base is applied (`new Event()` reads
 *     `performance.now`, now a throwing getter), so the verdict must NOT ride
 *     on the subprocess exit code — the probe writes its JSON on a pre-bound
 *     `stdout.write` and calls `process.exit(0)` deterministically.
 *   - a frozen `Error.prototype` makes happy-dom's `DOMException` constructor
 *     throw, so `querySelector` is unusable post-lock — the innerHTML redirect
 *     is asserted via `textContent` + `childElementCount`.
 *
 * Realm A: no DOM — a bare import must be completely inert, and `applyBase()`
 *          must REPORT `non-browser-realm` rather than silently no-op.
 * Realm B: happy-dom — the "before" state is observable, `applyBase()` hardens,
 *          returns the frozen 15-step report, and is idempotent.
 */

const HERE = import.meta.dir;
const FW_ROOT = join(HERE, '..', '..');
const BASE_URL = JSON.stringify(join(HERE, 'base.js'));

/** The 15-step order frozen by the W0 G0 contract (FINDINGS §a). */
const FROZEN_STEPS = [
    'freezePrototypes',
    'window',
    'document',
    'Element.prototype',
    'history',
    'performance',
    'crypto',
    'htmlRedirect',
    'document.domain',
    'wrapTimingFunctions',
    'blockJSONParsing',
    'blockDangerousElements',
    'disableDebugger',
    'blockPerformanceAPIs',
    'blockMathRandom',
];

const PRELUDE = `
const out = process.stdout; const write = out.write.bind(out);
write(''); // force lazy node:fs/stream init while intrinsics are still mutable
const checks = {};
function T(label, v) { checks[label] = v === true; }
function THROWS(label, fn) { let t = false; try { fn(); } catch { t = true; } checks[label] = t; }
function finish(extra) {
  write(JSON.stringify({ ok: Object.values(checks).every(Boolean), checks, ...extra }));
  process.exit(0);
}
`;

const REGISTER_DOM = `
const { GlobalRegistrator } = await import('@happy-dom/global-registrator');
GlobalRegistrator.register({ url: 'https://fw.test/' });
`;

// ── Realm A — no DOM: the import is inert, the call reports why ──────────────
const PROBE_A = `${PRELUDE}
const beforeFrozen = Object.isFrozen(Object.prototype);
const mod = await import(${BASE_URL});

T('import_exports_applyBase', typeof mod.applyBase === 'function');
T('import_has_no_other_named_export', Object.keys(mod).filter(k => k !== 'default' && k !== 'applyBase').length === 0);
T('import_did_not_freeze_Object_proto', Object.isFrozen(Object.prototype) === false && beforeFrozen === false);
T('import_left_Math_random_callable', typeof Math.random() === 'number');
T('import_left_JSON_unfrozen', Object.isFrozen(JSON) === false);
T('import_left_Date_now_unrounded', typeof Date.now() === 'number');

const r = mod.applyBase();
T('applyBase_reports_non_browser_realm', r.applied === false && r.reason === 'non-browser-realm');
T('applyBase_reports_empty_steps', Array.isArray(r.steps) && r.steps.length === 0);
T('applyBase_in_ssr_left_realm_untouched', typeof Math.random() === 'number' && Object.isFrozen(Object.prototype) === false);
finish({ realm: 'A' });
`;

// ── Realm B — happy-dom: before → applyBase() → after ────────────────────────
const PROBE_B = `${PRELUDE}${REGISTER_DOM}
const mod = await import(${BASE_URL});

// The element is created BEFORE the lock (post-lock DOM construction is
// unreliable under happy-dom, see the header).
const el = document.createElement('div');

// ── "Before": observable only because the module is explicit-call. ──
T('before_Math_random_ok', typeof Math.random() === 'number');
T('before_Object_proto_unfrozen', Object.isFrozen(Object.prototype) === false);
T('before_JSON_unfrozen', Object.isFrozen(JSON) === false);
T('before_JSON_parse_reviver_ok', JSON.parse('{"a":1}', (k, v) => v).a === 1);

const r1 = mod.applyBase();
T('apply_returns_applied_true', r1.applied === true);
T('apply_has_no_reason', r1.reason === undefined);

// ── "After": the documented base guarantees. ──
THROWS('after_Math_random_throws', () => Math.random());
T('after_Object_proto_frozen', Object.isFrozen(Object.prototype));
T('after_JSON_frozen', Object.isFrozen(JSON));
THROWS('after_JSON_parse_reviver_throws', () => JSON.parse('{"a":1}', (k, v) => v));
THROWS('after_setTimeout_string_throws', () => setTimeout('x', 0));
THROWS('after_document_write_throws', () => document.write('<b>x</b>'));
T('after_Date_now_rounded', Date.now() % 100 === 0);

// innerHTML → innerText redirect (never via querySelector — see the header).
el.innerHTML = '<b>bold</b>';
T('after_innerHTML_redirected_to_text', el.textContent === '<b>bold</b>' && el.childElementCount === 0);

// ── Idempotence: a second call is a no-op that says so. ──
const r2 = mod.applyBase();
T('second_call_is_noop', r2.applied === false && r2.reason === 'already-applied');
T('second_call_reports_empty_steps', Array.isArray(r2.steps) && r2.steps.length === 0);
finish({ realm: 'B', steps: r1.steps });
`;

function runProbe(src) {
    const proc = Bun.spawnSync(['bun', '-e', src], {
        cwd: FW_ROOT,
        stdout: 'pipe',
        stderr: 'pipe',
    });
    const stdout = proc.stdout?.toString() ?? '';
    let parsed = null;
    let parseError = null;
    try {
        parsed = JSON.parse(stdout.trim().split('\n').pop());
    } catch (e) {
        parseError = e;
    }
    return {
        exitCode: proc.exitCode,
        parsed,
        parseError,
        stdout,
        stderr: proc.stderr?.toString() ?? '',
    };
}

/** Fail loudly WITH the subprocess diagnostics rather than on `parsed?.x`. */
function assertProbeRan(result, realm) {
    if (result.parsed === null) {
        throw new Error(
            `realm ${realm} probe emitted no JSON (exit ${result.exitCode})\n` +
            `stdout: ${result.stdout.slice(0, 800)}\n` +
            `stderr: ${result.stderr.slice(0, 1500)}\n` +
            (result.parseError ? `parseError: ${result.parseError.message}` : '')
        );
    }
}

function failedChecks(parsed) {
    return Object.entries(parsed.checks).filter(([, v]) => v !== true).map(([k]) => k);
}

describe('sanity/base', () => {
    // One subprocess per realm for the whole suite: applying base is realm-global,
    // so re-running it per assertion would only re-pay the freeze cost.
    const realmA = runProbe(PROBE_A);
    const realmB = runProbe(PROBE_B);

    describe('realm A — non-browser (SSR / Worker / Bun)', () => {
        test('disposable-realm probe emits JSON and exits 0', () => {
            assertProbeRan(realmA, 'A');
            expect(realmA.exitCode).toBe(0);
        });

        test('every in-realm assertion passed', () => {
            assertProbeRan(realmA, 'A');
            expect(failedChecks(realmA.parsed)).toEqual([]);
            expect(realmA.parsed.ok).toBe(true);
        });

        test('a bare import is inert — no freeze, no global mutation', () => {
            assertProbeRan(realmA, 'A');
            expect(realmA.parsed.checks.import_did_not_freeze_Object_proto).toBe(true);
            expect(realmA.parsed.checks.import_left_Math_random_callable).toBe(true);
            expect(realmA.parsed.checks.import_left_JSON_unfrozen).toBe(true);
            expect(realmA.parsed.checks.import_left_Date_now_unrounded).toBe(true);
        });

        test('the module exposes applyBase() and nothing else', () => {
            assertProbeRan(realmA, 'A');
            expect(realmA.parsed.checks.import_exports_applyBase).toBe(true);
            expect(realmA.parsed.checks.import_has_no_other_named_export).toBe(true);
        });

        test('applyBase() REPORTS non-browser-realm instead of silently no-op-ing', () => {
            assertProbeRan(realmA, 'A');
            expect(realmA.parsed.checks.applyBase_reports_non_browser_realm).toBe(true);
            expect(realmA.parsed.checks.applyBase_reports_empty_steps).toBe(true);
            expect(realmA.parsed.checks.applyBase_in_ssr_left_realm_untouched).toBe(true);
        });
    });

    describe('realm B — browser (happy-dom)', () => {
        test('disposable-realm probe emits JSON and exits 0', () => {
            assertProbeRan(realmB, 'B');
            expect(realmB.exitCode).toBe(0);
        });

        test('every in-realm assertion passed', () => {
            assertProbeRan(realmB, 'B');
            expect(failedChecks(realmB.parsed)).toEqual([]);
            expect(realmB.parsed.ok).toBe(true);
        });

        test('the "before" state is observable and unhardened', () => {
            assertProbeRan(realmB, 'B');
            expect(realmB.parsed.checks.before_Math_random_ok).toBe(true);
            expect(realmB.parsed.checks.before_Object_proto_unfrozen).toBe(true);
            expect(realmB.parsed.checks.before_JSON_unfrozen).toBe(true);
            expect(realmB.parsed.checks.before_JSON_parse_reviver_ok).toBe(true);
        });

        test('after applyBase(): prototypes + JSON frozen, Math.random blocked', () => {
            assertProbeRan(realmB, 'B');
            expect(realmB.parsed.checks.after_Object_proto_frozen).toBe(true);
            expect(realmB.parsed.checks.after_JSON_frozen).toBe(true);
            expect(realmB.parsed.checks.after_Math_random_throws).toBe(true);
        });

        test('after applyBase(): string timers, JSON reviver and document.write throw', () => {
            assertProbeRan(realmB, 'B');
            expect(realmB.parsed.checks.after_setTimeout_string_throws).toBe(true);
            expect(realmB.parsed.checks.after_JSON_parse_reviver_throws).toBe(true);
            expect(realmB.parsed.checks.after_document_write_throws).toBe(true);
        });

        test('after applyBase(): Date.now coarsened to 100 ms, innerHTML redirected to text', () => {
            assertProbeRan(realmB, 'B');
            expect(realmB.parsed.checks.after_Date_now_rounded).toBe(true);
            expect(realmB.parsed.checks.after_innerHTML_redirected_to_text).toBe(true);
        });

        test('applyBase() returns the frozen 15-step order', () => {
            assertProbeRan(realmB, 'B');
            expect(realmB.parsed.checks.apply_returns_applied_true).toBe(true);
            expect(realmB.parsed.checks.apply_has_no_reason).toBe(true);
            expect(realmB.parsed.steps).toEqual(FROZEN_STEPS);
        });

        test('a second applyBase() is a no-op reporting already-applied', () => {
            assertProbeRan(realmB, 'B');
            expect(realmB.parsed.checks.second_call_is_noop).toBe(true);
            expect(realmB.parsed.checks.second_call_reports_empty_steps).toBe(true);
        });
    });
});
