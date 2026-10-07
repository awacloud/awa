// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * Wiring guard — asserts that a `ModuleRuntime` seeded with the FULL
 * descriptor manifest exported by `src/main.js` (`fw_require` + `modules` +
 * `extras` + `bundle`) resolves every descriptor declared in this package's
 * OWN `modules` array with no missing dependency, and that one FUNCTIONAL
 * graph path actually works (not just "resolves to something") — the
 * minimal odt write→read case from
 * `odf/tests/roundtrip.integration.test.js`, re-run on the manifest-only
 * runtime.
 *
 * Precedent: `pdf/tests/wiring.integration.test.js` (office/BATCH_40
 * task 04).
 *
 * @module odf/tests/wiring.integration
 */
import { describe, test, expect } from 'bun:test';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { fw_require, modules, extras, bundle } from '../src/main.js';

const ALL = [...fw_require, ...modules, ...extras, ...bundle];

function buildRuntime() {
    const rt = new ModuleRuntime();
    for (const m of ALL) rt.register(m);
    return rt;
}

describe('odf wiring — manifest is dependency-closed', () => {
    test('every descriptor exposes a string name', () => {
        for (const m of ALL) expect(typeof m.name).toBe('string');
    });

    test('runtime resolves every descriptor in the package\'s own `modules` array (no missing dependency)', () => {
        const rt = buildRuntime();
        for (const m of modules) {
            expect(() => rt.resolve(m.name)).not.toThrow();
        }
    });

    test('runtime resolves every `extras` and `bundle` descriptor (measured 100% resolvable, office/BATCH_40 task 04)', () => {
        const rt = buildRuntime();
        for (const m of [...extras, ...bundle]) {
            expect(() => rt.resolve(m.name)).not.toThrow();
        }
    });

    test('odt — hello world paragraph roundtrips on the manifest-only runtime (functional leg)', () => {
        const rt = buildRuntime();
        const o = rt.resolve('odt');
        const doc = { body: [o.paragraph('Hello, world.')] };
        const back = o.read(o.write(doc));
        expect(back.body).toHaveLength(1);
        expect(back.body[0].runs[0].value).toBe('Hello, world.');
    });
});
