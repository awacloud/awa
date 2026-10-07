// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * Wiring guard — asserts that a `ModuleRuntime` seeded with the FULL
 * descriptor manifest exported by `src/main.js` (`fw_require` + `modules` +
 * `extras` + `bundle`) resolves every descriptor declared in this package's
 * OWN `modules` array with no missing dependency, and that one FUNCTIONAL
 * graph path actually works (not just "resolves to something") —
 * `docx.write(docx.fromText(['x']))` → `docx.read` → `toText(read.document)`
 * contains `x`.
 *
 * Precedent: `pdf/tests/wiring.integration.test.js` (office/BATCH_40
 * task 04).
 *
 * @module ooxml/tests/wiring.integration
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

describe('ooxml wiring — manifest is dependency-closed', () => {
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

    test('docx write→read roundtrips through toText on the manifest-only runtime (functional leg)', () => {
        const rt = buildRuntime();
        const d = rt.resolve('docx');
        const doc = d.fromText(['x']);
        const read = d.read(d.write(doc));
        expect(d.toText(read.document)).toContain('x');
    });
});
