// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * Integration test — the documents of `tests/_helpers/written-documents.js`
 * (what the office-scorecard axis C hands to odfvalidator) are written by
 * the public writers, are well-formed ODF packages, and read back with the
 * package's readers with the features they were built to carry; `roundTrip`
 * writes each one back through the same package.
 */
import { describe, test, expect } from 'bun:test';
import { PNG_1X1, odfRuntime, roundTrip, writtenDocuments } from './_helpers/written-documents.js';

const rt = odfRuntime();
const docs = writtenDocuments(rt);
const byId = Object.fromEntries(docs.map((d) => [d.id, d]));
const read = (id, opts) => rt.resolve(byId[id].ext).read(byId[id].bytes, opts);

const MEDIA_TYPES = {
    odt: 'application/vnd.oasis.opendocument.text',
    ods: 'application/vnd.oasis.opendocument.spreadsheet',
    odp: 'application/vnd.oasis.opendocument.presentation'
};

/**
 * The first ZIP local entry of `bytes`: its name, compression method and,
 * when stored, its content.
 *
 * @param {Uint8Array} bytes
 * @returns {{ name: string, method: number, content: string }}
 */
function firstEntry(bytes) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const method = view.getUint16(8, true);
    const size = view.getUint32(18, true);
    const nameLength = view.getUint16(26, true);
    const extraLength = view.getUint16(28, true);
    const dec = new TextDecoder();
    const name = dec.decode(bytes.subarray(30, 30 + nameLength));
    const start = 30 + nameLength + extraLength;
    return { name, method, content: dec.decode(bytes.subarray(start, start + size)) };
}

/** Names of the raw elements a paragraph kept in `_extras.children`. */
const extrasNames = (node) => ((node._extras && node._extras.children) || []).map((c) => c.name);

describe('written documents for the output-validity measure', () => {
    test('11 documents, unique kebab-case ids prefixed by their extension', () => {
        expect(docs).toHaveLength(11);
        expect(new Set(docs.map((d) => d.id)).size).toBe(11);
        expect(docs.filter((d) => d.ext === 'odt')).toHaveLength(6);
        expect(docs.filter((d) => d.ext === 'ods')).toHaveLength(3);
        expect(docs.filter((d) => d.ext === 'odp')).toHaveLength(2);
        for (const d of docs) {
            expect(d.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)+$/);
            expect(d.id.startsWith(`${d.ext}-`)).toBe(true);
            expect(d.bytes).toBeInstanceOf(Uint8Array);
        }
    });

    test('each document is a ZIP whose first entry is the stored mimetype of its extension', () => {
        for (const d of docs) {
            expect([...d.bytes.subarray(0, 4)]).toEqual([0x50, 0x4b, 0x03, 0x04]);
            const first = firstEntry(d.bytes);
            expect(first.name).toBe('mimetype');
            expect(first.method).toBe(0);
            expect(first.content).toBe(MEDIA_TYPES[d.ext]);
        }
    });

    test('every document reads back with its package reader', () => {
        for (const d of docs) {
            const back = rt.resolve(d.ext).read(d.bytes);
            expect(back.mimetype).toBe(MEDIA_TYPES[d.ext]);
            expect(back.meta.generator).toBe('@awacloud/odf');
        }
    });

    test('odt: paragraph styles, emphasis spans, links and the metadata', () => {
        const back = read('odt-text-styles-meta');
        expect(back.meta.title).toBe('Quarterly report');
        expect(back.meta.initialCreator).toBe('Bob');
        expect(back.body[0].styleName).toBe('Title');
        expect(back.body[1].runs[1]).toEqual({ type: 'span', value: 'bold', bold: true });
        expect(back.body[1].runs.at(-2)).toEqual({ type: 'span', value: 'a named style', styleName: 'Emphasis', italic: true });
        expect(back.body[2].runs[1].href).toBe('https://example.com/report');
        expect(back.body[4]).toEqual({ type: 'soft-page-break' });
        expect('autoStyles' in back).toBe(false);
        expect(back.styles.masterStyles.map((e) => e.name)).toEqual(['style:master-page']);
    });

    test('odt: headings, ordered / bullet / nested lists and the section', () => {
        const back = read('odt-headings-lists-section');
        expect(back.body.map((n) => n.type)).toEqual(['heading', 'paragraph', 'list', 'list', 'list', 'heading', 'section']);
        expect(back.body[0].outlineLevel).toBe(1);
        expect(back.body[2].ordered).toBe(true);
        expect(back.body[2].items[1].children[1]).toMatchObject({ type: 'list', ordered: true, numFormat: 'a' });
        expect(back.body[3].ordered).toBe(false);
        expect(back.body[4].numFormat).toBe('I');
        expect(back.body[6].name).toBe('Appendix');
    });

    test('odt: the grid table keeps its header row, merge and nested list', () => {
        const [, grid, plain] = read('odt-table').body;
        expect(grid).toMatchObject({ type: 'table', name: 'Inventory', grid: true, headerRows: 1 });
        expect(grid.rows[1].cells[2].children[0].type).toBe('list');
        expect(grid.rows[2].cells[0].colSpan).toBe(2);
        expect(grid.rows[2].cells[1].covered).toBe(true);
        expect(plain.columns).toEqual([{ repeated: 2 }]);
    });

    test('odt: fields, bookmarks and the footer page number', () => {
        const back = read('odt-fields-bookmarks');
        expect(extrasNames(back.body[0])).toEqual(['text:bookmark', 'text:title', 'text:author-name']);
        expect(extrasNames(back.body[2])).toEqual(['text:bookmark-start', 'text:bookmark-end']);
        expect(extrasNames(back.body[3])).toContain('text:bookmark-ref');
        const master = rt.resolve('styleMasterPage').parseMasterPage(back.styles.masterStyles[0]);
        expect(master.footers.default[0].children.map((c) => c.name)).toContain('text:page-number');
    });

    test('odt: the tracked-changes container and the change markers', () => {
        const back = read('odt-tracked-changes');
        const container = back.body[0];
        expect(container.type).toBe('unknown');
        const regions = rt.resolve('textTracked').parseTrackedChanges(container.element).trackedChanges;
        expect(regions.map((r) => [r.id, r.kind])).toEqual([['ct1', 'insertion'], ['ct2', 'deletion'], ['ct3', 'format-change']]);
        expect(extrasNames(back.body[1])).toEqual(['text:change-start', 'text:change-end']);
    });

    test('odt: the picture part, the image and text-box frames and the shapes', () => {
        const back = read('odt-image-frames-shapes', { framesInRuns: true });
        expect(back.package.parts['Pictures/dot.png']).toEqual(PNG_1X1);
        expect(back.package.manifest.entries.find((e) => e.fullPath === 'Pictures/dot.png').mediaType).toBe('image/png');
        expect(back.body[0].runs[1]).toMatchObject({ type: 'frame', name: 'Logo', child: { kind: 'image', href: 'Pictures/dot.png' } });
        expect(back.body[2].runs[1].child.kind).toBe('text-box');
        expect(extrasNames(back.body[3])).toEqual(['draw:rect', 'draw:ellipse', 'draw:line', 'draw:custom-shape']);
    });

    test('ods: every cell value type the writer supports', () => {
        const [values] = read('ods-value-types').spreadsheet.tables;
        const typed = values.rows.slice(1, 8).map((r) => [r.cells[1].valueType, r.cells[1].value]);
        expect(typed).toEqual([
            ['string', 'text value'], ['float', '3.25'], ['percentage', '0.42'], ['currency', '19.99'],
            ['date', '2026-03-01T00:00:00'], ['time', 'PT10H30M00S'], ['boolean', 'true']
        ]);
        expect(values.rows[4].cells[1].currency).toBe('EUR');
        expect(values.rows[8].cells[1].valueType).toBeUndefined();
    });

    test('ods: two sheets, formulas, merges, styles, hidden and repeated rows', () => {
        const back = read('ods-formulas-merges-styles');
        const [data, notes] = back.spreadsheet.tables;
        expect([data.name, notes.name]).toEqual(['Data', 'Notes']);
        expect(data.rows[0].cells[0].colSpan).toBe(3);
        expect(data.rows[4].cells[1].formula).toBe('of:=SUM([.B3:.B4])');
        expect(data.rows[5].cells[2].rowSpan).toBe(2);
        expect(data.rows[7].repeated).toBe(2);
        expect(data.rows[8].visibility).toBe('collapse');
        expect(data.columns[2].visibility).toBe('collapse');
        expect(back.automaticStyles.styles.map((s) => s.name)).toEqual(['co1', 'co2', 'ro1', 'ce1', 'ce2', 'ce3']);
        expect(rt.resolve('numberFormats').parse({ children: back.styles.styles }).formats.map((f) => f.kind))
            .toEqual(['date', 'percentage']);
        expect(read('ods-from-arrays').spreadsheet.tables[0].rows).toHaveLength(3);
    });

    test('odp: text slides, notes and the picture, shapes and table frame', () => {
        const o = rt.resolve('odp');
        const text = read('odp-text-slides');
        expect(text.slides.map((s) => s.name)).toEqual(['Welcome', 'Agenda', 'End']);
        expect(text.slides[1].notes.body[0].name).toBe('draw:frame');
        expect(o.toText(text)).toBe('Welcome\nAn odf presentation\n\nAgenda\nFirst point\nSecond point\nThird point');
        const [shapes, figures] = read('odp-shapes-picture-table').slides;
        expect(shapes.frames[1].child).toMatchObject({ kind: 'image', href: 'https://example.com/picture.png' });
        expect(extrasNames(shapes)).toEqual(['draw:rect', 'draw:ellipse', 'draw:line', 'draw:custom-shape']);
        expect(extrasNames(figures.frames[1])).toEqual(['table:table']);
    });
});

describe('roundTrip', () => {
    test('each written document is written back and reads back with the same text', () => {
        for (const d of docs) {
            const mod = rt.resolve(d.ext);
            const out = roundTrip(d.ext, d.bytes, rt);
            expect(firstEntry(out).name).toBe('mimetype');
            expect(mod.toText(mod.read(out))).toBe(mod.toText(mod.read(d.bytes)));
        }
    });

    test('carried parts and the typed model survive', () => {
        const odt = rt.resolve('odt');
        const image = odt.read(roundTrip('odt', byId['odt-image-frames-shapes'].bytes, rt), { framesInRuns: true });
        expect(image.package.parts['Pictures/dot.png']).toEqual(PNG_1X1);
        expect(image.body[0].runs[1].type).toBe('frame');
        const lists = odt.read(roundTrip('odt', byId['odt-headings-lists-section'].bytes, rt));
        expect(lists.body).toEqual(read('odt-headings-lists-section').body);
        const sheets = rt.resolve('ods').read(roundTrip('ods', byId['ods-formulas-merges-styles'].bytes, rt));
        expect(sheets.spreadsheet).toEqual(read('ods-formulas-merges-styles').spreadsheet);
        const deck = rt.resolve('odp').read(roundTrip('odp', byId['odp-shapes-picture-table'].bytes, rt));
        expect(deck.slides).toEqual(read('odp-shapes-picture-table').slides);
    });

    test('throws nothing for each extension', () => {
        for (const ext of ['odt', 'ods', 'odp']) {
            const first = docs.find((d) => d.ext === ext);
            expect(() => roundTrip(ext, first.bytes)).not.toThrow();
        }
    });
});
