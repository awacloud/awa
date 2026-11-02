// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * `ods.write(doc, { preserveInput: true })` leaves the given model and
 * options exactly as they were. Without it, an extension's dehydrate hook
 * changes them (the walker hands it the caller's spreadsheet and
 * sidecars). The bytes are the same either way.
 */
import { describe, test, expect } from 'bun:test';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import * as odfMods from '../main.js';

function runtime() {
    const rt = new ModuleRuntime();
    for (const m of [...odfMods.fw_require, ...odfMods.modules]) rt.register(m);
    return rt;
}
const core = runtime();
const ods = core.resolve('ods');
const { ContractError } = core.resolve('odfErrors');
// An extension whose dehydrate hooks change the table and the styles they
// visit (the table's name, so the bytes, too).
const hooked = runtime().resolve('ods');
hooked.use({
    dehydrateTable(t) { t.name += ' (written)'; return t; },
    dehydrateStyles(s) { s.dehydrated = true; return s; }
});

const doc = () => ods.read(ods.write({ spreadsheet: { tables: [ods.sheet('Data', [[1, 2], ['a', 'b']])] } }));

function thrown(fn) {
    try { fn(); } catch (e) { return e; }
    return null;
}

describe('ods.write preserveInput', () => {
    test('premise: without the option a dehydrate hook changes the model', () => {
        const m = doc();
        hooked.write(m);
        expect(m.spreadsheet.tables[0].name).toBe('Data (written)');
    });

    test('with it the model is left as it was, objects included; the bytes are the same', () => {
        const without = hooked.write(doc());
        const m = doc();
        const before = structuredClone({ ...m, package: undefined });
        const table = m.spreadsheet.tables[0];
        const pkgRef = m.package;
        const bytes = hooked.write(m, { preserveInput: true });
        expect({ ...m, package: undefined }).toEqual(before);
        expect(m.spreadsheet.tables[0]).toBe(table);
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

    test('preserveInput: false is the default; another value throws odf/contract-error/ods', () => {
        expect(Array.from(ods.write(doc(), { preserveInput: false }))).toEqual(Array.from(ods.write(doc())));
        for (const v of ['yes', 1, null]) {
            const e = thrown(() => ods.write(doc(), { preserveInput: v }));
            expect(e).toBeInstanceOf(ContractError);
            expect(e.code).toBe('odf/contract-error/ods');
            expect(e.context).toMatchObject({ module: 'ods', argument: 'opts.preserveInput' });
        }
    });
});
