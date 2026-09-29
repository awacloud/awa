// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

/**
 * sanity/lockdown-apply — the self-applying wrapper, proved in a DISPOSABLE
 * realm (`ai/conventions/testing.md` § Evidence & gate design: freeze/lockdown
 * tests never run in the live test realm).
 *
 * The defect this module closes (BL-45): `integrations/webpack/index.js` could
 * only PREPEND A SPECIFIER for `sanity:'lockdown'`, and `sanity/lockdown.js`
 * has been an explicit-call ES module since BATCH_20 — so the prepended bare
 * import applied NOTHING and `sanity:'lockdown'` was silently a no-op.
 *
 * The probe is a single subprocess with two phases in ONE realm, so the
 * evidence is a before/after on the same check harness rather than two
 * separately-interpretable runs:
 *
 *   Phase A — bare-import the explicit-call tier (`lockdown.js`). Every
 *             hardening indicator must still read UNHARDENED. This is the
 *             red proof: it is exactly what the pre-fix webpack prepend did.
 *   Phase B — bare-import the wrapper (`lockdown-apply.js`). The SAME
 *             indicators must now all read HARDENED.
 *
 * Phase A is also what makes phase B non-vacuous: an assertion that "eval
 * throws" would pass in a realm that was already locked for an unrelated
 * reason; here the same realm demonstrably had a working `eval` moments before
 * the wrapper was imported.
 *
 * Subprocess hygiene copied from `lockdown.test.js`: pre-bind
 * `process.stdout.write` and force the lazy `node:fs`/stream module graph to
 * load BEFORE the freeze, then write the verdict through the bound copy. Both
 * imports are dynamic for the same reason — a static `import` is hoisted above
 * that pre-binding.
 */

const HERE = import.meta.dir;
const LOCKDOWN_URL = JSON.stringify(join(HERE, 'lockdown.js'));
const APPLY_URL = JSON.stringify(join(HERE, 'lockdown-apply.js'));

// No DOM is registered: this is the integrity path (steps 1-5 + 7), which runs
// in any realm. The browser-gated DOM composition (step 6) belongs to
// `lockdown.js` and is covered by `lockdown.test.js`'s PROBE_DOM.
const PROBE = `
const out = process.stdout;
const write = out.write.bind(out);
write(''); // force lazy node:fs/stream init while intrinsics are still mutable

const checks = {};
function expectTrue(label, v) { checks[label] = v === true; }
function expectThrow(label, fn) {
  let threw = false;
  try { fn(); } catch { threw = true; }
  checks[label] = threw;
}

// ── Phase A — a BARE import of the explicit-call tier applies NOTHING. ───────
const ld = await import(${LOCKDOWN_URL});
expectTrue('bare_import_exposes_explicit_call', typeof ld.lockdown === 'function');
expectTrue('bare_import_exposes_harden', typeof ld.harden === 'function');

expectTrue('bare_eval_still_works', globalThis.eval('1+1') === 2);
expectTrue('bare_Function_still_works', globalThis.Function('return 1')() === 1);
expectTrue('bare_ctorCtor_still_works', ({}).constructor.constructor('return 1')() === 1);
expectTrue('bare_ObjectProto_not_frozen', Object.isFrozen(Object.prototype) === false);
expectTrue('bare_ArrayProto_not_frozen', Object.isFrozen(Array.prototype) === false);
expectTrue('bare_ObjectProto_mutable', (() => {
  try {
    Object.prototype.__fwProbe = 1;
    const ok = Object.prototype.__fwProbe === 1;
    delete Object.prototype.__fwProbe;
    return ok;
  } catch { return false; }
})());

// ── Phase B — importing the WRAPPER applies the tier (side effect by design). ─
const mod = await import(${APPLY_URL});

// The wrapper publishes no API: importing it IS the API.
expectTrue('wrapper_has_no_exports', Object.keys(mod).length === 0);

// Same indicators as phase A, now inverted.
expectThrow('after_eval_throws', () => globalThis.eval('1'));
expectThrow('after_Function_throws', () => globalThis.Function('return 1'));
expectThrow('after_ctorCtor_throws', () => ({}).constructor.constructor('return 1'));
expectTrue('after_ObjectProto_frozen', Object.isFrozen(Object.prototype));
expectTrue('after_ArrayProto_frozen', Object.isFrozen(Array.prototype));
expectTrue('after_FunctionProto_frozen', Object.isFrozen(Function.prototype));
expectThrow('after_ObjectProto_assign_throws', () => { 'use strict'; Object.prototype.x = 1; });
// The wasm seam is armed as part of lockdown() step 4/7 — the wrapper must not
// short-circuit any step of the tier.
expectThrow('after_wasm_new_Module_throws',
  () => new WebAssembly.Module(new Uint8Array([0x00,0x61,0x73,0x6d,0x01,0x00,0x00,0x00])));

// Idempotence across the two entry points: they share ONE module instance, so
// an explicit call after the wrapper is a guarded no-op, not a second freeze.
let secondOk = true;
try { ld.lockdown(); } catch { secondOk = false; }
expectTrue('explicit_call_after_wrapper_is_noop', secondOk);

write(JSON.stringify({ ok: Object.values(checks).every(Boolean), checks }));
`;

/**
 * @param {string} src probe program
 * @returns {{exitCode: number|null, stdout: string, stderr: string}}
 */
function runProbe(src) {
    const proc = Bun.spawnSync(['bun', '-e', src], { stdout: 'pipe', stderr: 'pipe' });
    return {
        exitCode: proc.exitCode,
        stdout: proc.stdout?.toString() ?? '',
        stderr: proc.stderr?.toString() ?? '',
    };
}

describe('sanity/lockdown-apply — self-applying wrapper', () => {
    const result = runProbe(PROBE);
    let parsed = null;
    let parseError = null;
    try {
        parsed = JSON.parse(result.stdout);
    } catch (e) {
        parseError = e;
    }

    test('disposable-realm probe exits cleanly and emits JSON', () => {
        if (result.exitCode !== 0 || parsed === null) {
            throw new Error(
                `probe failed (exit ${result.exitCode})\n`
                + `stdout: ${result.stdout}\nstderr: ${result.stderr}\n`
                + (parseError ? `parseError: ${parseError.message}` : '')
            );
        }
        expect(result.exitCode).toBe(0);
        expect(parsed).not.toBeNull();
    });

    test('every in-realm assertion passed', () => {
        expect(parsed).not.toBeNull();
        // Non-vacuity: `[].every(Boolean)` is `true`, so an empty check map
        // would report a green probe that asserted nothing.
        expect(Object.keys(parsed.checks).length).toBeGreaterThanOrEqual(18);
        const failed = Object.entries(parsed.checks)
            .filter(([, v]) => v !== true)
            .map(([k]) => k);
        expect(failed).toEqual([]);
        expect(parsed.ok).toBe(true);
    });

    // The RED proof, kept as its own named test: this is the behaviour BL-45
    // reported, and the reason the wrapper exists at all.
    test('a bare import of lockdown.js hardens NOTHING (the pre-fix webpack prepend)', () => {
        expect(parsed?.checks.bare_import_exposes_explicit_call).toBe(true);
        expect(parsed?.checks.bare_eval_still_works).toBe(true);
        expect(parsed?.checks.bare_Function_still_works).toBe(true);
        expect(parsed?.checks.bare_ctorCtor_still_works).toBe(true);
        expect(parsed?.checks.bare_ObjectProto_not_frozen).toBe(true);
        expect(parsed?.checks.bare_ObjectProto_mutable).toBe(true);
    });

    test('a bare import of lockdown-apply.js APPLIES the tier', () => {
        expect(parsed?.checks.after_eval_throws).toBe(true);
        expect(parsed?.checks.after_Function_throws).toBe(true);
        expect(parsed?.checks.after_ctorCtor_throws).toBe(true);
        expect(parsed?.checks.after_ObjectProto_frozen).toBe(true);
        expect(parsed?.checks.after_ArrayProto_frozen).toBe(true);
        expect(parsed?.checks.after_FunctionProto_frozen).toBe(true);
        expect(parsed?.checks.after_ObjectProto_assign_throws).toBe(true);
    });

    test('the wrapper applies the WHOLE tier, wasm seam included', () => {
        expect(parsed?.checks.after_wasm_new_Module_throws).toBe(true);
    });

    test('the wrapper publishes no API, and stays idempotent with the explicit call', () => {
        expect(parsed?.checks.wrapper_has_no_exports).toBe(true);
        expect(parsed?.checks.explicit_call_after_wrapper_is_noop).toBe(true);
    });
});

// ── Package surface: the ONE canonical export key ────────────────────────────

const PKG_DIR = join(HERE, '..', '..');
const pkg = JSON.parse(readFileSync(join(PKG_DIR, 'package.json'), 'utf8'));

/** Is a `node` binary usable here? */
const NODE_OK = spawnSync('node', ['--version'], { encoding: 'utf8' }).status === 0;

describe('sanity/lockdown-apply — package surface', () => {
    test('the ./sanity/lockdown.apply export key targets the wrapper source', () => {
        const entry = pkg.exports['./sanity/lockdown.apply'];
        expect(entry).toBeDefined();
        expect(entry.default).toBe('./src/sanity/lockdown-apply.js');
    });

    test('the explicit-call tier keeps its own untouched key', () => {
        expect(pkg.exports['./sanity/lockdown'].default).toBe('./src/sanity/lockdown.js');
    });

    // A bare `import '@awacloud/fw/sanity/lockdown.apply'` is a SIDE-EFFECT-ONLY
    // import of a module with no exports. Webpack (and every other bundler
    // honouring the field) flags any file absent from `sideEffects` as pure and
    // deletes such an import in production — which would silently re-open BL-45.
    test('the wrapper is declared in sideEffects, or the prepend is tree-shaken away', () => {
        expect(pkg.sideEffects).toContain('./src/sanity/lockdown-apply.js');
    });

    test.if(NODE_OK)('the key resolves in a real Node ESM subprocess; an undeclared spelling does not', () => {
        const specifiers = [
            '@awacloud/fw/sanity/lockdown.apply',
            '@awacloud/fw/sanity/lockdown',
            // Falsification guard: no `./sanity/*` wildcard may exist, so the
            // file-path spelling must be rejected. Without this, a permissive
            // resolver would make the two assertions above vacuous.
            '@awacloud/fw/sanity/lockdown-apply.js',
        ];
        const script = `
            const out = {};
            for (const s of ${JSON.stringify(specifiers)}) {
                try { import.meta.resolve(s); out[s] = 'OK'; }
                catch (e) { out[s] = e.code || 'THROW'; }
            }
            console.log(JSON.stringify(out));
        `;
        const res = spawnSync('node', ['--input-type=module', '-e', script], {
            cwd: PKG_DIR,
            encoding: 'utf8',
        });
        if (res.status !== 0) throw new Error(`node subprocess exited ${res.status}: ${res.stderr}`);
        const results = JSON.parse(res.stdout.trim().split('\n').pop());
        expect(results['@awacloud/fw/sanity/lockdown.apply']).toBe('OK');
        expect(results['@awacloud/fw/sanity/lockdown']).toBe('OK');
        expect(results['@awacloud/fw/sanity/lockdown-apply.js']).toBe('ERR_PACKAGE_PATH_NOT_EXPORTED');
    });
});
