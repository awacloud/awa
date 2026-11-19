// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview Unit test (FINDINGS Q4 method) — worker-serializability of the
 * `graphic.anim` aggregator asserted against a MINIFIED artifact.
 *
 * The fw Worker path is `ModuleRuntime.serialize(specs)` → `def.factory.toString()`
 * evaluated in a bare scope with no module-scope bindings. A factory that
 * captures a module-scope identifier throws `ReferenceError` worker-side. A
 * minifier can rename/hoist such a binding but keeps it OUT of factory scope,
 * so the capture survives minification — this test proves detection survives
 * too.
 *
 * Method: two throwaway fixture descriptors (capture-free / capturing) are
 * written to a temp dir, minified with `Bun.build({minify:true})`, imported,
 * `serialize()`d, reconstructed in a bare `new Function` scope, registered
 * into a fresh runtime and resolved. Capture → `ReferenceError`. The fixtures
 * are NOT committed source (the capturing one would fail the package's
 * `fw/no-factory-capture` lint gate by design) — generated + removed within
 * this test, mirroring `tests/frames.integration.test.js`'s
 * `capturing-frames-sibling.js` pattern.
 *
 * Ported from `ai/archives/spikes/graphic-anim/03-packaging/min-capture.test.js` (the W0 spike, GO
 * verdict) against the now-registered `animAggregatorModule`.
 */

import { test, expect, describe, beforeAll, afterAll } from 'bun:test';
import { mkdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { graphicModules } from './main.js';
import { animAggregatorModule, AGGREGATE_NAMES } from './aggregator.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const TMP = join(HERE, '_min_fixture_tmp');

const GOOD_SRC = `
export const goodAggModule = {
    name: 'graphic.animGood',
    type: 'fw.dom.graphic',
    version: '0.1.0',
    dependencies: [],
    factory(a, b) {
        return { a, b, combined: [a, b] };
    },
};
`.trimStart();

const BAD_SRC = `
// Module-scope binding — the capture hazard.
const CAPTURED_TABLE = { hoisted: true, marker: 'module-scope' };

export const badAggModule = {
    name: 'graphic.animBad',
    type: 'fw.dom.graphic',
    version: '0.1.0',
    dependencies: [],
    factory(a, b) {
        // References CAPTURED_TABLE from module scope — not a parameter.
        return { a, b, table: CAPTURED_TABLE };
    },
};
`.trimStart();

/** Write, minify (`Bun.build({minify:true})`) and import a throwaway fixture module. */
async function buildMinifiedFixture(base, source, exportName) {
    const src = join(TMP, `${base}.js`);
    await Bun.write(src, source);
    const res = await Bun.build({
        entrypoints: [src],
        target: 'browser', format: 'esm', minify: true,
    });
    if (!res.success) throw new Error(`minify failed: ${res.logs.map(l => l.message).join('\n')}`);
    const text = await res.outputs[0].text();
    const out = join(TMP, `${base}.min.js`);
    await Bun.write(out, text);
    return (await import(`${out}?t=${Date.now()}`))[exportName];
}

/**
 * Reconstruct a serialized graph's factories in a bare scope and resolve the
 * root — the faithful fw Worker-side evaluation. Throws if any factory
 * captured a binding absent from the worker scope.
 */
function resolveWorkerSide(runtime, rootName) {
    const { content } = runtime.serialize([rootName]);
    const mods = new Function(`return ${content}`)();
    const fresh = new ModuleRuntime();
    fresh.registerAllDeep(mods);
    return fresh.resolve(rootName);
}

let goodMin, badMin;

beforeAll(async () => {
    mkdirSync(TMP, { recursive: true });
    goodMin = await buildMinifiedFixture('fixture-good-agg', GOOD_SRC, 'goodAggModule');
    badMin = await buildMinifiedFixture('fixture-bad-agg', BAD_SRC, 'badAggModule');
});

afterAll(() => {
    rmSync(TMP, { recursive: true, force: true });
});

describe('Q4 — worker-serializability against the .min.js', () => {
    test('the real aggregate (readable) serialize→worker-side roundtrip yields the 14-name namespace', () => {
        const rt = new ModuleRuntime();
        rt.registerAllDeep(graphicModules);
        const ns = resolveWorkerSide(rt, 'graphic.anim');
        expect(Object.keys(ns).sort()).toEqual(AGGREGATE_NAMES.map(n => n.split('.')[1]).sort());
    });

    test('MINIFIED capture-free fixture passes the worker-serialize assertion', () => {
        const rt = new ModuleRuntime();
        rt.registerAllDeep([goodMin]);
        const api = resolveWorkerSide(rt, 'graphic.animGood');
        expect(api).toBeDefined();
        expect(api.combined).toBeDefined();
    });

    test('MINIFIED capturing fixture is REJECTED (ReferenceError worker-side)', () => {
        // Sanity: the minifier really did rename/hoist the captured binding out
        // of the factory params (the "reintroduces capture" hazard).
        const src = badMin.factory.toString();
        const params = src.slice(src.indexOf('(') + 1, src.indexOf(')')).split(',').map(s => s.trim());
        const bodyRef = src.match(/table:\s*([A-Za-z_$][\w$]*)/)[1];
        expect(params).not.toContain(bodyRef); // captured identifier is NOT a param

        const rt = new ModuleRuntime();
        rt.registerAllDeep([badMin]);
        expect(() => resolveWorkerSide(rt, 'graphic.animBad')).toThrow(ReferenceError);
    });

    test('the real aggregator factory has ZERO free identifiers (every member is a param)', () => {
        const src = animAggregatorModule.factory.toString();
        const params = new Set(
            src.slice(src.indexOf('(') + 1, src.indexOf(')')).split(',').map(s => s.trim()),
        );
        for (const name of AGGREGATE_NAMES) {
            expect(params.has(name.split('.')[1])).toBe(true);
        }
    });
});
