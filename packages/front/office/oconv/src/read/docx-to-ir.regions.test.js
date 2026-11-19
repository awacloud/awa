// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview T80 (D58 A, a): the docx reader's headers and footers
 * (`document.header`, `document.footer`, three slots) and its page fields
 * (`field`), under `include: ['layout']` only. The documents are built
 * with ooxml's writer.
 */

import { describe, test, expect, beforeAll } from 'bun:test';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { modules as ooxmlModules, fw_require as ooxmlFwRequire } from '@awacloud/ooxml';
import { oconvIr } from '../ir/ir.js';
import { oconvDocxToIr } from './docx-to-ir.js';

let docxApi;
let docxToIr;
let validate;

beforeAll(() => {
    const runtime = new ModuleRuntime();
    runtime.registerAll(ooxmlFwRequire);
    runtime.registerAll(ooxmlModules);
    runtime.register(oconvIr);
    runtime.register(oconvDocxToIr);
    docxApi = runtime.resolve('docx');
    ({ docxToIr } = runtime.resolve('oconvDocxToIr'));
    ({ validate } = runtime.resolve('oconvIr'));
});

const LAYOUT = { include: ['layout'] };

const run = (text) => ({ type: 'run', rPr: {}, children: [{ type: 'text', value: text }] });
const para = (...children) => ({ type: 'paragraph', children });
const fieldChar = (kind) => ({ type: 'run', rPr: {}, children: [{ type: 'fldChar', kind }] });
const instr = (value) => ({ type: 'run', rPr: {}, children: [{ type: 'instrText', value }] });
/** A complex field: begin, its instruction, separate, the result runs, end. */
const complex = (instruction, ...result) => [fieldChar('begin'), instr(instruction), fieldChar('separate'), ...result, fieldChar('end')];
const simple = (instruction, text) => ({ type: 'fldSimple', instr: instruction, children: [run(text)] });

/**
 * A docx whose last section has a default header (a link) and an even one,
 * a default footer (`PAGE`, `NUMPAGES`) and a first one (`DATE`), and
 * `titlePg`; no first header, no even footer.
 */
function regionsDocx(settings, sect) {
    const sectPr = {
        headerReferences: [{ type: 'default', rId: 'rIdH1' }, { type: 'even', rId: 'rIdH2' }],
        footerReferences: [{ type: 'default', rId: 'rIdF1' }, { type: 'first', rId: 'rIdF2' }],
        titlePg: true,
        ...sect
    };
    const headers = {
        rIdH1: { type: 'header', body: [para(run('Report '), { type: 'hyperlink', rId: 'rIdL1', target: 'https://h.test/', children: [run('site')] })] },
        rIdH2: { type: 'header', body: [para(run('Even'))] }
    };
    const footers = {
        rIdF1: { type: 'footer', body: [para(run('Page '), ...complex(' PAGE \\* MERGEFORMAT ', run('1')), run(' of '), simple(' NUMPAGES ', '4'))] },
        rIdF2: { type: 'footer', body: [para(run('Printed '), ...complex(' DATE \\@ "d MMMM yyyy" ', run('13 November 2026')))] }
    };
    return docxApi.write({ body: [para(run('Body'))], sectPr }, { headers, footers, ...(settings ? { settings } : {}) });
}

/** A slot's blocks as `[kind, …]` rows: each inline as `[kind, text]`, a link's target appended, a field `['field', name, text]`. */
function shape(blocks) {
    if (blocks === null) return null;
    return blocks.map((b) => [b.kind, ...(b.children || []).map((c) => (c.kind === 'field' ? ['field', c.name, c.text]
        : c.link ? [c.kind, c.text, c.link] : [c.kind, c.text]))]);
}

describe('oconvDocxToIr — headers and footers under include layout (T80)', () => {
    test('without layout the document states no header and no footer', () => {
        const { ir, losses } = docxToIr(docxApi.read(regionsDocx({ evenAndOddHeaders: true })));
        expect(ir.header).toBeNull();
        expect(ir.footer).toBeNull();
        expect(losses.filter((l) => /^(layout|field)\//.test(l.code))).toEqual([]);
    });

    test('under layout, the last section gives the three slots of each region', () => {
        const { ir, losses } = docxToIr(docxApi.read(regionsDocx({ evenAndOddHeaders: true })), LAYOUT);
        expect(validate(ir)).toEqual({ ok: true, errors: [] });
        expect(shape(ir.header.default)).toEqual([['paragraph', ['run', 'Report '], ['run', 'site', 'https://h.test/']]]);
        expect(ir.header.first).toEqual([]);
        expect(shape(ir.header.even)).toEqual([['paragraph', ['run', 'Even']]]);
        expect(shape(ir.footer.default)).toEqual([['paragraph', ['run', 'Page '], ['field', 'page', '1'], ['run', ' of '], ['field', 'pages', '4']]]);
        expect(shape(ir.footer.first)).toEqual([['paragraph', ['run', 'Printed '], ['run', '13 November 2026']]]);
        expect(ir.footer.even).toEqual([]);
        expect(losses.filter((l) => l.code === 'field/static')).toEqual([{ code: 'field/static', detail: 'DATE' }]);
        expect(losses.filter((l) => l.code === 'link/target-missing')).toEqual([]);
    });

    test('even is null without evenAndOddHeaders, first null without titlePg', () => {
        const noEven = docxToIr(docxApi.read(regionsDocx()), LAYOUT).ir;
        expect(noEven.header.even).toBeNull();
        expect(noEven.footer.even).toBeNull();
        expect(noEven.header.first).toEqual([]);
        const noFirst = docxToIr(docxApi.read(regionsDocx(undefined, { titlePg: false })), LAYOUT).ir;
        expect(noFirst.header.first).toBeNull();
        expect(noFirst.footer.first).toBeNull();
        expect(shape(noFirst.footer.default)[0][2]).toEqual(['field', 'page', '1']);
    });

    test('a reference whose part did not read is layout/region-unresolved and no part', () => {
        const r = docxApi.read(regionsDocx({ evenAndOddHeaders: true }));
        delete r.headers[r.document.sectPr.headerReferences.find((h) => h.type === 'even').rId];
        const { ir, losses } = docxToIr(r, LAYOUT);
        expect(ir.header.even).toEqual([]);
        expect(losses.filter((l) => l.code === 'layout/region-unresolved')).toEqual([{ code: 'layout/region-unresolved', detail: 'header even' }]);
    });

    test('a region none of whose slots holds a block is null', () => {
        const bytes = docxApi.write({ body: [para(run('Body'))], sectPr: { headerReferences: [{ type: 'default', rId: 'rIdH' }] } },
            { headers: { rIdH: { type: 'header', body: [para()] } } });
        const { ir } = docxToIr(docxApi.read(bytes), LAYOUT);
        expect(ir.header).toBeNull();
        expect(ir.footer).toBeNull();
    });

    test('a page field in the body reads as a field under layout; another field keeps its runs, with no loss', () => {
        const body = [para(run('p. '), ...complex(' PAGE ', run('2'))), para(...complex(' DATE ', run('today')))];
        const plain = docxToIr(docxApi.read(docxApi.write({ body })));
        expect(shape(plain.ir.children)).toEqual([['paragraph', ['run', 'p. '], ['run', '2']], ['paragraph', ['run', 'today']]]);
        const { ir, losses } = docxToIr(docxApi.read(docxApi.write({ body })), LAYOUT);
        expect(shape(ir.children)).toEqual([['paragraph', ['run', 'p. '], ['field', 'page', '2']], ['paragraph', ['run', 'today']]]);
        expect(losses.filter((l) => l.code === 'field/static')).toEqual([]);
    });

    test('SECTIONPAGES reads as pages; a field nested in a page field gives its text to the outer one', () => {
        const body = [para(...complex(' SECTIONPAGES ', run('5'))),
            para(...complex(' PAGE ', ...complex(' QUOTE "7" ', run('7'))))];
        const { ir } = docxToIr(docxApi.read(docxApi.write({ body })), LAYOUT);
        expect(shape(ir.children)).toEqual([['paragraph', ['field', 'pages', '5']], ['paragraph', ['field', 'page', '7']]]);
    });
});

describe("oconvDocxToIr — a field takes its result run's props (T80, amended)", () => {
    test("a footer's PAGE whose result run is 9 pt bold reads as a field of size 9, bold", () => {
        const styled = { type: 'run', rPr: { bold: true, size: 18 }, children: [{ type: 'text', value: '4' }] };
        const bytes = docxApi.write({ body: [para(run('Body'))], sectPr: { footerReferences: [{ type: 'default', rId: 'rIdF' }] } },
            { footers: { rIdF: { type: 'footer', body: [para(run('p. '), ...complex(' PAGE ', styled))] } } });
        const { ir } = docxToIr(docxApi.read(bytes), LAYOUT);
        const field = ir.footer.default[0].children[1];
        expect(field).toMatchObject({ kind: 'field', name: 'page', text: '4', bold: true, size: 9 });
        const simpleField = docxToIr(docxApi.read(docxApi.write({ body: [para({ type: 'fldSimple', instr: ' NUMPAGES ', children: [styled] })] })), LAYOUT).ir.children[0].children[0];
        expect(simpleField).toMatchObject({ kind: 'field', name: 'pages', text: '4', bold: true, size: 9 });
    });
});
