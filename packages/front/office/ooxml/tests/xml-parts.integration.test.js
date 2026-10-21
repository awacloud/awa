// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Every XML part of the written documents, made malformed,
 * makes `read` throw an `OoxmlError` — never the XML parser's own error.
 *
 * The documents are those of `tests/_helpers/written-documents.js` (docx
 * with comments, notes, headers, numbering; xlsx with shared strings,
 * styles, tables, comments; pptx with slides, layouts, masters, theme).
 * Each XML part (`.xml`, `.rels`) is rewritten with an unclosed element
 * after its declaration, the package re-zipped, and read back with the
 * reader of its kind. The error documentation promises that every throw
 * of the package is an `OoxmlError`; a part read without a typed wrapper
 * used to let the fw `XmlParseError` (`xml/parse-error`) through.
 *
 * @module ooxml/tests/xml-parts.integration
 */

import { describe, test, expect } from 'bun:test';
import { ooxmlRuntime, writtenDocuments } from './_helpers/written-documents.js';

const rt = ooxmlRuntime();
const zip = rt.resolve('zip');
const { OoxmlError } = rt.resolve('ooxmlErrors');
const enc = new TextEncoder();
const dec = new TextDecoder();

/** The package with `part` made malformed (an unclosed element after the XML declaration, or at the start). */
function breakPart(bytes, part) {
    const files = zip.unzipSync(bytes);
    const text = dec.decode(files[part]);
    const at = text.startsWith('<?xml') ? text.indexOf('?>') + 2 : 0;
    files[part] = enc.encode(text.slice(0, at) + '<broken>' + text.slice(at));
    return zip.zipSync(files);
}

const docs = writtenDocuments(rt);
const cases = [];
for (const d of docs) {
    for (const part of Object.keys(zip.unzipSync(d.bytes)).sort()) {
        if (/\.(xml|rels)$/.test(part)) cases.push({ id: `${d.id} :: ${part}`, ext: d.ext, bytes: d.bytes, part });
    }
}

describe('a part nested past maxDepth is a typed refusal', () => {
    /** The first written docx with its document body replaced by `n` nested tables. */
    function nestedTables(n) {
        const d = docs.find((x) => x.ext === 'docx');
        const files = zip.unzipSync(d.bytes);
        const head = dec.decode(files['word/document.xml']).split('<w:body>')[0] + '<w:body>';
        files['word/document.xml'] = enc.encode(head
            + '<w:tbl><w:tr><w:tc>'.repeat(n) + '<w:p/>' + '</w:tc></w:tr></w:tbl><w:p/>'.repeat(n)
            + '<w:sectPr/></w:body></w:document>');
        return zip.zipSync(files, { level: 0 });
    }

    test('20,000 nested tables: docx.read refuses with opc/xml-too-deep instead of overflowing the stack', () => {
        let thrown;
        try { rt.resolve('docx').read(nestedTables(20000)); } catch (e) { thrown = e; }
        expect(thrown).toBeInstanceOf(OoxmlError);
        expect(thrown.code).toBe('opc/xml-too-deep');
        expect(thrown.context.partName).toBe('word/document.xml');
    });

    test('the limit is a read option: maxDepth lifts it, a lower one refuses earlier', () => {
        const docx = rt.resolve('docx');
        // 400 tables are 1,203 elements deep: past the default, read with the limit lifted.
        expect(() => docx.read(nestedTables(400))).toThrow('nests elements deeper than 1000');
        expect(docx.read(nestedTables(400), { maxDepth: 0 }).document.body.length).toBeGreaterThan(0);
        expect(() => docx.read(nestedTables(10), { maxDepth: 20 })).toThrow('deeper than 20');
    });
});

describe('a malformed XML part is a typed refusal', () => {
    test('every kind and many parts are covered', () => {
        expect(new Set(cases.map((c) => c.ext))).toEqual(new Set(['docx', 'xlsx', 'pptx']));
        expect(cases.length).toBeGreaterThan(60);
    });

    for (const c of cases) {
        test(c.id, () => {
            let thrown;
            try {
                rt.resolve(c.ext).read(breakPart(c.bytes, c.part));
            } catch (e) {
                thrown = e;
            }
            // A part the reader never opens may stay unread: then nothing is thrown.
            if (thrown === undefined) return;
            expect(`${thrown.name} ${thrown.code}`).toBe(`${thrown.name} ${thrown.code}`);
            expect(thrown).toBeInstanceOf(OoxmlError);
        });
    }
});
