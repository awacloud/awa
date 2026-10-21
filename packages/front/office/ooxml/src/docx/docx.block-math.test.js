// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * Tests — block math in docx. The schema allows `m:oMathPara` only inside
 * a `w:p` (`EG_PContent`), which is how Word writes a display equation:
 * `docx.write` wraps a body-level `oMathPara` node in a bare `w:p`, and
 * `docx.read` turns a bare `w:p` holding only one `m:oMathPara` back into
 * that node, in the body and in the story parts.
 */
import { describe, test, expect } from 'bun:test';
import { ooxmlRuntime } from '../../tests/_helpers/written-documents.js';

const rt = ooxmlRuntime();
const d = rt.resolve('docx');
const m = rt.resolve('ooxmlMath');
const opc = rt.resolve('opcPackage');
const encoder = new TextEncoder();
const decoder = new TextDecoder();

const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'
    + ' xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"';
const MATH = '<m:oMathPara><m:oMath><m:r><m:t>x=1</m:t></m:r></m:oMath></m:oMathPara>';

const equation = () => m.oMathPara(m.oMath(m.r('x = '), m.frac([m.r('a')], [m.r('b')])));
const part = (bytes, name) => decoder.decode(opc.read(bytes).parts[name]);

/** A docx package around a hand-written `word/document.xml` body. */
function documentPackage(bodyXml) {
    const pkg = opc.empty();
    const text = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${NS}><w:body>${bodyXml}</w:body></w:document>`;
    opc.setPart(pkg, '/word/document.xml', encoder.encode(text), d.CT_DOCUMENT);
    opc.setRels(pkg, '/', [{ Id: 'rId1', Type: d.REL_TYPE_DOC, Target: 'word/document.xml' }]);
    return opc.write(pkg);
}

describe('docx — block math is written inside a paragraph', () => {
    test('a body-level oMathPara is the only child of a bare w:p', () => {
        const text = part(d.write({ type: 'document', body: [d.paragraph('Before'), equation()] }), '/word/document.xml');
        expect(text).toContain('<w:p><m:oMathPara>');
        expect(text).toContain('</m:oMathPara></w:p>');
        expect(text).not.toMatch(/<w:body>(?:(?!<w:p[ >]).)*<m:oMathPara>/s);
    });

    test('story parts wrap it too (header, footnote)', () => {
        const bytes = d.write({
            type: 'document',
            body: [{ type: 'paragraph', children: [{ type: 'run', children: [{ type: 'footnoteReference', id: '1' }] }] }],
            sectPr: { headerReferences: [{ type: 'default', rId: 'rIdH' }] }
        }, {
            headers: { rIdH: { type: 'header', body: [equation()] } },
            footnotes: { notes: [{ id: 1, body: [equation()] }] }
        });
        expect(part(bytes, '/word/header1.xml')).toContain('<w:p><m:oMathPara>');
        expect(part(bytes, '/word/footnotes.xml')).toContain('<w:p><m:oMathPara>');
    });
});

describe('docx — a bare paragraph holding only block math reads as oMathPara', () => {
    test('Word shape: w:p with one m:oMathPara child', () => {
        const back = d.read(documentPackage(`<w:p>${MATH}</w:p>`));
        expect(back.document.body).toHaveLength(1);
        expect(back.document.body[0].type).toBe('oMathPara');
        expect(back.document.body[0].children[0].children[0].text).toBe('x=1');
    });

    test('the bare body-level m:oMathPara 1.0.0 wrote still reads', () => {
        const back = d.read(documentPackage(MATH));
        expect(back.document.body[0].type).toBe('oMathPara');
    });

    test('a story part reads the same shape', () => {
        const bytes = d.write({
            type: 'document', body: [d.paragraph('Body')],
            sectPr: { headerReferences: [{ type: 'default', rId: 'rIdH' }] }
        }, { headers: { rIdH: { type: 'header', body: [equation()] } } });
        const back = d.read(bytes);
        expect(back.headers.rIdH.body.map(n => n.type)).toEqual(['oMathPara']);
    });

    test.each([
        ['with a w:pPr', `<w:p><w:pPr><w:jc w:val="center"/></w:pPr>${MATH}</w:p>`],
        ['with a run beside it', `<w:p><w:r><w:t>see</w:t></w:r>${MATH}</w:p>`],
        ['with a bookmark beside it', `<w:p><w:bookmarkStart w:id="0" w:name="eq"/>${MATH}</w:p>`],
        ['with two m:oMathPara', `<w:p>${MATH}${MATH}</w:p>`]
    ])('any other paragraph is read as before (%s)', (_label, bodyXml) => {
        const back = d.read(documentPackage(bodyXml));
        const p = back.document.body[0];
        expect(p.type).toBe('paragraph');
        expect(p._extras.filter(e => e.name === 'm:oMathPara').length).toBeGreaterThan(0);
    });

    test('a table cell keeps it in the paragraph extras (cells never typed it)', () => {
        const back = d.read(documentPackage(`<w:tbl><w:tr><w:tc><w:p>${MATH}</w:p></w:tc></w:tr></w:tbl>`));
        const p = back.document.body[0].rows[0].cells[0].children[0];
        expect(p.type).toBe('paragraph');
        expect(p._extras[0].name).toBe('m:oMathPara');
    });
});

describe('docx — block math round trip', () => {
    test('read(write(doc)) keeps the node and a second write gives the same bytes', () => {
        const once = d.write({ type: 'document', body: [d.paragraph('Before'), equation(), d.paragraph('After')] });
        const back = d.read(once);
        expect(back.document.body.map(n => n.type)).toEqual(['paragraph', 'oMathPara', 'paragraph']);
        expect(back.document.body[1].children[0].children[1].type).toBe('frac');
        const twice = d.write(back.document);
        expect(part(twice, '/word/document.xml')).toBe(part(once, '/word/document.xml'));
    });
});
