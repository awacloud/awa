// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview T81: the writers and the IR `note`. The odt writer writes a
 * typed note (`text:note`, its body mapped as the body is); the md, docx
 * and pdf writers have no note and record `note/dropped` (detail its class).
 */

import { describe, test, expect } from 'bun:test';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { fw_require as oconvFwRequire, modules as oconvModules } from '../main.js';

const rt = new ModuleRuntime();
rt.registerAll(oconvFwRequire);
rt.registerAll(oconvModules);
const { node, doc } = rt.resolve('oconvIr');
const { irToOdt } = rt.resolve('oconvIrToOdt');
const { irToMd } = rt.resolve('oconvIrToMd');
const { irToDocx } = rt.resolve('oconvIrToDocx');
const { irToPdf } = rt.resolve('oconvIrToPdf');
const docxApi = rt.resolve('docx');
const zip = rt.resolve('zip');
const xml = rt.resolve('xml');

const contentOf = (bytes) => xml.parse(new TextDecoder().decode(zip.unzipSync(bytes)['content.xml']));
function all(root, name, out = []) {
    for (const c of (root && root.children) || []) {
        if (c.type !== 'element') continue;
        if (c.name === name) out.push(c);
        all(c, name, out);
    }
    return out;
}
const textOf = (el) => (el.children || []).map((c) => (c.type === 'text' ? c.value : textOf(c))).join('');
const p = (...inlines) => node('paragraph', {}, inlines);
const r = (text, props) => node('run', { text, ...props });

/** A paragraph with two automatic footnotes, an endnote and a custom-mark footnote. */
function notesIr() {
    return doc([p(r('One'), node('note', {}, [p(r('Foot one')), p(r('Foot '), r('bold', { bold: true }))]), r(' two'),
        node('note', { class: 'endnote' }, [p(r('End'))]), r(' three'), node('note', { mark: '*' }, [p(r('Starred'))]),
        r(' four'), node('note', {}, [p(r('Foot two'))]))]);
}
const noteLosses = (losses) => losses.filter((l) => l.code === 'note/dropped');

describe('the odt writer — notes (T81)', () => {
    test('each note is a text:note with its class, id, citation and body', () => {
        const { bytes, losses } = irToOdt(notesIr());
        expect(noteLosses(losses)).toEqual([]);
        const notes = all(contentOf(bytes), 'text:note');
        const cite = (n) => n.children.find((c) => c.name === 'text:note-citation');
        expect(notes.map((n) => [n.attrs['text:note-class'], n.attrs['text:id'], textOf(cite(n)), cite(n).attrs['text:label'] ?? null]))
            .toEqual([['footnote', 'ftn1', '1', null], ['endnote', 'edn1', '1', null], ['footnote', 'ftn2', '*', '*'], ['footnote', 'ftn3', '2', null]]);
        const body = notes[0].children.find((c) => c.name === 'text:note-body');
        expect(all(body, 'text:p').map(textOf)).toEqual(['Foot one', 'Foot bold']);
        const para = all(contentOf(bytes), 'office:text')[0].children.find((c) => c.name === 'text:p');
        expect(para.children.map((c) => (c.type === 'text' ? c.value : c.name)))
            .toEqual(['One', 'text:note', ' two', 'text:note', ' three', 'text:note', ' four', 'text:note']);
    });

    test("a note inside a note's body is note/dropped (nested) and not written", () => {
        const ir = doc([p(r('a'), node('note', {}, [p(r('outer'), node('note', {}, [p(r('inner'))]))]))]);
        const { bytes, losses } = irToOdt(ir);
        expect(noteLosses(losses)).toEqual([{ code: 'note/dropped', detail: 'nested' }]);
        expect(all(contentOf(bytes), 'text:note')).toHaveLength(1);
    });
});

describe('the md, docx and pdf writers — notes (T81)', () => {
    const DROPPED = [{ code: 'note/dropped', detail: 'footnote' }, { code: 'note/dropped', detail: 'endnote' },
        { code: 'note/dropped', detail: 'footnote' }, { code: 'note/dropped', detail: 'footnote' }];

    test('md drops each note with note/dropped and keeps the text around it', () => {
        const { markdown, losses } = irToMd(notesIr(), {}, { frontMatter: 'none' });
        expect(markdown).toBe('One two three four\n');
        expect(noteLosses(losses)).toEqual(DROPPED);
    });

    test('docx drops each note with note/dropped and keeps the text around it', () => {
        const { bytes, losses } = irToDocx(notesIr());
        expect(docxApi.toText(docxApi.read(bytes).document).trim()).toBe('One two three four');
        expect(noteLosses(losses)).toEqual(DROPPED);
    });

    test('pdf drops each note with note/dropped', () => {
        const { bytes, losses } = irToPdf(notesIr());
        expect(bytes.length).toBeGreaterThan(0);
        expect(noteLosses(losses)).toEqual(DROPPED);
    });
});
