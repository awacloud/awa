// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview T81: the docx reader's footnotes and endnotes (`note`, an
 * inline container holding the note's blocks), under `include: ['layout']`
 * only. The documents are built with ooxml's writer.
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
const text = (value) => ({ type: 'text', value });
const run = (value) => ({ type: 'run', rPr: {}, children: [text(value)] });
const para = (...children) => ({ type: 'paragraph', children });
const ref = (type, id, extra) => ({ type: 'run', rPr: {}, children: [{ type, id: String(id), ...extra }] });

/** A body with a two-paragraph footnote, an endnote and a custom-mark footnote. */
function notesDocx() {
    const body = [
        para(run('One'), ref('footnoteReference', 1), run(' two'), ref('endnoteReference', 1)),
        para(run('Three'), { type: 'run', rPr: {}, children: [{ type: 'footnoteReference', id: '2', customMarkFollows: true }, text('*')] })
    ];
    return docxApi.write({ body }, {
        footnotes: { notes: [{ id: 1, body: [para(run('Foot one')), para(run('Foot two'))] }, { id: 2, body: [para(run('Starred'))] }] },
        endnotes: { notes: [{ id: 1, body: [para(run('End one'))] }] }
    });
}

/** A paragraph's inlines as rows: a run's text, a note's class, mark and paragraph texts. */
function shape(p) {
    return p.children.map((c) => (c.kind === 'note'
        ? ['note', c.class, c.mark, c.children.map((b) => b.children.map((r) => r.text).join(''))]
        : [c.kind, c.text]));
}

describe('oconvDocxToIr — notes under include layout (T81)', () => {
    // T83: without layout a dropped reference's custom mark goes with it.
    test('without layout no note is read, and a custom mark goes with its reference', () => {
        const { ir } = docxToIr(docxApi.read(notesDocx()));
        expect(shape(ir.children[0])).toEqual([['run', 'One'], ['run', ' two']]);
        expect(shape(ir.children[1])).toEqual([['run', 'Three']]);
    });

    test('under layout each reference is a note at its place holding its blocks; a custom mark is its mark', () => {
        const { ir, losses } = docxToIr(docxApi.read(notesDocx()), LAYOUT);
        expect(validate(ir)).toEqual({ ok: true, errors: [] });
        expect(shape(ir.children[0])).toEqual([['run', 'One'], ['note', 'footnote', null, ['Foot one', 'Foot two']],
            ['run', ' two'], ['note', 'endnote', null, ['End one']]]);
        expect(shape(ir.children[1])).toEqual([['run', 'Three'], ['note', 'footnote', '*', ['Starred']]]);
        expect(losses.filter((l) => l.code.startsWith('note/'))).toEqual([]);
    });

    test('a reference whose note did not read is note/unresolved, and nothing is placed', () => {
        const r = docxApi.read(notesDocx());
        r.endnotes.notes = [];
        const { ir, losses } = docxToIr(r, LAYOUT);
        expect(shape(ir.children[0]).map((x) => x[0])).toEqual(['run', 'note', 'run']);
        expect(losses.filter((l) => l.code === 'note/unresolved')).toEqual([{ code: 'note/unresolved', detail: 'endnote 1' }]);
    });
});
