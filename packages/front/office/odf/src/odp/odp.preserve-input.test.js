// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * `odp.write(doc, { preserveInput: true })` leaves the given model and
 * options exactly as they were. Without it, an extension's dehydrate hook
 * changes them (the walker hands it the caller's slides and
 * sidecars). The bytes are the same either way.
 */
import { describe, test, expect } from 'bun:test';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import * as odfModp from '../main.js';

function runtime() {
    const rt = new ModuleRuntime();
    for (const m of [...odfModp.fw_require, ...odfModp.modules]) rt.register(m);
    return rt;
}
const core = runtime();
const odp = core.resolve('odp');
const { ContractError } = core.resolve('odfErrors');
// An extension whose dehydrate hooks change the slide and the styles they
// visit (the slide's name, so the bytes, too).
const hooked = runtime().resolve('odp');
hooked.use({
    dehydrateSlide(sl) { sl.name += ' (written)'; return sl; },
    dehydrateStyles(s) { s.dehydrated = true; return s; }
});

const doc = () => odp.read(odp.write({ slides: [odp.slide('Data', { masterPageName: 'Default' })] }));

function thrown(fn) {
    try { fn(); } catch (e) { return e; }
    return null;
}

describe('odp.write preserveInput', () => {
    test('premise: without the option a dehydrate hook changes the model', () => {
        const m = doc();
        hooked.write(m);
        expect(m.slides[0].name).toBe('Data (written)');
    });

    test('with it the model is left as it was, objects included; the bytes are the same', () => {
        const without = hooked.write(doc());
        const m = doc();
        const before = structuredClone({ ...m, package: undefined });
        const slide = m.slides[0];
        const pkgRef = m.package;
        const bytes = hooked.write(m, { preserveInput: true });
        expect({ ...m, package: undefined }).toEqual(before);
        expect(m.slides[0]).toBe(slide);
        expect(m.package).toBe(pkgRef);
        expect(Array.from(bytes)).toEqual(Array.from(without));
    });

    test('the sidecars passed as options are left as they were too', () => {
        const m = doc();
        const styles = m.styles;
        const before = structuredClone(styles);
        hooked.write({ ...m, styles: undefined }, { styles, preserveInput: true });
        expect(styles).toEqual(before);
    });

    test('preserveInput: false is the default; another value throws odf/contract-error/odp', () => {
        expect(Array.from(odp.write(doc(), { preserveInput: false }))).toEqual(Array.from(odp.write(doc())));
        for (const v of ['yes', 1, null]) {
            const e = thrown(() => odp.write(doc(), { preserveInput: v }));
            expect(e).toBeInstanceOf(ContractError);
            expect(e.code).toBe('odf/contract-error/odp');
            expect(e.context).toMatchObject({ module: 'odp', argument: 'opts.preserveInput' });
        }
    });
});
