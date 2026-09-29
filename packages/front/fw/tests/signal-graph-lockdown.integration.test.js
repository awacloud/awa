// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { describe, test, expect } from 'bun:test';
import { join } from 'path';

/**
 * @fileoverview `signal.inspectGraph()` × `sanity/lockdown()` — measured
 * compatibility (BATCH_26/03).
 *
 * `inspectGraph()` is a NEW surface, so the BATCH_21 zero-carve-out verdict on
 * `devtools.js` says nothing about it: this file MEASURES the posture instead
 * of asserting it.
 *
 * Realm-corruption trap (`ai/conventions/testing.md` § Evidence & gate design):
 * `lockdown()` freezes the *running realm's* shared intrinsics, so calling it
 * inside the main `bun test` process corrupts every later test file in the run
 * and breaks Bun internals that initialise their primordials lazily. The whole
 * probe therefore runs in a throwaway `Bun.spawnSync(['bun', '-e', …])`
 * subprocess that prints one JSON line; this file only parses and asserts on
 * that line. The probe's ES `import` statements execute before its own
 * top-level body, so the module graph is fully resolved BEFORE `lockdown()`.
 *
 * Every escape/behaviour assertion targets the access PATH
 * (`({}).constructor.constructor`, `globalThis.eval`), never a handle captured
 * before the freeze — a pre-captured handle would still work and prove nothing.
 * The `control_*` checks exist for the same reason: a green result without them
 * may simply mean the freeze never happened (`lockdown()` is explicit-call ESM,
 * a bare import hardens nothing).
 *
 * `signal` is dependency-free and touches no ambient global, so the probe needs
 * no DOM and no happy-dom registration.
 */

const HERE = import.meta.dir;
const SIGNAL_URL   = JSON.stringify(join(HERE, '../src/io/utils/signal.js'));
const LOCKDOWN_URL = JSON.stringify(join(HERE, '../src/sanity/lockdown.js'));

const PROBE = `
import { signal } from ${SIGNAL_URL};
import { lockdown } from ${LOCKDOWN_URL};

// Pre-bind stdout.write while intrinsics are still mutable (lockdown.test.js
// lesson: the node:fs stream init path is lazy and breaks once frozen).
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

// ---- Instance built BEFORE lockdown (an app that resolved the signal module
// at boot, then opted into the integrity tier) ----
const apiPre = signal.factory();
const preA = apiPre.create(0);
const preB = apiPre.create(0);
let preRunsA = 0, preRunsB = 0, preInsideReads = 0;
const stopPreA = apiPre.effect(() => { preRunsA++; preA.get(); });
apiPre.effect(() => {
  preRunsB++;
  preB.get();
  apiPre.inspectGraph();     // graph read from inside a tracking context
  preInsideReads++;
});
const preGraphBefore = JSON.stringify(apiPre.inspectGraph());

lockdown();

// Control assertions: prove lockdown() actually took effect in THIS probe.
expectThrow('control_eval_throws', () => globalThis.eval('1'));
expectThrow('control_ctor_ctor_throws', () => ({}).constructor.constructor('return 1'));

// ---- Drive the PRE-built instance AFTER lockdown ----
expectNoThrow('preInstance_inspectGraph', () => {
  const g = apiPre.inspectGraph();
  values.preInstance_graph = JSON.stringify(g);
  expectTrue('preInstance_graph_shape_ok',
    !!g && Array.isArray(g.signals) && Array.isArray(g.effects) && Array.isArray(g.edges)
    && g.signals.length === 2 && g.effects.length === 2 && g.edges.length === 2);
  expectTrue('preInstance_graph_frozen',
    Object.isFrozen(g) && Object.isFrozen(g.signals) && Object.isFrozen(g.edges)
    && Object.isFrozen(g.signals[0]) && Object.isFrozen(g.edges[0]));
});

// Heisenberg, post-lockdown: re-run the graph-reading effect, graph unchanged.
expectNoThrow('preInstance_heisenberg_drive', () => {
  preB.set(1);
  const graphAfter = JSON.stringify(apiPre.inspectGraph());
  values.preInstance_graph_after = graphAfter;
  expectTrue('preInstance_read_inside_tracking_happened', preInsideReads === 2);
  expectTrue('preInstance_graph_identical_after_tracked_read', graphAfter === preGraphBefore);
  preA.set(1);
  expectTrue('preInstance_no_phantom_dependency', preRunsA === 2 && preRunsB === 2);
});

expectThrow('preInstance_snapshot_push_rejected', () => {
  apiPre.inspectGraph().signals.push({ id: 'sX', kind: 'signal' });
});
expectThrow('preInstance_snapshot_write_rejected', () => {
  apiPre.inspectGraph().effects[0].deps = 99;
});

expectNoThrow('preInstance_stop_prunes_graph', () => {
  stopPreA();
  const g = apiPre.inspectGraph();
  expectTrue('preInstance_stop_prunes_graph_ok', g.effects.length === 1 && g.edges.length === 1);
});

// ---- Fresh factory instantiation AFTER lockdown (new closures over an
// already-imported module graph, against frozen intrinsics) ----
let apiPost = null;
expectNoThrow('freshFactory_instantiation', () => { apiPost = signal.factory(); });

if (apiPost) {
  const a = apiPost.create(0);
  const b = apiPost.create(0);
  const c = apiPost.computed(() => a.peek() + 1);
  let runsA = 0, runsB = 0, insideReads = 0;

  expectNoThrow('postInstance_wiring', () => {
    apiPost.effect(() => { runsA++; a.get(); c.get(); });
    apiPost.effect(() => {
      runsB++;
      b.get();
      apiPost.inspectGraph();
      insideReads++;
    });
  });

  expectNoThrow('postInstance_inspectGraph', () => {
    const g = apiPost.inspectGraph();
    values.postInstance_graph = JSON.stringify(g);
    expectTrue('postInstance_graph_shape_ok',
      g.signals.length === 3 && g.effects.length === 2 && g.edges.length === 3);
    expectTrue('postInstance_computed_node_reported',
      g.signals.some(n => n.kind === 'computed'));
    expectTrue('postInstance_graph_frozen', Object.isFrozen(g) && Object.isFrozen(g.effects));
  });

  expectNoThrow('postInstance_heisenberg', () => {
    const before = JSON.stringify(apiPost.inspectGraph());
    b.set(1);
    const after = JSON.stringify(apiPost.inspectGraph());
    expectTrue('postInstance_read_inside_tracking_happened', insideReads === 2);
    expectTrue('postInstance_graph_identical_after_tracked_read', after === before);
    a.set(1);
    expectTrue('postInstance_no_phantom_dependency', runsA === 2 && runsB === 2);
    expectTrue('postInstance_graph_still_identical',
      JSON.stringify(apiPost.inspectGraph()) === before);
  });

  expectThrow('postInstance_snapshot_push_rejected', () => {
    apiPost.inspectGraph().edges.push({ effect: 'eX', signal: 'sX' });
  });

  expectTrue('postInstance_isolated_from_preInstance',
    apiPost.inspectGraph().effects.length === 2 && apiPre.inspectGraph().effects.length === 1);
}

const ok = Object.values(checks).every(Boolean);
write(JSON.stringify({ ok, checks, values }));
process.exit(0);
`;

/**
 * @param {string} [src] probe program (defaults to the signal-graph probe)
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

describe('signal.inspectGraph() x sanity/lockdown() — measured compatibility', () => {
    const result = runProbe();
    let parsed = null;
    let parseError = null;
    try { parsed = JSON.parse(result.stdout); }
    catch (e) { parseError = e; }

    test('disposable-realm probe exits cleanly and emits JSON', () => {
        if (result.exitCode !== 0 || parsed === null) {
            throw new Error(
                `probe failed (exit ${result.exitCode})\n` +
                `stdout: ${result.stdout}\nstderr: ${result.stderr}\n` +
                (parseError ? `parseError: ${parseError.message}` : '')
            );
        }
        expect(result.exitCode).toBe(0);
        expect(parsed).not.toBeNull();
    });

    test('control: lockdown() actually applied in this probe (methodology check)', () => {
        expect(parsed?.checks.control_eval_throws).toBe(true);
        expect(parsed?.checks.control_ctor_ctor_throws).toBe(true);
    });

    test('every check passed post-lockdown (zero carve-outs)', () => {
        const failed = Object.entries(parsed?.checks ?? {})
            .filter(([k, v]) => (k.startsWith('control_') ? false : v !== true))
            .map(([k]) => k);
        expect(failed).toEqual([]);
        expect(parsed?.ok).toBe(true);
    });

    test('a pre-built instance keeps reporting a well-shaped frozen graph after lockdown', () => {
        expect(parsed?.checks.preInstance_inspectGraph).toBe(true);
        expect(parsed?.checks.preInstance_graph_shape_ok).toBe(true);
        expect(parsed?.checks.preInstance_graph_frozen).toBe(true);
    });

    test('Heisenberg guarantee holds post-lockdown (pre-built instance)', () => {
        expect(parsed?.checks.preInstance_read_inside_tracking_happened).toBe(true);
        expect(parsed?.checks.preInstance_graph_identical_after_tracked_read).toBe(true);
        expect(parsed?.checks.preInstance_no_phantom_dependency).toBe(true);
    });

    test('the snapshot stays defensive post-lockdown: mutation is still rejected', () => {
        expect(parsed?.checks.preInstance_snapshot_push_rejected).toBe(true);
        expect(parsed?.checks.preInstance_snapshot_write_rejected).toBe(true);
        expect(parsed?.checks.postInstance_snapshot_push_rejected).toBe(true);
    });

    test('stop() still prunes the graph post-lockdown (behaviour preserved, not disarmed)', () => {
        expect(parsed?.checks.preInstance_stop_prunes_graph_ok).toBe(true);
    });

    test('a FRESH signal.factory() built AFTER lockdown reports a full graph', () => {
        expect(parsed?.checks.freshFactory_instantiation).toBe(true);
        expect(parsed?.checks.postInstance_wiring).toBe(true);
        expect(parsed?.checks.postInstance_graph_shape_ok).toBe(true);
        expect(parsed?.checks.postInstance_computed_node_reported).toBe(true);
        expect(parsed?.checks.postInstance_graph_frozen).toBe(true);
    });

    test('Heisenberg guarantee holds on a post-lockdown factory too', () => {
        expect(parsed?.checks.postInstance_read_inside_tracking_happened).toBe(true);
        expect(parsed?.checks.postInstance_graph_identical_after_tracked_read).toBe(true);
        expect(parsed?.checks.postInstance_no_phantom_dependency).toBe(true);
        expect(parsed?.checks.postInstance_graph_still_identical).toBe(true);
    });

    test('graphs stay per-instance across the lockdown boundary', () => {
        expect(parsed?.checks.postInstance_isolated_from_preInstance).toBe(true);
    });

    // Non-vacuity anchor: a boolean-only gate passes identically when the probe
    // reports an empty graph. These pin the exact topology measured under
    // lockdown, so a silently-degraded accessor reddens here even if every
    // boolean above stayed true.
    test('measured post-lockdown topology is exact, not merely well-shaped', () => {
        expect(JSON.parse(parsed?.values.preInstance_graph ?? 'null')).toEqual({
            signals: [{ id: 's1', kind: 'signal' }, { id: 's2', kind: 'signal' }],
            effects: [{ id: 'e1', deps: 1 }, { id: 'e2', deps: 1 }],
            edges: [
                { effect: 'e1', signal: 's1' },
                { effect: 'e2', signal: 's2' },
            ],
        });
        // Identical before and after the effect re-ran and read the graph while
        // tracking was active — the Heisenberg guarantee, byte for byte.
        expect(parsed?.values.preInstance_graph_after).toBe(parsed?.values.preInstance_graph);

        expect(JSON.parse(parsed?.values.postInstance_graph ?? 'null')).toEqual({
            signals: [
                { id: 's1', kind: 'signal' },
                { id: 'c3', kind: 'computed' },
                { id: 's2', kind: 'signal' },
            ],
            effects: [{ id: 'e1', deps: 2 }, { id: 'e2', deps: 1 }],
            edges: [
                { effect: 'e1', signal: 's1' },
                { effect: 'e1', signal: 'c3' },
                { effect: 'e2', signal: 's2' },
            ],
        });
    });
});
