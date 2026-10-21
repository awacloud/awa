// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * Tests — `docx.write` gives every drawing a `wp:docPr` id unique in the
 * document (ECMA-376 Part 1 § 20.4.2.5), across the body and the story
 * parts, keeping the ids it is given when they do not clash.
 */
import { describe, test, expect } from 'bun:test';
import { ooxmlRuntime, PNG_1X1 } from '../../tests/_helpers/written-documents.js';

const rt = ooxmlRuntime();
const d = rt.resolve('docx');
const opc = rt.resolve('opcPackage');
const chart = rt.resolve('drawingmlChart');

const para = (children) => ({ type: 'paragraph', children });
const image = (opts = {}) => d.imageRun(PNG_1X1, { cx: '1in', cy: '1in', ...opts });
/** Every `wp:docPr` id of a part, in document order. */
const ids = (bytes, part) => [...new TextDecoder().decode(opc.read(bytes).parts[part]).matchAll(/<wp:docPr id="(\d+)"/g)].map((m) => Number(m[1]));

describe('docx — wp:docPr ids are unique in the document', () => {
    test('built drawings (image, chart, shape) get 1, 2, 3', () => {
        const bytes = d.write({ type: 'document', body: [
            para([image()]),
            para([d.chartRun(chart.barChart({ series: [{ name: 's', values: [1] }] }), { cx: '2in', cy: '1in' })]),
            para([d.shapeRun('rect', { cx: '1in', cy: '1in' })])
        ] });
        expect(ids(bytes, '/word/document.xml')).toEqual([1, 2, 3]);
    });

    test('ids are unique across the body and the story parts', () => {
        const bytes = d.write({
            type: 'document',
            body: [para([image()]), para([{ type: 'run', children: [{ type: 'footnoteReference', id: '1' }] }])],
            sectPr: { headerReferences: [{ type: 'default', rId: 'rIdH' }] }
        }, {
            headers: { rIdH: { type: 'header', body: [para([image()])] } },
            footnotes: { notes: [{ id: 1, body: [para([image()])] }] }
        });
        const all = [...ids(bytes, '/word/document.xml'), ...ids(bytes, '/word/header1.xml'), ...ids(bytes, '/word/footnotes.xml')];
        expect(all.sort((a, b) => a - b)).toEqual([1, 2, 3]);
    });

    test('a given id is kept; a later duplicate and a missing or bad one take the smallest free id', () => {
        const doc = { type: 'document', body: [
            para([image()]),
            para([image({ docId: 1 })]),
            para([image({ docId: 7 })]),
            para([image({ docId: 7 })]),
            para([image({ docId: -2 })])
        ] };
        // Explicit ids are claimed first: 1 and 7; then the first drawing,
        // the duplicate 7 and the negative id take 2, 3, 4 in order.
        const bytes = d.write(doc);
        expect(ids(bytes, '/word/document.xml')).toEqual([2, 1, 7, 3, 4]);
    });

    test('ids are patched in place: a second write gives the same bytes', () => {
        const doc = { type: 'document', body: [para([image()]), para([image()])] };
        const first = d.write(doc);
        const drawings = doc.body.map((p) => p.children[0].children[0]);
        expect(drawings.map((x) => x.docId)).toEqual([1, 2]);
        expect(d.write(doc)).toEqual(first);
    });

    test('ids read from a document are written back unchanged', () => {
        const doc = { type: 'document', body: [para([image({ docId: 5 })]), para([image({ docId: 0 })]), para([image()])] };
        const back = d.read(d.write(doc));
        // 0 is a valid id (ST_DrawingElementId is an unsignedInt): kept; the third gets 1.
        expect(ids(d.write(back.document), '/word/document.xml')).toEqual([5, 0, 1]);
    });
});
