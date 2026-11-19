// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * Tracked-change wrappers (`w:ins`, `w:del`, `w:moveFrom`, `w:moveTo`)
 * keep every child, in place, through `docxStructure` and through
 * `docx.read` / `docx.write`; `docx.toText` shows the accepted view.
 *
 * The fixtures are hand-written WordprocessingML: a revision holding
 * each kind of inline content ECMA-376 Part 1 § 17.13.5 lets it carry.
 */
import { describe, test, expect } from 'bun:test';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import * as ooxmlMods from '../main.js';

const runtime = new ModuleRuntime();
for (const m of [...ooxmlMods.fw_require, ...ooxmlMods.modules]) runtime.register(m);
const d = runtime.resolve('docx');
const s = runtime.resolve('docxStructure');
const xml = runtime.resolve('xml');

const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'
    + ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"'
    + ' xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"';

const para = (inner) => xml.parse(`<w:p ${NS}>${inner}</w:p>`);
const run = (t) => `<w:r><w:t>${t}</w:t></w:r>`;
const elementNames = (el) => el.children.filter((c) => c.type === 'element').map((c) => c.name);

const RICH_INS = '<w:ins w:id="1" w:author="Ann" w:date="2026-01-01T00:00:00Z">'
    + run('a')
    + `<w:hyperlink r:id="rIdLink">${run('link')}</w:hyperlink>`
    + `<w:fldSimple w:instr=" PAGE ">${run('1')}</w:fldSimple>`
    + `<w:sdt><w:sdtContent>${run('tag')}</w:sdtContent></w:sdt>`
    + '<m:oMath><m:r><m:t>x</m:t></m:r></m:oMath>'
    + '<w:del w:id="2" w:author="Bob"><w:r><w:delText>gone</w:delText></w:r></w:del>'
    + '<w:customXml w:element="place"/>' // T68: w:smartTag is typed now; customXml stays an unknown child
    + '</w:ins>';

describe('docxStructure — a revision keeps every child', () => {
    test('typed children in order, an unknown one in the revision _extras', () => {
        const p = s.parseParagraph(para(RICH_INS));
        expect(p._extras).toBeUndefined();
        const ins = p.children[0];
        expect(ins.type).toBe('ins');
        expect(ins.children.map((c) => c.type)).toEqual(['run', 'hyperlink', 'fldSimple', 'sdt', 'oMath', 'del']);
        expect(ins.children[1].rId).toBe('rIdLink');
        expect(ins.children[5].author).toBe('Bob');
        expect(ins._extras.map((e) => e.name)).toEqual(['w:customXml']);
    });

    test('parse → render → parse is a fixed point, and the XML holds every child', () => {
        const once = s.parseParagraph(para(RICH_INS));
        const rendered = s.renderParagraph(once);
        const insEl = rendered.children.find((c) => c.name === 'w:ins');
        expect(elementNames(insEl)).toEqual(['w:r', 'w:hyperlink', 'w:fldSimple', 'w:sdt', 'm:oMath', 'w:del', 'w:customXml']);
        expect(s.parseParagraph(xml.parse(xml.serialize(rendered).replace('<w:p>', `<w:p ${NS}>`)))).toEqual(once);
    });

    test('moveFrom / moveTo are typed revisions, kept in place', () => {
        const p = s.parseParagraph(para(run('A')
            + `<w:moveFrom w:id="3" w:author="Ann">${run('B')}</w:moveFrom>`
            + run('C')
            + `<w:moveTo w:id="4" w:author="Ann" w:date="2026-01-02T00:00:00Z">${run('B')}</w:moveTo>`));
        expect(p._extras).toBeUndefined();
        expect(p.children.map((c) => c.type)).toEqual(['run', 'moveFrom', 'run', 'moveTo']);
        expect(p.children[3]).toMatchObject({ id: '4', author: 'Ann', date: '2026-01-02T00:00:00Z' });
        expect(elementNames(s.renderParagraph(p))).toEqual(['w:r', 'w:moveFrom', 'w:r', 'w:moveTo']);
    });
});

describe('docx.read / docx.write — revisions', () => {
    const doc = {
        type: 'document',
        body: [{
            type: 'paragraph',
            children: [
                { type: 'run', children: [{ type: 'text', value: 'Keep ' }] },
                {
                    type: 'ins', id: '1', author: 'Ann',
                    children: [{
                        type: 'hyperlink', rId: 'rId90', target: 'https://example.invalid/', external: true,
                        children: [{ type: 'run', children: [{ type: 'text', value: 'new link' }] }]
                    }]
                },
                { type: 'del', id: '2', author: 'Ann', children: [{ type: 'run', children: [{ type: 'delText', value: 'old' }] }] },
                { type: 'moveFrom', id: '3', author: 'Ann', children: [{ type: 'run', children: [{ type: 'text', value: ' moved' }] }] },
                { type: 'moveTo', id: '4', author: 'Ann', children: [{ type: 'run', children: [{ type: 'text', value: ' moved' }] }] }
            ]
        }]
    };

    test('a hyperlink inside a revision keeps its target and relationship', () => {
        const back = d.read(d.write(doc));
        const kids = back.document.body[0].children;
        expect(kids.map((c) => c.type)).toEqual(['run', 'ins', 'del', 'moveFrom', 'moveTo']);
        expect(kids[1].children[0]).toMatchObject({ type: 'hyperlink', target: 'https://example.invalid/', external: true });
    });

    test('toText shows inserted and moved-to text, never deleted or moved-from text', () => {
        expect(d.toText(d.read(d.write(doc)).document)).toBe('Keep new link moved');
    });
});

describe('revision range markers kept in place (T31 c3)', () => {
    const NAMES = [
        'moveFromRangeStart', 'moveFromRangeEnd', 'moveToRangeStart', 'moveToRangeEnd',
        'customXmlInsRangeStart', 'customXmlInsRangeEnd', 'customXmlDelRangeStart', 'customXmlDelRangeEnd',
        'customXmlMoveFromRangeStart', 'customXmlMoveFromRangeEnd', 'customXmlMoveToRangeStart', 'customXmlMoveToRangeEnd'
    ];
    const marker = (name, attrs = { 'w:id': '7' }) => ({ type: 'rangeMarker', name, attrs });
    const p = (t) => ({ type: 'paragraph', children: [{ type: 'run', children: [{ type: 'text', value: t }] }] });

    test('in a paragraph: typed between the runs, written back there', () => {
        const once = s.parseParagraph(para(run('A')
            + '<w:moveFromRangeStart w:id="2" w:author="Ann" w:name="move1"/>'
            + `<w:moveFrom w:id="3" w:author="Ann">${run('B')}</w:moveFrom>` + run('C')));
        expect(once._extras).toBeUndefined();
        expect(once.children.map((c) => c.type)).toEqual(['run', 'rangeMarker', 'moveFrom', 'run']);
        expect(once.children[1]).toEqual(marker('moveFromRangeStart', { 'w:id': '2', 'w:author': 'Ann', 'w:name': 'move1' }));
        expect(elementNames(s.renderParagraph(once))).toEqual(['w:r', 'w:moveFromRangeStart', 'w:moveFrom', 'w:r']);
    });

    test('each of the twelve names round-trips in a paragraph', () => {
        for (const name of NAMES) {
            const once = s.parseParagraph(para(`${run('A')}<w:${name} w:id="9"/>${run('B')}`));
            expect([name, once.children[1]]).toEqual([name, marker(name, { 'w:id': '9' })]);
            expect(elementNames(s.renderParagraph(once))).toEqual(['w:r', `w:${name}`, 'w:r']);
        }
    });

    test('in the body, a table cell and a block SDT: kept in place through docx.read / docx.write', () => {
        const doc = {
            type: 'document',
            body: [
                p('one'),
                marker('moveFromRangeEnd', { 'w:id': '2' }),
                {
                    type: 'table',
                    rows: [{ type: 'row', cells: [{ type: 'cell', children: [p('cell'), marker('moveToRangeEnd', { 'w:id': '6' })] }] }]
                },
                { type: 'blockSdt', children: [marker('customXmlMoveFromRangeEnd', { 'w:id': '4' }), p('in sdt')] },
                p('two')
            ]
        };
        const body = d.read(d.write(doc)).document.body;
        expect(body.map((n) => n.type)).toEqual(['paragraph', 'rangeMarker', 'table', 'blockSdt', 'paragraph']);
        expect(body[1]).toEqual(marker('moveFromRangeEnd', { 'w:id': '2' }));
        expect(body[2].rows[0].cells[0].children.map((n) => n.type)).toEqual(['paragraph', 'rangeMarker']);
        expect(body[3].children.map((n) => n.type)).toEqual(['rangeMarker', 'paragraph']);
        // The markers add no text (toText reads no block SDT content: a limit of its own).
        expect(d.toText(d.read(d.write(doc)).document)).toBe('one\ncell\ntwo');
    });
});

describe('bookmarks and range markup kept in place (T51 f, T39)', () => {
    const p = (t) => ({ type: 'paragraph', children: [{ type: 'run', children: [{ type: 'text', value: t }] }] });
    const BODY = (inner) => xml.parse(`<w:document ${NS}><w:body>${inner}<w:sectPr/></w:body></w:document>`);

    test('the marker attributes are read and written back, none when absent', () => {
        const once = s.parseParagraph(para('<w:bookmarkStart w:id="1" w:name="col" w:colFirst="0" w:colLast="2" w:displacedByCustomXml="next"/>'
            + run('A') + '<w:bookmarkEnd w:id="1" w:displacedByCustomXml="prev"/>'
            + '<w:commentRangeStart w:id="3" w:displacedByCustomXml="next"/><w:commentRangeEnd w:id="3" w:displacedByCustomXml="prev"/>'
            + '<w:bookmarkStart w:id="4" w:name="plain"/><w:bookmarkEnd w:id="4"/>'));
        expect(once.children[0]).toEqual({ type: 'bookmarkStart', id: '1', name: 'col', colFirst: 0, colLast: 2, displacedByCustomXml: 'next' });
        expect(once.children[2]).toEqual({ type: 'bookmarkEnd', id: '1', displacedByCustomXml: 'prev' });
        expect(once.children[3]).toEqual({ type: 'commentRangeStart', id: '3', displacedByCustomXml: 'next' });
        expect(once.children[4]).toEqual({ type: 'commentRangeEnd', id: '3', displacedByCustomXml: 'prev' });
        expect(once.children[5]).toEqual({ type: 'bookmarkStart', id: '4', name: 'plain' });
        expect(once.children[6]).toEqual({ type: 'bookmarkEnd', id: '4' });
        expect(s.parseParagraph(s.renderParagraph(once))).toEqual(once);
        const attrs = s.renderParagraph(once).children.filter((c) => c.type === 'element').map((c) => c.attrs);
        expect(attrs[0]).toEqual({ 'w:id': '1', 'w:name': 'col', 'w:colFirst': '0', 'w:colLast': '2', 'w:displacedByCustomXml': 'next' });
        expect(attrs[6]).toEqual({ 'w:id': '4' });
    });

    test('a permission and a proofing mark are range markup, typed in place in a paragraph', () => {
        const once = s.parseParagraph(para('<w:permStart w:id="5" w:edGrp="everyone"/>' + run('A')
            + '<w:proofErr w:type="spellStart"/>' + run('B') + '<w:proofErr w:type="spellEnd"/><w:permEnd w:id="5"/>'));
        expect(once._extras).toBeUndefined();
        expect(once.children.map((c) => c.type === 'rangeMarker' ? c.name : c.type))
            .toEqual(['permStart', 'run', 'proofErr', 'run', 'proofErr', 'permEnd']);
        expect(once.children[0].attrs).toEqual({ 'w:id': '5', 'w:edGrp': 'everyone' });
        expect(elementNames(s.renderParagraph(once)))
            .toEqual(['w:permStart', 'w:r', 'w:proofErr', 'w:r', 'w:proofErr', 'w:permEnd']);
    });

    test('between blocks: the body keeps its bookmarks, comment range end and permission end in place', () => {
        const parsed = s.parseBody(xml.findChild(BODY('<w:p/><w:bookmarkStart w:id="1" w:name="b" w:displacedByCustomXml="next"/><w:p/>'
            + '<w:bookmarkEnd w:id="1"/><w:commentRangeEnd w:id="2"/><w:permEnd w:id="3"/><w:p/>'), 'w:body'));
        expect(parsed.extras).toEqual([]);
        expect(parsed.body.map((n) => n.type === 'rangeMarker' ? n.name : n.type))
            .toEqual(['paragraph', 'bookmarkStart', 'paragraph', 'bookmarkEnd', 'commentRangeEnd', 'permEnd', 'paragraph']);
        expect(parsed.body[1]).toEqual({ type: 'bookmarkStart', id: '1', name: 'b', displacedByCustomXml: 'next' });
    });

    test('in the body, a cell and a block control: kept in place through docx.read / docx.write', () => {
        const doc = {
            type: 'document',
            body: [
                p('one'),
                { type: 'bookmarkStart', id: '1', name: 'whole' },
                { type: 'table', rows: [{ type: 'row', cells: [{ type: 'cell', children: [
                    { type: 'bookmarkStart', id: '2', name: 'cell' }, p('cell'), { type: 'bookmarkEnd', id: '2' }] }] }] },
                { type: 'blockSdt', children: [{ type: 'bookmarkStart', id: '3', name: 'toc' }, p('in sdt'), { type: 'bookmarkEnd', id: '3' }] },
                { type: 'bookmarkEnd', id: '1' },
                { type: 'commentRangeEnd', id: '4' },
                { type: 'rangeMarker', name: 'permEnd', attrs: { 'w:id': '5' } },
                p('two')
            ]
        };
        const back = d.read(d.write(doc)).document;
        expect(back.body.map((n) => n.type)).toEqual(doc.body.map((n) => n.type));
        for (const k of [1, 4, 5, 6, 7]) expect(back.body[k]).toEqual(doc.body[k]);
        expect(back.body[2].rows[0].cells[0].children).toEqual(doc.body[2].rows[0].cells[0].children);
        expect(back.body[3].children).toEqual(doc.body[3].children);
        expect(back._extras).toBeUndefined();
        expect(d.toText(back)).toBe('one\ncell\ntwo');
    });

    test("the body's other untyped children are kept, before the section properties", () => {
        const doc = d.read(d.write({ type: 'document', body: [p('one')], sectPr: {} })).document;
        expect(doc._extras).toBeUndefined();
        const odd = xml.el('w:altChunk', { 'r:id': 'rIdX' });
        const back = d.read(d.write({ type: 'document', body: [p('one')], _extras: [odd], sectPr: {} })).document;
        expect(back._extras.map((e) => e.name)).toEqual(['w:altChunk']);
    });
});
