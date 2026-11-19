// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview The docx reader's text boxes and Word 2010 shapes: a text
 * box's content, in a run's VML or in a shape, group or canvas drawing,
 * reads as blocks after the paragraph that anchors it; such a drawing is
 * never an image, and one holding no text box records `inline/dropped`.
 */

import { describe, test, expect, beforeAll } from 'bun:test';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { modules as ooxmlModules, fw_require as ooxmlFwRequire } from '@awacloud/ooxml';
import { oconvIr } from '../ir/ir.js';
import { oconvDocxToIr } from './docx-to-ir.js';

let docxApi;
let docxNumberingMod;
let opcApi;
let docxToIr;
let validate;

beforeAll(() => {
    const runtime = new ModuleRuntime();
    runtime.registerAll(ooxmlFwRequire);
    runtime.registerAll(ooxmlModules);
    runtime.register(oconvIr);
    runtime.register(oconvDocxToIr);
    docxApi = runtime.resolve('docx');
    docxNumberingMod = runtime.resolve('docxNumbering');
    opcApi = runtime.resolve('opcPackage');
    ({ docxToIr } = runtime.resolve('oconvDocxToIr'));
    ({ validate } = runtime.resolve('oconvIr'));
});

const enc = new TextEncoder();
const dec = new TextDecoder();
const DECLS = {
    mc: 'http://schemas.openxmlformats.org/markup-compatibility/2006',
    wp: 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing',
    a: 'http://schemas.openxmlformats.org/drawingml/2006/main',
    wps: 'http://schemas.microsoft.com/office/word/2010/wordprocessingShape',
    v: 'urn:schemas-microsoft-com:vml',
    o: 'urn:schemas-microsoft-com:office:office'
};

const para = (text) => `<w:p><w:r><w:t>${text}</w:t></w:r></w:p>`;
const vmlBox = (content) => `<w:r><w:pict><v:rect style="width:72pt;height:36pt"><v:textbox><w:txbxContent>${content}</w:txbxContent></v:textbox></v:rect></w:pict></w:r>`;
const shape = (content, name = 'Text Box 1') => '<w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="914400" cy="457200"/>'
    + `<wp:docPr id="7" name="${name}"/><a:graphic><a:graphicData uri="http://schemas.microsoft.com/office/word/2010/wordprocessingShape">`
    + '<wps:wsp><wps:cNvSpPr txBox="1"/><wps:spPr><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></wps:spPr>'
    + (content === undefined ? '' : `<wps:txbx><w:txbxContent>${content}</w:txbxContent></wps:txbx>`)
    + '<wps:bodyPr/></wps:wsp></a:graphicData></a:graphic></wp:inline></w:drawing>';
const choice = (content) => `<w:r><mc:AlternateContent><mc:Choice Requires="wps">${shape(content)}</mc:Choice>`
    + `<mc:Fallback>${vmlBox(content).slice(5, -6)}</mc:Fallback></mc:AlternateContent></w:r>`;

/** A docx read (the default read) whose body is `bodyXml`, with `numbering` when given. */
function readBody(bodyXml, numbering) {
    const pkg = opcApi.read(docxApi.write({ body: [docxApi.paragraph('PLACEHOLDER')] }, numbering ? { numbering } : {}));
    let s = dec.decode(pkg.parts['/word/document.xml']);
    const start = s.indexOf('<w:p>');
    const end = s.indexOf('</w:p>', start) + 6;
    s = s.slice(0, start) + bodyXml + s.slice(end);
    const open = s.match(/<w:document\b[^>]*>/)[0];
    let tag = open;
    for (const [p, uri] of Object.entries(DECLS)) if (!tag.includes(`xmlns:${p}=`)) tag = tag.replace(/>$/, ` xmlns:${p}="${uri}">`);
    pkg.parts['/word/document.xml'] = enc.encode(s.replace(open, tag));
    return docxApi.read(opcApi.write(pkg));
}

/** Each block as a short label: its kind and text. */
function view(blocks) {
    const text = (n) => (n.kind === 'run' ? n.text : (n.children || []).map(text).join(''));
    return blocks.map((b) => b.kind === 'paragraph' ? text(b) : `${b.kind}:${text(b)}`);
}

describe('oconvDocxToIr — text boxes and Word 2010 shapes', () => {
    test('a VML text box reads after the paragraph that anchors it', () => {
        const { ir, losses } = docxToIr(readBody(para('before')
            + `<w:p><w:r><w:t>anchor</w:t></w:r>${vmlBox(para('Boxed one') + para('Boxed two'))}</w:p>` + para('after')));
        expect(validate(ir).ok).toBe(true);
        expect(losses).toEqual([]);
        expect(view(ir.children)).toEqual(['before', 'anchor', 'Boxed one', 'Boxed two', 'after']);
    });

    test('a Word 2010 construct reads through its VML Fallback, once', () => {
        const { ir, losses } = docxToIr(readBody(`<w:p>${choice(para('In the box'))}</w:p>` + para('after')));
        expect(losses).toEqual([]);
        expect(view(ir.children)).toEqual(['In the box', 'after']);
    });

    test('a bare shape drawing is no image: its text box reads as blocks', () => {
        const { ir, losses } = docxToIr(readBody(`<w:p><w:r><w:t>anchor</w:t></w:r><w:r>${shape(para('Shape text'))}</w:r></w:p>`));
        expect(losses).toEqual([]);
        expect(view(ir.children)).toEqual(['anchor', 'Shape text']);
        expect(JSON.stringify(ir)).not.toContain('"image"');
    });

    test('a shape without a text box records inline/dropped, no image', () => {
        const { ir, losses } = docxToIr(readBody(`<w:p><w:r><w:t>anchor</w:t></w:r><w:r>${shape(undefined, 'Arrow 2')}</w:r></w:p>`));
        expect(losses).toEqual([{ code: 'inline/dropped', detail: 'wps:wsp' }]);
        expect(view(ir.children)).toEqual(['anchor']);
    });

    test('a box anchored in an empty paragraph still reads; a box in a box follows its own anchor', () => {
        const inner = `<w:p><w:r><w:t>outer</w:t></w:r>${vmlBox(para('inner'))}</w:p>` + para('outer tail');
        const { ir, losses } = docxToIr(readBody(`<w:p>${vmlBox(inner)}</w:p>` + para('after')));
        expect(losses).toEqual([]);
        expect(view(ir.children)).toEqual(['outer', 'inner', 'outer tail', 'after']);
    });

    test('a box in a list item follows the list; a box holding a table keeps it', () => {
        const { numbering, numId } = docxNumberingMod.bulletList();
        const item = (t, extra = '') => `<w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="${numId}"/></w:numPr></w:pPr><w:r><w:t>${t}</w:t></w:r>${extra}</w:p>`;
        const table = '<w:tbl><w:tr><w:tc><w:p><w:r><w:t>cell</w:t></w:r></w:p></w:tc></w:tr></w:tbl>';
        const { ir, losses } = docxToIr(readBody(item('one', vmlBox(table + para('note'))) + item('two') + para('after'), numbering));
        expect(losses).toEqual([]);
        expect(ir.children.map((b) => b.kind)).toEqual(['list', 'table', 'paragraph', 'paragraph']);
        expect(view(ir.children.slice(1))).toEqual(['table:cell', 'note', 'after']);
        expect(ir.children[0].children).toHaveLength(2);
    });

    test('a picture in a text box keeps its bytes', () => {
        const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 3]);
        const pkg = opcApi.read(docxApi.write({ body: [{ type: 'paragraph', children: [docxApi.imageRun(png, { name: 'Boxed picture' })] }] }));
        const s = dec.decode(pkg.parts['/word/document.xml']);
        const run = s.match(/<w:r>(?:(?!<w:r>).)*?<w:drawing>.*?<\/w:drawing><\/w:r>/s)[0];
        const open = s.match(/<w:document\b[^>]*>/)[0];
        let tag = open;
        for (const [p, uri] of Object.entries(DECLS)) if (!tag.includes(`xmlns:${p}=`)) tag = tag.replace(/>$/, ` xmlns:${p}="${uri}">`);
        pkg.parts['/word/document.xml'] = enc.encode(s.replace(open, tag).replace(run, vmlBox(`<w:p>${run}</w:p>`)));
        const { ir, losses } = docxToIr(docxApi.read(opcApi.write(pkg)));
        expect(losses).toEqual([]);
        const image = ir.children[0].children[0];
        expect(image.kind).toBe('image');
        expect(image.name).toBe('Boxed picture');
        expect(image.escapes.docx.bytes).toEqual(png);
    });

    test('a box in a table cell stays in that cell', () => {
        const table = `<w:tbl><w:tr><w:tc><w:p><w:r><w:t>cell</w:t></w:r>${vmlBox(para('boxed in cell'))}</w:p></w:tc></w:tr></w:tbl>`;
        const { ir, losses } = docxToIr(readBody(table));
        expect(losses).toEqual([]);
        expect(ir.children).toHaveLength(1);
        expect(JSON.stringify(ir.children[0])).toContain('boxed in cell');
    });
});

// T27 (b): a text box's blocks hold their own page breaks; the body's go on
// past them to the next paragraph of the body.
describe('oconvDocxToIr — page breaks around a text box (T27 b)', () => {
    test('a lone break whose paragraph anchors a box goes to the body paragraph after the box', () => {
        const r = readBody(`<w:p><w:r><w:br w:type="page"/></w:r>${vmlBox(para('in the box'))}</w:p>${para('next in the body')}`);
        const { ir, losses } = docxToIr(r, { include: ['layout'] });
        const flagged = ir.children.filter((n) => n.breakBefore).map((n) => n.children.map((c) => c.text).join(''));
        expect(flagged).toEqual(['next in the body']);
        expect(losses).toEqual([]);
    });

    test('a break left at the end of a box is dropped, recorded; the body keeps its own', () => {
        const r = readBody(`<w:p><w:r><w:t>anchor</w:t></w:r>${vmlBox('<w:p><w:r><w:t>boxed</w:t><w:br w:type="page"/></w:r></w:p>')}</w:p>${para('body')}`);
        const { ir, losses } = docxToIr(r, { include: ['layout'] });
        expect(ir.children.filter((n) => n.breakBefore)).toEqual([]);
        expect(losses).toEqual([{ code: 'layout/break-dropped', detail: 'textBox' }]);
    });
});
