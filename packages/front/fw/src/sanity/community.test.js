// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { join } from 'path';

import { applyCommunity } from './community.js';

/**
 * sanity/community — SSR-inertness contract + behavioural proof.
 *
 * `community.js` is an explicit-call ES module (`applyCommunity()`), so a bare
 * import is inert in EVERY realm. The first describe block asserts exactly that
 * in-process: importing the module must not touch the shared `bun test` realm.
 *
 * ⚠️ `applyCommunity()` is never invoked against a REAL realm in-process: it
 * mutates realm globals (window/document/Element.prototype) irreversibly, and a
 * sibling test file may have leaked happy-dom globals into this process
 * (memory 2026-06-13). The behavioural assertions therefore run in DISPOSABLE
 * Bun subprocesses that print ONE JSON line on a pre-bound `stdout.write` and
 * `process.exit(0)` deterministically (never ride the exit code — W0 FINDINGS
 * §a), and assert DOM effects via `textContent`/property setters, never
 * `querySelector`.
 *
 * The final describe block DOES invoke it in-process, but on a realm made of
 * throwaway objects created by the test itself — never happy-dom, never
 * `globalThis`. See the long comment above that block for the two measured
 * reasons a real realm cannot be used here, and for the shared-intrinsic
 * save/restore contract it asserts.
 */

const HERE = import.meta.dir;
const FW_ROOT = join(HERE, '..', '..');
const COMMUNITY_URL = JSON.stringify(join(HERE, 'community.js'));

/** Step order returned by applyCommunity() — no `freezePrototypes`, order-free by design. */
const STEPS = [
    'window',
    'document',
    'Element.prototype',
    'document.domain',
    'wrapTimingFunctions',
    'blockDangerousElements',
    'disableDebugger',
];

const PRELUDE = `
const out = process.stdout; const write = out.write.bind(out);
write('');
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
const mod = await import(${COMMUNITY_URL});
T('import_exports_applyCommunity', typeof mod.applyCommunity === 'function');
T('import_has_no_other_named_export', Object.keys(mod).filter(k => k !== 'default' && k !== 'applyCommunity').length === 0);
T('import_left_Object_proto_unfrozen', Object.isFrozen(Object.prototype) === false);

const r = mod.applyCommunity();
T('reports_non_browser_realm', r.applied === false && r.reason === 'non-browser-realm');
T('reports_empty_steps', Array.isArray(r.steps) && r.steps.length === 0);
finish({ realm: 'A' });
`;

// ── Realm B — happy-dom: what the layer DOES, and what it deliberately does not ──
const PROBE_B = `${PRELUDE}${REGISTER_DOM}
const mod = await import(${COMMUNITY_URL});
const iframe = document.createElement('iframe');

// ── "Before": observable only because the module is explicit-call. ──
T('before_document_write_ok', typeof document.write === 'function');
T('before_window_eval_ok', typeof window.eval === 'function');

const r1 = mod.applyCommunity();
T('apply_returns_applied_true', r1.applied === true);
T('apply_has_no_reason', r1.reason === undefined);

// ── "After": the retained hardening. ──
THROWS('after_window_eval_throws', () => window.eval('1'));
THROWS('after_document_write_throws', () => document.write('<b>x</b>'));
THROWS('after_setTimeout_string_throws', () => setTimeout('x', 0));
THROWS('after_setInterval_string_throws', () => setInterval('x', 0));
THROWS('after_document_domain_set_throws', () => { document.domain = 'evil.test'; });
THROWS('after_iframe_src_set_throws', () => { iframe.src = 'https://evil.test/'; });
T('after_window_debugger_shimmed', typeof window.debugger === 'function');

// ── "After": what community deliberately does NOT do (the degraded contract). ──
T('after_Object_proto_still_unfrozen', Object.isFrozen(Object.prototype) === false);
T('after_Math_random_still_works', typeof Math.random() === 'number');
T('after_JSON_still_unfrozen', Object.isFrozen(JSON) === false);
T('after_JSON_parse_reviver_still_works', JSON.parse('{"a":1}', (k, v) => v).a === 1);
T('after_Date_now_not_rounded', typeof Date.now() === 'number' && String(Date.now()).length > 3);
T('after_history_pushState_still_works', typeof history.pushState === 'function');

// innerHTML is NOT redirected in this tier (asserted via textContent, never querySelector).
const el = document.createElement('div');
el.innerHTML = '<b>bold</b>';
T('after_innerHTML_not_redirected', el.childElementCount === 1 && el.textContent === 'bold');

// ── Idempotence. ──
const r2 = mod.applyCommunity();
T('second_call_is_noop', r2.applied === false && r2.reason === 'already-applied');
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

describe('sanity/community — SSR-inertness contract', () => {
    beforeAll(async () => {
        // Import community.js once before all tests. Under the Bun test runner
        // there is no real `window`/`document`; more importantly the module is
        // explicit-call, so the import itself must never touch the realm.
        await import('./community.js');
    });

    test('importing community.js under a non-window environment does not throw', async () => {
        // A clean re-import (module is cached) proves no throw on the SSR path.
        const mod = await import('./community.js');
        expect(mod).toBeDefined();
        // Explicit-call shape: the tier is applied by invoking the export.
        expect(typeof mod.applyCommunity).toBe('function');
    });

    test('Math.random is still callable after import (not blocked)', () => {
        // base.js blocks Math.random; community must NOT.
        expect(typeof Math.random).toBe('function');
        const v = Math.random();
        expect(typeof v).toBe('number');
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThan(1);
    });

    test('Object.prototype is not frozen after import', () => {
        // base.js freezes Object.prototype via freezePrototypes(); community must NOT.
        expect(Object.isFrozen(Object.prototype)).toBe(false);
    });

    test('Array.prototype is not frozen after import', () => {
        expect(Object.isFrozen(Array.prototype)).toBe(false);
    });

    test('Function.prototype is not frozen after import', () => {
        expect(Object.isFrozen(Function.prototype)).toBe(false);
    });

    test('Date.now is not rounded — returns high-resolution timestamps', () => {
        // base.js rounds Date.now to 100 ms; community must NOT.
        expect(typeof Date.now).toBe('function');
        const t1 = Date.now();
        const t2 = Date.now();
        expect(t1).toBeGreaterThan(0);
        expect(t2).toBeGreaterThanOrEqual(t1);
        // Two consecutive calls take well under 100 ms — the gap must stay < 100 ms.
        // If Date.now were rounded to 100 ms boundaries the delta could jump
        // artificially; in practice two successive calls are < 1 ms apart.
        expect(t2 - t1).toBeLessThan(100);
    });

    test('JSON is not frozen after import', () => {
        // base.js freezes JSON after wrapping blockJSONParsing(); community must NOT.
        expect(Object.isFrozen(JSON)).toBe(false);
    });

    test('JSON.parse with reviver is still callable after import', () => {
        // base.js blocks JSON.parse with a reviver; community must NOT.
        const result = JSON.parse('{"a":1}', (key, value) => value);
        expect(result).toEqual({ a: 1 });
    });

    test('JSON.stringify with function replacer is still callable after import', () => {
        // base.js blocks JSON.stringify with a function replacer; community must NOT.
        const result = JSON.stringify({ a: 1 }, (key, value) => value);
        expect(result).toBe('{"a":1}');
    });
});

describe('sanity/community — what the layer does', () => {
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

        test('applyCommunity() REPORTS non-browser-realm instead of silently no-op-ing', () => {
            assertProbeRan(realmA, 'A');
            expect(realmA.parsed.checks.reports_non_browser_realm).toBe(true);
            expect(realmA.parsed.checks.reports_empty_steps).toBe(true);
        });

        test('the module exposes applyCommunity() and nothing else', () => {
            assertProbeRan(realmA, 'A');
            expect(realmA.parsed.checks.import_exports_applyCommunity).toBe(true);
            expect(realmA.parsed.checks.import_has_no_other_named_export).toBe(true);
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

        test('after applyCommunity(): eval, document.write and document.domain are blocked', () => {
            assertProbeRan(realmB, 'B');
            expect(realmB.parsed.checks.before_window_eval_ok).toBe(true);
            expect(realmB.parsed.checks.before_document_write_ok).toBe(true);
            expect(realmB.parsed.checks.after_window_eval_throws).toBe(true);
            expect(realmB.parsed.checks.after_document_write_throws).toBe(true);
            expect(realmB.parsed.checks.after_document_domain_set_throws).toBe(true);
        });

        test('after applyCommunity(): string timers and dangerous element setters throw', () => {
            assertProbeRan(realmB, 'B');
            expect(realmB.parsed.checks.after_setTimeout_string_throws).toBe(true);
            expect(realmB.parsed.checks.after_setInterval_string_throws).toBe(true);
            expect(realmB.parsed.checks.after_iframe_src_set_throws).toBe(true);
            expect(realmB.parsed.checks.after_window_debugger_shimmed).toBe(true);
        });

        test('the degraded contract holds — prototypes, Math.random, JSON, Date.now, history untouched', () => {
            assertProbeRan(realmB, 'B');
            expect(realmB.parsed.checks.after_Object_proto_still_unfrozen).toBe(true);
            expect(realmB.parsed.checks.after_Math_random_still_works).toBe(true);
            expect(realmB.parsed.checks.after_JSON_still_unfrozen).toBe(true);
            expect(realmB.parsed.checks.after_JSON_parse_reviver_still_works).toBe(true);
            expect(realmB.parsed.checks.after_Date_now_not_rounded).toBe(true);
            expect(realmB.parsed.checks.after_history_pushState_still_works).toBe(true);
        });

        test('innerHTML is NOT redirected to text in this tier', () => {
            assertProbeRan(realmB, 'B');
            expect(realmB.parsed.checks.after_innerHTML_not_redirected).toBe(true);
        });

        test('applyCommunity() reports its step list and is idempotent', () => {
            assertProbeRan(realmB, 'B');
            expect(realmB.parsed.checks.apply_returns_applied_true).toBe(true);
            expect(realmB.parsed.checks.apply_has_no_reason).toBe(true);
            expect(realmB.parsed.steps).toEqual(STEPS);
            expect(realmB.parsed.checks.second_call_is_noop).toBe(true);
        });
    });
});

// ---------------------------------------------------------------------------
// In-process realm (BATCH_29/11, top-up 3a).
//
// Everything above proves BEHAVIOUR in disposable subprocesses, which
// contribute ZERO instrumented lines: `community.js` therefore entered the
// package coverage gate at 0/193 lines. This block invokes `applyCommunity()`
// IN-PROCESS, on a realm built entirely out of throwaway objects created here.
//
// Why not a happy-dom realm (the obvious choice)? Measured twice on this
// branch, and both results are IRREVERSIBLE:
//
//   1. `GlobalRegistrator.register()` aliases `globalThis.window` to
//      `globalThis` itself (GlobalRegistrator.js rewrites the window
//      self-reference to the global object). `blockPropertyAccess(window, ...)`
//      then redefines `globalThis.eval` as a NON-configurable throwing
//      accessor; `GlobalRegistrator.unregister()` afterwards throws
//      "Unable to delete property" and `eval` stays broken for every later
//      test file of the same bun process.
//   2. happy-dom's `Element` class is a PROCESS-level singleton: a
//      `configurable: false` block on `Element.prototype.setHTML` survives an
//      unregister/re-register cycle and leaks into the next realm.
//
// Neither can satisfy the save-and-assert-restoration contract this block
// exists to honour. The ONLY shared intrinsic `community.js` mutates is
// `Error.stackTraceLimit` (`disableDebugger()`); it is saved at module scope,
// restored in `afterAll` and the restoration is asserted. `Date.now` rounding,
// `Math.random` and `JSON` are NOT touched by this tier (they are base.js's
// job) -- the subprocess realm-B probe above pins that.
//
// Ordering is load-bearing: `applyCommunity()`'s `_applied` guard allows ONE
// successful application per process, and it is checked BEFORE the
// browser-realm check, so the `non-browser-realm` report can only be observed
// before the application. Hence the two nested describes, in this order.
// ---------------------------------------------------------------------------

/** Globals `community.js` reads as bare identifiers. */
const REALM_KEYS = ['window', 'document', 'Element', 'HTMLIFrameElement', 'HTMLObjectElement', 'HTMLEmbedElement'];

/** @type {Map<string, PropertyDescriptor|null>} */
const SAVED_GLOBALS = new Map();
/** The single SHARED intrinsic community.js mutates (disableDebugger). */
let SAVED_STACK_TRACE_LIMIT;
/** Value of Error.stackTraceLimit observed right after applyCommunity(). */
let STACK_TRACE_LIMIT_DURING;
/** console.warn as it was before this block stubbed it. */
let SAVED_CONSOLE_WARN;

function saveRealmSlots() {
    for (const k of REALM_KEYS) {
        SAVED_GLOBALS.set(k, Object.getOwnPropertyDescriptor(globalThis, k) ?? null);
    }
    SAVED_STACK_TRACE_LIMIT = Error.stackTraceLimit;
}

function restoreRealmSlots() {
    for (const k of REALM_KEYS) {
        const d = SAVED_GLOBALS.get(k);
        if (d) Object.defineProperty(globalThis, k, d);
        else delete globalThis[k];
    }
    Error.stackTraceLimit = SAVED_STACK_TRACE_LIMIT;
}

/** Slots whose current own-descriptor value differs from the saved one. */
function unrestoredSlots() {
    return REALM_KEYS.filter(k => {
        const now = Object.getOwnPropertyDescriptor(globalThis, k) ?? null;
        const before = SAVED_GLOBALS.get(k) ?? null;
        return (now === null) !== (before === null) || (now !== null && now.value !== before.value);
    });
}

function setGlobal(key, value) {
    Object.defineProperty(globalThis, key, { value, writable: true, enumerable: true, configurable: true });
}

/**
 * A disposable realm: plain objects and local classes, nothing shared.
 * @returns {object}
 */
function makeDisposableRealm() {
    /** @type {Array<[string, string]>} */
    const timerCalls = [];

    const win = {
        eval: () => 'unblocked',
        alert: () => 'unblocked',
        confirm: () => 'unblocked',
        prompt: () => 'unblocked',
        open: () => 'unblocked',
        setTimeout: (cb) => { timerCalls.push(['setTimeout', typeof cb]); return 101; },
        setInterval: (cb) => { timerCalls.push(['setInterval', typeof cb]); return 102; },
        requestAnimationFrame: (cb) => { timerCalls.push(['requestAnimationFrame', typeof cb]); return 103; },
    };

    // `execScript` and `createContextualFragment` are deliberately ABSENT: they
    // exercise the `descriptor ? descriptor.enumerable : false` false-branch of
    // blockPropertyAccess, while the present ones exercise the true-branch.
    const doc = {
        write: () => 'unblocked',
        writeln: () => 'unblocked',
        open: () => 'unblocked',
        close: () => 'unblocked',
        execCommand: () => 'unblocked',
        evaluate: () => 'unblocked',
        domain: 'fw.test',
    };

    class RealmElement {}
    RealmElement.prototype.setHTML = function () { return 'unblocked'; };
    RealmElement.prototype.evaluate = function () { return 'unblocked'; };

    class RealmIframe {}
    class RealmObject {}

    // Two deliberate obstructions, each pinning a documented degradation:
    //  - a NON-configurable window slot must be skipped with a console warning,
    //    not abort the pass (blockPropertyAccess catch);
    //  - a NON-configurable element property must likewise be skipped
    //    (blockDangerousElements catch).
    // `document.domain` is NOT obstructed: doing so would drop a step, and the
    // frozen 7-step order is the contract asserted below.
    Object.defineProperty(win, 'alert', { value: () => 'unblockable', writable: false, enumerable: true, configurable: false });
    Object.defineProperty(RealmObject.prototype, 'src', { value: 'unblockable', writable: false, configurable: false });

    return { win, doc, RealmElement, RealmIframe, RealmObject, timerCalls };
}

describe('sanity/community - in-process application (coverage + restoration gate)', () => {
    beforeAll(() => {
        saveRealmSlots();
        // A sibling file of the same bun process may have leaked DOM globals;
        // the non-browser assertion below needs their absence. They are put
        // back verbatim by restoreRealmSlots().
        delete globalThis.window;
        delete globalThis.document;
    });

    afterAll(() => {
        restoreRealmSlots();
        if (SAVED_CONSOLE_WARN) console.warn = SAVED_CONSOLE_WARN;

        // The restoration is the gate, so it is asserted, not merely performed.
        expect(unrestoredSlots()).toEqual([]);
        expect(Error.stackTraceLimit).toBe(SAVED_STACK_TRACE_LIMIT);
        // ...and the save/restore is not vacuous: community.js really moved it.
        expect(STACK_TRACE_LIMIT_DURING).toBe(10);
    });

    describe('non-browser realm', () => {
        test('applyCommunity() reports non-browser-realm with an empty step list', () => {
            expect(typeof globalThis.window).toBe('undefined');
            expect(typeof globalThis.document).toBe('undefined');

            const r = applyCommunity();
            expect(r.applied).toBe(false);
            expect(r.reason).toBe('non-browser-realm');
            expect(r.steps).toEqual([]);
        });
    });

    describe('browser realm', () => {
        /** @type {ReturnType<typeof makeDisposableRealm>} */
        let realm;
        /** @type {{applied: boolean, reason?: string, steps: string[]}} */
        let report;
        /** @type {string[]} */
        let warnings = [];

        beforeAll(() => {
            realm = makeDisposableRealm();
            setGlobal('window', realm.win);
            setGlobal('document', realm.doc);
            setGlobal('Element', realm.RealmElement);
            setGlobal('HTMLIFrameElement', realm.RealmIframe);
            setGlobal('HTMLObjectElement', realm.RealmObject);
            // Absent on purpose: pins the `!ElementClass` skip in
            // blockDangerousElements (a realm without <embed> must not throw).
            setGlobal('HTMLEmbedElement', undefined);

            SAVED_CONSOLE_WARN = console.warn;
            warnings = [];
            console.warn = (...args) => { warnings.push(args.map(String).join(' ')); };

            // A value the module must overwrite, so the restore assertion bites.
            Error.stackTraceLimit = 42;

            report = applyCommunity();
            STACK_TRACE_LIMIT_DURING = Error.stackTraceLimit;
        });

        test('reports applied:true with the frozen 7-step order and no reason', () => {
            expect(report.applied).toBe(true);
            expect(report.reason).toBeUndefined();
            expect(report.steps).toEqual(STEPS);
        });

        test('window eval/confirm/prompt/open are blocked on get and on set', () => {
            expect(() => realm.win.eval('1')).toThrow('not allowed');
            expect(() => realm.win.confirm('x')).toThrow('not allowed');
            expect(() => realm.win.prompt('x')).toThrow('not allowed');
            expect(() => { realm.win.open = () => 'evil'; }).toThrow('not allowed');
        });

        test('document injection APIs and document.domain are blocked', () => {
            expect(() => realm.doc.write('<b>x</b>')).toThrow('not allowed');
            expect(() => realm.doc.writeln('<b>x</b>')).toThrow('not allowed');
            expect(() => realm.doc.execCommand('x')).toThrow('not allowed');
            expect(() => { realm.doc.domain = 'evil.test'; }).toThrow('not allowed');
        });

        test('Element.prototype setHTML/evaluate are blocked', () => {
            expect(() => realm.RealmElement.prototype.setHTML('<b>x</b>')).toThrow('not allowed');
            expect(() => realm.RealmElement.prototype.evaluate('//x')).toThrow('not allowed');
        });

        test('dangerous element setters throw on iframe, and a missing embed class is skipped', () => {
            const frame = new realm.RealmIframe();
            expect(() => { frame.src = 'https://evil.test/'; }).toThrow('not allowed');
            expect(() => { frame.srcdoc = 'x'; }).toThrow('not allowed');
            expect(() => { frame.innerHTML = '<b>x</b>'; }).toThrow('not allowed');
            // No HTMLEmbedElement in this realm: the pass skipped it silently.
            expect(globalThis.HTMLEmbedElement).toBeUndefined();
            expect(report.steps).toContain('blockDangerousElements');
        });

        test('string timer callbacks are rejected and function callbacks pass through', () => {
            expect(() => realm.win.setTimeout('evil()', 0)).toThrow('not allowed');
            expect(() => realm.win.setInterval('evil()', 0)).toThrow('not allowed');
            // requestAnimationFrame drops a string callback rather than throwing.
            expect(realm.win.requestAnimationFrame('evil()')).toBeUndefined();

            const noop = () => {};
            expect(realm.win.setTimeout(noop, 0)).toBe(101);
            expect(realm.win.setInterval(noop, 0)).toBe(102);
            expect(realm.win.requestAnimationFrame(noop)).toBe(103);
            expect(realm.timerCalls).toEqual([
                ['setTimeout', 'function'],
                ['setInterval', 'function'],
                ['requestAnimationFrame', 'function'],
            ]);
        });

        test('the debugger shim is installed and the stack-trace limit is clamped', () => {
            expect(typeof realm.win.debugger).toBe('function');
            expect(realm.win.debugger()).toBeUndefined();
            expect(STACK_TRACE_LIMIT_DURING).toBe(10);
        });

        test('an unblockable slot degrades with a warning instead of aborting the pass', () => {
            // window.alert and HTMLObjectElement.prototype.src were made
            // non-configurable BEFORE the pass; both must survive untouched...
            expect(realm.win.alert()).toBe('unblockable');
            expect(new realm.RealmObject().src).toBe('unblockable');
            // ...their warnings must be emitted...
            expect(warnings.some(w => w.startsWith('Cannot block window.alert:'))).toBe(true);
            expect(warnings.some(w => w.startsWith('Cannot block object.src:'))).toBe(true);
            // ...and the pass must still have completed every step.
            expect(report.applied).toBe(true);
            expect(report.steps).toEqual(STEPS);
        });

        test('blocked accesses are logged through logAttempt', () => {
            expect(warnings.some(w => w.startsWith('[SECURITY] Blocked get on window.eval'))).toBe(true);
            expect(warnings.some(w => w.startsWith('[SECURITY] Blocked set on document.domain'))).toBe(true);
        });

        test('a second applyCommunity() is a no-op reporting already-applied', () => {
            const r2 = applyCommunity();
            expect(r2.applied).toBe(false);
            expect(r2.reason).toBe('already-applied');
            expect(r2.steps).toEqual([]);
        });
    });
});
