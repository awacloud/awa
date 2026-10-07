// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/* global Bun */
import { describe, test, expect, beforeAll } from 'bun:test';
import { fileURLToPath } from 'node:url';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { modules as ooxmlModules, fw_require as ooxmlFwRequire } from '@awacloud/ooxml';
import { oconvIr } from '../ir/ir.js';
import { oconvIrToDocx } from './ir-to-docx.js';
import { oconvDocxToIr } from '../read/docx-to-ir.js';

// Spike-proven pattern (W0 FINDINGS, mirrored from `../read/docx-to-ir.test.js`):
// a unit test hand-registers the needed descriptors on a local
// `ModuleRuntime` rather than going through a package composition root.
//
// Structural oracle: every assertion below reads the produced bytes back —
// either through `docx.read(bytes)` (typed model) or through the
// `opcPackage` runtime module (raw OPC parts / relationships). The one
// container-byte comparison is the determinism block's byte-identity test:
// the docx target is byte-reproducible.
let docxApi;
let opcApi;
let irApi;
let irToDocx;
let stylesMod;
let docxToIr;

beforeAll(() => {
    const runtime = new ModuleRuntime();
    runtime.registerAll(ooxmlFwRequire);
    runtime.registerAll(ooxmlModules);
    runtime.register(oconvIr);
    runtime.register(oconvIrToDocx);
    runtime.register(oconvDocxToIr);

    docxApi = runtime.resolve('docx');
    opcApi = runtime.resolve('opcPackage');
    irApi = runtime.resolve('oconvIr');
    stylesMod = runtime.resolve('docxStyles');
    ({ irToDocx } = runtime.resolve('oconvIrToDocx'));
    ({ docxToIr } = runtime.resolve('oconvDocxToIr'));
});

/* ── fixture helpers ─────────────────────────────────────────────────── */

/** @returns {Object} an IR `run` node with the frozen defaults filled in. */
const run = (text, props) => irApi.node('run', { text, ...(props || {}) });
/** @returns {Object} an IR block/inline container node. */
const n = (kind, props, children) => irApi.node(kind, props, children);
/** @returns {Object} an IR `document` node. */
const doc = children => irApi.doc(children);

/** Read the raw OPC package out of the produced bytes. */
const opcOf = bytes => opcApi.read(bytes);

/** Raw `word/document.xml` text of the produced bytes. */
const documentXmlOf = bytes =>
    opcApi.bytesToString(opcOf(bytes).parts['/word/document.xml']);

/* ── descriptor ──────────────────────────────────────────────────────── */

describe('oconvIrToDocx — descriptor', () => {
    test('is a fw module descriptor with the prescribed dependencies', () => {
        expect(oconvIrToDocx.name).toBe('oconvIrToDocx');
        expect(oconvIrToDocx.dependencies).toEqual(['oconvIr', 'docx']);
        expect(typeof oconvIrToDocx.factory).toBe('function');
    });
});

/* ── headings ────────────────────────────────────────────────────────── */

describe('oconvIrToDocx — headings', () => {
    test('levels 1–6 map to the Heading<n> pStyle the read leg recognises', () => {
        const levels = [1, 2, 3, 4, 5, 6];
        const ir = doc(levels.map(level =>
            n('heading', { level }, [run('H' + level)])));

        const { bytes, losses } = irToDocx(ir);
        const read = docxApi.read(bytes);

        expect(losses).toEqual([]);
        expect(read.document.body).toHaveLength(6);
        levels.forEach((level, i) => {
            expect(read.document.body[i].pPr.pStyle).toBe('Heading' + level);
            expect(read.document.body[i].children[0].children[0].value)
                .toBe('H' + level);
        });
    });

    test('a plain paragraph carries no pStyle', () => {
        const { bytes } = irToDocx(doc([n('paragraph', {}, [run('flat')])]));
        const p = docxApi.read(bytes).document.body[0];
        expect(p.type).toBe('paragraph');
        expect(p.pPr === undefined || p.pPr.pStyle === undefined).toBe(true);
    });
});

/* ── run flags ───────────────────────────────────────────────────────── */

describe('oconvIrToDocx — run formatting', () => {
    test('bold / italic / strike survive singly and combined', () => {
        const ir = doc([n('paragraph', {}, [
            run('plain'),
            run('b', { bold: true }),
            run('i', { italic: true }),
            run('s', { strike: true }),
            run('bis', { bold: true, italic: true, strike: true })
        ])]);

        const { bytes, losses } = irToDocx(ir);
        const runs = docxApi.read(bytes).document.body[0].children;

        expect(losses).toEqual([]);
        expect(runs).toHaveLength(5);
        // A run with every flag false carries no `w:rPr` at all.
        expect(runs[0].rPr).toBeUndefined();
        expect(runs[1].rPr).toEqual({ bold: true });
        expect(runs[2].rPr).toEqual({ italic: true });
        expect(runs[3].rPr).toEqual({ strike: true });
        expect(runs[4].rPr).toEqual({ bold: true, italic: true, strike: true });
        expect(runs.map(r => r.children[0].value))
            .toEqual(['plain', 'b', 'i', 's', 'bis']);
    });
});

/* ── inline code (monospace, symmetric with the reader, office/BATCH_35) ── */

describe('oconvIrToDocx — inline code', () => {
    test('a code run writes rPr.font === "Courier New", no loss', () => {
        const ir = doc([n('paragraph', {}, [run('npm i', { code: true })])]);
        const { bytes, losses } = irToDocx(ir);
        const runs = docxApi.read(bytes).document.body[0].children;

        expect(losses).toEqual([]);
        expect(runs[0].rPr).toEqual({ font: 'Courier New' });
        expect(runs[0].children[0].value).toBe('npm i');
    });

    test('code combined with bold keeps both flags, no loss', () => {
        const ir = doc([n('paragraph', {}, [run('bold code', { code: true, bold: true })])]);
        const { bytes, losses } = irToDocx(ir);
        const runs = docxApi.read(bytes).document.body[0].children;

        expect(losses).toEqual([]);
        expect(runs[0].rPr).toEqual({ bold: true, font: 'Courier New' });
    });

    test('a code run inside a hyperlink carries the font on the inner run, no loss', () => {
        const ir = doc([n('paragraph', {}, [
            run('linked code', { code: true, link: 'https://example.test/code' })
        ])]);
        const { bytes, losses } = irToDocx(ir);
        const read = docxApi.read(bytes);
        const link = read.document.body[0].children[0];

        expect(losses).toEqual([]);
        expect(link.type).toBe('hyperlink');
        expect(read.hyperlinks.rIdHl1.target).toBe('https://example.test/code');
        expect(link.children[0].rPr.font).toBe('Courier New');
        expect(link.children[0].children[0].value).toBe('linked code');
    });

    test('a non-allowlisted-looking plain run carries no font at all', () => {
        const ir = doc([n('paragraph', {}, [run('plain')])]);
        const { bytes } = irToDocx(ir);
        expect(docxApi.read(bytes).document.body[0].children[0].rPr).toBeUndefined();
    });
});

describe('oconvIrToDocx — exhaustive absence of run/code-degraded', () => {
    test('a document mixing code, bold, links, lists and tables produces NO run/code-degraded loss', () => {
        const ir = doc([
            n('paragraph', {}, [
                run('code', { code: true }),
                run(' and ', {}),
                run('bold code', { code: true, bold: true }),
                run(' and a ', {}),
                run('linked code', { code: true, link: 'https://example.test/mix' })
            ]),
            n('list', { ordered: true }, [
                n('listItem', {}, [n('paragraph', {}, [run('item code', { code: true })])])
            ]),
            n('table', {}, [
                n('row', { header: true }, [
                    n('cell', {}, [n('paragraph', {}, [run('cell code', { code: true })])])
                ])
            ])
        ]);
        const { losses } = irToDocx(ir);

        // Exhaustive — not a `some`/`toContain` check: this fixture exercises
        // code runs in every position the writer maps (plain, bold+code,
        // hyperlink, list item, table cell) and must produce ZERO losses,
        // proving `run/code-degraded` is gone.
        expect(losses).toEqual([]);
    });
});

/* ── hyperlinks (GAP-OOXML-1 kept off the call path) ─────────────────── */

describe('oconvIrToDocx — hyperlinks', () => {
    test('explicit rIdHl<n> rels reach the model, the rels part and document.xml', () => {
        const ir = doc([
            n('paragraph', {}, [
                run('first', { link: 'https://example.test/one' }),
                run(' then '),
                run('second', { link: 'https://example.test/two', bold: true })
            ])
        ]);

        const { bytes, losses } = irToDocx(ir);
        const read = docxApi.read(bytes);
        const pkg = opcOf(bytes);

        expect(losses).toEqual([]);

        // (1) typed model — the relationship table resolves both targets.
        expect(read.hyperlinks.rIdHl1.target).toBe('https://example.test/one');
        expect(read.hyperlinks.rIdHl2.target).toBe('https://example.test/two');
        expect(read.hyperlinks.rIdHl1.external).toBe(true);

        // (2) raw `word/_rels/document.xml.rels` — the part `opcPackage`
        // parses the relationships out of — carries both targets.
        const docRels = pkg.rels['/word/document.xml'];
        const byId = Object.fromEntries(docRels.map(r => [r.Id, r]));
        expect(byId.rIdHl1.Target).toBe('https://example.test/one');
        expect(byId.rIdHl2.Target).toBe('https://example.test/two');
        expect(byId.rIdHl1.TargetMode).toBe('External');

        // (3) raw `word/document.xml` — the run is wrapped in a
        // <w:hyperlink r:id="rIdHl1"> pointing at that relationship.
        const xmlText = documentXmlOf(bytes);
        expect(xmlText).toContain('r:id="rIdHl1"');
        expect(xmlText).toContain('r:id="rIdHl2"');

        // (4) the inner run keeps its emphasis flags.
        const links = read.document.body[0].children.filter(c => c.type === 'hyperlink');
        expect(links).toHaveLength(2);
        expect(links[0].rId).toBe('rIdHl1');
        expect(links[1].children[0].rPr.bold).toBe(true);
        expect(links[0].children[0].children[0].value).toBe('first');
    });

    test('rIds never collide with the allocator-claimed rId1.. part rels', () => {
        // `docx.write` claims rId1.. for styles/numbering/settings BEFORE
        // hyperlink rels are appended — a bare 'rId'+n would collide with
        // the numbering rel of a list-bearing document.
        const ir = doc([
            n('list', { ordered: false }, [
                n('listItem', {}, [n('paragraph', {}, [
                    run('linked', { link: 'https://example.test/list' })
                ])])
            ])
        ]);
        const { bytes } = irToDocx(ir);
        const docRels = opcOf(bytes).rels['/word/document.xml'];
        const ids = docRels.map(r => r.Id);

        expect(ids).toContain('rIdHl1');
        expect(new Set(ids).size).toBe(ids.length);
        expect(docxApi.read(bytes).hyperlinks.rIdHl1.target)
            .toBe('https://example.test/list');
    });
});

/* ── lists + numbering (GAP-OOXML-2 closed from the caller side) ─────── */

describe('oconvIrToDocx — lists and numbering', () => {
    test('ordered vs bullet resolve to distinct numIds and numbering.xml exists', () => {
        const ir = doc([
            n('list', { ordered: false }, [
                n('listItem', {}, [n('paragraph', {}, [run('bullet top')])]),
                n('listItem', {}, [
                    n('paragraph', {}, [run('bullet parent')]),
                    n('list', { ordered: false }, [
                        n('listItem', {}, [n('paragraph', {}, [run('bullet nested')])])
                    ])
                ])
            ]),
            n('list', { ordered: true }, [
                n('listItem', {}, [n('paragraph', {}, [run('ordered one')])])
            ])
        ]);

        const { bytes, losses } = irToDocx(ir);
        const read = docxApi.read(bytes);
        const body = read.document.body;

        expect(losses).toEqual([]);
        expect(body).toHaveLength(4);
        expect(body[0].pPr.numPr).toEqual({ numId: 1, ilvl: 0 });
        expect(body[1].pPr.numPr).toEqual({ numId: 1, ilvl: 0 });
        expect(body[2].pPr.numPr).toEqual({ numId: 1, ilvl: 1 });
        expect(body[3].pPr.numPr).toEqual({ numId: 2, ilvl: 0 });

        // The `word/numbering.xml` part EXISTS — without it every `w:numPr`
        // above would dangle and the docx→IR leg would degrade to
        // `list/numbering-unresolved` (GAP-OOXML-2).
        expect(Object.keys(opcOf(bytes).parts)).toContain('/word/numbering.xml');
        expect(read.numbering.nums.map(x => x.numId)).toEqual([1, 2]);
        const abstracts = read.numbering.abstractNums;
        expect(abstracts.map(a => a.abstractNumId)).toEqual([0, 1]);
        expect(abstracts[0].levels).toHaveLength(9);
        expect(abstracts[1].levels).toHaveLength(9);
        expect(abstracts[0].levels[0].numFmt).toBe('bullet');
        expect(abstracts[1].levels[2].numFmt).toBe('decimal');
        expect(abstracts[1].levels[2].lvlText).toBe('%3.');
        expect(abstracts[1].levels[2].pPr.indent)
            .toEqual({ left: 2160, hanging: 360 });
    });

    test('a document with no list carries NO numbering.xml part', () => {
        // Falsification control for the assertion above: the part must not
        // appear merely because `docx.write` was called.
        const { bytes } = irToDocx(doc([n('paragraph', {}, [run('no lists here')])]));
        expect(Object.keys(opcOf(bytes).parts)).not.toContain('/word/numbering.xml');
        expect(docxApi.read(bytes).numbering).toBeUndefined();
    });

    // BL-1799 (office/BATCH_48/03): the bullet levels must NOT pin the
    // Symbol font — U+2022 is a plain Unicode glyph; under `Symbol` it
    // renders as a missing-glyph box in viewers lacking that font.
    test('bullet levels carry U+2022 with NO Symbol font (BL-1799)', () => {
        const ir = doc([
            n('list', { ordered: false }, [
                n('listItem', {}, [n('paragraph', {}, [run('bullet')])])
            ]),
            n('list', { ordered: true }, [
                n('listItem', {}, [n('paragraph', {}, [run('ordered')])])
            ])
        ]);
        const { bytes } = irToDocx(ir);
        const read = docxApi.read(bytes);

        const abstract0 = read.numbering.abstractNums.find(a => a.abstractNumId === 0);
        expect(abstract0.levels.map(l => l.ilvl)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
        for (const level of abstract0.levels) {
            expect(level.numFmt).toBe('bullet');
            expect(level.lvlText).toBe('•');
            expect(level.rPr).toBeUndefined();
        }

        // Raw part: no `w:rFonts` anywhere inside abstractNum 0.
        const numXml = opcApi.bytesToString(opcOf(bytes).parts['/word/numbering.xml']);
        const chunk = /<w:abstractNum [^>]*w:abstractNumId="0"[^>]*>[\s\S]*?<\/w:abstractNum>/.exec(numXml);
        expect(chunk).not.toBeNull();
        expect(chunk[0]).toContain('w:lvlText w:val="•"');
        expect(chunk[0]).not.toContain('w:rFonts');
        expect(numXml).not.toContain('Symbol');

        // Non-vacuity: abstractNum 1 (decimal) is unchanged by the fix.
        const abstract1 = read.numbering.abstractNums.find(a => a.abstractNumId === 1);
        expect(abstract1.levels).toHaveLength(9);
        expect(abstract1.levels[0].numFmt).toBe('decimal');
        expect(abstract1.levels[0].lvlText).toBe('%1.');
        expect(abstract1.levels[0].start).toBe(1);
        expect(abstract1.levels[0].pPr.indent).toEqual({ left: 720, hanging: 360 });
        expect(abstract1.levels[0].rPr).toBeUndefined();
    });

    test('nesting deeper than ilvl 8 is clamped once per over-deep list', () => {
        // Build a 10-deep bullet nest: depths 0..8 are legal, 9 clamps.
        let innermost = n('list', { ordered: false }, [
            n('listItem', {}, [n('paragraph', {}, [run('deep')])])
        ]);
        for (let d = 8; d >= 0; d--) {
            innermost = n('list', { ordered: false }, [
                n('listItem', {}, [
                    n('paragraph', {}, [run('level ' + d)]),
                    innermost
                ])
            ]);
        }

        const { bytes, losses } = irToDocx(doc([innermost]));
        const body = docxApi.read(bytes).document.body;

        expect(losses).toEqual([{ code: 'list/depth-clamped', detail: 'ilvl>8' }]);
        expect(body[body.length - 1].pPr.numPr.ilvl).toBe(8);
        expect(body[body.length - 2].pPr.numPr.ilvl).toBe(8);
    });

    test('a non-paragraph block inside a listItem is emitted after it, with a loss', () => {
        const ir = doc([
            n('list', { ordered: true }, [
                n('listItem', {}, [
                    n('paragraph', {}, [run('item text')]),
                    n('table', {}, [
                        n('row', { header: false }, [
                            n('cell', {}, [n('paragraph', {}, [run('in-item cell')])])
                        ])
                    ])
                ])
            ])
        ]);

        const { bytes, losses } = irToDocx(ir);
        const body = docxApi.read(bytes).document.body;

        expect(losses).toEqual([
            { code: 'block/degraded', detail: 'listItem-child:table' }
        ]);
        // A lone ordered list is the document's first list: `numId` 1.
        expect(body[0].pPr.numPr).toEqual({ numId: 1, ilvl: 0 });
        expect(body[1].type).toBe('table');
    });

    /** One bullet or ordered IR list of one-paragraph items. */
    const listOf = (ordered, texts, nested) => n('list', { ordered }, texts.map((t, i) =>
        n('listItem', {}, [n('paragraph', {}, [run(t)])]
            .concat(nested && i === texts.length - 1 ? [nested] : []))));

    test('two adjacent bullet lists get numId 1 and 2 and re-read as TWO lists', () => {
        const ir = doc([
            listOf(false, ['A1', 'A2']),
            listOf(false, ['B1', 'B2'])
        ]);
        const { bytes, losses } = irToDocx(ir);
        const read = docxApi.read(bytes);
        const body = read.document.body;

        expect(losses).toEqual([]);
        expect(body.map(p => p.pPr.numPr.numId)).toEqual([1, 1, 2, 2]);
        expect(read.numbering.nums).toEqual([
            { numId: 1, abstractNumId: 0 },
            { numId: 2, abstractNumId: 0 }
        ]);

        // Re-read through the docx reader: two distinct lists, not one.
        const back = docxToIr(read);
        const lists = back.ir.children.filter(b => b.kind === 'list');
        expect(lists).toHaveLength(2);
        expect(lists.map(l => l.ordered)).toEqual([false, false]);
        expect(lists.map(l => l.children.length)).toEqual([2, 2]);
        expect(back.losses).toEqual([]);
    });

    test('two adjacent ordered lists also stay two lists (both on the decimal abstract)', () => {
        const { bytes } = irToDocx(doc([
            listOf(true, ['one']),
            listOf(true, ['uno'])
        ]));
        const read = docxApi.read(bytes);
        expect(read.numbering.nums).toEqual([
            { numId: 1, abstractNumId: 1 },
            { numId: 2, abstractNumId: 1 }
        ]);
        const lists = docxToIr(read).ir.children.filter(b => b.kind === 'list');
        expect(lists).toHaveLength(2);
    });

    test('a lone ordered list resolves to numId 1 (allocation starts at 1, not by kind)', () => {
        const { bytes } = irToDocx(doc([listOf(true, ['x', 'y'])]));
        const read = docxApi.read(bytes);
        expect(read.document.body.map(p => p.pPr.numPr))
            .toEqual([{ numId: 1, ilvl: 0 }, { numId: 1, ilvl: 0 }]);
        expect(read.numbering.nums).toEqual([{ numId: 1, abstractNumId: 1 }]);
    });

    test('a nested same-kind list shares the parent numId; the next top-level list gets a new one', () => {
        const ir = doc([
            listOf(false, ['top', 'parent'], listOf(false, ['nested'])),
            listOf(true, ['ordered'])
        ]);
        const { bytes } = irToDocx(ir);
        const read = docxApi.read(bytes);
        const body = read.document.body;

        expect(body.map(p => p.pPr.numPr)).toEqual([
            { numId: 1, ilvl: 0 },
            { numId: 1, ilvl: 0 },
            { numId: 1, ilvl: 1 },
            { numId: 2, ilvl: 0 }
        ]);
        expect(read.numbering.nums.map(x => x.numId)).toEqual([1, 2]);
    });

    test('a nested list of the OTHER kind takes the top-level list second instance, reused by later nested lists', () => {
        const ir = doc([
            n('list', { ordered: false }, [
                n('listItem', {}, [
                    n('paragraph', {}, [run('p1')]),
                    listOf(true, ['o1'])
                ]),
                n('listItem', {}, [
                    n('paragraph', {}, [run('p2')]),
                    listOf(true, ['o2'])
                ])
            ]),
            listOf(false, ['next'])
        ]);
        const { bytes } = irToDocx(ir);
        const read = docxApi.read(bytes);

        // top-level bullet = 1; its ordered children share ONE instance (2);
        // the next top-level bullet list is a fresh instance (3).
        expect(read.document.body.map(p => p.pPr.numPr.numId)).toEqual([1, 2, 1, 2, 3]);
        expect(read.numbering.nums).toEqual([
            { numId: 1, abstractNumId: 0 },
            { numId: 2, abstractNumId: 1 },
            { numId: 3, abstractNumId: 0 }
        ]);
    });

    test('numbering.nums.length equals the number of distinct (top-level list, kind) pairs', () => {
        const ir = doc([
            listOf(false, ['a']),                                  // (L1, bullet)
            listOf(true, ['b'], listOf(true, ['b nested'])),       // (L2, ordered)
            listOf(false, ['c'], listOf(true, ['c nested'])),      // (L3, bullet) + (L3, ordered)
            listOf(false, ['d'])                                   // (L4, bullet)
        ]);
        const { bytes } = irToDocx(ir);
        expect(docxApi.read(bytes).numbering.nums).toHaveLength(5);
    });

    test('lists in table cells allocate their own instances and the allocation is per document', () => {
        const cellList = () => n('table', {}, [
            n('row', { header: false }, [n('cell', {}, [listOf(false, ['in cell'])])])
        ]);
        const ir = doc([listOf(false, ['top']), cellList()]);
        const first = docxApi.read(irToDocx(ir).bytes);
        expect(first.numbering.nums.map(x => x.numId)).toEqual([1, 2]);

        // A second write starts again at 1 — no state leaks between documents.
        const second = docxApi.read(irToDocx(doc([listOf(true, ['solo'])])).bytes);
        expect(second.numbering.nums).toEqual([{ numId: 1, abstractNumId: 1 }]);
    });
});

/* ── tables ──────────────────────────────────────────────────────────── */

describe('oconvIrToDocx — tables', () => {
    test('a 3×2 table with formatted cells round-trips through the model', () => {
        const cell = (text, props) =>
            n('cell', {}, [n('paragraph', {}, [run(text, props)])]);
        const ir = doc([
            n('table', {}, [
                n('row', { header: true }, [cell('H1', { bold: true }), cell('H2', { bold: true })]),
                n('row', { header: false }, [cell('A1'), cell('B1', { italic: true })]),
                n('row', { header: false }, [cell('A2'), cell('B2')])
            ])
        ]);

        const { bytes, losses } = irToDocx(ir);
        const table = docxApi.read(bytes).document.body[0];

        // `row.header` has no docx model concept — the header row is
        // preserved POSITIONALLY (row 0) and is deliberately not a loss.
        expect(losses).toEqual([]);
        expect(table.type).toBe('table');
        expect(table.rows).toHaveLength(3);
        const textAt = (r, c) =>
            table.rows[r].cells[c].children[0].children[0].children[0].value;
        expect([textAt(0, 0), textAt(0, 1)]).toEqual(['H1', 'H2']);
        expect([textAt(1, 0), textAt(1, 1)]).toEqual(['A1', 'B1']);
        expect([textAt(2, 0), textAt(2, 1)]).toEqual(['A2', 'B2']);
        expect(table.rows[0].cells[0].children[0].children[0].rPr)
            .toEqual({ bold: true });
        expect(table.rows[1].cells[1].children[0].children[0].rPr)
            .toEqual({ italic: true });
    });
});

/* ── styles part + bordered tables (BL-1766, office/BATCH_47/04) ────── */

/** One grid edge — the prescribed `single` 1/2 pt auto-colour border. */
const GRID_EDGE = { val: 'single', sz: 4, space: 0, color: 'auto' };
/** The prescribed `GRID_BORDERS`: six edges, each {@link GRID_EDGE}. */
const GRID_BORDERS = {
    top: GRID_EDGE, left: GRID_EDGE, bottom: GRID_EDGE,
    right: GRID_EDGE, insideH: GRID_EDGE, insideV: GRID_EDGE
};
/** The prescribed `GRID_CELL_MARGINS`: Word's `Table Grid` 108 dxa (0.19 cm) left / right padding. */
const GRID_CELL_MARGINS = { left: { w: 108, type: 'dxa' }, right: { w: 108, type: 'dxa' } };
/** The prescribed heading sizes (half-points), Heading1..Heading6. */
const HEADING_SIZES = [32, 28, 26, 24, 22, 22];

/** Every `w:pStyle w:val` referenced in `word/document.xml`, in order. */
const referencedPStyles = bytes =>
    [...documentXmlOf(bytes).matchAll(/<w:pStyle w:val="([^"]*)"/g)].map(m => m[1]);

/** A small 2x2 IR table (header row + one body row). */
const table2x2 = () => n('table', {}, [
    n('row', { header: true }, [
        n('cell', {}, [n('paragraph', {}, [run('H1')])]),
        n('cell', {}, [n('paragraph', {}, [run('H2')])])
    ]),
    n('row', { header: false }, [
        n('cell', {}, [n('paragraph', {}, [run('a')])]),
        n('cell', {}, [n('paragraph', {}, [run('b')])])
    ])
]);

describe('oconvIrToDocx — styles part (BL-1766)', () => {
    test('word/styles.xml is emitted on EVERY write — part, content type, one styles rel', () => {
        // No heading, no table, no list: the part is still there.
        for (const ir of [doc([n('paragraph', {}, [run('only prose')])]), doc([])]) {
            const { bytes } = irToDocx(ir);
            const pkg = opcOf(bytes);

            expect(pkg.parts['/word/styles.xml']).toBeInstanceOf(Uint8Array);
            expect(pkg.contentTypes.overrides['/word/styles.xml']).toBe(stylesMod.CT_STYLES);
            const stylesRels = pkg.rels['/word/document.xml']
                .filter(r => r.Type === stylesMod.REL_TYPE_STYLES);
            expect(stylesRels).toHaveLength(1);
            expect(stylesRels[0].Target).toBe('styles.xml');
        }
    });

    test('every referenced pStyle is defined; Heading1..6 / Normal as prescribed', () => {
        const ir = doc([
            ...[1, 2, 3, 4, 5, 6].map(level => n('heading', { level }, [run('H' + level)])),
            n('paragraph', {}, [run('body')]),
            n('list', { ordered: false }, [
                n('listItem', {}, [n('paragraph', {}, [run('item')])])
            ])
        ]);
        const { bytes } = irToDocx(ir);
        const styles = docxApi.read(bytes).styles.styles;
        const ids = new Set(styles.map(s => s.styleId));

        const refs = referencedPStyles(bytes);
        expect(refs).toEqual(['Heading1', 'Heading2', 'Heading3',
            'Heading4', 'Heading5', 'Heading6']);             // non-vacuity
        for (const ref of refs) expect(ids.has(ref)).toBe(true);

        const byId = id => styles.find(s => s.styleId === id);
        for (let level = 1; level <= 6; level++) {
            const h = byId('Heading' + level);
            expect(h.type).toBe('paragraph');
            expect(h.basedOn).toBe('Normal');
            expect(h.next).toBe('Normal');
            expect(h.rPr.bold).toBe(true);
            expect(h.rPr.size).toBe(HEADING_SIZES[level - 1]);
        }
        expect(byId('Normal').isDefault).toBe(true);
        expect(byId('Normal').type).toBe('paragraph');
    });

    test('the styles part is EXACTLY the prescribed fixed set (no unreferenced extras)', () => {
        const { bytes } = irToDocx(doc([n('paragraph', {}, [run('x')])]));
        const styles = docxApi.read(bytes).styles;

        expect(styles.docDefaults).toEqual({ rPr: { font: 'Calibri', size: 22 } });
        expect(styles.styles).toEqual([
            { type: 'paragraph', styleId: 'Normal', name: 'Normal', isDefault: true },
            ...[1, 2, 3, 4, 5, 6].map(level => ({
                type: 'paragraph', styleId: 'Heading' + level, name: 'heading ' + level,
                basedOn: 'Normal', next: 'Normal',
                pPr: { spacing: { before: 240, after: 80 } },
                rPr: { bold: true, size: HEADING_SIZES[level - 1] }
            })),
            { type: 'table', styleId: 'TableGrid', name: 'Table Grid',
                tblPr: { borders: GRID_BORDERS, cellMargins: GRID_CELL_MARGINS } }
        ]);
    });

    test('a table carries the TableGrid style reference AND direct single borders', () => {
        const { bytes, losses } = irToDocx(doc([table2x2()]));
        const read = docxApi.read(bytes);

        expect(losses).toEqual([]);
        expect(read.document.body[0].type).toBe('table');
        expect(read.document.body[0].tblPr).toEqual(
            { style: 'TableGrid', borders: GRID_BORDERS, cellMargins: GRID_CELL_MARGINS });

        const grid = read.styles.styles.find(s => s.styleId === 'TableGrid');
        expect(grid.type).toBe('table');
        expect(grid.tblPr.borders).toEqual(GRID_BORDERS);

        const xmlText = documentXmlOf(bytes);
        const m = /<w:tblBorders>([\s\S]*?)<\/w:tblBorders>/.exec(xmlText);
        expect(m).not.toBeNull();
        expect(m[1].match(/w:val="single"/g)).toHaveLength(6);
    });

    test('table cells are padded: tblCellMar left/right 108 dxa on the table AND the TableGrid style', () => {
        const { bytes } = irToDocx(doc([table2x2()]));
        const read = docxApi.read(bytes);
        const PADDING = '<w:tblCellMar><w:left w:w="108" w:type="dxa"/>'
            + '<w:right w:w="108" w:type="dxa"/></w:tblCellMar>';

        // Direct on the table, after tblBorders (schema order).
        const docXml = documentXmlOf(bytes);
        expect(docXml).toContain('</w:tblBorders>' + PADDING + '</w:tblPr>');
        // And in the style, so a consumer resolving the style gets it too.
        const stylesXml = opcApi.bytesToString(opcOf(bytes).parts['/word/styles.xml']);
        expect(stylesXml).toContain(PADDING);
        const grid = read.styles.styles.find(s => s.styleId === 'TableGrid');
        expect(grid.tblPr.cellMargins).toEqual(GRID_CELL_MARGINS);
    });

    test('determinism: styles.xml and document.xml are byte-identical across two writes', () => {
        const ir = doc([
            n('heading', { level: 1 }, [run('Title')]),
            n('paragraph', {}, [run('b', { bold: true })]),
            table2x2()
        ]);
        const a = opcOf(irToDocx(ir).bytes);
        const b = opcOf(irToDocx(ir).bytes);

        expect(a.parts['/word/styles.xml']).toBeInstanceOf(Uint8Array);
        expect(Bun.deepEquals(a.parts['/word/styles.xml'], b.parts['/word/styles.xml'])).toBe(true);
        expect(Bun.deepEquals(a.parts['/word/document.xml'], b.parts['/word/document.xml'])).toBe(true);
    });

    test('ledger unchanged: headings + prose stay loss-free, hr stays block/dropped', () => {
        const clean = doc([
            n('heading', { level: 1 }, [run('T')]),
            n('paragraph', {}, [run('p')])
        ]);
        expect(irToDocx(clean).losses).toEqual([]);
        expect(irToDocx(doc([n('hr')])).losses)
            .toEqual([{ code: 'block/dropped', detail: 'hr' }]);
    });

    test('return leg: docx -> IR keeps heading levels and inline emphasis with the styles part present', () => {
        const ir = doc([
            n('heading', { level: 1 }, [run('One')]),
            n('heading', { level: 2 }, [run('Two')]),
            n('heading', { level: 3 }, [run('Three')]),
            n('paragraph', {}, [
                run('bold', { bold: true }),
                run(' and '),
                run('italic', { italic: true })
            ]),
            table2x2()
        ]);
        const { bytes } = irToDocx(ir);
        const read = docxApi.read(bytes);
        expect(read.styles).toBeDefined();                    // the part is really there
        const back = docxToIr(read).ir;

        const headings = back.children.filter(b => b.kind === 'heading');
        expect(headings.map(h => [h.level, h.children[0].text]))
            .toEqual([[1, 'One'], [2, 'Two'], [3, 'Three']]);
        const para = back.children.find(b => b.kind === 'paragraph');
        const bold = para.children.find(r => r.text === 'bold');
        const italic = para.children.find(r => r.text === 'italic');
        expect(bold.bold).toBe(true);
        expect(bold.italic).toBe(false);
        expect(italic.italic).toBe(true);
        expect(italic.bold).toBe(false);
        expect(back.children.filter(b => b.kind === 'table')).toHaveLength(1);
    });
});

/* ── degrades ────────────────────────────────────────────────────────── */

describe('oconvIrToDocx — degrades', () => {
    test('codeBlock becomes one paragraph per line, with one loss', () => {
        const ir = doc([n('codeBlock', { info: 'js', text: 'a();\nb();\nc();' })]);
        const { bytes, losses } = irToDocx(ir);
        const body = docxApi.read(bytes).document.body;

        expect(losses).toEqual([{ code: 'block/degraded', detail: 'codeBlock' }]);
        expect(body.map(p => p.children[0].children[0].value))
            .toEqual(['a();', 'b();', 'c();']);
    });

    test('blockquote emits its children in place, with one loss', () => {
        const ir = doc([
            n('blockquote', {}, [
                n('paragraph', {}, [run('quoted')]),
                n('heading', { level: 3 }, [run('quoted heading')])
            ])
        ]);
        const { bytes, losses } = irToDocx(ir);
        const body = docxApi.read(bytes).document.body;

        expect(losses).toEqual([{ code: 'block/degraded', detail: 'blockquote' }]);
        expect(body).toHaveLength(2);
        expect(body[0].children[0].children[0].value).toBe('quoted');
        expect(body[1].pPr.pStyle).toBe('Heading3');
    });

    test('hr is dropped with a loss', () => {
        const ir = doc([n('paragraph', {}, [run('before')]), n('hr'),
            n('paragraph', {}, [run('after')])]);
        const { bytes, losses } = irToDocx(ir);
        const body = docxApi.read(bytes).document.body;

        expect(losses).toEqual([{ code: 'block/dropped', detail: 'hr' }]);
        expect(body).toHaveLength(2);
        expect(body.map(p => p.children[0].children[0].value))
            .toEqual(['before', 'after']);
    });

    test('a block image is dropped, named by its manifest name', () => {
        const ir = doc([n('image', { name: 'figure.png', alt: 'A figure' })]);
        const { bytes, losses } = irToDocx(ir);

        expect(losses).toEqual([{ code: 'image/dropped', detail: 'figure.png' }]);
        expect(docxApi.read(bytes).document.body).toHaveLength(0);
    });

    test('an inline image is dropped but the surrounding text flow survives', () => {
        const ir = doc([n('paragraph', {}, [
            run('before '),
            n('image', { name: 'inline.png', alt: 'inline' }),
            run(' after')
        ])]);
        const { bytes, losses } = irToDocx(ir);
        const runs = docxApi.read(bytes).document.body[0].children;

        expect(losses).toEqual([{ code: 'image/dropped', detail: 'inline.png' }]);
        expect(runs.map(r => r.children[0].value)).toEqual(['before ', ' after']);
    });

    test('a loss-free fixture reports no losses at all (non-vacuity)', () => {
        const ir = doc([
            n('heading', { level: 1 }, [run('Title')]),
            n('paragraph', {}, [run('body '), run('bold', { bold: true })]),
            n('list', { ordered: true }, [
                n('listItem', {}, [n('paragraph', {}, [run('one')])])
            ]),
            n('table', {}, [
                n('row', { header: true }, [
                    n('cell', {}, [n('paragraph', {}, [run('cell')])])
                ])
            ]),
            n('paragraph', {}, [run('link', { link: 'https://example.test/' })])
        ]);
        const { losses } = irToDocx(ir);
        expect(losses).toEqual([]);
    });

    test('losses are returned in document order', () => {
        const ir = doc([
            n('hr'),
            n('paragraph', {}, [n('image', { name: 'inline-z.png', alt: '' })]),
            n('image', { name: 'z.png', alt: '' }),
            n('codeBlock', { info: '', text: 'q' })
        ]);
        expect(irToDocx(ir).losses.map(l => l.code)).toEqual([
            'block/dropped', 'image/dropped', 'image/dropped', 'block/degraded'
        ]);
    });
});

/* ── determinism ──────────────────────────────────────────────────────── */

describe('oconvIrToDocx — determinism', () => {
    // The `docx` target is byte-reproducible: `@awacloud/ooxml` stamps every
    // zip entry with a fixed 1980-01-01 00:00 timestamp. The `odt` target is
    // not: the ODF package writer stamps the current time, so two identical
    // calls give equal document models but may give different bytes. The
    // `pdf` target is byte-reproducible.
    const sampleIr = () => doc([
        n('heading', { level: 2 }, [run('Repeatable')]),
        n('paragraph', {}, [run('link', { link: 'https://example.test/d' })]),
        n('list', { ordered: true }, [
            n('listItem', {}, [n('paragraph', {}, [run('a')])]),
            n('listItem', {}, [n('paragraph', {}, [run('b')])])
        ]),
        n('hr')
    ]);

    test('two calls produce byte-identical containers (fixed zip entry timestamp)', async () => {
        const ir = sampleIr();
        const first = irToDocx(ir);
        // Cross a DOS-time granule (2 s): a wall-clock stamp could not match.
        await new Promise(resolve => setTimeout(resolve, 2100));
        const second = irToDocx(ir);

        expect(second.bytes.length).toBe(first.bytes.length);
        expect(second.bytes.every((v, i) => v === first.bytes[i])).toBe(true);
    });

    test('two calls produce deep-equal models and identical losses', () => {
        // The oracle is the re-read MODEL and the raw PARTS.
        const ir = doc([
            n('heading', { level: 2 }, [run('Repeatable')]),
            n('paragraph', {}, [run('link', { link: 'https://example.test/d' })]),
            n('list', { ordered: true }, [
                n('listItem', {}, [n('paragraph', {}, [run('a')])]),
                n('listItem', {}, [n('paragraph', {}, [run('b')])])
            ]),
            n('hr')
        ]);

        const first = irToDocx(ir);
        const second = irToDocx(ir);

        const readFirst = docxApi.read(first.bytes);
        const readSecond = docxApi.read(second.bytes);

        expect(readSecond.document).toEqual(readFirst.document);
        expect(readSecond.hyperlinks).toEqual(readFirst.hyperlinks);
        expect(readSecond.numbering).toEqual(readFirst.numbering);
        expect(second.losses).toEqual(first.losses);
        expect(documentXmlOf(second.bytes)).toBe(documentXmlOf(first.bytes));
    });

    test('the input IR is not mutated', () => {
        const ir = doc([
            n('heading', { level: 1 }, [run('T')]),
            n('list', { ordered: false }, [
                n('listItem', {}, [n('paragraph', {}, [run('i')])])
            ])
        ]);
        const before = JSON.stringify(ir);
        irToDocx(ir);
        expect(JSON.stringify(ir)).toBe(before);
    });
});

/* ── validation ──────────────────────────────────────────────────────── */

describe('oconvIrToDocx — validation', () => {
    test('an unknown node kind throws the prescribed message', () => {
        expect(() => irToDocx({ kind: 'nope' }))
            .toThrow('oconv: invalid ir (unknown-kind at $)');
    });

    test('the first structural error names its own path', () => {
        const ir = doc([n('paragraph', {}, [run('ok')])]);
        ir.children[0].children[0].bold = 'yes';
        expect(() => irToDocx(ir))
            .toThrow('oconv: invalid ir (bad-prop at $.children[0].children[0])');
    });

    test('a valid empty document writes a readable, body-less package', () => {
        const { bytes, losses } = irToDocx(doc([]));
        expect(losses).toEqual([]);
        expect(docxApi.read(bytes).document.body).toEqual([]);
    });
});

/* ── images: the asset manifest (BL-980) ─────────────────────────────── */

describe('oconvIrToDocx — opts.assets', () => {
    /** The committed first-party 1x1 greyscale PNG (corpus/assets). */
    let PNG;

    beforeAll(async () => {
        PNG = new Uint8Array(await Bun.file(
            fileURLToPath(new URL('../../tests/_fixtures/corpus/assets/px.png', import.meta.url))
        ).arrayBuffer());
    });

    test('a block image WITH bytes is placed: one image part, image/size-defaulted, no drop', () => {
        const ir = doc([n('image', { name: 'figure.png', alt: 'A figure' })]);
        const { bytes, losses } = irToDocx(ir, { assets: { 'figure.png': PNG } });

        expect(losses).toEqual([{ code: 'image/size-defaulted', detail: 'figure.png' }]);
        const read = docxApi.read(bytes);
        const ids = Object.keys(read.images);
        expect(ids).toHaveLength(1);
        expect([...read.images[ids[0]].data]).toEqual([...PNG]);
        expect(read.document.body).toHaveLength(1);
    });

    test('an inline image WITH bytes is placed between its runs, flow preserved', () => {
        const ir = doc([n('paragraph', {}, [
            run('before '),
            n('image', { name: 'inline.png', alt: 'inline' }),
            run(' after')
        ])]);
        const { bytes, losses } = irToDocx(ir, { assets: { 'inline.png': PNG } });

        expect(losses).toEqual([{ code: 'image/size-defaulted', detail: 'inline.png' }]);
        const read = docxApi.read(bytes);
        expect(Object.keys(read.images)).toHaveLength(1);
        const kids = read.document.body[0].children;
        // Three runs now: text, drawing, text — the image no longer vanishes.
        expect(kids).toHaveLength(3);
        expect(kids[0].children[0].value).toBe('before ');
        expect(kids[2].children[0].value).toBe(' after');
    });

    test('reader-carried bytes (escapes.docx.bytes) resolve on their own', () => {
        const image = n('image', { name: 'carried.png', alt: '' });
        image.escapes = { docx: { bytes: PNG, contentType: 'image/png' } };
        const { bytes, losses } = irToDocx(doc([image]));

        expect(losses).toEqual([{ code: 'image/size-defaulted', detail: 'carried.png' }]);
        expect(Object.keys(docxApi.read(bytes).images)).toHaveLength(1);
    });

    test('caller `assets` WINS over reader-carried bytes when both are present', () => {
        const other = Uint8Array.from(PNG);
        other[other.length - 1] = (other[other.length - 1] + 1) & 0xFF;   // distinguishable
        const image = n('image', { name: 'both.png', alt: '' });
        image.escapes = { docx: { bytes: PNG, contentType: 'image/png' } };

        const { bytes } = irToDocx(doc([image]), { assets: { 'both.png': other } });
        const read = docxApi.read(bytes);
        const id = Object.keys(read.images)[0];
        expect([...read.images[id].data]).toEqual([...other]);
        expect([...read.images[id].data]).not.toEqual([...PNG]);
    });

    test('no bytes anywhere → the unchanged image/dropped loss', () => {
        const { losses } = irToDocx(doc([n('image', { name: 'x.png', alt: '' })]),
            { assets: { 'somethingelse.png': PNG } });
        expect(losses).toEqual([{ code: 'image/dropped', detail: 'x.png' }]);
    });

    test('omitting `opts` entirely reproduces the pre-BL-980 ledger exactly', () => {
        const ir = doc([n('image', { name: 'x.png', alt: '' })]);
        expect(irToDocx(ir).losses).toEqual([{ code: 'image/dropped', detail: 'x.png' }]);
        expect(irToDocx(ir, {}).losses).toEqual([{ code: 'image/dropped', detail: 'x.png' }]);
        expect(irToDocx(ir, { assets: undefined }).losses)
            .toEqual([{ code: 'image/dropped', detail: 'x.png' }]);
    });

    // MEASURED, not assumed. This writer never sniffs the bytes — it hands
    // them to `@awacloud/ooxml`. What `docx.write` does with NON-image bytes
    // is pinned here as observed, whichever way it goes.
    test('8 random bytes as an "image": @awacloud/ooxml\'s MEASURED behaviour', () => {
        const junk = Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8]);
        const ir = doc([n('image', { name: 'junk.png', alt: '' })]);

        let thrown = null;
        let result = null;
        try {
            result = irToDocx(ir, { assets: { 'junk.png': junk } });
        } catch (e) { thrown = e; }

        // MEASURED on this tree: `@awacloud/ooxml` does NOT throw, and it
        // does NOT mislabel the payload either — it SNIFFS the magic bytes
        // and, finding none it knows, writes `/word/media/image1.bin` with
        // `application/octet-stream`, ignoring the `.png` in the node name.
        // The bytes come back byte-identical, so a downstream reader gets
        // exactly what the caller supplied and can judge for itself. That
        // is honest behaviour, so this writer's refusal to sniff is safe:
        // pinned here rather than assumed, and routed nowhere.
        expect(thrown).toBeNull();
        expect(result.losses).toEqual([{ code: 'image/size-defaulted', detail: 'junk.png' }]);
        const read = docxApi.read(result.bytes);
        const id = Object.keys(read.images)[0];
        expect([...read.images[id].data]).toEqual([...junk]);
        expect(read.images[id].partName).toBe('/word/media/image1.bin');
        expect(read.images[id].contentType).toBe('application/octet-stream');
    });
});
