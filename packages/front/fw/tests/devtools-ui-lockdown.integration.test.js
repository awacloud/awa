// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { describe, test, expect } from 'bun:test';
import { join } from 'path';

/**
 * @fileoverview `devtoolsUI` × `sanity/lockdown()` — measured compatibility
 * (BATCH_26/05).
 *
 * Option A's entire claim is "an inspector that works under lockdown, composing
 * only lockdown-clean modules". This file MEASURES that claim rather than
 * inheriting it: the BATCH_21 zero-carve-out verdict covers `devtools.js`, not
 * this new DOM-rendering layer on top of it.
 *
 * Method, identical to tasks 02/03 (`ai/conventions/testing.md` § Evidence &
 * gate design): `lockdown()` freezes the running realm's shared intrinsics, so
 * calling it inside the main `bun test` process would corrupt every later file
 * of the run. The whole probe therefore runs in a throwaway
 * `Bun.spawnSync(['bun', '-e', …])` subprocess printing one JSON line; this
 * file only parses and asserts on that line. ES `import` statements execute
 * before the probe's own top-level body, so the module graph — including
 * happy-dom's registration — is fully in place BEFORE `lockdown()`.
 *
 * The `control_*` checks are load-bearing: `lockdown()` is explicit-call ESM
 * and a bare import hardens nothing, so a green run without them may simply
 * mean the freeze never happened. Both target the access PATH
 * (`globalThis.eval`, `({}).constructor.constructor`), never a pre-captured
 * handle.
 *
 * happy-dom caveat, deliberately designed around: under a LOCKED realm
 * happy-dom's `Event`/`DOMException` constructors throw (memory/types/fw,
 * 2026-07-27), so the probe exercises only the DOM surface `devtoolsUI`
 * actually uses — `createElement` / `appendChild` / `textContent` /
 * `setAttribute` / `className` / `querySelectorAll` — dispatches no event, and
 * exits explicitly rather than riding the exit code.
 *
 * The session fixture is a synthetic object shaped exactly as
 * `devtools.inspect()` reads it, NOT a real `uiSession`: a real one would drag
 * `template`/`render`/`parser`/`dom`/`events` — none of them measured
 * lockdown-clean — into the probe and turn a failure anywhere in that chain
 * into a false verdict on `devtoolsUI`.
 */

const HERE = import.meta.dir;
const UI_URL       = JSON.stringify(join(HERE, '../src/dom/rendering/devtools-ui.js'));
const DEVTOOLS_URL = JSON.stringify(join(HERE, '../src/dom/rendering/devtools.js'));
const CLOCK_URL    = JSON.stringify(join(HERE, '../src/io/timing/clock.js'));
const SIGNAL_URL   = JSON.stringify(join(HERE, '../src/io/utils/signal.js'));
const RUNTIME_URL  = JSON.stringify(join(HERE, '../src/core/runtime.js'));
const LOCKDOWN_URL = JSON.stringify(join(HERE, '../src/sanity/lockdown.js'));

const PROBE = `
import { GlobalRegistrator } from '@happy-dom/global-registrator';
GlobalRegistrator.register();

import { devtoolsUI } from ${UI_URL};
import { devtools } from ${DEVTOOLS_URL};
import { clock } from ${CLOCK_URL};
import { signal } from ${SIGNAL_URL};
import { ModuleRuntime } from ${RUNTIME_URL};
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
    values[label + '_error'] = String((e && e.stack) || (e && e.message) || e);
  }
  checks[label] = !threw;
}
// querySelector / querySelectorAll are UNUSABLE in this probe: happy-dom's
// selector parser constructs a DOMException on the uncached path, and
// DOMException's constructor throws under a locked realm. Everything below
// therefore walks .children by hand — assert via textContent, per
// ai/memory/types/fw.md (2026-07-27).
function findAll(node, pred, acc) {
  acc = acc || [];
  for (const ch of node.children) { if (pred(ch)) acc.push(ch); findAll(ch, pred, acc); }
  return acc;
}
function firstMatch(node, pred) { return findAll(node, pred)[0] || null; }
function viewOf(root, name) {
  return firstMatch(root, e => e.getAttribute('data-view') === name);
}
function rows(scope) {
  return findAll(scope, e => e.tagName === 'TR' && e.parentElement && e.parentElement.tagName === 'TBODY')
    .map(tr => [...tr.children].filter(c => c.tagName === 'TD').map(td => td.textContent));
}
function makeSessionFixture(tag) {
  // Shaped exactly as devtools.inspect() reads a uiSession.
  return {
    _container: 'ctx-' + tag,
    _map: new Map([['panel', new Map([['root', {}], ['title', {}]])]]),
    _attach: new Map(),
    _children: new Map(),
    _listeners: new Map([['panel', new Map([['root', new Set(['click-handler'])]])]]),
    _mount: new Map(),
    _unmount: new Map(),
    _lists: new Map(),
    _portals: new Map(),
  };
}

// ---- Instances built BEFORE lockdown (an app that booted, then opted into the
// integrity tier) ----
// devtools.factory() takes the clock INSTANCE, mirroring what
// runtime.resolve() injects (BL-466) — hand-wiring calls clock.factory()
// itself rather than passing the raw clock module descriptor.
const uiPre = devtoolsUI.factory(devtools.factory(clock.factory()));
const rtPre = new ModuleRuntime();
rtPre.register({ name: 'fixtureLeaf', version: '1.0.0', type: 'fw.test.fixture', dependencies: [], factory: () => ({}) });
rtPre.register({ name: 'fixtureRoot', version: '2.1.0', type: 'fw.test.fixture', dependencies: ['fixtureLeaf'], factory: () => ({}) });
const sigPre = signal.factory();
const sPreA = sigPre.create(0);
const sPreB = sigPre.create(0);
let preRuns = 0;
sigPre.effect(() => { preRuns++; sPreA.get(); sPreB.get(); });
const sessionPre = makeSessionFixture('pre');
const preGraphBefore = JSON.stringify(sigPre.inspectGraph());
const preRegistryBefore = JSON.stringify(rtPre.snapshot());
const preSessionBefore = JSON.stringify(devtools.factory(clock.factory()).inspect(sessionPre));

// A view rendered BEFORE the freeze, to prove the module was already working.
const targetPreLockdown = document.createElement('div');
uiPre.render(targetPreLockdown, { session: sessionPre, runtime: rtPre, signal: sigPre });
values.preLockdown_viewCount = targetPreLockdown.firstElementChild.childElementCount;

lockdown();

// Control assertions: prove lockdown() actually took effect in THIS probe.
expectThrow('control_eval_throws', () => globalThis.eval('1'));
expectThrow('control_ctor_ctor_throws', () => ({}).constructor.constructor('return 1'));

// ---- The DOM surface devtoolsUI depends on, post-lockdown ----
expectNoThrow('dom_surface_available', () => {
  const d = document.createElement('div');
  d.className = 'x';
  d.setAttribute('data-view', 'probe');
  const p = document.createElement('p');
  p.textContent = 'hello';
  d.appendChild(p);
  document.body.appendChild(d);
  expectTrue('dom_surface_ok',
    d.tagName === 'DIV' && d.className === 'x' && d.getAttribute('data-view') === 'probe'
    && findAll(d, e => e.tagName === 'P').length === 1 && d.textContent === 'hello');
});

// ---- Drive the PRE-built instance AFTER lockdown ----
let preTarget = null;
expectNoThrow('preInstance_render', () => {
  preTarget = document.createElement('div');
  const root = uiPre.render(preTarget, { session: sessionPre, runtime: rtPre, signal: sigPre });
  values.preInstance_views = [...root.children].map(c => c.getAttribute('data-view')).join(',');
  values.preInstance_registryRows = JSON.stringify(rows(viewOf(root, 'registry')));
  values.preInstance_graphRows = JSON.stringify(rows(viewOf(root, 'graph')));
  values.preInstance_sessionRows = JSON.stringify(rows(viewOf(root, 'session')));
  values.preInstance_note = firstMatch(viewOf(root, 'graph'),
    e => e.className === 'fw-devtools-ui__note').textContent;
  expectTrue('preInstance_three_views', values.preInstance_views === 'session,registry,graph');
});

// ---- Read-only, post-lockdown: no source moved ----
expectTrue('preInstance_registry_unchanged', JSON.stringify(rtPre.snapshot()) === preRegistryBefore);
expectTrue('preInstance_nothing_instantiated', rtPre.instances.size === 0);
expectTrue('preInstance_graph_unchanged', JSON.stringify(sigPre.inspectGraph()) === preGraphBefore);
expectTrue('preInstance_no_effect_rerun', preRuns === 1);
expectTrue('preInstance_session_unchanged',
  JSON.stringify(devtools.factory(clock.factory()).inspect(sessionPre)) === preSessionBefore);

// ---- Fresh factories instantiated AFTER lockdown (new closures over an
// already-imported module graph, against frozen intrinsics) ----
let uiPost = null;
expectNoThrow('freshFactory_instantiation', () => {
  uiPost = devtoolsUI.factory(devtools.factory(clock.factory()));
});

// The canonical consumer path: resolve the module through a runtime built after
// the freeze (dependency injection hands devtoolsUI the devtools INSTANCE).
let uiResolved = null;
let rtPost = null;
expectNoThrow('freshRuntime_resolve', () => {
  rtPost = new ModuleRuntime();
  rtPost.registerAllDeep([devtoolsUI]);
  uiResolved = rtPost.resolve('devtoolsUI');
  expectTrue('freshRuntime_resolve_shape',
    typeof uiResolved.render === 'function' && typeof uiResolved.renderSession === 'function'
    && typeof uiResolved.renderRegistry === 'function' && typeof uiResolved.renderGraph === 'function');
});

if (uiPost && uiResolved) {
  const sigPost = signal.factory();
  const a = sigPost.create(0);
  const c = sigPost.computed(() => a.peek() + 1);
  let postRuns = 0;
  sigPost.effect(() => { postRuns++; a.get(); c.get(); });
  const sessionPost = makeSessionFixture('post');

  expectNoThrow('postInstance_renderSession', () => {
    const t = document.createElement('div');
    const sec = uiPost.renderSession(t, sessionPost);
    values.postInstance_sessionRows = JSON.stringify(rows(sec));
    expectTrue('postInstance_session_ok',
      sec.getAttribute('data-view') === 'session'
      && sec.textContent.includes('container: ctx-post')
      && sec.textContent.includes('summary: panel(root,title)'));
  });

  expectNoThrow('postInstance_renderRegistry', () => {
    const t = document.createElement('div');
    const sec = uiPost.renderRegistry(t, rtPost);
    values.postInstance_registryRows = JSON.stringify(rows(sec));
    expectTrue('postInstance_registry_ok', sec.getAttribute('data-view') === 'registry');
  });

  expectNoThrow('postInstance_renderGraph', () => {
    const t = document.createElement('div');
    const sec = uiPost.renderGraph(t, sigPost);
    values.postInstance_graphRows = JSON.stringify(rows(sec));
    expectTrue('postInstance_graph_ok',
      sec.getAttribute('data-view') === 'graph'
      && sec.textContent.includes('2 signal(s) · 1 effect(s) · 2 edge(s)'));
  });

  expectNoThrow('resolvedInstance_render', () => {
    const t = document.createElement('div');
    const root = uiResolved.render(t, { session: sessionPost, runtime: rtPost, signal: sigPost });
    values.resolvedInstance_views = [...root.children].map(c => c.getAttribute('data-view')).join(',');
    expectTrue('resolvedInstance_three_views',
      values.resolvedInstance_views === 'session,registry,graph');
  });

  // Read-only on the post-lockdown sources too.
  const postGraphBefore = JSON.stringify(sigPost.inspectGraph());
  const postRunsBefore = postRuns;
  expectNoThrow('postInstance_readonly_drive', () => {
    const t = document.createElement('div');
    uiPost.render(t, { signal: sigPost, runtime: rtPost });
    expectTrue('postInstance_graph_unchanged', JSON.stringify(sigPost.inspectGraph()) === postGraphBefore);
    expectTrue('postInstance_no_effect_rerun', postRuns === postRunsBefore);
    a.set(1);
    expectTrue('postInstance_effect_still_live', postRuns === postRunsBefore + 1);
  });

  // Error paths still throw (behaviour preserved, not disarmed by the freeze).
  expectThrow('postInstance_bad_target_throws', () => uiPost.render(null));
  expectThrow('postInstance_list_source_rejected', () => uiPost.renderRegistry(document.createElement('div'), { list: () => [] }));
  expectThrow('postInstance_bad_signal_rejected', () => uiPost.renderGraph(document.createElement('div'), {}));
}

const ok = Object.values(checks).every(Boolean);
write(JSON.stringify({ ok, checks, values }));
process.exit(0);
`;

/**
 * @param {string} [src] probe program (defaults to the devtoolsUI probe)
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

describe('devtoolsUI x sanity/lockdown() — measured compatibility', () => {
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

    test('the DOM surface devtoolsUI uses survives the freeze', () => {
        expect(parsed?.checks.dom_surface_available).toBe(true);
        expect(parsed?.checks.dom_surface_ok).toBe(true);
    });

    test('an instance built BEFORE lockdown still renders the three views', () => {
        expect(parsed?.checks.preInstance_render).toBe(true);
        expect(parsed?.checks.preInstance_three_views).toBe(true);
        expect(parsed?.values.preInstance_views).toBe('session,registry,graph');
        expect(parsed?.values.preLockdown_viewCount).toBe(3);
    });

    test('rendering stays read-only post-lockdown (asserted on the sources)', () => {
        expect(parsed?.checks.preInstance_registry_unchanged).toBe(true);
        expect(parsed?.checks.preInstance_nothing_instantiated).toBe(true);
        expect(parsed?.checks.preInstance_graph_unchanged).toBe(true);
        expect(parsed?.checks.preInstance_no_effect_rerun).toBe(true);
        expect(parsed?.checks.preInstance_session_unchanged).toBe(true);
        expect(parsed?.checks.postInstance_graph_unchanged).toBe(true);
        expect(parsed?.checks.postInstance_no_effect_rerun).toBe(true);
        expect(parsed?.checks.postInstance_effect_still_live).toBe(true);
    });

    test('a FRESH devtoolsUI.factory() built AFTER lockdown renders all three views', () => {
        expect(parsed?.checks.freshFactory_instantiation).toBe(true);
        expect(parsed?.checks.postInstance_renderSession).toBe(true);
        expect(parsed?.checks.postInstance_session_ok).toBe(true);
        expect(parsed?.checks.postInstance_renderRegistry).toBe(true);
        expect(parsed?.checks.postInstance_registry_ok).toBe(true);
        expect(parsed?.checks.postInstance_renderGraph).toBe(true);
        expect(parsed?.checks.postInstance_graph_ok).toBe(true);
    });

    test('the canonical resolve() path works on a runtime built after the freeze', () => {
        expect(parsed?.checks.freshRuntime_resolve).toBe(true);
        expect(parsed?.checks.freshRuntime_resolve_shape).toBe(true);
        expect(parsed?.checks.resolvedInstance_render).toBe(true);
        expect(parsed?.values.resolvedInstance_views).toBe('session,registry,graph');
    });

    test('error paths still throw post-lockdown (preserved, not disarmed)', () => {
        expect(parsed?.checks.postInstance_bad_target_throws).toBe(true);
        expect(parsed?.checks.postInstance_list_source_rejected).toBe(true);
        expect(parsed?.checks.postInstance_bad_signal_rejected).toBe(true);
    });

    // Non-vacuity anchor: every boolean above passes identically when the probe
    // renders EMPTY tables. These pin the exact rendered content measured under
    // lockdown, so a silently-degraded renderer reddens here.
    test('measured post-lockdown rendering is exact, not merely well-shaped', () => {
        expect(JSON.parse(parsed?.values.preInstance_registryRows ?? 'null')).toEqual([
            ['fixtureLeaf', '1.0.0', 'fw.test.fixture', '—', 'yes', 'no'],
            ['fixtureRoot', '2.1.0', 'fw.test.fixture', 'fixtureLeaf', 'yes', 'no'],
        ]);
        expect(JSON.parse(parsed?.values.preInstance_graphRows ?? 'null')).toEqual([
            ['e1', '2'],
            ['s1', 'signal'],
            ['s2', 'signal'],
            ['e1', 's1'],
            ['e1', 's2'],
        ]);
        expect(JSON.parse(parsed?.values.preInstance_sessionRows ?? 'null')).toEqual([
            ['panel', 'root,title', 'no'],
            ['panel', 'root', 'click-handler'],
            ['blocks', '1'],
            ['attaches', '0'],
            ['children', '0'],
            ['listeners', '1'],
            ['mountHooks', '0'],
            ['unmountHooks', '0'],
            ['lists', '0'],
            ['portals', '0'],
        ]);
        // The runtime built AFTER the freeze, rendered by the module it hosts:
        // registerAllDeep pulled devtoolsUI's own dependency chain.
        expect(JSON.parse(parsed?.values.postInstance_registryRows ?? 'null')).toEqual([
            ['clock', '1.0.0', 'fw.io.timing', '—', 'yes', 'yes'],
            ['devtools', '1.0.0', 'fw.dom.rendering', 'clock', 'yes', 'yes'],
            ['devtoolsUI', '1.0.0', 'fw.dom.rendering', 'devtools', 'yes', 'yes'],
        ]);
        // The computed appears as a node only because an effect reads it.
        expect(JSON.parse(parsed?.values.postInstance_graphRows ?? 'null')).toEqual([
            ['e1', '2'],
            ['s1', 'signal'],
            ['c2', 'computed'],
            ['e1', 's1'],
            ['e1', 'c2'],
        ]);
    });

    test('the graph view states its documented limits under lockdown too', () => {
        const note = parsed?.values.preInstance_note ?? '';
        expect(note).toContain('EFFECT dependency graph');
        expect(note).toContain('no live effect observes is not a node');
        expect(note).toContain('own sources of a computed');
    });
});
