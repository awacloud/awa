// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * An empty drawing name (`wp:docPr/@name`, `pic:cNvPr/@name`: required,
 * may be empty) reads as the empty string and is written back empty, not
 * replaced by the other name or by `'Picture'`.
 */
import { describe, test, expect } from 'bun:test';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import * as ooxmlMods from '../main.js';

const runtime = new ModuleRuntime();
for (const m of [...ooxmlMods.fw_require, ...ooxmlMods.modules]) runtime.register(m);
const d = runtime.resolve('docx');
const drawing = runtime.resolve('docxDrawing');
const xml = runtime.resolve('xml');
const zip = runtime.resolve('zip');
const enc = new TextEncoder();
const dec = new TextDecoder();

const PNG_1X1 = new Uint8Array([
    0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4,
    0x89, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9C, 0x62, 0x00, 0x01, 0x00, 0x00,
    0x05, 0x00, 0x01, 0x0D, 0x0A, 0x2D, 0xB4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE,
    0x42, 0x60, 0x82
]);

/** A docx holding one picture whose docPr / cNvPr names are `docName` / `picName`. */
function pictureDocx(docName, picName) {
    const run = d.imageRun(PNG_1X1, { cx: 9525, cy: 9525, name: 'Seed' });
    const parts = zip.unzipSync(d.write({ type: 'document', body: [{ type: 'paragraph', children: [run] }] }));
    const body = dec.decode(parts['word/document.xml'])
        .replace(/(<wp:docPr\b[^>]*\sname=")[^"]*"/, `$1${docName}"`)
        .replace(/(<pic:cNvPr\b[^>]*\sname=")[^"]*"/, `$1${picName}"`);
    return zip.zipSync({ ...parts, 'word/document.xml': enc.encode(body) });
}
const namesOf = (bytes) => {
    const body = dec.decode(zip.unzipSync(bytes)['word/document.xml']);
    return [/<wp:docPr\b[^>]*\sname="([^"]*)"/.exec(body)[1], /<pic:cNvPr\b[^>]*\sname="([^"]*)"/.exec(body)[1]];
};
const firstDrawing = (doc) => doc.body[0].children[0].children[0];

describe('docxDrawing — empty names', () => {
    test('an empty docPr and cNvPr name read as \'\' and parse → render → parse keeps them', () => {
        const el = xml.parse(dec.decode(zip.unzipSync(pictureDocx('', ''))['word/document.xml']));
        const found = [];
        const walk = (n) => { if (n && n.type === 'element') { if (n.name === 'w:drawing') found.push(n); n.children.forEach(walk); } };
        walk(el);
        const once = drawing.parseDrawing(found[0]);
        expect(once.docName).toBe('');
        expect(once.picName).toBe('');
        expect(drawing.parseDrawing(xml.parse(xml.serialize(drawing.renderDrawing(once))))).toEqual(once);
    });

    test('a drawing with no picName still names its picture after docName', () => {
        const out = xml.serialize(drawing.renderDrawing({ type: 'drawing', mode: 'inline', cx: 1, cy: 1, docName: 'Logo', embedRef: 'rId9' }));
        expect(out).toContain('<pic:cNvPr id="0" name="Logo"/>');
        expect(out).toContain('name="Logo"');
    });
});

describe('docx.read / docx.write — empty drawing names', () => {
    for (const [docName, picName] of [['Obrázek 2', ''], ['', 'Picture 1'], ['', '']]) {
        test(`docPr ${JSON.stringify(docName)}, cNvPr ${JSON.stringify(picName)} survive the round trip`, () => {
            const r = d.read(pictureDocx(docName, picName));
            const out = d.write(r.document, { images: r.images });
            expect(namesOf(out)).toEqual([docName, picName]);
            expect(firstDrawing(d.read(out).document).picName).toBe(picName);
        });
    }
});
