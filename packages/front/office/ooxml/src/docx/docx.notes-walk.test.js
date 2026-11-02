// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * The docx walker visits the footnotes, endnotes and comments as it does the
 * body, the headers and the footers (T59 (b)): an extension's hooks see their
 * blocks at read and at write, so `dmlWpDrawing` writes an edited note
 * drawing into its kept source.
 */
import { describe, test, expect } from 'bun:test';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import * as ooxmlMods from '../main.js';
import { dmlWpDrawing } from '../extra/dml-wp-drawing.js';

function runtime() {
    const rt = new ModuleRuntime();
    for (const m of [...ooxmlMods.fw_require, ...ooxmlMods.modules, dmlWpDrawing]) rt.register(m);
    return rt;
}
const png = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 7]);
const para = (children) => ({ type: 'paragraph', children });

/** A document with a footnote, an endnote and a comment, each holding `block`. */
function withNotes(d, block) {
    return d.write({ type: 'document', body: [
        para([{ type: 'run', children: [{ type: 'footnoteReference', id: '1' }] },
            { type: 'run', children: [{ type: 'endnoteReference', id: '1' }] },
            { type: 'run', children: [{ type: 'commentReference', id: '1' }] }])
    ] }, {
        footnotes: { notes: [{ id: 1, body: [block('foot')] }] },
        endnotes: { notes: [{ id: 1, body: [block('end')] }] },
        comments: { comments: [{ id: 1, author: 'Alice', body: [block('comment')] }] }
    });
}
const write = (d, r) => d.write(r.document, { footnotes: r.footnotes, endnotes: r.endnotes, comments: r.comments,
    hyperlinks: r.hyperlinks, images: r.images, carry: r });

describe('the docx walker visits notes and comments (T59 b)', () => {
    test('a paragraph hook sees a footnote\'s, an endnote\'s and a comment\'s blocks at read and write', () => {
        const d = runtime().resolve('docx');
        const seen = [];
        d.use({
            hydrateParagraphProperties(p) { seen.push('h:' + p.pStyle); return p; },
            dehydrateParagraphProperties(p) { seen.push('d:' + p.pStyle); return p; }
        });
        const source = withNotes(d, (tag) => ({ ...d.paragraph(tag), pPr: { pStyle: tag } }));
        seen.length = 0;   // the source's own write dehydrated too
        const r = d.read(source);
        expect(seen.filter((x) => x.startsWith('h:')).sort()).toEqual(['h:comment', 'h:end', 'h:foot']);
        write(d, r);
        expect(seen.filter((x) => x.startsWith('d:')).sort()).toEqual(['d:comment', 'd:end', 'd:foot']);
    });

    test('dmlWpDrawing writes an edited footnote drawing into its source', () => {
        const rt = runtime();
        const d = rt.resolve('docx');
        d.use(rt.resolve('dmlWpDrawing'));
        const r = d.read(withNotes(d, () => para([d.imageRun(png, { cx: 914400, cy: 914400, description: 'pic' })])));
        const drawing = r.footnotes.notes.find((n) => n.body.length).body[0].children[0].children[0];
        expect(drawing.picture).toBeDefined();
        drawing.picture.bwMode = 'gray';
        const out = new TextDecoder().decode(rt.resolve('opcPackage').read(write(d, r)).parts['/word/footnotes.xml']);
        expect(out).toContain('<pic:spPr bwMode="gray">');
    });
});
