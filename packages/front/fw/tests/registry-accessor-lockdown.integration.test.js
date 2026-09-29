// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { describe, test, expect } from 'bun:test';
import { join } from 'path';

/**
 * @fileoverview `runtime.snapshot()` × `sanity/lockdown()` — measured
 * compatibility (fw/BATCH_26 task 02).
 *
 * BATCH_21's zero-carve-out verdict is scoped to the code that spike actually
 * drove (`dom/rendering/devtools.js`), explicitly NOT to code written later.
 * `ModuleRuntime#snapshot` is new, so it gets its own measurement rather than
 * inheriting a claim: does a frozen-intrinsics realm let it enumerate the
 * registry, freeze its rows, and keep instantiating nothing?
 *
 * **Why a subprocess.** `lockdown()` freezes the *running realm's* shared
 * intrinsics: calling it inside the main `bun test` process corrupts every
 * later file in the run and breaks Bun internals that initialise their
 * primordials lazily. So the whole probe (module-graph import → fixture build →
 * `lockdown()` → drive the accessor) runs in a throwaway
 * `Bun.spawnSync(['bun', '-e', …])` realm that prints one JSON line; this file
 * only parses and asserts on that line. The probe's `import` statements all
 * resolve before its body runs, so the graph is loaded before the freeze.
 * Mirrors `src/sanity/lockdown.test.js` and the BATCH_21 devtools spike.
 *
 * **Control assertion.** Every "works post-lockdown" result is vacuous if the
 * freeze never happened, so the probe first proves `lockdown()` took effect —
 * through the access PATH (`({}).constructor.constructor`), never a handle
 * captured before the freeze.
 *
 * The accessor touches no DOM, no timing source and no evaluator, so no
 * happy-dom registration is involved (and therefore no DOM-global leak into
 * sibling test files).
 */

const HERE = import.meta.dir;
const RUNTIME_URL = JSON.stringify(join(HERE, '../src/core/runtime.js'));
const LOCKDOWN_URL = JSON.stringify(join(HERE, '../src/sanity/lockdown.js'));

const PROBE = `
import { ModuleRuntime } from ${RUNTIME_URL};
import { lockdown } from ${LOCKDOWN_URL};

// Pre-bind stdout.write: touch the lazy node:fs stream init path while
// intrinsics are still mutable (lockdown.test.js lesson).
const out = process.stdout;
const write = out.write.bind(out);
write('');

const checks = {};
const values = {};
function expectTrue(label, v) { checks[label] = v === true; }
function expectThrow(label, fn) {
  let threw = false;
  try { fn(); } catch { threw = true; }
  checks[label] = threw;
}
function expectNoThrow(label, fn) {
  let threw = false;
  try { fn(); } catch (e) {
    threw = true;
    values[label + '_error'] = String((e && e.message) || e);
  }
  checks[label] = !threw;
}

const fingerprint = (r) => JSON.stringify(
  [...r.instances.entries()].map(([n, m]) => [n, [...m.keys()]])
);

// ---- Runtime built BEFORE lockdown(): the "app resolved fw at boot, then
// opted into the integrity tier" scenario.
const rtPre = new ModuleRuntime();
rtPre.register({ name: 'hex', version: '1.0.0', type: 'fw.io.codec', dependencies: [], factory: () => 1 });
rtPre.register({ name: 'hex', version: '2.0.0', type: 'fw.io.codec', dependencies: [], factory: () => 2 });
rtPre.register({ name: 'utf8', version: '1.0.0', type: 'fw.io.codec', dependencies: ['hex'], factory: () => 3 });
const preFingerprint = fingerprint(rtPre);

lockdown();

// ---- Control: prove lockdown() actually applied in THIS realm. Targets the
// access path, not a pre-captured handle.
expectThrow('control_eval_throws', () => globalThis.eval('1'));
expectThrow('control_ctor_ctor_throws', () => ({}).constructor.constructor('return 1'));
expectTrue('control_object_prototype_frozen', Object.isFrozen(Object.prototype));
expectTrue('control_array_prototype_frozen', Object.isFrozen(Array.prototype));

// ---- Drive the PRE-lockdown runtime.
let preSnap = null;
expectNoThrow('preRuntime_snapshot', () => { preSnap = rtPre.snapshot(); });
if (preSnap) {
  expectTrue('preRuntime_snapshot_enumerates',
    preSnap.length === 3
    && preSnap.map(e => e.name + '@' + e.version).sort().join(',') === 'hex@1.0.0,hex@2.0.0,utf8@1.0.0');
  expectTrue('preRuntime_snapshot_dependencies_ok',
    preSnap.find(e => e.name === 'utf8').dependencies.join(',') === 'hex');
  expectTrue('preRuntime_snapshot_latest_ok',
    preSnap.filter(e => e.name === 'hex' && e.latest).map(e => e.version).join(',') === '2.0.0');
  expectTrue('preRuntime_snapshot_frozen',
    Object.isFrozen(preSnap)
    && preSnap.every(e => Object.isFrozen(e) && Object.isFrozen(e.dependencies)));
  expectThrow('preRuntime_snapshot_array_immutable', () => { preSnap.push({ name: 'x' }); });
  expectThrow('preRuntime_snapshot_row_immutable', () => { preSnap[0].name = 'hijacked'; });
  expectThrow('preRuntime_snapshot_deps_immutable', () => { preSnap[0].dependencies.push('evil'); });
}
expectTrue('preRuntime_instantiates_nothing',
  fingerprint(rtPre) === preFingerprint && rtPre.instances.size === 0);

// ---- Filters still work post-lockdown (String.prototype.endsWith /
// startsWith and Array.prototype.slice all read through frozen intrinsics).
expectNoThrow('preRuntime_snapshot_filtered', () => {
  const r = rtPre.snapshot({ type: 'fw.' });
  expectTrue('preRuntime_snapshot_filtered_ok', r.length === 3);
  const one = rtPre.snapshot({ name: 'hex', version: '2.0.0' });
  expectTrue('preRuntime_snapshot_filter_exact_ok', one.length === 1 && one[0].latest === true);
});

// ---- A runtime CONSTRUCTED AFTER the freeze (the "factory built after
// lockdown" leg): new closures + new Maps against frozen intrinsics.
let rtPost = null;
expectNoThrow('postLockdown_construction', () => { rtPost = new ModuleRuntime(); });
if (rtPost) {
  expectNoThrow('postLockdown_register', () => {
    // Descriptor object itself also created after the freeze.
    rtPost.register({ name: 'b64', version: '1.0.0', type: 'fw.io.codec', dependencies: ['utf8'], factory: () => 4 });
    rtPost.register({ name: 'utf8', dependencies: [], factory: () => 5 });
  });
  let postSnap = null;
  expectNoThrow('postLockdown_snapshot', () => { postSnap = rtPost.snapshot(); });
  if (postSnap) {
    expectTrue('postLockdown_snapshot_ok',
      postSnap.length === 2
      && postSnap.find(e => e.name === 'b64').dependencies.join(',') === 'utf8'
      && postSnap.find(e => e.name === 'utf8').version === '0.0.0'
      && postSnap.every(e => e.instantiated === false));
    expectTrue('postLockdown_snapshot_frozen',
      Object.isFrozen(postSnap) && postSnap.every(e => Object.isFrozen(e)));
  }
  expectTrue('postLockdown_instantiates_nothing', rtPost.instances.size === 0);

  // Control for the "instantiates nothing" claim: resolving DOES fill the
  // cache post-lockdown, so the 0 above is a real observation, not a realm
  // where nothing works at all.
  expectNoThrow('postLockdown_resolve_control', () => {
    const v = rtPost.resolve('b64');
    expectTrue('postLockdown_resolve_control_ok', v === 4 && rtPost.instances.size === 2);
    expectTrue('postLockdown_instantiated_flag_ok',
      rtPost.snapshot({ name: 'b64' })[0].instantiated === true);
  });
}

const ok = Object.values(checks).every(Boolean);
write(JSON.stringify({ ok, checks, values }));
process.exit(0);
`;

/**
 * @param {string} [src] probe program
 * @returns {{exitCode: number|null, stdout: string, stderr: string}}
 */
function runProbe(src = PROBE) {
    const proc = Bun.spawnSync(['bun', '-e', src], { stdout: 'pipe', stderr: 'pipe' });
    return {
        exitCode: proc.exitCode,
        stdout: proc.stdout?.toString() ?? '',
        stderr: proc.stderr?.toString() ?? '',
    };
}

describe('runtime.snapshot() x sanity/lockdown() - measured compatibility', () => {
    const result = runProbe();
    /** @type {{ok: boolean, checks: Record<string, boolean>, values: Record<string, string>}|null} */
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

    test('control: lockdown() actually applied in this probe (methodology check)', () => {
        expect(parsed?.checks.control_eval_throws).toBe(true);
        expect(parsed?.checks.control_ctor_ctor_throws).toBe(true);
        expect(parsed?.checks.control_object_prototype_frozen).toBe(true);
        expect(parsed?.checks.control_array_prototype_frozen).toBe(true);
    });

    test('every check passed post-lockdown - zero carve-out needed', () => {
        const failed = Object.entries(parsed?.checks ?? {})
            .filter(([, v]) => v !== true)
            .map(([k]) => k);
        expect(failed).toEqual([]);
        expect(parsed?.ok).toBe(true);
    });

    test('pre-lockdown runtime: snapshot() enumerates and stays frozen', () => {
        expect(parsed?.checks.preRuntime_snapshot).toBe(true);
        expect(parsed?.checks.preRuntime_snapshot_enumerates).toBe(true);
        expect(parsed?.checks.preRuntime_snapshot_dependencies_ok).toBe(true);
        expect(parsed?.checks.preRuntime_snapshot_latest_ok).toBe(true);
        expect(parsed?.checks.preRuntime_snapshot_frozen).toBe(true);
    });

    test('pre-lockdown runtime: the returned view stays immutable under a frozen realm', () => {
        expect(parsed?.checks.preRuntime_snapshot_array_immutable).toBe(true);
        expect(parsed?.checks.preRuntime_snapshot_row_immutable).toBe(true);
        expect(parsed?.checks.preRuntime_snapshot_deps_immutable).toBe(true);
    });

    test('snapshot() still instantiates nothing post-lockdown', () => {
        expect(parsed?.checks.preRuntime_instantiates_nothing).toBe(true);
        expect(parsed?.checks.postLockdown_instantiates_nothing).toBe(true);
        // Non-vacuity control: resolve() DOES fill the cache in the same realm.
        expect(parsed?.checks.postLockdown_resolve_control_ok).toBe(true);
        expect(parsed?.checks.postLockdown_instantiated_flag_ok).toBe(true);
    });

    test('filters survive lockdown (startsWith/endsWith/slice through frozen intrinsics)', () => {
        expect(parsed?.checks.preRuntime_snapshot_filtered_ok).toBe(true);
        expect(parsed?.checks.preRuntime_snapshot_filter_exact_ok).toBe(true);
    });

    test('a runtime CONSTRUCTED after the freeze snapshots correctly', () => {
        expect(parsed?.checks.postLockdown_construction).toBe(true);
        expect(parsed?.checks.postLockdown_register).toBe(true);
        expect(parsed?.checks.postLockdown_snapshot).toBe(true);
        expect(parsed?.checks.postLockdown_snapshot_ok).toBe(true);
        expect(parsed?.checks.postLockdown_snapshot_frozen).toBe(true);
    });
});
