// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { fw_require as odfFwRequire, modules as odfModules } from '@awacloud/odf';
import { fw_require as ooxmlFwRequire, modules as ooxmlModules } from '@awacloud/ooxml';
import { oconvIr as oconvIrDescriptor } from '../ir/ir.js';
import { oconvOdtToIr } from './odt-to-ir.js';
import { oconvDocxToIr } from './docx-to-ir.js';

// Compose `@awacloud/odf`'s public runtime (its own `fw_require` + `modules`
// arrays, the same cross-package pattern `@awacloud/facturx/src/main.js` uses
// for `@awacloud/pdf`) to get a real `odt` instance for building/reading .odt
// fixtures through the public writer/reader. `oconvOdtToIr` itself only
// needs `odt` as a declared (unused) dependency — see the file's own
// "unused-dep guard" note — so it is built directly, no runtime required.
const runtime = new ModuleRuntime();
runtime.registerAll([...odfFwRequire, ...odfModules]);
const odt = runtime.resolve('odt');
const xml = runtime.resolve('xml');

const oconvIr = oconvIrDescriptor.factory();
const { odtToIr } = oconvOdtToIr.factory(oconvIr, odt);

// Second, independent runtime composing `@awacloud/ooxml`'s public surface plus
// task 02's delivered `oconvDocxToIr` — needed ONLY for the reader-swap
// proof below (F2: readers must be drop-in swappable in front of the same
// writer). Task 02 (`docx-to-ir.js`) is now delivered in this worktree, so
// this file can import it directly (read-only: never edited from here).
const docxRuntime = new ModuleRuntime();
docxRuntime.registerAll(ooxmlFwRequire);
docxRuntime.registerAll(ooxmlModules);
docxRuntime.register(oconvIrDescriptor);
docxRuntime.register(oconvDocxToIr);
const docxApi = docxRuntime.resolve('docx');
const docxNumberingMod = docxRuntime.resolve('docxNumbering');
const { docxToIr } = docxRuntime.resolve('oconvDocxToIr');

/**
 * Structural signature (kinds/levels/text only) of a produced IR — the
 * shared assertion helper for the "reader-swap" proof (F2: docx-to-ir and
 * odt-to-ir must be drop-in swappable in front of the same writer,
 * `ai/plans/oconv/spikes/w0-core/FINDINGS.md` F2). Applied to BOTH
 * readers' IR output below for an equivalent document structure — this is
 * the literal proof the plan asks for, not a same-reader placeholder.
 */
function structuralSignature(ir) {
    const sig = [];
    oconvIr.walk(ir, (n) => {
        if (n.kind === 'document') return;
        const entry = { kind: n.kind };
        if (n.kind === 'heading') entry.level = n.level;
        if (n.kind === 'run') entry.text = n.text;
        sig.push(entry);
    });
    return sig;
}

describe('oconvOdtToIr — descriptor', () => {
    test('has the frozen name/dependencies/factory shape', () => {
        expect(oconvOdtToIr.name).toBe('oconvOdtToIr');
        expect(oconvOdtToIr.dependencies).toEqual(['oconvIr', 'odt']);
        expect(typeof oconvOdtToIr.factory).toBe('function');
    });
});

describe('oconvOdtToIr — odtToIr()', () => {
    test('maps headings, plain runs, unresolved formatting, an auto-resolved '
        + 'bold span, a resolved link, a mapped table and a bullet-fallback '
        + 'list', () => {
        const linkEl = xml.el('text:a', { 'xlink:href': 'https://example.test/' },
            [xml.text('Example')]);
        const tableEl = xml.el('table:table', { 'table:name': 'T1' }, [
            xml.el('table:table-row', {}, [
                xml.el('table:table-cell', {}, [
                    xml.el('text:p', {}, [xml.text('cell')])
                ])
            ])
        ]);

        const doc = {
            body: [
                { type: 'heading', outlineLevel: 1, runs: [{ type: 'text', value: 'Title' }] },
                { type: 'heading', outlineLevel: 2, runs: [{ type: 'text', value: 'Subtitle' }] },
                {
                    type: 'heading', outlineLevel: 3,
                    runs: [{ type: 'text', value: 'Sub-subtitle' }]
                },
                {
                    type: 'paragraph',
                    runs: [
                        { type: 'text', value: 'plain ' },
                        { type: 'span', value: 'bold-ish', styleName: 'Strong' }
                    ]
                },
                {
                    // No `styleName` + a flag set → the registry generates and
                    // resolves a real content-automatic style end to end
                    // (RULING B "auto" — consume-and-drop, real write→read).
                    type: 'paragraph',
                    runs: [{ type: 'span', value: 'resolved bold', bold: true }]
                },
                {
                    type: 'paragraph',
                    runs: [{ type: 'text', value: 'See ' }],
                    _extras: { children: [linkEl] }
                },
                tableEl,
                {
                    type: 'list',
                    styleName: 'L1',
                    items: [
                        {
                            children: [{
                                type: 'paragraph',
                                runs: [{ type: 'text', value: 'item one' }]
                            }]
                        },
                        {
                            children: [{
                                type: 'paragraph',
                                runs: [{ type: 'text', value: 'item two' }]
                            }]
                        }
                    ]
                }
            ]
        };

        const back = odt.read(odt.write(doc));
        const { ir, losses } = odtToIr(back);

        expect(oconvIr.validate(ir).ok).toBe(true);
        expect(ir.children).toEqual([
            oconvIr.node('heading', { level: 1 }, [oconvIr.node('run', { text: 'Title' })]),
            oconvIr.node('heading', { level: 2 }, [oconvIr.node('run', { text: 'Subtitle' })]),
            oconvIr.node('heading', { level: 3 }, [oconvIr.node('run', { text: 'Sub-subtitle' })]),
            oconvIr.node('paragraph', {}, [
                oconvIr.node('run', { text: 'plain ' }),
                oconvIr.node('run', { text: 'bold-ish' })
            ]),
            oconvIr.node('paragraph', {}, [
                oconvIr.node('run', { text: 'resolved bold', bold: true })
            ]),
            oconvIr.node('paragraph', {}, [
                oconvIr.node('run', { text: 'See ' }),
                oconvIr.node('run', { text: 'Example', link: 'https://example.test/' })
            ]),
            oconvIr.node('table', {}, [
                oconvIr.node('row', { header: false }, [
                    oconvIr.node('cell', {}, [
                        oconvIr.node('paragraph', {}, [oconvIr.node('run', { text: 'cell' })])
                    ])
                ])
            ]),
            oconvIr.node('list', { ordered: false }, [
                oconvIr.node('listItem', {}, [
                    oconvIr.node('paragraph', {}, [oconvIr.node('run', { text: 'item one' })])
                ]),
                oconvIr.node('listItem', {}, [
                    oconvIr.node('paragraph', {}, [oconvIr.node('run', { text: 'item two' })])
                ])
            ])
        ]);
        expect(losses).toEqual([
            { code: 'run/format-unresolved', detail: 'Strong' },
            { code: 'list/numbering-unresolved', detail: 'L1' }
        ]);
    });

    test('an auto-resolved ordered list round-trips to `ordered: true` with '
        + 'no loss (RULING B "auto", real write→read composition)', () => {
        const doc = {
            body: [{
                type: 'list',
                ordered: true,
                items: [
                    { children: [{ type: 'paragraph', runs: [{ type: 'text', value: 'first' }] }] },
                    { children: [{ type: 'paragraph', runs: [{ type: 'text', value: 'second' }] }] }
                ]
            }]
        };
        const back = odt.read(odt.write(doc));
        const { ir, losses } = odtToIr(back);

        expect(oconvIr.validate(ir).ok).toBe(true);
        expect(losses).toEqual([]);
        expect(ir.children).toEqual([
            oconvIr.node('list', { ordered: true }, [
                oconvIr.node('listItem', {}, [
                    oconvIr.node('paragraph', {}, [oconvIr.node('run', { text: 'first' })])
                ]),
                oconvIr.node('listItem', {}, [
                    oconvIr.node('paragraph', {}, [oconvIr.node('run', { text: 'second' })])
                ])
            ])
        ]);
    });

    test('keep-and-gain (RULING B "named", hand-built resolved model): a '
        + 'span keeps its styleName AND gains bold, zero loss', () => {
        const readResult = {
            body: [{
                type: 'paragraph',
                runs: [{ type: 'span', value: 'important', styleName: 'Strong', bold: true }]
            }]
        };
        const { ir, losses } = odtToIr(readResult);

        expect(oconvIr.validate(ir).ok).toBe(true);
        expect(losses).toEqual([]);
        expect(ir.children).toEqual([
            oconvIr.node('paragraph', {}, [
                oconvIr.node('run', { text: 'important', bold: true })
            ])
        ]);
    });

    test('keep-and-gain (RULING B "named", hand-built resolved model): a '
        + 'list keeps its styleName AND gains ordered, zero loss', () => {
        const readResult = {
            body: [{
                type: 'list',
                styleName: 'WWNum1',
                ordered: true,
                items: [
                    { children: [{ type: 'paragraph', runs: [{ type: 'text', value: 'one' }] }] }
                ]
            }]
        };
        const { ir, losses } = odtToIr(readResult);

        expect(oconvIr.validate(ir).ok).toBe(true);
        expect(losses).toEqual([]);
        expect(ir.children).toEqual([
            oconvIr.node('list', { ordered: true }, [
                oconvIr.node('listItem', {}, [
                    oconvIr.node('paragraph', {}, [oconvIr.node('run', { text: 'one' })])
                ])
            ])
        ]);
    });

    test('table: header rows, a repeated row, a repeated cell and a covered '
        + 'cell (hand-built odt.read-shaped model)', () => {
        const readResult = {
            body: [{
                type: 'table',
                headerRows: 1,
                rows: [
                    {
                        type: 'row',
                        repeated: 2,
                        cells: [{
                            type: 'cell',
                            children: [{ type: 'paragraph', runs: [{ type: 'text', value: 'H' }] }]
                        }]
                    },
                    {
                        type: 'row',
                        cells: [
                            {
                                type: 'cell',
                                repeated: 2,
                                children: [{ type: 'paragraph', runs: [{ type: 'text', value: 'D' }] }]
                            },
                            { type: 'cell', covered: true, children: [] }
                        ]
                    }
                ]
            }]
        };
        const { ir, losses } = odtToIr(readResult);

        expect(oconvIr.validate(ir).ok).toBe(true);
        expect(losses).toEqual([]);
        const headerCell = oconvIr.node('cell', {}, [
            oconvIr.node('paragraph', {}, [oconvIr.node('run', { text: 'H' })])
        ]);
        const dataCell = oconvIr.node('cell', {}, [
            oconvIr.node('paragraph', {}, [oconvIr.node('run', { text: 'D' })])
        ]);
        expect(ir.children).toEqual([
            oconvIr.node('table', {}, [
                // `row.repeated: 2` on the (single) header-row entry → 2 header rows.
                oconvIr.node('row', { header: true }, [headerCell]),
                oconvIr.node('row', { header: true }, [headerCell]),
                // The covered cell contributes nothing; the repeated cell expands to 2.
                oconvIr.node('row', { header: false }, [dataCell, dataCell])
            ])
        ]);
    });

    test('falsification: an unknown node inside a table cell degrades via '
        + 'the ordinary block/dropped code (the cell mapper is not silently '
        + 'permissive)', () => {
        const readResult = {
            body: [{
                type: 'table',
                rows: [{
                    type: 'row',
                    cells: [{
                        type: 'cell',
                        children: [{ type: 'unknown', element: { name: 'draw:custom-shape' } }]
                    }]
                }]
            }]
        };
        const { ir, losses } = odtToIr(readResult);

        expect(oconvIr.validate(ir).ok).toBe(true);
        expect(ir.children).toEqual([
            oconvIr.node('table', {}, [
                oconvIr.node('row', { header: false }, [oconvIr.node('cell', {}, [])])
            ])
        ]);
        expect(losses).toEqual([{ code: 'block/dropped', detail: 'draw:custom-shape' }]);
    });

    test('clamps an out-of-range heading level and records the loss', () => {
        const doc = {
            body: [{ type: 'heading', outlineLevel: 8, runs: [{ type: 'text', value: 'Deep' }] }]
        };
        const back = odt.read(odt.write(doc));
        const { ir, losses } = odtToIr(back);

        expect(oconvIr.validate(ir).ok).toBe(true);
        expect(ir.children).toEqual([
            oconvIr.node('heading', { level: 6 }, [oconvIr.node('run', { text: 'Deep' })])
        ]);
        expect(losses).toEqual([{ code: 'heading/level-clamped', detail: '8' }]);
    });

    test('records link/target-missing and keeps the text when a text:a has no href', () => {
        const linkEl = xml.el('text:a', {}, [xml.text('nowhere')]);
        const doc = {
            body: [{ type: 'paragraph', runs: [], _extras: { children: [linkEl] } }]
        };
        const back = odt.read(odt.write(doc));
        const { ir, losses } = odtToIr(back);

        expect(oconvIr.validate(ir).ok).toBe(true);
        expect(ir.children).toEqual([
            oconvIr.node('paragraph', {}, [oconvIr.node('run', { text: 'nowhere', link: null })])
        ]);
        expect(losses).toEqual([{ code: 'link/target-missing', detail: 'text:a' }]);
    });

    test('drops an inline image reference (no drawFrame/drawImage dependency) '
        + 'and records the loss', () => {
        const frameEl = xml.el('draw:frame', { 'draw:name': 'Pic1' }, [
            xml.el('draw:image', { 'xlink:href': 'Pictures/100000000000012C.png' }, [])
        ]);
        const doc = {
            body: [{
                type: 'paragraph',
                runs: [{ type: 'text', value: 'Photo: ' }],
                _extras: { children: [frameEl] }
            }]
        };
        const back = odt.read(odt.write(doc));
        const { ir, losses } = odtToIr(back);

        expect(oconvIr.validate(ir).ok).toBe(true);
        expect(ir.children).toEqual([
            oconvIr.node('paragraph', {}, [oconvIr.node('run', { text: 'Photo: ' })])
        ]);
        expect(losses).toEqual([{ code: 'image/unresolved', detail: 'draw:frame' }]);
    });

    test('drops an unrecognised inline extra generically', () => {
        const bookmarkEl = xml.el('text:bookmark-start', { 'text:name': 'b1' }, []);
        const doc = {
            body: [{
                type: 'paragraph',
                runs: [{ type: 'text', value: 'Here' }],
                _extras: { children: [bookmarkEl] }
            }]
        };
        const back = odt.read(odt.write(doc));
        const { ir, losses } = odtToIr(back);

        expect(oconvIr.validate(ir).ok).toBe(true);
        expect(ir.children).toEqual([
            oconvIr.node('paragraph', {}, [oconvIr.node('run', { text: 'Here' })])
        ]);
        expect(losses).toEqual([{ code: 'inline/dropped', detail: 'text:bookmark-start' }]);
    });

    test('drops a recognised-by-odf node with no IR equivalent (soft-page-break)', () => {
        const doc = {
            body: [
                { type: 'paragraph', runs: [{ type: 'text', value: 'Before' }] },
                { type: 'soft-page-break' },
                { type: 'paragraph', runs: [{ type: 'text', value: 'After' }] }
            ]
        };
        const back = odt.read(odt.write(doc));
        const { ir, losses } = odtToIr(back);

        expect(oconvIr.validate(ir).ok).toBe(true);
        expect(ir.children).toEqual([
            oconvIr.node('paragraph', {}, [oconvIr.node('run', { text: 'Before' })]),
            oconvIr.node('paragraph', {}, [oconvIr.node('run', { text: 'After' })])
        ]);
        expect(losses).toEqual([{ code: 'block/dropped', detail: 'text:soft-page-break' }]);
    });

    test('empty document → valid empty IR, no losses', () => {
        const back = odt.read(odt.write({ body: [] }));
        const { ir, losses } = odtToIr(back);

        expect(losses).toEqual([]);
        expect(ir.children).toEqual([]);
        expect(oconvIr.validate(ir).ok).toBe(true);
    });
});

describe('oconvOdtToIr — reader-swap proof (F2, vs oconvDocxToIr)', () => {
    test('the same structural-signature helper accepts task 02\'s docx IR '
        + 'and this reader\'s odt IR for an equivalent document structure', () => {
        const { numbering, numId: bulletNumId } = docxNumberingMod.bulletList();
        const docxBody = [
            docxApi.paragraph('Title', { pPr: { pStyle: 'Heading1' } }),
            docxApi.paragraph('Subtitle', { pPr: { pStyle: 'Heading2' } }),
            docxApi.paragraph('Intro.'),
            {
                type: 'paragraph',
                children: [docxApi.hyperlink('Example', 'https://example.test/',
                    { rId: 'rIdExample' })]
            },
            docxApi.listParagraph('item one', bulletNumId, 0),
            docxApi.listParagraph('item two', bulletNumId, 0)
        ];
        const docxBytes = docxApi.write({ body: docxBody }, { numbering });
        const { ir: docxIr } = docxToIr(docxApi.read(docxBytes));

        const linkEl = xml.el('text:a', { 'xlink:href': 'https://example.test/' },
            [xml.text('Example')]);
        const odtDoc = {
            body: [
                { type: 'heading', outlineLevel: 1, runs: [{ type: 'text', value: 'Title' }] },
                { type: 'heading', outlineLevel: 2, runs: [{ type: 'text', value: 'Subtitle' }] },
                { type: 'paragraph', runs: [{ type: 'text', value: 'Intro.' }] },
                { type: 'paragraph', runs: [], _extras: { children: [linkEl] } },
                {
                    type: 'list',
                    styleName: 'L1',
                    items: [
                        {
                            children: [{
                                type: 'paragraph',
                                runs: [{ type: 'text', value: 'item one' }]
                            }]
                        },
                        {
                            children: [{
                                type: 'paragraph',
                                runs: [{ type: 'text', value: 'item two' }]
                            }]
                        }
                    ]
                }
            ]
        };
        const { ir: odtIr } = odtToIr(odt.read(odt.write(odtDoc)));

        expect(oconvIr.validate(docxIr).ok).toBe(true);
        expect(oconvIr.validate(odtIr).ok).toBe(true);
        // The proof: ONE helper, fed both readers' IR for an equivalent
        // document, agrees on kinds/levels/text end to end (headings,
        // plain paragraph, link text, list items) — this is F2's seam,
        // not a same-reader placeholder.
        expect(structuralSignature(docxIr)).toEqual(structuralSignature(odtIr));
    });

    test('GAP-ODF-2 divergence, asserted explicitly: docx resolves run '
        + 'formatting, odt cannot — text still agrees, the bold flag does not', () => {
        const docxBytes = docxApi.write({
            body: [{ type: 'paragraph', children: [docxApi.run('bold text', { bold: true })] }]
        });
        const { ir: docxIr } = docxToIr(docxApi.read(docxBytes));

        const odtDoc = {
            body: [{
                type: 'paragraph',
                runs: [{ type: 'span', value: 'bold text', styleName: 'Strong' }]
            }]
        };
        const { ir: odtIr, losses: odtLosses } = odtToIr(odt.read(odt.write(odtDoc)));

        // What CAN both express — the visible text — still agrees:
        expect(structuralSignature(docxIr)).toEqual(structuralSignature(odtIr));
        // What can't — GAP-ODF-2 (file header): `odt.read()`'s public
        // surface never exposes content.xml's automatic-styles bucket, so
        // the bold flag is permanently unresolvable here. Asserted
        // explicitly, not excluded from the comparison:
        expect(docxIr.children[0].children[0].bold).toBe(true);
        expect(odtIr.children[0].children[0].bold).toBe(false);
        expect(odtLosses).toEqual([{ code: 'run/format-unresolved', detail: 'Strong' }]);
    });

    test('GAP-ODF-1 RETIRED: docx and odt both map a real table node now '
        + '(task 04 gave `odt.read()` a `<table:table>` dispatch)', () => {
        const docxBytes = docxApi.write({
            body: [docxApi.tableFromRows([['A1', 'B1'], ['A2', 'B2']])]
        });
        const { ir: docxIr } = docxToIr(docxApi.read(docxBytes));

        const tableEl = xml.el('table:table', { 'table:name': 'T1' }, [
            xml.el('table:table-row', {}, [
                xml.el('table:table-cell', {}, [xml.el('text:p', {}, [xml.text('A1')])]),
                xml.el('table:table-cell', {}, [xml.el('text:p', {}, [xml.text('B1')])])
            ]),
            xml.el('table:table-row', {}, [
                xml.el('table:table-cell', {}, [xml.el('text:p', {}, [xml.text('A2')])]),
                xml.el('table:table-cell', {}, [xml.el('text:p', {}, [xml.text('B2')])])
            ])
        ]);
        const { ir: odtIr, losses: odtLosses } = odtToIr(odt.read(odt.write({ body: [tableEl] })));

        // docx: a real `table` IR node (tier-2 mapping, task 02)...
        expect(docxIr.children).toHaveLength(1);
        expect(docxIr.children[0].kind).toBe('table');
        // ...odt: GAP-ODF-1 is retired — no longer `block/dropped`, a real
        // `table` IR node with the same shape, zero loss:
        expect(odtIr.children).toHaveLength(1);
        expect(odtIr.children[0].kind).toBe('table');
        expect(odtLosses).toEqual([]);
        // The two readers now agree structurally on the table too:
        expect(structuralSignature(docxIr)).toEqual(structuralSignature(odtIr));
        // Text content matches (table → row → cell → paragraph → run):
        expect(odtIr.children[0].children[0].children[0].children[0].children[0].text)
            .toBe('A1');
        expect(docxIr.children[0].children[0].children[0].children[0].children[0].text)
            .toBe('A1');
    });
});

/** Concatenated text of every IR run, in document order. */
function irText(ir) {
    let s = '';
    oconvIr.walk(ir, (n) => {
        if (n.kind === 'run') s += n.text;
    });
    return s;
}

/**
 * Deep copy of an odt span whose `runs` (and the `runs` of every nested span
 * and link) no longer carry the `space` / `tab` / `line-break` entries.
 */
function withoutSpacing(r) {
    const copy = { ...r };
    if (Array.isArray(r.runs)) {
        copy.runs = r.runs
            .filter((e) => !(e && (e.type === 'space' || e.type === 'tab'
                || e.type === 'line-break')))
            .map((e) => (e && (e.type === 'span' || e.type === 'link') ? withoutSpacing(e) : e));
    }
    return copy;
}

/** Every odt span carrying `runs`, at any depth of an odt run list. */
function spansWithRuns(runs, out = []) {
    for (const r of runs || []) {
        if (!r || !Array.isArray(r.runs)) continue;
        if (r.type === 'span') out.push(r);
        spansWithRuns(r.runs, out);
    }
    return out;
}

/**
 * The span invariant: mapping a span with its spacing entries removed gives
 * exactly the span's flattened `value` — no character of `value` is lost.
 * Returns the number of spans checked (so a caller can prove non-vacuity).
 */
function expectSpanInvariant(paragraph) {
    const spans = spansWithRuns(paragraph.runs);
    for (const span of spans) {
        const { ir } = odtToIr({
            body: [{ type: 'paragraph', runs: [withoutSpacing(span)] }]
        });
        expect(irText(ir)).toBe(span.value);
    }
    return spans.length;
}

/** IR run with the given props (every other prop at its default). */
function run(text, props) {
    return oconvIr.node('run', { text, ...props });
}

describe('oconvOdtToIr — span inner markup', () => {
    // A span whose content carries spacing, a line break and a nested bold
    // span, written and read back through the real odf writer and reader.
    const measured = odt.read(odt.write({
        body: [{
            type: 'paragraph',
            runs: [{
                type: 'span',
                value: 'BCDE nb F',
                runs: [
                    { type: 'text', value: 'B' },
                    { type: 'space', count: 3 },
                    { type: 'text', value: 'C' },
                    { type: 'tab' },
                    { type: 'text', value: 'D' },
                    { type: 'line-break' },
                    { type: 'text', value: 'E ' },
                    { type: 'span', value: 'nb', bold: true },
                    { type: 'text', value: ' F' }
                ]
            }]
        }]
    })).body[0];

    // Nested emphasis, hand-built odf model: bold > italic > monospace, plus
    // a nested span whose named style does not resolve.
    const nested = {
        type: 'paragraph',
        runs: [{
            type: 'span',
            value: 'x yzw',
            bold: true,
            runs: [
                { type: 'text', value: 'x ' },
                {
                    type: 'span',
                    value: 'yz',
                    italic: true,
                    runs: [
                        { type: 'text', value: 'y' },
                        { type: 'span', value: 'z', monospace: true }
                    ]
                },
                { type: 'span', value: 'w', styleName: 'Foreign' }
            ]
        }]
    };

    // A link inside an italic span, written and read back.
    const linked = odt.read(odt.write({
        body: [{
            type: 'paragraph',
            runs: [{
                type: 'span',
                value: 'see go',
                italic: true,
                runs: [
                    { type: 'text', value: 'see ' },
                    { type: 'link', href: 'https://example.test/', runs: [{ type: 'text', value: 'go' }] }
                ]
            }]
        }]
    })).body[0];

    // A link with an empty target inside a struck span, hand-built.
    const missingTarget = {
        type: 'paragraph',
        runs: [{
            type: 'span',
            value: 'nowhere',
            strike: true,
            runs: [{ type: 'link', href: '', runs: [{ type: 'text', value: 'nowhere' }] }]
        }]
    };

    // Raw elements inside a bold span, written and read back: a field with
    // text, a frame holding a text box, a frame holding an image only, an
    // empty bookmark.
    const fields = odt.read(odt.write({
        body: [{
            type: 'paragraph',
            runs: [{
                type: 'span',
                value: 'See Table 3 and Caption.',
                bold: true,
                runs: [
                    { type: 'text', value: 'See ' },
                    xml.el('text:reference-ref', { 'text:ref-name': 'tab3' }, [xml.text('Table 3')]),
                    { type: 'text', value: ' and ' },
                    xml.el('draw:frame', { 'draw:name': 'Box1' }, [
                        xml.el('draw:text-box', {}, [
                            xml.el('text:p', {}, [
                                xml.text('Cap'),
                                xml.el('text:s', { 'text:c': '2' }, []),
                                xml.text('tion')
                            ])
                        ])
                    ]),
                    xml.el('draw:frame', { 'draw:name': 'Pic1' }, [
                        xml.el('draw:image', { 'xlink:href': 'Pictures/100000000000012C.png' }, [])
                    ]),
                    xml.el('text:bookmark', { 'text:name': 'b1' }, []),
                    { type: 'text', value: '.' }
                ]
            }]
        }]
    })).body[0];

    test('spacing, a tab, a line break and a nested bold span are kept, one IR '
        + 'run per entry (written and read back)', () => {
        // Non-vacuity: the reader really hands this span over with `runs`.
        expect(measured.runs).toHaveLength(1);
        expect(measured.runs[0].value).toBe('BCDE nb F');
        expect(measured.runs[0].runs).toHaveLength(9);

        const { ir, losses } = odtToIr({ body: [measured] });

        expect(oconvIr.validate(ir).ok).toBe(true);
        expect(ir.children).toEqual([
            oconvIr.node('paragraph', {}, [
                run('B'), run('   '), run('C'), run('\t'), run('D'), run('\n'),
                run('E '), run('nb', { bold: true }), run(' F')
            ])
        ]);
        expect(irText(ir)).toBe('B   C\tD\nE nb F');
        expect(losses).toEqual([{ code: 'run/format-unresolved', detail: '(unnamed)' }]);
        expect(expectSpanInvariant(measured)).toBe(1);
    });

    test('nested span flags add up; a nested span keeps its own unresolved-style '
        + 'loss', () => {
        const { ir, losses } = odtToIr({ body: [nested] });

        expect(oconvIr.validate(ir).ok).toBe(true);
        expect(ir.children).toEqual([
            oconvIr.node('paragraph', {}, [
                run('x ', { bold: true }),
                run('y', { bold: true, italic: true }),
                run('z', { bold: true, italic: true, code: true }),
                run('w', { bold: true })
            ])
        ]);
        expect(losses).toEqual([{ code: 'run/format-unresolved', detail: 'Foreign' }]);
        expect(expectSpanInvariant(nested)).toBe(2);
    });

    test('a link inside a span: its runs carry the target and the span flags '
        + '(written and read back)', () => {
        expect(Array.isArray(linked.runs[0].runs)).toBe(true);

        const { ir, losses } = odtToIr({ body: [linked] });

        expect(oconvIr.validate(ir).ok).toBe(true);
        expect(ir.children).toEqual([
            oconvIr.node('paragraph', {}, [
                run('see ', { italic: true }),
                run('go', { italic: true, link: 'https://example.test/' })
            ])
        ]);
        expect(losses).toEqual([]);
        expect(expectSpanInvariant(linked)).toBe(1);
    });

    test('a link with no target inside a span keeps its text, records '
        + 'link/target-missing and keeps the span flags', () => {
        const { ir, losses } = odtToIr({ body: [missingTarget] });

        expect(ir.children).toEqual([
            oconvIr.node('paragraph', {}, [run('nowhere', { strike: true, link: null })])
        ]);
        expect(losses).toEqual([{ code: 'link/target-missing', detail: 'text:a' }]);
        expect(expectSpanInvariant(missingTarget)).toBe(1);
    });

    test('raw elements inside a span: field text kept with inline/flattened, a '
        + 'text-box frame kept with image/unresolved, an image-only frame and an '
        + 'empty bookmark dropped (written and read back)', () => {
        const kinds = fields.runs[0].runs.map((e) => (e.type === 'element' ? e.name : e.type));
        expect(kinds).toEqual([
            'text', 'text:reference-ref', 'text', 'draw:frame', 'draw:frame', 'text:bookmark', 'text'
        ]);

        const { ir, losses } = odtToIr({ body: [fields] });

        expect(oconvIr.validate(ir).ok).toBe(true);
        expect(ir.children).toEqual([
            oconvIr.node('paragraph', {}, [
                run('See ', { bold: true }),
                run('Table 3', { bold: true }),
                run(' and ', { bold: true }),
                run('Caption', { bold: true }),
                run('.', { bold: true })
            ])
        ]);
        expect(losses).toEqual([
            { code: 'inline/flattened', detail: 'text:reference-ref' },
            { code: 'image/unresolved', detail: 'draw:frame' },
            { code: 'image/unresolved', detail: 'draw:frame' },
            { code: 'inline/dropped', detail: 'text:bookmark' }
        ]);
        expect(expectSpanInvariant(fields)).toBe(1);
    });

    test('a span without runs maps exactly as before (pinned)', () => {
        const para = {
            type: 'paragraph',
            runs: [
                { type: 'span', value: 'flagged', bold: true, monospace: true },
                { type: 'span', value: 'named', styleName: 'Strong', italic: true },
                { type: 'span', value: 'unresolved', styleName: 'Emphasis' },
                { type: 'span', value: 'anonymous' },
                { type: 'span' }
            ]
        };
        const { ir, losses } = odtToIr({ body: [para] });

        expect(ir.children).toEqual([
            oconvIr.node('paragraph', {}, [
                run('flagged', { bold: true, code: true }),
                run('named', { italic: true }),
                run('unresolved'),
                run('anonymous'),
                run('')
            ])
        ]);
        expect(losses).toEqual([
            { code: 'run/format-unresolved', detail: 'Emphasis' },
            { code: 'run/format-unresolved', detail: '(unnamed)' },
            { code: 'run/format-unresolved', detail: '(unnamed)' }
        ]);

        // And the real reader gives a span with no element child no `runs`.
        const back = odt.read(odt.write({
            body: [{ type: 'paragraph', runs: [{ type: 'span', value: 'only text', bold: true }] }]
        }));
        expect('runs' in back.body[0].runs[0]).toBe(false);
        expect(odtToIr(back).ir.children).toEqual([
            oconvIr.node('paragraph', {}, [run('only text', { bold: true })])
        ]);
    });

    test('the spacing-free text of every span with runs equals its value, over '
        + 'every fixture above', () => {
        let checked = 0;
        for (const para of [measured, nested, linked, missingTarget, fields]) {
            checked += expectSpanInvariant(para);
        }
        expect(checked).toBe(6);
    });
});
