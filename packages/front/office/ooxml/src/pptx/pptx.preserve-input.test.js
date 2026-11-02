// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * `pptx.write(presentation, { preserveInput: true })` leaves the given
 * model exactly as it was. Without it the writer changes it by design: the
 * extensions' dehydrate hooks run on it, a picture shape gets the
 * `embedRef` the writer assigns and a master its `layoutIds`. The bytes are
 * the same either way.
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
const pptx = core.resolve('pptx');
const { ContractError } = core.resolve('ooxmlErrors');
// An extension whose dehydrate hook changes the presentation it visits.
const hooked = runtime().resolve('pptx');
hooked.use({ dehydrateSettings(p) { p.dehydrated = true; return p; } });

const PNG = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 7]);
const presentation = () => {
    const pres = pptx.read(pptx.write({ slides: [{ title: 'Hello', body: ['World'] }] })).presentation;
    pres.slides[0].shapes.push(pptx.picture(PNG, { cx: '1in', cy: '1in' }));
    for (const m of pres.slideMasters || []) delete m.layoutIds;
    return pres;
};

function thrown(fn) {
    try { fn(); } catch (e) { return e; }
    return null;
}

describe('pptx.write preserveInput', () => {
    test('premise: without the option the writer and a dehydrate hook change the model', () => {
        const a = presentation();
        expect(a.slides[0].shapes.at(-1).embedRef).toBeUndefined();
        pptx.write(a);
        expect(a.slides[0].shapes.at(-1).embedRef).toBeDefined();
        expect(a.slideMasters[0].layoutIds).toBeDefined();
        const b = presentation();
        hooked.write(b);
        expect(b.dehydrated).toBe(true);
    });

    test('with it the model is left as it was, objects included; the bytes are the same', () => {
        const without = hooked.write(presentation());
        const m = presentation();
        const before = structuredClone(m);
        const slide = m.slides[0];
        const bytes = hooked.write(m, { preserveInput: true });
        expect(m).toEqual(before);
        expect(m.slides[0]).toBe(slide);
        expect(Array.from(bytes)).toEqual(Array.from(without));
    });

    test('preserveInput: false is the default; another value throws pptx/invalid-preserve-input', () => {
        expect(Array.from(pptx.write(presentation(), { preserveInput: false }))).toEqual(Array.from(pptx.write(presentation())));
        for (const v of ['yes', 1, null]) {
            const e = thrown(() => pptx.write(presentation(), { preserveInput: v }));
            expect(e).toBeInstanceOf(ContractError);
            expect(e.code).toBe('pptx/invalid-preserve-input');
        }
    });
});
