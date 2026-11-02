// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * `xlsx.write(workbook, { preserveInput: true })` leaves the given model
 * exactly as it was. Without it the writer changes it by design: the
 * extensions' dehydrate hooks run on it, and the authors of threaded
 * comments are added to `workbook.persons`. The bytes are the same either
 * way.
 */
import { describe, test, expect } from 'bun:test';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import * as ooxmlMods from '../main.js';

function runtime() {
    const rt = new ModuleRuntime();
    for (const m of [...ooxmlMods.fw_require, ...ooxmlMods.modules]) rt.register(m);
    return rt;
}
const core = runtime();
const xlsx = core.resolve('xlsx');
const { ContractError } = core.resolve('ooxmlErrors');
// An extension whose dehydrate hook changes the sheet it visits (and so the
// bytes: the written sheet name).
const hooked = runtime().resolve('xlsx');
hooked.use({ dehydrateSheet(s) { s.name += ' (written)'; return s; } });

const workbook = (withComments) => ({
    sheets: [{
        name: 'Review',
        rows: [['Item', 'Value'], ['a', 1]],
        ...(withComments ? { threadedComments: [{ ref: 'B1', author: 'Alice', date: '2024-01-15T10:00:00Z', text: 'Why?' }] } : {})
    }]
});

function thrown(fn) {
    try { fn(); } catch (e) { return e; }
    return null;
}

describe('xlsx.write preserveInput', () => {
    test('premise: without the option the writer and a dehydrate hook change the model', () => {
        const a = workbook(true);
        xlsx.write(a);
        expect(a.persons.map((p) => p.displayName)).toEqual(['Alice']);
        const b = workbook(false);
        hooked.write(b);
        expect(b.sheets[0].name).toBe('Review (written)');
    });

    test('with it the model is left as it was, objects included; the bytes are the same', () => {
        const without = hooked.write(workbook(false));
        const m = workbook(false);
        const before = structuredClone(m);
        const sheet = m.sheets[0];
        const bytes = hooked.write(m, { preserveInput: true });
        expect(m).toEqual(before);
        expect(m.sheets[0]).toBe(sheet);
        expect(Array.from(bytes)).toEqual(Array.from(without));
        expect(hooked.read(bytes).workbook.sheets[0].name).toBe('Review (written)');
        const c = workbook(true);
        const cBefore = structuredClone(c);
        xlsx.write(c, { preserveInput: true });
        expect(c).toEqual(cBefore);
        expect(c.persons).toBeUndefined();
    });

    test('preserveInput: false is the default; another value throws xlsx/invalid-preserve-input', () => {
        expect(Array.from(xlsx.write(workbook(false), { preserveInput: false }))).toEqual(Array.from(xlsx.write(workbook(false))));
        for (const v of ['yes', 1, null]) {
            const e = thrown(() => xlsx.write(workbook(false), { preserveInput: v }));
            expect(e).toBeInstanceOf(ContractError);
            expect(e.code).toBe('xlsx/invalid-preserve-input');
        }
    });
});
