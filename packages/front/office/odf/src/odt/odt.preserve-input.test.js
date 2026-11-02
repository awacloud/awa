// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * `odt.write(doc, { preserveInput: true })` leaves the given model and
 * options exactly as they were. Without it, an extension's dehydrate hook
 * changes them (`docs/guide/extending.md`: hooks may mutate the visited
 * node, and the walker writes a returned replacement back into the
 * caller's arrays). The bytes are the same either way.
 */
import { describe, test, expect } from 'bun:test';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import * as odfMods from '../main.js';

const core = new ModuleRuntime();
for (const m of [...odfMods.fw_require, ...odfMods.modules]) core.register(m);
const odt = core.resolve('odt');
const pkg = core.resolve('pkgPackage');
const { ContractError } = core.resolve('odfErrors');
const big = new ModuleRuntime();
big.registerDeep(odfMods.odtLargeBundle);
const large = big.resolve('odtLargeBundle');
const enc = new TextEncoder();

const NS = 'xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"'
    + ' xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"';

/** An .odt whose paragraphs carry change marks, which the large bundle types on read. */
function marked() {
    const p = pkg.read(odt.write({ body: [] }));
    p.parts['content.xml'] = enc.encode('<?xml version="1.0" encoding="UTF-8"?>'
        + `<office:document-content ${NS} office:version="1.3"><office:body><office:text>`
        + '<text:p>a<text:change-start text:change-id="c1"/>b<text:change-end text:change-id="c1"/></text:p>'
        + '<text:p>plain</text:p></office:text></office:body></office:document-content>');
    return pkg.write(p);
}

function thrown(fn) {
    try { fn(); } catch (e) { return e; }
    return null;
}

describe('odt.write preserveInput', () => {
    test('premise: without the option the large bundle changes the model it is given', () => {
        const m = large.read(marked());
        expect(m.body[0].changeMarkers).toHaveLength(2);
        const before = structuredClone({ ...m, package: undefined });
        large.write(m);
        expect({ ...m, package: undefined }).not.toEqual(before);
    });

    test('with it the model is left as it was, objects included; the bytes are the same', () => {
        const a = large.read(marked());
        const bytesWithout = large.write(a);
        const b = large.read(marked());
        const before = structuredClone({ ...b, package: undefined });
        const first = b.body[0];
        const pkgRef = b.package;
        const bytesWith = large.write(b, { preserveInput: true });
        expect({ ...b, package: undefined }).toEqual(before);
        expect(b.body[0]).toBe(first);
        expect(b.package).toBe(pkgRef);
        expect(Array.from(bytesWith)).toEqual(Array.from(bytesWithout));
    });

    test('the sidecars passed as options are left as they were too', () => {
        const m = large.read(marked());
        const styles = m.styles;
        const before = structuredClone(styles);
        large.write({ ...m, styles: undefined }, { styles, preserveInput: true });
        expect(styles).toEqual(before);
    });

    test('preserveInput: false is the default; another value throws odf/contract-error/odt', () => {
        expect(Array.from(odt.write(odt.read(marked()), { preserveInput: false })))
            .toEqual(Array.from(odt.write(odt.read(marked()))));
        for (const v of ['yes', 1, null]) {
            const e = thrown(() => odt.write({ body: [] }, { preserveInput: v }));
            expect(e).toBeInstanceOf(ContractError);
            expect(e.code).toBe('odf/contract-error/odt');
            expect(e.context).toMatchObject({ module: 'odt', argument: 'opts.preserveInput' });
        }
    });
});
