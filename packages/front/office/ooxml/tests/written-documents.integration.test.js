// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * Integration test — the documents of `tests/_helpers/written-documents.js`
 * (what the office-scorecard axis C hands to OOXML-Validator) are written
 * by the public writers and read back by the package's readers with the
 * features they were built to carry.
 */
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ooxmlRuntime, roundTrip, writtenDocuments } from './_helpers/written-documents.js';

const rt = ooxmlRuntime();
const docs = writtenDocuments(rt);
const byId = Object.fromEntries(docs.map((d) => [d.id, d]));
const read = (id) => rt.resolve(byId[id].ext).read(byId[id].bytes);

describe('written documents for the output-validity measure', () => {
    test('21 documents, unique ids, each one a ZIP of its own extension', () => {
        expect(docs).toHaveLength(21);
        expect(new Set(docs.map((d) => d.id)).size).toBe(21);
        expect(docs.filter((d) => d.ext === 'docx')).toHaveLength(10);
        expect(docs.filter((d) => d.ext === 'xlsx')).toHaveLength(7);
        expect(docs.filter((d) => d.ext === 'pptx')).toHaveLength(4);
        for (const d of docs) {
            expect(d.id.startsWith(`${d.ext}-`)).toBe(true);
            expect([...d.bytes.subarray(0, 4)]).toEqual([0x50, 0x4b, 0x03, 0x04]);
        }
    });

    test('every document reads back; the parts it carries are all modelled', () => {
        for (const d of docs) {
            const back = rt.resolve(d.ext).read(d.bytes);
            // xlsx comments: the legacy VML drawing of the comment shapes is
            // listed (write() generates it from the comments model).
            const expected = d.id === 'xlsx-comments' ? ['/xl/drawings/vmlDrawing1.vml'] : [];
            expect(back.unmodelledParts.map((p) => p.partName)).toEqual(expected);
        }
    });

    test('docx: footer field, footnote, endnote, comment, bullets and the image read back', () => {
        const hdr = read('docx-numbering-header-footnote');
        expect(Object.keys(hdr.footers)).toEqual(['rIdF1']);
        expect(hdr.footers.rIdF1.body[0].children[0].type).toBe('fldSimple');
        expect(hdr.footnotes.notes.map((n) => n.id)).toContain(1);
        const notes = read('docx-comments-endnotes-fields');
        expect(notes.comments.comments[0].author).toBe('Alice');
        expect(notes.endnotes.notes.map((n) => n.id)).toContain(1);
        expect(notes.hyperlinks.rIdL1.target).toBe('https://example.com/');
        expect(rt.resolve('docx').toText(notes.document)).toContain('After the break.');
        const bullets = read('docx-bullet-list');
        expect(bullets.numbering.nums).toHaveLength(1);
        const image = read('docx-image');
        expect(Object.values(image.images)[0].contentType).toBe('image/png');
    });

    test('xlsx: every cell type, row and column properties, the hidden sheet', () => {
        const wb = read('xlsx-sheet-properties').workbook;
        expect(wb.sheets.map((s) => [s.name, s.state ?? 'visible'])).toEqual([['Visible', 'visible'], ['Hidden', 'hidden']]);
        const [r0, r1] = wb.sheets[0].rows;
        expect(r0.map((c) => c.t)).toEqual(['s', 'b', 'inlineStr']);
        expect(r1.map((c) => c.t)).toEqual(['str', 'b', 'n']);
        expect(wb.sheets[0].rowProps[2].hidden).toBe(true);
        expect(wb.sheets[0].cols.find((c) => c.min === 3).hidden).toBe(true);
    });

    test('xlsx: generated threaded-comment ids are upper-case GUIDs and the references agree', () => {
        const wb = read('xlsx-threaded-comments').workbook;
        const guid = /^\{[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}\}$/;
        const tc = wb.sheets[0].threadedComments;
        const ids = [...tc.map((c) => c.id), ...tc.map((c) => c.personId), ...wb.persons.map((p) => p.id), ...tc.filter((c) => c.parentId).map((c) => c.parentId)];
        for (const id of ids) expect(id).toMatch(guid);
        expect(tc[1].parentId).toBe(tc[0].id);
        expect(new Set(tc.map((c) => c.personId))).toEqual(new Set(wb.persons.map((p) => p.id)));
    });

    test('pptx: shapes, picture, table and chart read back', () => {
        expect(read('pptx-shapes').presentation.slides[0].shapes).toHaveLength(4);
        expect(read('pptx-picture-table').presentation.slides[0].shapes.map((s) => s.type)).toEqual(['shape', 'picture', 'table']);
        expect(read('pptx-chart').presentation.slides[0].shapes[0].type).toBe('chart');
    });

    test('roundTrip writes a read document back through the same package', () => {
        const src = new Uint8Array(readFileSync(join(import.meta.dir, '_fixtures', 'word-repeating-section.docx')));
        const out = roundTrip('docx', src, rt);
        const d = rt.resolve('docx');
        expect(d.toText(d.read(out).document)).toBe(d.toText(d.read(src).document));
        const xlsx = byId['xlsx-formulas-merges'].bytes;
        expect(rt.resolve('xlsx').read(roundTrip('xlsx', xlsx, rt)).workbook.sheets[0].merges).toEqual(['A1:D1']);
        const pptx = byId['pptx-title-body'].bytes;
        expect(rt.resolve('pptx').read(roundTrip('pptx', pptx, rt)).presentation.slides).toHaveLength(2);
    });
});
