// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * Hyperlink relationships through `docx.read` / `docx.write`, for the
 * document body and for every story part (headers, footers, footnotes,
 * endnotes, comments).
 *
 *  - On read, a `hyperlink` node whose `rId` resolves to a hyperlink
 *    relationship of the part that holds it carries `target` and
 *    `external` (the body against `word/document.xml`'s relationships, a
 *    story part against its own), so `write(read(x).document, …)` keeps the
 *    link without extra options.
 *  - On write, each story part gets its own relationship table holding the
 *    hyperlink relationships derived from its nodes; none is written for a
 *    part without one.
 *  - A hyperlink `rId` with no relationship in the table written for its
 *    part throws `ContractError` `docx/hyperlink-unresolved-rid` before any
 *    part is rendered; `docx/hyperlink-missing-rid` covers every story part.
 *
 * Raw assertions go through `opcPackage.read` (relationship tables keyed by
 * their owner part name), independent of the docx reader.
 *
 * These tests are the citations behind `docs/api/docx/docx.md` § Notes, the
 * hyperlink line of `docs/api/docx/structure.md` and the
 * `docx/hyperlink-unresolved-rid` row of `docs/api/errors.md`.
 */
import { describe, test, expect } from 'bun:test';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import * as ooxmlMods from '../main.js';

const runtime = new ModuleRuntime();
for (const m of [...ooxmlMods.fw_require, ...ooxmlMods.modules]) runtime.register(m);
const d = runtime.resolve('docx');
const opc = runtime.resolve('opcPackage');
const { ContractError } = runtime.resolve('ooxmlErrors');
const REL_TYPE_HYPERLINK = d.REL_TYPE_HYPERLINK;
const REL_TYPE_IMAGE = runtime.resolve('docxDrawing').REL_TYPE_IMAGE;

/** Run `fn`, return the error it throws (or `null`). */
function thrown(fn) {
    try { fn(); } catch (e) { return e; }
    return null;
}

/** A paragraph holding the given inline nodes. */
function para(...children) {
    return { type: 'paragraph', children };
}

/** A hyperlink node carrying an `rId` but no target. */
function ridOnly(rId) {
    return { type: 'hyperlink', rId, children: [d.run('link')] };
}

/** A one-paragraph document body holding `node`. */
function bodyDoc(node) {
    return { type: 'document', body: [para(node)] };
}

/** The first `hyperlink` node of a body, depth-first. */
function firstHyperlink(body) {
    let found = null;
    const walk = n => {
        if (!n || found) return;
        if (Array.isArray(n)) { n.forEach(walk); return; }
        if (n.type === 'hyperlink') { found = n; return; }
        walk(n.body); walk(n.children); walk(n.rows); walk(n.cells);
    };
    walk(body);
    return found;
}

/** The `write()` options that rewrite every story part of a read result. */
function storyOpts(r) {
    const o = { headers: r.headers, footers: r.footers };
    if (r.footnotes) o.footnotes = r.footnotes;
    if (r.endnotes) o.endnotes = r.endnotes;
    if (r.comments) o.comments = r.comments;
    return o;
}

// One hyperlink per story part, all with the SAME rId: each part has its
// own relationship table, so the rIds never collide.
const STORY_TARGETS = {
    header: 'https://header.example/',
    footer: 'https://footer.example/',
    footnotes: 'https://footnote.example/',
    endnotes: 'https://endnote.example/',
    comments: 'https://comment.example/'
};
const STORY_PART_NAMES = {
    header: '/word/header1.xml',
    footer: '/word/footer1.xml',
    footnotes: '/word/footnotes.xml',
    endnotes: '/word/endnotes.xml',
    comments: '/word/comments.xml'
};

function linkPara(text, target) {
    return para(d.hyperlink(text, target, { rId: 'hlRid1' }));
}

/** Document + story parts, each story part holding one hyperlink. */
function storyFixture() {
    const doc = { type: 'document', body: [d.paragraph('Body')] };
    const opts = {
        headers: { rIdHdr1: { type: 'header', body: [linkPara('h', STORY_TARGETS.header)] } },
        footers: { rIdFtr1: { type: 'footer', body: [linkPara('f', STORY_TARGETS.footer)] } },
        footnotes: { notes: [{ id: 1, body: [linkPara('fn', STORY_TARGETS.footnotes)] }] },
        endnotes: { notes: [{ id: 1, body: [linkPara('en', STORY_TARGETS.endnotes)] }] },
        comments: { comments: [{ id: 1, author: 'Alice',
            body: [linkPara('c', STORY_TARGETS.comments)] }] }
    };
    return { doc, opts };
}

/** The same document and story parts, without any hyperlink. */
function plainStoryFixture() {
    const doc = { type: 'document', body: [d.paragraph('Body')] };
    const opts = {
        headers: { rIdHdr1: { type: 'header', body: [d.paragraph('h')] } },
        footers: { rIdFtr1: { type: 'footer', body: [d.paragraph('f')] } },
        footnotes: { notes: [{ id: 1, body: [d.paragraph('fn')] }] },
        endnotes: { notes: [{ id: 1, body: [d.paragraph('en')] }] },
        comments: { comments: [{ id: 1, author: 'Alice', body: [d.paragraph('c')] }] }
    };
    return { doc, opts };
}

/** The story bodies of a read result, by story kind. */
function readStoryBodies(r) {
    return {
        header: r.headers.rIdHdr1.body,
        footer: r.footers.rIdFtr1.body,
        footnotes: r.footnotes.notes[0].body,
        endnotes: r.endnotes.notes[0].body,
        comments: r.comments.comments[0].body
    };
}

describe('docx read → write — a body hyperlink round-trips without extra options', () => {
    test('write(read(x).document) keeps the body hyperlink relationship; the read node carries target and external: true', () => {
        const source = d.write(bodyDoc(d.hyperlink('Example', 'https://example.com/', { rId: 'hlRid1' })));

        const r = d.read(source);
        const node = firstHyperlink(r.document.body);
        expect(node.rId).toBe('hlRid1');
        expect(node.target).toBe('https://example.com/');
        expect(node.external).toBe(true);

        const rewritten = d.write(r.document);
        const docRels = opc.read(rewritten).rels['/word/document.xml'] || [];
        expect(docRels).toContainEqual({
            Id: 'hlRid1', Type: REL_TYPE_HYPERLINK,
            Target: 'https://example.com/', TargetMode: 'External'
        });
        expect(d.read(rewritten).hyperlinks.hlRid1)
            .toEqual({ target: 'https://example.com/', external: true });
    });

    test('result.hyperlinks keeps its shape: { rId: { target, external } } for the body only', () => {
        const { doc, opts } = storyFixture();
        doc.body.push(para(d.hyperlink('Body link', 'https://body.example/', { rId: 'hlBody' })));

        const r = d.read(d.write(doc, opts));

        expect(r.hyperlinks).toEqual({
            hlBody: { target: 'https://body.example/', external: true }
        });
    });

    test('an internal relationship (no TargetMode): the read node has external === false and the rewrite keeps no TargetMode', () => {
        const source = d.write(bodyDoc(
            d.hyperlink('Internal', 'other.docx', { rId: 'hlInt1', external: false })));
        const sourceRel = opc.read(source).rels['/word/document.xml'].find(x => x.Id === 'hlInt1');
        expect(sourceRel).toEqual({ Id: 'hlInt1', Type: REL_TYPE_HYPERLINK, Target: 'other.docx' });

        const r = d.read(source);
        const node = firstHyperlink(r.document.body);
        expect(node.target).toBe('other.docx');
        expect(node.external).toBe(false);

        const rewritten = d.write(r.document);
        const rel = opc.read(rewritten).rels['/word/document.xml'].find(x => x.Id === 'hlInt1');
        expect(rel).toEqual({ Id: 'hlInt1', Type: REL_TYPE_HYPERLINK, Target: 'other.docx' });
        expect('TargetMode' in rel).toBe(false);
    });
});

describe('docx story parts — each part writes and reads its own hyperlink relationships', () => {
    test('header, footer, footnotes, endnotes and comments: each part has its own relationship table holding its hyperlink', () => {
        const { doc, opts } = storyFixture();

        const pkg = opc.read(d.write(doc, opts));

        for (const kind of Object.keys(STORY_PART_NAMES)) {
            expect({ kind, rels: pkg.rels[STORY_PART_NAMES[kind]] }).toEqual({
                kind,
                rels: [{ Id: 'hlRid1', Type: REL_TYPE_HYPERLINK,
                    Target: STORY_TARGETS[kind], TargetMode: 'External' }]
            });
        }
        // The body has no hyperlink: its table holds the story-part
        // relationships only, never a story part's hyperlink.
        const docRels = pkg.rels['/word/document.xml'];
        expect(docRels.some(x => x.Type === REL_TYPE_HYPERLINK)).toBe(false);
    });

    test('read() copies each story part\'s target and external onto its node, resolved against that part\'s own relationships', () => {
        const { doc, opts } = storyFixture();

        const r = d.read(d.write(doc, opts));

        const bodies = readStoryBodies(r);
        for (const kind of Object.keys(bodies)) {
            const node = firstHyperlink(bodies[kind]);
            expect({ kind, rId: node.rId, target: node.target, external: node.external })
                .toEqual({ kind, rId: 'hlRid1', target: STORY_TARGETS[kind], external: true });
        }
    });

    test('write(read(x).document, { headers, footers, footnotes, endnotes, comments }) reproduces each part\'s table (same Id, Target, TargetMode)', () => {
        const { doc, opts } = storyFixture();
        const source = d.write(doc, opts);
        const sourcePkg = opc.read(source);

        const r = d.read(source);
        const rewritten = opc.read(d.write(r.document, storyOpts(r)));

        for (const kind of Object.keys(STORY_PART_NAMES)) {
            const name = STORY_PART_NAMES[kind];
            expect({ name, count: (sourcePkg.rels[name] || []).length })
                .toEqual({ name, count: 1 });
            expect({ name, rels: rewritten.rels[name] })
                .toEqual({ name, rels: sourcePkg.rels[name] });
        }
    });

    test('an internal story-part relationship reads as external === false and is rewritten without TargetMode', () => {
        const doc = { type: 'document', body: [d.paragraph('Body')] };
        const headers = { rIdHdr1: { type: 'header', body: [para(
            d.hyperlink('h', 'other.docx', { rId: 'hlInt1', external: false }))] } };

        const r = d.read(d.write(doc, { headers }));
        const node = firstHyperlink(r.headers.rIdHdr1.body);
        expect(node.target).toBe('other.docx');
        expect(node.external).toBe(false);

        const rels = opc.read(d.write(r.document, { headers: r.headers })).rels['/word/header1.xml'];
        expect(rels).toEqual([{ Id: 'hlInt1', Type: REL_TYPE_HYPERLINK, Target: 'other.docx' }]);
    });

    test('a hyperlink nested in a header table cell and in a blockSdt is written to the header\'s table', () => {
        const doc = { type: 'document', body: [d.paragraph('Body')] };
        const headers = { rIdHdr1: { type: 'header', body: [
            { type: 'table', rows: [{ type: 'row', cells: [{ type: 'cell',
                children: [para(d.hyperlink('cell', 'https://cell.example/', { rId: 'hlCell' }))] }] }] },
            { type: 'blockSdt', children: [
                para(d.hyperlink('sdt', 'https://sdt.example/', { rId: 'hlSdt' }))] }
        ] } };

        const rels = opc.read(d.write(doc, { headers })).rels['/word/header1.xml'];

        expect(rels.map(x => [x.Id, x.Target])).toEqual([
            ['hlCell', 'https://cell.example/'],
            ['hlSdt', 'https://sdt.example/']
        ]);
    });

    test('no hyperlink in a story part: no relationship table is written for it', () => {
        const { doc, opts } = plainStoryFixture();

        const pkg = opc.read(d.write(doc, opts));

        expect(Object.keys(pkg.rels).sort()).toEqual(['/', '/word/document.xml']);
    });

    test('only the story parts holding a hyperlink get a relationship table', () => {
        const { doc, opts } = plainStoryFixture();
        opts.footnotes.notes[0].body = [linkPara('fn', STORY_TARGETS.footnotes)];

        const pkg = opc.read(d.write(doc, opts));

        expect(Object.keys(pkg.rels).sort())
            .toEqual(['/', '/word/document.xml', '/word/footnotes.xml']);
    });

    test('a story-part rId pointing at a non-hyperlink relationship gets no target', () => {
        const doc = { type: 'document', body: [d.paragraph('Body')] };
        const headers = { rIdHdr1: { type: 'header', body: [
            linkPara('h', STORY_TARGETS.header),
            para({ type: 'hyperlink', anchor: 'Top', children: [d.run('anchor')] })
        ] } };
        const pkg = opc.read(d.write(doc, { headers }));
        // Patch: the anchor link now also names an image relationship.
        pkg.rels['/word/header1.xml'].push(
            { Id: 'rIdImg', Type: REL_TYPE_IMAGE, Target: 'media/x.png' });
        const header = new TextDecoder().decode(pkg.parts['/word/header1.xml'])
            .replace('<w:hyperlink w:anchor="Top">', '<w:hyperlink r:id="rIdImg" w:anchor="Top">');
        pkg.parts['/word/header1.xml'] = new TextEncoder().encode(header);

        const r = d.read(opc.write(pkg));

        const nodes = r.headers.rIdHdr1.body.map(p => p.children[0]);
        expect(nodes[0].target).toBe(STORY_TARGETS.header);
        expect(nodes[1].rId).toBe('rIdImg');
        expect('target' in nodes[1]).toBe(false);
        expect('external' in nodes[1]).toBe(false);
    });

    test('unmodelledParts is identical with and without story-part hyperlinks (relationship lookups consume no part)', () => {
        const withLinks = storyFixture();
        const without = plainStoryFixture();

        const a = d.read(d.write(withLinks.doc, withLinks.opts));
        const b = d.read(d.write(without.doc, without.opts));

        expect(a.unmodelledParts).toEqual(b.unmodelledParts);
        expect(a.unmodelledParts).toEqual([]);
    });
});

describe('docx.write — a hyperlink rId must resolve in its part (docx/hyperlink-unresolved-rid)', () => {
    test('body node with an rId and no target, no opts.hyperlinks: throws with context { rId, story: document }', () => {
        const err = thrown(() => d.write(bodyDoc(ridOnly('x'))));

        expect(err).toBeInstanceOf(ContractError);
        expect(err.code).toBe('docx/hyperlink-unresolved-rid');
        expect(err.context).toEqual({ rId: 'x', story: 'document' });
        expect(err.message).toBe('docx.write: hyperlink rId "x" has no relationship in the document part'
            + ' (give the node a target, or pass the relationship in opts.hyperlinks for the document body)');
    });

    test('body node with a target whose rId is absent from a supplied opts.hyperlinks: throws', () => {
        const doc = bodyDoc(d.hyperlink('Example', 'https://example.com/', { rId: 'hlRid1' }));

        const err = thrown(() => d.write(doc, {
            hyperlinks: { hlRid9: { target: 'https://explicit.example/' } }
        }));

        expect(err).toBeInstanceOf(ContractError);
        expect(err.code).toBe('docx/hyperlink-unresolved-rid');
        expect(err.context).toEqual({ rId: 'hlRid1', story: 'document' });
    });

    test('header node with an rId and no target: throws with context { rId, story: header, key }', () => {
        const doc = { type: 'document', body: [d.paragraph('Body')] };
        const headers = { rIdHdr1: { type: 'header', body: [para(ridOnly('y'))] } };

        const err = thrown(() => d.write(doc, { headers }));

        expect(err).toBeInstanceOf(ContractError);
        expect(err.code).toBe('docx/hyperlink-unresolved-rid');
        expect(err.context).toEqual({ rId: 'y', story: 'header', key: 'rIdHdr1' });
        expect(err.message).toContain('has no relationship in the header part');
    });

    test('footer node with an rId and no target: throws with context { rId, story: footer, key }', () => {
        const doc = { type: 'document', body: [d.paragraph('Body')] };
        const footers = { rIdFtr1: { type: 'footer', body: [para(ridOnly('z'))] } };

        const err = thrown(() => d.write(doc, { footers }));

        expect(err.code).toBe('docx/hyperlink-unresolved-rid');
        expect(err.context).toEqual({ rId: 'z', story: 'footer', key: 'rIdFtr1' });
    });

    test('footnote, endnote and comment nodes with an rId and no target: throw with their story', () => {
        const doc = { type: 'document', body: [d.paragraph('Body')] };
        const cases = [
            ['footnotes', { footnotes: { notes: [{ id: 1, body: [para(ridOnly('fnR'))] }] } }, 'fnR'],
            ['endnotes', { endnotes: { notes: [{ id: 1, body: [para(ridOnly('enR'))] }] } }, 'enR'],
            ['comments', { comments: { comments: [{ id: 1, author: 'A',
                body: [para(ridOnly('cmR'))] }] } }, 'cmR']
        ];
        for (const [story, opts, rId] of cases) {
            const err = thrown(() => d.write(doc, opts));
            expect(err).toBeInstanceOf(ContractError);
            expect({ story, code: err.code, context: err.context })
                .toEqual({ story, code: 'docx/hyperlink-unresolved-rid', context: { rId, story } });
        }
    });

    test('a body node nested in a table cell is found and throws', () => {
        const doc = { type: 'document', body: [{ type: 'table', rows: [{ type: 'row',
            cells: [{ type: 'cell', children: [para(ridOnly('inCell'))] }] }] }] };

        const err = thrown(() => d.write(doc));

        expect(err.code).toBe('docx/hyperlink-unresolved-rid');
        expect(err.context).toEqual({ rId: 'inCell', story: 'document' });
    });

    test('a node nested in a blockSdt is found and throws (body and header)', () => {
        const sdt = rId => ({ type: 'blockSdt', children: [para(ridOnly(rId))] });

        const bodyErr = thrown(() => d.write({ type: 'document', body: [sdt('inSdt')] }));
        expect(bodyErr.code).toBe('docx/hyperlink-unresolved-rid');
        expect(bodyErr.context).toEqual({ rId: 'inSdt', story: 'document' });

        const headerErr = thrown(() => d.write({ type: 'document', body: [d.paragraph('Body')] },
            { headers: { rIdHdr1: { type: 'header', body: [sdt('inHdrSdt')] } } }));
        expect(headerErr.code).toBe('docx/hyperlink-unresolved-rid');
        expect(headerErr.context).toEqual({ rId: 'inHdrSdt', story: 'header', key: 'rIdHdr1' });
    });

    test('tables are per part: a header node\'s target never resolves a body rId, and opts.hyperlinks never resolves a story-part rId', () => {
        const headers = { rIdHdr1: { type: 'header', body: [linkPara('h', STORY_TARGETS.header)] } };
        const bodyErr = thrown(() => d.write(bodyDoc(ridOnly('hlRid1')), { headers }));
        expect(bodyErr.code).toBe('docx/hyperlink-unresolved-rid');
        expect(bodyErr.context).toEqual({ rId: 'hlRid1', story: 'document' });

        const headerErr = thrown(() => d.write({ type: 'document', body: [d.paragraph('Body')] }, {
            headers: { rIdHdr1: { type: 'header', body: [para(ridOnly('hlRid9'))] } },
            hyperlinks: { hlRid9: { target: 'https://explicit.example/' } }
        }));
        expect(headerErr.code).toBe('docx/hyperlink-unresolved-rid');
        expect(headerErr.context).toEqual({ rId: 'hlRid9', story: 'header', key: 'rIdHdr1' });
    });

    test('the first offending node in document order wins: body before header before footnotes', () => {
        const err = thrown(() => d.write(bodyDoc(ridOnly('first')), {
            headers: { rIdHdr1: { type: 'header', body: [para(ridOnly('second'))] } },
            footnotes: { notes: [{ id: 1, body: [para(ridOnly('third'))] }] }
        }));

        expect(err.context).toEqual({ rId: 'first', story: 'document' });
    });

    test('check order: every missing-rid check, then unresolved-rid, then numbering', () => {
        // An unresolved rId in the body comes BEFORE a missing-rid node in
        // a comment: the missing-rid check still wins.
        const missingFirst = thrown(() => d.write(bodyDoc(ridOnly('dangling')), {
            comments: { comments: [{ id: 1, author: 'A',
                body: [para(d.hyperlink('lost', 'https://lost.example/'))] }] }
        }));
        expect(missingFirst.code).toBe('docx/hyperlink-missing-rid');
        expect(missingFirst.context).toEqual({ target: 'https://lost.example/' });

        // A list reference without opts.numbering comes BEFORE an
        // unresolved rId: unresolved-rid still wins.
        const unresolvedFirst = thrown(() => d.write({ type: 'document', body: [
            d.listParagraph('Item', 1, 0), para(ridOnly('dangling'))
        ] }));
        expect(unresolvedFirst.code).toBe('docx/hyperlink-unresolved-rid');
    });

    test('an anchor-only hyperlink and a hyperlink without rId or target are not checked', () => {
        const doc = { type: 'document', body: [
            para({ type: 'hyperlink', anchor: 'Top', children: [d.run('a')] }),
            para(d.hyperlink('Plain', undefined))
        ] };

        expect(() => d.write(doc)).not.toThrow();
    });
});

describe('docx.write — docx/hyperlink-missing-rid covers footnotes, endnotes and comments', () => {
    const doc = { type: 'document', body: [d.paragraph('Body')] };
    const lost = target => [para(d.hyperlink('lost', target))];

    test('a target-without-rId node in a footnote throws', () => {
        const err = thrown(() => d.write(doc,
            { footnotes: { notes: [{ id: 1, body: lost('https://fn.example/') }] } }));
        expect(err).toBeInstanceOf(ContractError);
        expect(err.code).toBe('docx/hyperlink-missing-rid');
        expect(err.context).toEqual({ target: 'https://fn.example/' });
    });

    test('a target-without-rId node in an endnote throws', () => {
        const err = thrown(() => d.write(doc,
            { endnotes: { notes: [{ id: 1, body: lost('https://en.example/') }] } }));
        expect(err.code).toBe('docx/hyperlink-missing-rid');
        expect(err.context).toEqual({ target: 'https://en.example/' });
    });

    test('a target-without-rId node in a comment throws', () => {
        const err = thrown(() => d.write(doc,
            { comments: { comments: [{ id: 1, author: 'A', body: lost('https://cm.example/') }] } }));
        expect(err.code).toBe('docx/hyperlink-missing-rid');
        expect(err.context).toEqual({ target: 'https://cm.example/' });
    });
});

describe('docx.write — an unresolved-rid throw leaves the caller\'s tree untouched', () => {
    // Same control pattern as `docx.write-defaults.test.js`: with an
    // extension registered, `write()` runs the dehydrate pass, which
    // mutates the tree in place (`caps` demoted into `rPr._extras`).
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

    test('unresolved-rid throws: the document and the story parts are deep-equal before and after', () => {
        const doc = { type: 'document', body: [
            dx.paragraph('x', { rPr: { bold: true, caps: true } }),
            para(dx.hyperlink('Example', 'https://example.com/', { rId: 'hlRid1' }))
        ] };
        const opts = {
            headers: { rIdHdr1: { type: 'header', body: [
                dx.paragraph('h', { rPr: { bold: true, caps: true } }),
                para(ridOnly('dangling'))
            ] } },
            footnotes: { notes: [{ id: 1, body: [linkPara('fn', STORY_TARGETS.footnotes)] }] }
        };
        const before = structuredClone({ doc, opts });

        const err = thrown(() => dx.write(doc, opts));

        expect(err).toBeInstanceOf(RtContractError);
        expect(err.code).toBe('docx/hyperlink-unresolved-rid');
        expect({ doc, opts }).toEqual(before);
    });
});
