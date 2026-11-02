// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * `docx.write`'s opt-in `cleanup: ['emptyProperties']`: an empty `rPr` /
 * `pPr` (read from an empty `<w:rPr/>` / `<w:pPr/>`) is dropped instead of
 * written back, in the body and the story parts, without touching the
 * caller's model.
 */
import { describe, test, expect } from 'bun:test';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import * as ooxmlMods from '../main.js';

const runtime = new ModuleRuntime();
for (const m of [...ooxmlMods.fw_require, ...ooxmlMods.modules]) runtime.register(m);
const d = runtime.resolve('docx');
const zip = runtime.resolve('zip');
const decoder = new TextDecoder();

const text = (value, rPr) => ({ type: 'run', ...(rPr ? { rPr } : {}), children: [{ type: 'text', value }] });
const part = (bytes, name) => decoder.decode(zip.unzipSync(bytes)[name]);

/** A body with every empty shape, plus a bold run and an aligned paragraph that must stay. */
function model() {
    const doc = {
        type: 'document',
        body: [
            { type: 'paragraph', pPr: {}, children: [text('a', {}), text('b', { bold: true })] },
            { type: 'paragraph', pPr: { rPr: {} }, children: [text('c')] },
            { type: 'paragraph', pPr: { align: 'center', rPr: {} }, children: [text('d')] }
        ],
        sectPr: { headerReferences: [{ type: 'default', rId: 'rIdH1' }] }
    };
    const headers = { rIdH1: { type: 'header', body: [{ type: 'paragraph', pPr: {}, children: [text('h', {})] }] } };
    return { doc, headers };
}

describe('docx.write — cleanup: emptyProperties', () => {
    test('empty rPr / pPr are not written, in the body and a header; the rest stays', () => {
        const { doc, headers } = model();
        const bytes = d.write(doc, { headers, cleanup: ['emptyProperties'] });
        const body = part(bytes, 'word/document.xml');
        expect(body).not.toContain('<w:rPr/>');
        expect(body).not.toContain('<w:pPr/>');
        expect(body).toContain('<w:b/>');
        expect(body).toContain('<w:jc w:val="center"/>');
        expect(part(bytes, 'word/header1.xml')).not.toMatch(/<w:[pr]Pr\/>/);
        const back = d.read(bytes).document.body;
        expect(back[0].pPr).toBeUndefined();
        expect(back[0].children[0].rPr).toBeUndefined();
        expect(back[0].children[1].rPr).toEqual({ bold: true });
        expect(back[1].pPr).toBeUndefined();
        expect(back[2].pPr).toEqual({ align: 'center' });
    });

    test("the caller's model is not changed; without the option the empty elements are written", () => {
        const { doc, headers } = model();
        d.write(doc, { headers, cleanup: ['emptyProperties'] });
        expect(doc.body[0].pPr).toEqual({});
        expect(doc.body[0].children[0].rPr).toEqual({});
        expect(headers.rIdH1.body[0].pPr).toEqual({});
        const plain = part(d.write(doc, { headers }), 'word/document.xml');
        expect(plain).toContain('<w:rPr/>');
        expect(plain).toContain('<w:pPr/>');
        const empty = part(d.write(doc, { headers, cleanup: [] }), 'word/document.xml');
        expect(empty).toBe(plain);
    });

    test('a bad cleanup value throws docx/invalid-cleanup', () => {
        const { doc } = model();
        for (const cleanup of ['emptyProperties', ['nope'], ['emptyProperties', 'emptyProperties'], [1], null]) {
            let err;
            try { d.write(doc, { cleanup }); } catch (e) { err = e; }
            expect(err && err.code).toBe('docx/invalid-cleanup');
        }
    });
});
