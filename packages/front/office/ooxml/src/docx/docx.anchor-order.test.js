// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * Tests — `docx.write` writes the children of a `wp:anchor` in the
 * `CT_Anchor` order (ECMA-376 Part 1 § 20.4.2.3), the preserved
 * positioning and wrap children among the typed ones, extensions after
 * the graphic.
 */
import { describe, test, expect } from 'bun:test';
import { ooxmlRuntime, PNG_1X1 } from '../../tests/_helpers/written-documents.js';
import { docxDrawing } from './drawing.js';

const rt = ooxmlRuntime();
const d = rt.resolve('docx');
const opc = rt.resolve('opcPackage');
const xml = rt.resolve('xml');
const shared = rt.resolve('ooxmlShared');
const decoder = new TextDecoder();
const encoder = new TextEncoder();

const NS_WP14 = 'http://schemas.microsoft.com/office/word/2010/wordprocessingDrawing';
const NS_MC = 'http://schemas.openxmlformats.org/markup-compatibility/2006';
const SCHEMA_ORDER = ['wp:simplePos', 'wp:positionH', 'wp:positionV', 'wp:extent', 'wp:effectExtent',
    'wp:wrapSquare', 'wp:docPr', 'wp:cNvGraphicFramePr', 'a:graphic', 'wp14:sizeRelH', 'wp14:sizeRelV'];

/** The anchor's positioning, wrap and extension children as Word writes them, in a scrambled order. */
function wordAnchorChildren() {
    const pos = (name, from, off) => xml.el(name, { relativeFrom: from }, [xml.el('wp:posOffset', {}, [xml.text(off)])]);
    return [
        xml.el('wp14:sizeRelV', { relativeFrom: 'page' }, [xml.el('wp14:pctHeight', {}, [xml.text('0')])]),
        xml.el('wp:wrapSquare', { wrapText: 'bothSides' }),
        pos('wp:positionV', 'paragraph', '-104609'),
        xml.el('wp14:sizeRelH', { relativeFrom: 'page' }, [xml.el('wp14:pctWidth', {}, [xml.text('0')])]),
        pos('wp:positionH', 'column', '1882747'),
        xml.el('wp:simplePos', { x: '0', y: '0' })
    ];
}

function anchoredDocument(anchorChildren) {
    const pic = d.imageRun(PNG_1X1, { cx: '1in', cy: '1in' });
    const drawing = pic.children.find(c => c.type === 'drawing');
    drawing.mode = 'anchor';
    drawing.anchorAttrs = { simplePos: '0', relativeHeight: '1', behindDoc: '0', locked: '0', layoutInCell: '1', allowOverlap: '1' };
    drawing.anchorChildren = anchorChildren;
    return { type: 'document', body: [{ type: 'paragraph', children: [pic] }] };
}

function findElement(node, name) {
    if (node.name === name) return node;
    for (const c of node.children || []) {
        if (c.type !== 'element') continue;
        const hit = findElement(c, name);
        if (hit) return hit;
    }
    return null;
}

const names = (el) => el.children.filter(c => c.type === 'element').map(c => c.name);
const documentXml = (bytes) => decoder.decode(opc.read(bytes).parts['/word/document.xml']);
const anchorOf = (bytes) => findElement(xml.parse(documentXml(bytes)), 'wp:anchor');

describe('docx — wp:anchor children in CT_Anchor order', () => {
    test('preserved positioning, wrap and extension children take their schema places', () => {
        expect(names(anchorOf(d.write(anchoredDocument(wordAnchorChildren()))))).toEqual(SCHEMA_ORDER);
    });

    test('an mc:AlternateContent takes the place of what it holds', () => {
        const alt = xml.el('mc:AlternateContent', { 'xmlns:mc': NS_MC }, [
            xml.el('mc:Choice', { Requires: 'wp14', 'xmlns:wp14': NS_WP14 }, [
                xml.el('wp:positionH', { relativeFrom: 'margin' }, [xml.el('wp14:pctPosHOffset', {}, [xml.text('10000')])])
            ]),
            xml.el('mc:Fallback', {}, [
                xml.el('wp:positionH', { relativeFrom: 'page' }, [xml.el('wp:posOffset', {}, [xml.text('0')])])
            ])
        ]);
        const kids = wordAnchorChildren().filter(c => c.name !== 'wp:positionH');
        kids.splice(1, 0, alt);
        expect(names(anchorOf(d.write(anchoredDocument(kids))))).toEqual(SCHEMA_ORDER.map(n => n === 'wp:positionH' ? 'mc:AlternateContent' : n));
    });

    test('the read model keeps the children as read; read, write, read is stable', () => {
        // The written part marks wp14 ignorable, and the read drops ignorable
        // content it does not model: the wp14 extensions are left out here.
        const once = d.write(anchoredDocument(wordAnchorChildren().filter(c => !c.name.startsWith('wp14:'))));
        const back = d.read(once);
        const drawing = back.document.body[0].children[0].children.find(c => c.type === 'drawing');
        expect(drawing.mode).toBe('anchor');
        expect(drawing.anchorChildren.map(c => c.name)).toEqual(['wp:simplePos', 'wp:positionH', 'wp:positionV', 'wp:wrapSquare']);
        const twice = d.write(back.document);
        expect(documentXml(twice)).toBe(documentXml(once));
    });

    test('a Word-shaped anchor read from a file is written back in the same order', () => {
        const anchor = '<wp:anchor distT="0" distB="0" distL="114300" distR="114300" simplePos="0" relativeHeight="1"'
            + ' behindDoc="0" locked="0" layoutInCell="1" allowOverlap="1"><wp:simplePos x="0" y="0"/>'
            + '<wp:positionH relativeFrom="column"><wp:posOffset>1882747</wp:posOffset></wp:positionH>'
            + '<wp:positionV relativeFrom="paragraph"><wp:posOffset>-104609</wp:posOffset></wp:positionV>'
            + '<wp:extent cx="1677725" cy="1677725"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:wrapNone/>'
            + '<wp:docPr id="1" name="Picture 1"/><wp:cNvGraphicFramePr/>'
            + '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic>'
            + '<pic:nvPicPr><pic:cNvPr id="0" name="p"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip/></pic:blipFill>'
            + '<pic:spPr/></pic:pic></a:graphicData></a:graphic>'
            + '<wp14:sizeRelH relativeFrom="page"><wp14:pctWidth>0</wp14:pctWidth></wp14:sizeRelH>'
            + '<wp14:sizeRelV relativeFrom="page"><wp14:pctHeight>0</wp14:pctHeight></wp14:sizeRelV></wp:anchor>';
        const ns = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'
            + ' xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"'
            + ' xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"'
            + ' xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"'
            + ` xmlns:wp14="${NS_WP14}"`;
        const pkg = opc.empty();
        opc.setPart(pkg, '/word/document.xml', encoder.encode(
            `<w:document ${ns}><w:body><w:p><w:r><w:drawing>${anchor}</w:drawing></w:r></w:p></w:body></w:document>`), d.CT_DOCUMENT);
        opc.setRels(pkg, '/', [{ Id: 'rId1', Type: d.REL_TYPE_DOC, Target: 'word/document.xml' }]);
        const back = d.read(opc.write(pkg));
        expect(names(anchorOf(d.write(back.document)))).toEqual([...SCHEMA_ORDER.slice(0, 5), 'wp:wrapNone', ...SCHEMA_ORDER.slice(6)]);
    });

    test('inline drawings are untouched', () => {
        const text = documentXml(d.write({ type: 'document', body: [{ type: 'paragraph', children: [d.imageRun(PNG_1X1, { cx: '1in', cy: '1in' })] }] }));
        expect(names(findElement(xml.parse(text), 'wp:inline'))).toEqual(['wp:extent', 'wp:effectExtent', 'wp:docPr', 'wp:cNvGraphicFramePr', 'a:graphic']);
    });

    test('a hand-wired docxDrawing without the ordering helper keeps the old order', () => {
        const { orderBySequence: _o, sequence: _s, ...older } = shared;
        const mod = docxDrawing.factory(xml, rt.resolve('drawingmlShape'), older);
        const doc = anchoredDocument(wordAnchorChildren());
        const drawing = doc.body[0].children[0].children.find(c => c.type === 'drawing');
        expect(names(mod.renderDrawing(drawing).children[0])).toEqual([
            'wp14:sizeRelV', 'wp:wrapSquare', 'wp:positionV', 'wp14:sizeRelH', 'wp:positionH', 'wp:simplePos',
            'wp:extent', 'wp:effectExtent', 'wp:docPr', 'wp:cNvGraphicFramePr', 'a:graphic']);
    });
});
