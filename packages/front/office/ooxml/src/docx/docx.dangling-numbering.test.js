// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * `docx.write(document, { danglingNumbering })`: a list reference
 * (`pPr.numPr.numId`, non-zero) to a num the written numbering does not
 * declare — or written without `opts.numbering` — throws by default
 * (`'throw'`: `docx/numbering-unknown-num`, `docx/numbering-missing`) and
 * is written as given with `'keep'`, as `docx.read` reads such a file
 * (Word ignores the reference).
 */
import { describe, test, expect } from 'bun:test';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import * as ooxmlMods from '../main.js';

const runtime = new ModuleRuntime();
for (const m of [...ooxmlMods.fw_require, ...ooxmlMods.modules]) runtime.register(m);
const d = runtime.resolve('docx');
const { ContractError } = runtime.resolve('ooxmlErrors');

function thrown(fn) {
    try { fn(); } catch (e) { return e; }
    return null;
}

const numbering = { abstractNums: [{ abstractNumId: 0,
    levels: [{ ilvl: 0, numFmt: 'decimal', lvlText: '%1.' }] }],
    nums: [{ numId: 1, abstractNumId: 0 }] };
// numId 7 is declared nowhere
const doc = () => ({ type: 'document', body: [d.listParagraph('Body item', 7, 0), d.listParagraph('Declared', 1, 0)] });
const headers = () => ({ rIdH: { type: 'header', body: [d.listParagraph('Header item', 7, 0)] } });
const styles = () => ({ styles: [{ type: 'paragraph', styleId: 'L', name: 'L', pPr: { numPr: { ilvl: 0, numId: 7 } } }] });
const numIdOf = (p) => p && p.pPr && p.pPr.numPr ? Number(p.pPr.numPr.numId) : null;

describe('danglingNumbering', () => {
    test('default and \'throw\': a num the numbering does not declare throws docx/numbering-unknown-num', () => {
        for (const extra of [{}, { danglingNumbering: 'throw' }]) {
            const e = thrown(() => d.write(doc(), { numbering, ...extra }));
            expect(e).toBeInstanceOf(ContractError);
            expect(e.code).toBe('docx/numbering-unknown-num');
        }
    });

    test('default and \'throw\': without opts.numbering throws docx/numbering-missing', () => {
        for (const extra of [{}, { danglingNumbering: 'throw' }]) {
            const e = thrown(() => d.write(doc(), extra));
            expect(e && e.code).toBe('docx/numbering-missing');
        }
    });

    test('\'keep\': body, header and style references are written as given and read back', () => {
        const out = d.write(doc(), { numbering, headers: headers(), styles: styles(), danglingNumbering: 'keep' });
        const back = d.read(out);
        expect(back.document.body.map(numIdOf)).toEqual([7, 1]);
        expect(numIdOf(back.headers.rIdH.body[0])).toBe(7);
        expect(numIdOf(back.styles.styles.find((s) => s.styleId === 'L'))).toBe(7);
        expect(back.numbering.nums.map((n) => Number(n.numId))).toEqual([1]);
    });

    test('\'keep\' without opts.numbering: written without a numbering part', () => {
        const out = d.write(doc(), { danglingNumbering: 'keep' });
        const back = d.read(out);
        expect(back.numbering).toBeUndefined();
        expect(back.document.body.map(numIdOf)).toEqual([7, 1]);
    });

    test('\'keep\' leaves the hyperlink checks in place', () => {
        const linked = { type: 'document', body: [{ type: 'paragraph', children: [
            { type: 'hyperlink', rId: 'rIdNone', children: [d.run('x')] }] }] };
        const e = thrown(() => d.write(linked, { danglingNumbering: 'keep' }));
        expect(e && e.code).toBe('docx/hyperlink-unresolved-rid');
    });

    test('a value other than \'throw\' or \'keep\' throws docx/invalid-dangling-numbering', () => {
        for (const v of ['drop', true, 0, null]) {
            const e = thrown(() => d.write(doc(), { numbering, danglingNumbering: v }));
            expect(e).toBeInstanceOf(ContractError);
            expect(e.code).toBe('docx/invalid-dangling-numbering');
        }
    });

    test('danglingNumbering: undefined is the default', () => {
        const ok = { type: 'document', body: [d.listParagraph('Declared', 1, 0)] };
        const a = d.write(ok, { numbering });
        const b = d.write(ok, { numbering, danglingNumbering: undefined });
        expect(Array.from(b)).toEqual(Array.from(a));
    });
});
