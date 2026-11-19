// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview The paragraph model's typed `note` run (write side):
 * `odt.write` renders it through its `ctx.renderNote` sink as `text:note`,
 * its body typed blocks rendered with the document's style registry.
 */

import { describe, test, expect } from 'bun:test';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import * as odf from '../main.js';

const rt = new ModuleRuntime();
for (const m of [...odf.fw_require, ...odf.modules]) rt.register(m);
const odt = rt.resolve('odt');
const zip = rt.resolve('zip');
const xml = rt.resolve('xml');
const paragraphMod = rt.resolve('textParagraph');

const contentOf = (bytes) => xml.parse(new TextDecoder().decode(zip.unzipSync(bytes)['content.xml']));

/** Every descendant element of `root` named `name`, document order. */
function all(root, name, out = []) {
    for (const c of (root && root.children) || []) {
        if (c.type !== 'element') continue;
        if (c.name === name) out.push(c);
        all(c, name, out);
    }
    return out;
}

/** The text of an element's tree. */
const textOf = (el) => (el.children || []).map((c) => (c.type === 'text' ? c.value : textOf(c))).join('');

describe('odt.write — a typed note run (text:note)', () => {
    test('a footnote is written with its id, class, citation and typed body', () => {
        const note = {
            type: 'note', id: 'ftn1', noteClass: 'footnote', citation: '1',
            body: [{ type: 'paragraph', runs: [{ type: 'text', value: 'First ' }, { type: 'span', value: 'bold', bold: true }] },
                { type: 'paragraph', runs: [{ type: 'text', value: 'Second' }] }]
        };
        const bytes = odt.write({ body: [{ type: 'paragraph', runs: [{ type: 'text', value: 'Text' }, note, { type: 'text', value: ' after' }] }] });
        const content = contentOf(bytes);
        const notes = all(content, 'text:note');
        expect(notes.map((n) => n.attrs)).toEqual([{ 'text:id': 'ftn1', 'text:note-class': 'footnote' }]);
        const [citation, body] = notes[0].children.filter((c) => c.type === 'element');
        expect([citation.name, textOf(citation), body.name]).toEqual(['text:note-citation', '1', 'text:note-body']);
        expect(all(body, 'text:p').map(textOf)).toEqual(['First bold', 'Second']);
        const span = all(body, 'text:span')[0];
        const styles = all(content, 'style:style').map((s) => s.attrs['style:name']);
        expect(styles).toContain(span.attrs['text:style-name']);
        const p = all(content, 'office:text')[0].children.find((c) => c.name === 'text:p');
        expect(p.children.map((c) => (c.type === 'text' ? c.value : c.name))).toEqual(['Text', 'text:note', ' after']);
    });

    test('an endnote with a label writes text:label; the class defaults to footnote', () => {
        const runs = [{ type: 'note', noteClass: 'endnote', citation: '*', label: '*', body: [{ type: 'paragraph', runs: [{ type: 'text', value: 'E' }] }] },
            { type: 'note', citation: '2', body: [] }];
        const notes = all(contentOf(odt.write({ body: [{ type: 'paragraph', runs }] })), 'text:note');
        expect(notes.map((n) => n.attrs['text:note-class'])).toEqual(['endnote', 'footnote']);
        expect(Object.hasOwn(notes[0].attrs, 'text:id')).toBe(false);
        expect(notes[0].children.find((c) => c.name === 'text:note-citation').attrs).toEqual({ 'text:label': '*' });
        expect(notes[1].children.find((c) => c.name === 'text:note-citation').attrs).toEqual({});
    });

    test('without a sink a note run renders nothing', () => {
        const el = paragraphMod.renderParagraph({ type: 'paragraph', runs: [{ type: 'text', value: 'a' }, { type: 'note', citation: '1', body: [] }] });
        expect(all({ children: [el] }, 'text:note')).toEqual([]);
        expect(textOf(el)).toBe('a');
    });
});

// T82 (D60 A): the read side, under the opt-in `notes`.
describe('odt.read — notes: true types text:note as the note run', () => {
    const written = () => odt.write({ body: [{ type: 'paragraph', runs: [{ type: 'text', value: 'Text' },
        { type: 'note', id: 'ftn1', noteClass: 'footnote', citation: '1', body: [{ type: 'paragraph', runs: [{ type: 'text', value: 'Foot' }] }] },
        { type: 'span', value: 'x', runs: [{ type: 'text', value: 'in span' },
            { type: 'note', id: 'edn1', noteClass: 'endnote', citation: '*', label: '*', body: [{ type: 'paragraph', runs: [{ type: 'text', value: 'End' }] }] }] }] }] });

    test('a paragraph note and a span note are typed note runs with their body', () => {
        const read = odt.read(written(), { notes: true });
        const runs = read.body[0].runs;
        expect(runs[1]).toEqual({ type: 'note', id: 'ftn1', noteClass: 'footnote', citation: '1', body: [{ type: 'paragraph', runs: [{ type: 'text', value: 'Foot' }] }] });
        const inSpan = runs[2].runs.find((r) => r.type === 'note');
        expect(inSpan).toMatchObject({ type: 'note', id: 'edn1', noteClass: 'endnote', citation: '*', label: '*' });
        expect(inSpan.body[0].runs).toEqual([{ type: 'text', value: 'End' }]);
    });

    test('written back, a typed note is the same note', () => {
        const read = odt.read(written(), { notes: true });
        const again = odt.read(odt.write(read), { notes: true });
        expect(again.body[0].runs[1]).toEqual(read.body[0].runs[1]);
    });

    test('without notes the read is as before; a bad notes throws', () => {
        const plain = odt.read(written());
        expect(plain.body[0].runs.some((r) => r.type === 'note')).toBe(false);
        expect(() => odt.read(written(), { notes: 'yes' })).toThrow('odt: read opts.notes must be true or false');
    });
});
