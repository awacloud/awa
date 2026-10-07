// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * Contract tests for the three explicit failures of `docx.write`:
 *
 *  - a `hyperlink` node with a non-empty `target`, no `rId` and no
 *    `anchor` throws `ContractError` `docx/hyperlink-missing-rid` — the
 *    target would otherwise be lost (no `r:id`, no relationship);
 *  - a `hyperlink` node whose non-empty `rId` has no relationship in the
 *    table written for its part throws `ContractError`
 *    `docx/hyperlink-unresolved-rid` — the `r:id` would otherwise dangle
 *    (here: the `opts.hyperlinks` REPLACE leg; the per-part contract is
 *    pinned in `docx.hyperlink-rels.test.js`);
 *  - a paragraph whose `pPr.numPr.numId` is non-zero, written without
 *    `opts.numbering`, throws `ContractError` `docx/numbering-missing` —
 *    `write()` never derives `word/numbering.xml`, so the list reference
 *    would otherwise dangle.
 *
 * The hyperlink checks walk the document body and every header, footer,
 * footnotes, endnotes and comments body; the numbering check walks the
 * body and every header / footer body. All checks run before any part is
 * rendered and before the extension dehydrate pass, so a throw leaves the
 * caller's tree untouched.
 *
 * These tests are the citations behind `docs/api/docx/docx.md` § Notes,
 * the cross-reference in `docs/api/docx/numbering.md` and the `docx/*`
 * rows of `docs/api/errors.md` — each test title states, in plain words,
 * the behaviour the corresponding doc sentence claims.
 */
import { describe, test, expect } from 'bun:test';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import * as ooxmlMods from '../main.js';

// Same wiring pattern as `tests/roundtrip.integration.test.js` and
// `tests/fuzz.test.js`: a `ModuleRuntime` fed from `main.js`'s
// `fw_require` (fw infra) + `modules` (ooxml core) arrays, never a
// hand-listed factory graph.
const runtime = new ModuleRuntime();
for (const m of [...ooxmlMods.fw_require, ...ooxmlMods.modules]) runtime.register(m);
const d = runtime.resolve('docx');
const opc = runtime.resolve('opcPackage');
const { ContractError } = runtime.resolve('ooxmlErrors');
const decoder = new TextDecoder();

/** Run `fn`, return the error it throws (or `null`). */
function thrown(fn) {
    try { fn(); } catch (e) { return e; }
    return null;
}

function hyperlinkDoc(node) {
    return { type: 'document', body: [{ type: 'paragraph', children: [node] }] };
}

describe('docx.write — a hyperlink with a target needs an rId', () => {
    test('hyperlink with a target and no rId: write() throws ContractError docx/hyperlink-missing-rid carrying context.target', () => {
        const doc = hyperlinkDoc(d.hyperlink('Example', 'https://example.com'));

        const err = thrown(() => d.write(doc));

        expect(err).toBeInstanceOf(ContractError);
        expect(err.code).toBe('docx/hyperlink-missing-rid');
        expect(err.context).toEqual({ target: 'https://example.com' });
    });

    test('the throw also happens when opts.hyperlinks is supplied (it replaces the derived map, so the node target would be lost either way)', () => {
        const doc = hyperlinkDoc(d.hyperlink('Example', 'https://example.com'));

        const err = thrown(() => d.write(doc, {
            hyperlinks: { hlRid9: { target: 'https://explicit.example' } }
        }));

        expect(err).toBeInstanceOf(ContractError);
        expect(err.code).toBe('docx/hyperlink-missing-rid');
        expect(err.context.target).toBe('https://example.com');
    });

    test('a hyperlink nested in a table cell is found and throws', () => {
        const doc = {
            type: 'document',
            body: [{
                type: 'table',
                rows: [{
                    type: 'row',
                    cells: [{
                        type: 'cell',
                        children: [{ type: 'paragraph',
                            children: [d.hyperlink('In cell', 'https://cell.example')] }]
                    }]
                }]
            }]
        };

        const err = thrown(() => d.write(doc));

        expect(err).toBeInstanceOf(ContractError);
        expect(err.code).toBe('docx/hyperlink-missing-rid');
        expect(err.context.target).toBe('https://cell.example');
    });

    test('a hyperlink in a header body is found and throws', () => {
        const doc = { type: 'document', body: [d.paragraph('Body text')] };
        const headers = {
            rIdHdr1: { type: 'header', body: [{ type: 'paragraph',
                children: [d.hyperlink('In header', 'https://header.example')] }] }
        };

        const err = thrown(() => d.write(doc, { headers }));

        expect(err).toBeInstanceOf(ContractError);
        expect(err.code).toBe('docx/hyperlink-missing-rid');
        expect(err.context.target).toBe('https://header.example');
    });

    test('hyperlink with an anchor and no rId: no throw, w:anchor is written and no r:id', () => {
        const node = { ...d.hyperlink('Jump', 'https://unused.example'), anchor: 'Section1' };
        const doc = hyperlinkDoc(node);

        let bytes;
        expect(() => { bytes = d.write(doc); }).not.toThrow();

        const documentXml = decoder.decode(opc.read(bytes).parts['/word/document.xml']);
        const openTag = documentXml.match(/<w:hyperlink[^>]*>/);
        expect(openTag[0]).toBe('<w:hyperlink w:anchor="Section1">');
    });

    test('hyperlink with no target, no rId and no anchor: no throw, a bare <w:hyperlink> is written (nothing supplied is lost)', () => {
        const doc = hyperlinkDoc(d.hyperlink('Plain', undefined));

        let bytes;
        expect(() => { bytes = d.write(doc); }).not.toThrow();

        const documentXml = decoder.decode(opc.read(bytes).parts['/word/document.xml']);
        expect(documentXml.match(/<w:hyperlink[^>]*>/)[0]).toBe('<w:hyperlink>');
    });

    test('hyperlink WITH an explicit rId: r:id and the relationship are written, and the target round-trips through read()', () => {
        const doc = hyperlinkDoc(d.hyperlink('Example', 'https://example.com', { rId: 'hlRid1' }));

        const bytes = d.write(doc);

        const pkg = opc.read(bytes);
        const documentXml = decoder.decode(pkg.parts['/word/document.xml']);
        const openTag = documentXml.match(/<w:hyperlink[^>]*>/);
        expect(openTag[0]).toContain('r:id="hlRid1"');

        const docRels = pkg.rels['/word/document.xml'] || [];
        const rel = docRels.find(r => r.Id === 'hlRid1');
        expect(rel).toBeDefined();
        expect(rel.Type).toBe(d.REL_TYPE_HYPERLINK);
        expect(rel.Target).toBe('https://example.com');

        const back = d.read(bytes);
        expect(back.hyperlinks.hlRid1).toEqual({ target: 'https://example.com', external: true });
    });

    test('opts.hyperlinks REPLACES the derived map: a body node whose rId is not a key of it throws ContractError docx/hyperlink-unresolved-rid', () => {
        const doc = hyperlinkDoc(d.hyperlink('Example', 'https://dropped.example', { rId: 'hlRid1' }));

        const err = thrown(() => d.write(doc, {
            hyperlinks: { hlRid9: { target: 'https://explicit.example' } }
        }));

        expect(err).toBeInstanceOf(ContractError);
        expect(err.code).toBe('docx/hyperlink-unresolved-rid');
        expect(err.context.rId).toBe('hlRid1');
        expect(err.context.story).toBe('document');
    });

    test('opts.hyperlinks REPLACES the derived map: a node whose rId IS a key of it is written with the map\'s target, not the node\'s', () => {
        const doc = hyperlinkDoc(d.hyperlink('Example', 'https://node.example', { rId: 'hlRid9' }));

        const bytes = d.write(doc, {
            hyperlinks: { hlRid9: { target: 'https://explicit.example' } }
        });

        const docRels = opc.read(bytes).rels['/word/document.xml'] || [];
        expect(docRels.filter(r => r.Type === d.REL_TYPE_HYPERLINK)).toHaveLength(1);
        const explicit = docRels.find(r => r.Id === 'hlRid9');
        expect(explicit).toBeDefined();
        expect(explicit.Type).toBe(d.REL_TYPE_HYPERLINK);
        expect(explicit.Target).toBe('https://explicit.example');

        // opts.hyperlinks entries are relationship descriptors, not
        // `hyperlink()`-builder nodes: `external` is NOT defaulted to
        // true here, unlike the builder's `opts.external !== false`.
        const back = d.read(bytes);
        expect(back.hyperlinks).toEqual({
            hlRid9: { target: 'https://explicit.example', external: false }
        });
    });
});

describe('docx.write — a list reference needs opts.numbering', () => {
    test('listParagraph WITHOUT opts.numbering: write() throws ContractError docx/numbering-missing with context.numId', () => {
        const doc = { type: 'document', body: [d.listParagraph('Item A', 1, 0)] };

        const err = thrown(() => d.write(doc));

        expect(err).toBeInstanceOf(ContractError);
        expect(err.code).toBe('docx/numbering-missing');
        expect(err.context.numId).toBe(1);
    });

    test('a list paragraph nested in a table cell is found and throws', () => {
        const doc = {
            type: 'document',
            body: [{
                type: 'table',
                rows: [{
                    type: 'row',
                    cells: [{ type: 'cell', children: [d.listParagraph('In cell', 3, 0)] }]
                }]
            }]
        };

        const err = thrown(() => d.write(doc));

        expect(err).toBeInstanceOf(ContractError);
        expect(err.code).toBe('docx/numbering-missing');
        expect(err.context.numId).toBe(3);
    });

    test('a list paragraph in a footer body is found and throws', () => {
        const doc = { type: 'document', body: [d.paragraph('Body text')] };
        const footers = {
            rIdFtr1: { type: 'footer', body: [d.listParagraph('In footer', 2, 0)] }
        };

        const err = thrown(() => d.write(doc, { footers }));

        expect(err).toBeInstanceOf(ContractError);
        expect(err.code).toBe('docx/numbering-missing');
        expect(err.context.numId).toBe(2);
    });

    test('numPr with numId 0 (removes numbering) is not a list reference: no throw without opts.numbering', () => {
        const doc = {
            type: 'document',
            body: [d.paragraph('Not a list item', { pPr: { numPr: { ilvl: 0, numId: 0 } } })]
        };

        let bytes;
        expect(() => { bytes = d.write(doc); }).not.toThrow();
        expect(opc.read(bytes).parts['/word/numbering.xml']).toBeUndefined();
    });

    test('listParagraph WITH the numbering object from the docx.md "Numbered list + header" example: word/numbering.xml is written and read().numbering is defined', () => {
        // Literal object copied from docs/api/docx/docx.md's "Numbered list
        // + header" example — the executed-example rule requires the two
        // stay identical.
        const numbering = { abstractNums: [{ abstractNumId: 0,
            levels: [{ ilvl: 0, numFmt: 'decimal', lvlText: '%1.',
                       pPr: { indent: { left: 720, hanging: 360 } } }] }],
            nums: [{ numId: 1, abstractNumId: 0 }] };
        const doc = { type: 'document', body: [d.listParagraph('First item', 1, 0)] };

        const bytes = d.write(doc, { numbering });

        const pkg = opc.read(bytes);
        expect(pkg.parts['/word/numbering.xml']).toBeDefined();

        const back = d.read(bytes);
        expect(back.numbering).toBeDefined();
    });
});

describe('docx.write — a failed check leaves the caller\'s tree unmutated', () => {
    // A separate runtime with an extension registered: `use()` makes
    // write() run the dehydrate pass, which mutates the tree in place
    // (here `caps` is demoted into `rPr._extras`). The checks run before
    // that pass, so a throw must leave the tree exactly as supplied.
    const rt = new ModuleRuntime();
    for (const m of [...ooxmlMods.fw_require, ...ooxmlMods.modules, ...ooxmlMods.extras]) rt.register(m);
    const dx = rt.resolve('docx');
    const { ContractError: RtContractError } = rt.resolve('ooxmlErrors');
    dx.use(rt.resolve('wmlRunFormatting'));

    test('control: without a failing check the dehydrate pass does mutate the tree', () => {
        const doc = { type: 'document', body: [dx.paragraph('x', { rPr: { bold: true, caps: true } })] };
        const before = structuredClone(doc);

        dx.write(doc);

        expect(doc).not.toEqual(before);
    });

    test('hyperlink check throws: the tree is deep-equal before and after', () => {
        const doc = { type: 'document', body: [
            dx.paragraph('x', { rPr: { bold: true, caps: true } }),
            { type: 'paragraph', children: [dx.hyperlink('Example', 'https://example.com')] }
        ] };
        const before = structuredClone(doc);

        const err = thrown(() => dx.write(doc));

        expect(err).toBeInstanceOf(RtContractError);
        expect(err.code).toBe('docx/hyperlink-missing-rid');
        expect(doc).toEqual(before);
    });

    test('numbering check throws: the tree is deep-equal before and after', () => {
        const doc = { type: 'document', body: [
            dx.paragraph('x', { rPr: { bold: true, caps: true } }),
            dx.listParagraph('Item', 1, 0)
        ] };
        const before = structuredClone(doc);

        const err = thrown(() => dx.write(doc));

        expect(err).toBeInstanceOf(RtContractError);
        expect(err.code).toBe('docx/numbering-missing');
        expect(doc).toEqual(before);
    });
});
