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
 * `ai/archives/plans/oconv/spikes/w0-core/FINDINGS.md` F2). Applied to BOTH
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

    test('maps a section\'s content in place, nested sections too (A42)', () => {
        const doc = {
            body: [
                { type: 'paragraph', runs: [{ type: 'text', value: 'Before' }] },
                { type: 'section', name: 'Sect1', children: [
                    { type: 'heading', level: 1, runs: [{ type: 'text', value: 'Inside' }] },
                    { type: 'paragraph', runs: [{ type: 'text', value: 'Body of the section.' }] },
                    { type: 'section', name: 'Sect2', children: [
                        { type: 'paragraph', runs: [{ type: 'text', value: 'Nested.' }] }
                    ] }
                ] },
                { type: 'paragraph', runs: [{ type: 'text', value: 'After' }] }
            ]
        };
        const back = odt.read(odt.write(doc));
        expect(back.body.some((n) => n.type === 'section')).toBe(true);
        const { ir, losses } = odtToIr(back);
        expect(oconvIr.validate(ir).ok).toBe(true);
        expect(ir.children).toEqual([
            oconvIr.node('paragraph', {}, [oconvIr.node('run', { text: 'Before' })]),
            oconvIr.node('heading', { level: 1 }, [oconvIr.node('run', { text: 'Inside' })]),
            oconvIr.node('paragraph', {}, [oconvIr.node('run', { text: 'Body of the section.' })]),
            oconvIr.node('paragraph', {}, [oconvIr.node('run', { text: 'Nested.' })]),
            oconvIr.node('paragraph', {}, [oconvIr.node('run', { text: 'After' })])
        ]);
        expect(losses).toEqual([]);
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

    test('framesInRuns: a text-box frame maps like the raw one; an image frame becomes an IR image', () => {
        const typed = odt.read(odt.write({ body: [fields] }), { framesInRuns: true }).body[0];
        // Non-vacuity: the frames really are typed runs here.
        expect(typed.runs[0].runs.filter((e) => e.type === 'frame')).toHaveLength(2);
        const { ir, losses } = odtToIr({ body: [typed] });
        expect(oconvIr.validate(ir).ok).toBe(true);
        expect(ir.children).toEqual([oconvIr.node('paragraph', {}, [
            run('See ', { bold: true }), run('Table 3', { bold: true }), run(' and ', { bold: true }),
            run('Caption', { bold: true }),
            // The span flags are not image props; no package part → no bytes.
            oconvIr.node('image', { name: 'Pic1', alt: '' }),
            run('.', { bold: true })
        ])]);
        expect(losses).toEqual([
            { code: 'inline/flattened', detail: 'text:reference-ref' },
            { code: 'image/unresolved', detail: 'draw:frame' },
            { code: 'image/bytes-unavailable', detail: 'Pic1' },
            { code: 'inline/dropped', detail: 'text:bookmark' }
        ]);
    });

    test('framesInRuns: a text-box frame at paragraph level and in a link records image/unresolved', () => {
        const frame = { type: 'frame', anchorType: 'paragraph', child: { kind: 'text-box', children: [] } };
        const { ir, losses } = odtToIr({ body: [{ type: 'paragraph', runs: [
            { type: 'text', value: 'a ' }, frame,
            { type: 'link', href: 'https://e.x', runs: [{ type: 'text', value: 'l' }, frame] }
        ] }] });
        expect(ir.children).toEqual([oconvIr.node('paragraph', {}, [
            oconvIr.node('run', { text: 'a ' }), oconvIr.node('run', { text: 'l', link: 'https://e.x' })
        ])]);
        expect(losses).toEqual([
            { code: 'image/unresolved', detail: 'draw:frame' },
            { code: 'image/unresolved', detail: 'draw:frame' }
        ]);
    });

    // Image frames (framesInRuns): an 8-byte PNG signature plus payload.
    const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

    test('an image frame written and read back is an IR image carrying its bytes in escapes.odt', () => {
        const bytes = odt.write({ pictures: { 'Pictures/a.png': PNG }, body: [{ type: 'paragraph', runs: [
            { type: 'text', value: 'Logo: ' },
            { type: 'image', href: 'Pictures/a.png', name: 'Logo', width: '1cm', height: '1cm' },
            { type: 'text', value: ' end' }
        ] }] });
        const { ir, losses } = odtToIr(odt.read(bytes, { framesInRuns: true }));

        expect(oconvIr.validate(ir).ok).toBe(true);
        expect(losses).toEqual([]);
        const [p] = ir.children;
        expect(p.children.map((c) => c.kind)).toEqual(['run', 'image', 'run']);
        const img = p.children[1];
        expect(img.name).toBe('Logo');
        expect(img.alt).toBe('');
        expect(img.escapes.odt.contentType).toBe('image/png');
        expect([...img.escapes.odt.bytes]).toEqual([...PNG]);
    });

    test('alt text from svg:title (else svg:desc); the name falls back to the href basename', () => {
        const titled = { type: 'frame', child: { kind: 'image', href: './Pictures/b.png' },
            _extras: { children: [xml.el('svg:desc', {}, [xml.text('long')]), xml.el('svg:title', {}, [xml.text('Short')])] } };
        const described = { type: 'frame', name: 'D', child: { kind: 'image', href: 'Pictures/b.png' },
            _extras: { children: [xml.el('svg:desc', {}, [xml.text('Only desc')])] } };
        const pkg = { parts: { 'Pictures/b.png': PNG }, manifest: { entries: [] } };
        const { ir, losses } = odtToIr({ package: pkg, body: [{ type: 'paragraph', runs: [titled, described] }] });
        const [a, b] = ir.children[0].children;
        expect([a.name, a.alt, b.name, b.alt]).toEqual(['b.png', 'Short', 'D', 'Only desc']);
        expect(a.escapes.odt).toEqual({ bytes: PNG, contentType: null });
        expect(losses).toEqual([]);
    });

    test('a missing part or an external href records image/bytes-unavailable; an image in a link loses its target (inline/dropped link-target)', () => {
        const ext = { type: 'frame', name: 'Ext', child: { kind: 'image', href: 'https://e.x/a.png' } };
        const { ir, losses } = odtToIr({ package: { parts: {} }, body: [{ type: 'paragraph', runs: [
            { type: 'link', href: 'https://e.x', runs: [{ type: 'text', value: 'l' }, ext] }
        ] }] });
        expect(oconvIr.validate(ir).ok).toBe(true);
        expect(ir.children[0].children).toEqual([
            oconvIr.node('run', { text: 'l', link: 'https://e.x' }), oconvIr.node('image', { name: 'Ext', alt: '' })
        ]);
        expect(losses).toEqual([
            { code: 'image/bytes-unavailable', detail: 'Ext' },
            { code: 'inline/dropped', detail: 'link-target' }
        ]);
    });

    test('a frame with no content child, only a title or a description, is an image without bytes (image/bytes-unavailable)', () => {
        const titled = { type: 'frame', anchorType: 'as-char', name: 'Chart 1', width: '5.08cm', height: '3.81cm',
            _extras: { children: [xml.el('svg:title', {}, [xml.text('Sales')])] } };
        const described = { type: 'frame', _extras: { children: [xml.el('svg:desc', {}, [xml.text('Only desc')])] } };
        const bare = { type: 'frame', name: 'Bare' };
        const { ir, losses } = odtToIr({ package: { parts: {} }, body: [{ type: 'paragraph', runs: [
            { type: 'text', value: 'a ' }, titled, described, bare
        ] }] });
        expect(oconvIr.validate(ir).ok).toBe(true);
        expect(ir.children[0].children).toEqual([
            oconvIr.node('run', { text: 'a ' }),
            oconvIr.node('image', { name: 'Chart 1', alt: 'Sales' }),
            oconvIr.node('image', { name: 'image', alt: 'Only desc' }),
            oconvIr.node('image', { name: 'Bare', alt: '' })
        ]);
        expect(losses).toEqual([
            { code: 'image/bytes-unavailable', detail: 'Chart 1' },
            { code: 'image/bytes-unavailable', detail: 'image' },
            { code: 'image/bytes-unavailable', detail: 'Bare' }
        ]);
    });

    test('a frame with no typed child but another child (a plugin) stays image/unresolved', () => {
        const plugin = { type: 'frame', name: 'Media object 1', _extras: { children: [
            xml.el('draw:plugin', { 'xlink:href': 'Media/ok.wav' }, []), xml.el('svg:title', {}, [xml.text('Sound')])
        ] } };
        const { ir, losses } = odtToIr({ package: { parts: {} }, body: [{ type: 'paragraph', runs: [
            { type: 'text', value: 'a' }, plugin
        ] }] });
        expect(ir.children[0].children).toEqual([oconvIr.node('run', { text: 'a' })]);
        expect(losses).toEqual([{ code: 'image/unresolved', detail: 'draw:frame' }]);
    });

    test('an image without bytes written as an empty frame reads back with its name and alt', () => {
        const bytes = odt.write({ body: [{ type: 'paragraph', runs: [
            { type: 'frame', anchorType: 'as-char', name: 'Chart 1', width: '5.08cm', height: '3.81cm',
              _extras: { children: [xml.el('svg:title', {}, [xml.text('Sales')])] } }
        ] }] });
        const { ir, losses } = odtToIr(odt.read(bytes, { framesInRuns: true }));
        expect(ir.children).toEqual([oconvIr.node('paragraph', {}, [oconvIr.node('image', { name: 'Chart 1', alt: 'Sales' })])]);
        expect(losses).toEqual([{ code: 'image/bytes-unavailable', detail: 'Chart 1' }]);
    });

    test('a link\'s untyped children: field text kept on the link with inline/flattened, '
        + 'an empty bookmark recorded inline/dropped (written and read back)', () => {
        const back = odt.read(odt.write({ body: [{ type: 'paragraph', runs: [
            { type: 'link', href: 'https://e.x', runs: [{ type: 'text', value: 'see ' }],
              _extras: { children: [
                  xml.el('text:reference-ref', { 'text:ref-name': 'f1' }, [xml.text('Fig 1')]),
                  xml.el('text:bookmark', { 'text:name': 'b1' }, [])
              ] } }
        ] }] })).body[0];
        // Non-vacuity: the reader really parks both on the link's own extras.
        expect(back.runs[0]._extras.children.map((c) => c.name)).toEqual(['text:reference-ref', 'text:bookmark']);

        const { ir, losses } = odtToIr({ body: [back] });

        expect(oconvIr.validate(ir).ok).toBe(true);
        expect(ir.children).toEqual([oconvIr.node('paragraph', {}, [
            run('see ', { link: 'https://e.x' }), run('Fig 1', { link: 'https://e.x' })
        ])]);
        expect(losses).toEqual([
            { code: 'inline/flattened', detail: 'text:reference-ref' },
            { code: 'inline/dropped', detail: 'text:bookmark' }
        ]);
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
                run('anonymous')
                // the valueless span: no inline since T32 (b3c), its loss kept
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

// Code blocks, quotes and rules by paragraph style: LibreOffice's built-in
// `Preformatted Text`, `Quotations` and `Horizontal Line` (also what pandoc
// writes), by style name.
describe('oconvOdtToIr — code blocks, quotes and rules by paragraph style', () => {
    const para = (styleName, runs) => ({ type: 'paragraph', styleName, runs });
    const text = (value) => ({ type: 'text', value });

    test('consecutive Preformatted Text paragraphs → ONE codeBlock; spaces, tabs, breaks and spans kept', () => {
        const back = odt.read(odt.write({ body: [
            para('Preformatted_20_Text', [{ type: 'space', count: 2 }, text('if (a)'),
                { type: 'space', count: 2 }, text('b();')]),
            para('Preformatted_20_Text', []),
            para('Preformatted_20_Text', [{ type: 'tab' }, text('c;'), { type: 'line-break' },
                { type: 'span', value: 'd', bold: true }]),
            para(undefined, [text('After.')])
        ] }));
        const { ir, losses } = odtToIr(back);

        expect(oconvIr.validate(ir).ok).toBe(true);
        expect(losses).toEqual([]);
        expect(ir.children).toEqual([
            oconvIr.node('codeBlock', { info: '', text: '  if (a)  b();\n\n\tc;\nd' }),
            oconvIr.node('paragraph', {}, [run('After.')])
        ]);
    });

    test('code groups separated by prose stay two code blocks; an all-empty group is skipped', () => {
        const { ir } = odtToIr({ body: [
            para('Preformatted_20_Text', [text('one')]),
            para(undefined, [text('prose')]),
            para('Preformatted_20_Text', [text('two')]),
            para(undefined, [text('more')]),
            para('Preformatted_20_Text', [])
        ] });
        expect(ir.children.map((b) => b.kind)).toEqual(['codeBlock', 'paragraph', 'codeBlock', 'paragraph']);
        expect(ir.children.map((b) => b.text).filter(Boolean)).toEqual(['one', 'two']);
    });

    test('consecutive Quotations paragraphs → ONE blockquote; an empty one does not split it', () => {
        const back = odt.read(odt.write({ body: [
            para('Quotations', [text('Q1')]),
            para('Quotations', []),
            para('Quotations', [{ type: 'span', value: 'Q2', italic: true }]),
            para(undefined, [text('Between.')]),
            para('Quotations', [text('Q3')])
        ] }));
        const { ir, losses } = odtToIr(back);

        expect(oconvIr.validate(ir).ok).toBe(true);
        expect(losses).toEqual([]);
        expect(ir.children).toEqual([
            oconvIr.node('blockquote', {}, [
                oconvIr.node('paragraph', {}, [run('Q1')]),
                oconvIr.node('paragraph', {}, [run('Q2', { italic: true })])
            ]),
            oconvIr.node('paragraph', {}, [run('Between.')]),
            oconvIr.node('blockquote', {}, [oconvIr.node('paragraph', {}, [run('Q3')])])
        ]);
    });

    test('an EMPTY Horizontal Line paragraph → hr; one with text stays a paragraph', () => {
        const { ir, losses } = odtToIr({ body: [
            para('Horizontal_20_Line', []),
            para('Horizontal_20_Line', [text('Not a rule')])
        ] });
        expect(losses).toEqual([]);
        expect(ir.children).toEqual([
            oconvIr.node('hr'),
            oconvIr.node('paragraph', {}, [run('Not a rule')])
        ]);
    });

    test('an automatic paragraph style whose parent is a block style resolves (one hop)', () => {
        const back = odt.read(odt.write({
            autoStyles: { styles: [
                { name: 'P1', family: 'paragraph', parentStyleName: 'Preformatted_20_Text' },
                { name: 'P2', family: 'paragraph', parentStyleName: 'Quotations' }
            ] },
            body: [para('P1', [text('code')]), para('P2', [text('quote')])]
        }));
        // Non-vacuity: the reader really surfaces the automatic styles.
        expect(back.autoStyles.styles.map((s) => [s.name, s.parentStyleName]))
            .toEqual([['P1', 'Preformatted_20_Text'], ['P2', 'Quotations']]);

        const { ir } = odtToIr(back);
        expect(ir.children.map((b) => b.kind)).toEqual(['codeBlock', 'blockquote']);
    });

    test('a block style inside a table cell and a list item resolves there too', () => {
        const { ir } = odtToIr({ body: [
            { type: 'table', rows: [{ type: 'row', cells: [{ type: 'cell', children: [
                para('Preformatted_20_Text', [text('in cell')])
            ] }] }] },
            { type: 'list', ordered: false, items: [{ children: [para('Quotations', [text('in item')])] }] }
        ] });
        const cell = ir.children[0].children[0].children[0];
        expect(cell.children).toEqual([oconvIr.node('codeBlock', { info: '', text: 'in cell' })]);
        const item = ir.children[1].children[0];
        expect(item.children.map((b) => b.kind)).toEqual(['blockquote']);
    });
});

// A45a — an inline element at paragraph level, read with elementsInRuns.
describe('oconvOdtToIr — paragraph-level element runs keep their text (A45a)', () => {
    test('a cross-reference keeps its text in place; an empty bookmark is dropped as before', () => {
        const para = { type: 'paragraph', runs: [
            { type: 'text', value: 'See ' },
            xml.el('text:reference-ref', { 'text:ref-name': 's43' }, [xml.text('4.3')]),
            { type: 'text', value: ' below.' },
            xml.el('text:bookmark', { 'text:name': 'b1' }, [])
        ] };
        const { ir, losses } = odtToIr({ body: [para] });
        expect(oconvIr.validate(ir).ok).toBe(true);
        expect(ir.children[0].children.map((r) => r.text).join('')).toBe('See 4.3 below.');
        expect(losses).toEqual([
            { code: 'inline/flattened', detail: 'text:reference-ref' },
            { code: 'inline/dropped', detail: 'text:bookmark' }
        ]);
    });

    test('in a heading and in a link body too; the link carries the kept text', () => {
        const ref = xml.el('text:sequence-ref', {}, [xml.text('Table 2')]);
        const { ir } = odtToIr({ body: [
            { type: 'heading', outlineLevel: 2, runs: [{ type: 'text', value: 'About ' }, ref] },
            { type: 'paragraph', runs: [{ type: 'link', href: 'https://e.x', runs: [{ type: 'text', value: 'see ' }, ref] }] }
        ] });
        expect(ir.children[0].children.map((r) => r.text).join('')).toBe('About Table 2');
        expect(ir.children[1].children.map((r) => [r.text, r.link])).toEqual([['see ', 'https://e.x'], ['Table 2', 'https://e.x']]);
    });

    test('written bytes read back with elementsInRuns keep the element at its place', () => {
        const bytes = odt.write({ body: [{ type: 'paragraph', runs: [
            { type: 'text', value: 'See ' },
            xml.el('text:reference-ref', { 'text:ref-name': 's43' }, [xml.text('4.3')]),
            { type: 'text', value: ' below.' }
        ] }] });
        const { ir } = odtToIr(odt.read(bytes, { framesInRuns: true, elementsInRuns: true }));
        expect(ir.children[0].children.map((r) => r.text).join('')).toBe('See 4.3 below.');
    });
});

// A45c — a heading's outline number, from the document's outline style.
describe('oconvOdtToIr — heading outline numbers (A45c)', () => {
    /** `text:outline-style` raw element, one level per `[level, attrs]`. */
    function outlineStyle(levels) {
        return xml.el('text:outline-style', { 'style:name': 'Outline' }, levels.map(([lvl, attrs]) =>
            xml.el('text:outline-level-style', { 'text:level': String(lvl), ...attrs }, [])));
    }
    function h(level, text, attrs) {
        const node = { type: 'heading', outlineLevel: level, runs: [{ type: 'text', value: text }] };
        if (attrs) node._extras = { attrs };
        return node;
    }
    const headingTexts = (ir) => ir.children.filter((b) => b.kind === 'heading')
        .map((b) => b.children.map((r) => r.text).join(''));
    const TWO_LEVELS = [
        [1, { 'style:num-format': '1' }],
        [2, { 'style:num-format': '1', 'text:display-levels': '2' }],
        [3, { 'style:num-format': '' }]
    ];

    test('a written ODT numbers its headings by its outline style', () => {
        const bytes = odt.write({
            styles: { styles: [outlineStyle(TWO_LEVELS)], automaticStyles: [], masterStyles: [] },
            body: [h(1, 'A'), h(2, 'B'), h(2, 'C'), h(3, 'Plain'), h(1, 'D'), h(2, 'E')]
        });
        const { ir, losses } = odtToIr(odt.read(bytes, { framesInRuns: true, elementsInRuns: true }));
        expect(oconvIr.validate(ir).ok).toBe(true);
        expect(headingTexts(ir)).toEqual(['1 A', '1.1 B', '1.2 C', 'Plain', '2 D', '2.1 E']);
        expect(ir.children[1].children[0]).toMatchObject({ kind: 'run', text: '1.1 ' });
        expect(losses).toEqual([]);
    });

    test('a list header and a level without format get no label and keep the counters', () => {
        const { ir } = odtToIr({
            styles: { styles: [outlineStyle(TWO_LEVELS)] },
            body: [h(1, 'A'), h(1, 'Header', { 'text:is-list-header': 'true' }), h(2, 'B'), h(3, 'C'), h(2, 'D')]
        });
        expect(headingTexts(ir)).toEqual(['1 A', 'Header', '1.1 B', 'C', '1.2 D']);
    });

    test('a restart takes its start value, else the level one', () => {
        const levels = [
            [1, { 'style:num-format': '1', 'text:start-value': '3' }],
            [2, { 'style:num-format': '1', 'text:display-levels': '2', 'text:start-value': '2' }]
        ];
        const { ir } = odtToIr({
            styles: { styles: [outlineStyle(levels)] },
            body: [h(1, 'A'), h(2, 'B'), h(2, 'C', { 'text:restart-numbering': 'true', 'text:start-value': '7' }),
                h(2, 'D'), h(2, 'E', { 'text:restart-numbering': 'true' }), h(1, 'F'), h(2, 'G')]
        });
        expect(headingTexts(ir)).toEqual(['3 A', '3.2 B', '3.7 C', '3.8 D', '3.2 E', '4 F', '4.2 G']);
    });

    test('letters, roman numerals, prefix and suffix; an unknown format is written as 1', () => {
        const levels = [
            [1, { 'style:num-format': 'I', 'style:num-suffix': '.' }],
            [2, { 'style:num-format': 'a', 'text:display-levels': '2', 'style:num-prefix': '(', 'style:num-suffix': ')' }],
            [3, { 'style:num-format': 'A', 'text:start-value': '26' }],
            [4, { 'style:num-format': 'i', 'text:display-levels': '1' }],
            [5, { 'style:num-format': '一' }]
        ];
        const { ir } = odtToIr({
            styles: { styles: [outlineStyle(levels)] },
            body: [h(1, 'A'), h(2, 'B'), h(2, 'C'), h(3, 'D'), h(3, 'E'), h(4, 'F'), h(4, 'G'), h(5, 'H'), h(1, 'I')]
        });
        expect(headingTexts(ir)).toEqual(['I. A', '(I.a) B', '(I.b) C', 'Z D', 'AA E', 'i F', 'ii G', '1 H', 'II. I']);
    });

    test('headings in sections and table cells are numbered; a heading inside a list is not', () => {
        const cell = { cells: [{ children: [h(2, 'In cell')] }] };
        const { ir } = odtToIr({
            styles: { styles: [outlineStyle(TWO_LEVELS)] },
            body: [
                { type: 'section', children: [h(1, 'A')] },
                { type: 'list', ordered: true, items: [{ children: [h(2, 'Listed')] }] },
                { type: 'table', rows: [cell] },
                h(2, 'B')
            ]
        });
        // The heading alone in a list item stands among the headings (the
        // list gives it up), still without a number.
        expect(headingTexts(ir)).toEqual(['1 A', 'Listed', '1.2 B']);
        expect(ir.children[1].kind).toBe('heading');
        expect(ir.children[2].children[0].children[0].children[0].children.map((r) => r.text).join('')).toBe('1.1 In cell');
    });

    test('a typed outline-style entry of styles.listStyles (the large bundle) numbers too', () => {
        const { ir } = odtToIr({
            styles: { styles: [], listStyles: [{ type: 'outline-style', name: 'Outline', attrs: {}, levels: [
                { type: 'level-outline', attrs: { 'text:level': '1', 'style:num-format': '1', 'style:num-suffix': '.' } }
            ] }] },
            body: [h(1, 'A'), h(1, 'B')]
        });
        expect(headingTexts(ir)).toEqual(['1. A', '2. B']);
    });

    test('no outline style, no label', () => {
        const { ir } = odtToIr(odt.read(odt.write({ body: [h(1, 'A'), h(2, 'B')] })));
        expect(headingTexts(ir)).toEqual(['A', 'B']);
    });
});

// A45b — the table of contents, read on request (opts.include).
describe('oconvOdtToIr — a table of contents under include toc (A45b)', () => {
    const entry = (num, text, page) => xml.el('text:p', { 'text:style-name': 'Contents_20_1' }, [
        xml.el('text:a', { 'xlink:type': 'simple', 'xlink:href': '#__RefHeading__1' }, [
            xml.text(num), xml.el('text:s', { 'text:c': '2' }, []), xml.text(text),
            xml.el('text:tab', {}, []), xml.text(page)
        ])
    ]);
    const toc = xml.el('text:table-of-content', { 'text:name': 'Table of Contents1' }, [
        xml.el('text:table-of-content-source', { 'text:outline-level': '2' }, [
            xml.el('text:index-title-template', {}, [xml.text('Contents')])
        ]),
        xml.el('text:index-body', {}, [
            xml.el('text:index-title', { 'text:name': 'Table of Contents1_Head' }, [
                xml.el('text:p', {}, [xml.text('Contents')])
            ]),
            entry('1 ', 'Introduction', '7'),
            entry('1.1 ', 'Scope', '7'),
            xml.el('text:p', {}, [xml.el('text:s', {}, [])])
        ])
    ]);
    const para = (text) => ({ type: 'paragraph', runs: [{ type: 'text', value: text }] });
    const read = () => odt.read(odt.write({ body: [para('Before'), { type: 'unknown', element: toc }, para('After')] }),
        { framesInRuns: true, elementsInRuns: true });
    const texts = (ir) => ir.children.map((b) => b.children.map((r) => r.text).join(''));

    test('its index-body paragraphs are read in place, no loss', () => {
        const { ir, losses } = odtToIr(read(), { include: ['toc'] });
        expect(oconvIr.validate(ir).ok).toBe(true);
        expect(texts(ir)).toEqual(['Before', 'Contents', '1 Introduction 7', '1.1 Scope 7', 'After']);
        expect(ir.children[2].children[0].link).toBeNull();
        expect(losses).toEqual([]);
    });

    test('without the option it is dropped as before', () => {
        for (const opts of [undefined, {}, { include: [] }]) {
            const { ir, losses } = odtToIr(read(), opts);
            expect(texts(ir)).toEqual(['Before', 'After']);
            expect(losses).toEqual([{ code: 'block/dropped', detail: 'text:table-of-content' }]);
        }
    });

    test('another index stays dropped under the option', () => {
        const index = xml.el('text:alphabetical-index', {}, [xml.el('text:index-body', {}, [xml.el('text:p', {}, [xml.text('Term 3')])])]);
        const { losses } = odtToIr({ body: [{ type: 'unknown', element: index }] }, { include: ['toc'] });
        expect(losses).toEqual([{ code: 'block/dropped', detail: 'text:alphabetical-index' }]);
    });

    test('a bad include throws', () => {
        for (const include of [['index'], ['toc', 'toc'], 'toc', [1]]) {
            expect(() => odtToIr({ body: [] }, { include })).toThrow('oconv: bad odt include');
        }
    });
});

describe('oconvOdtToIr — a leading ballot box reads as a GFM task marker (T28)', () => {
    /** An odt of one bullet list, one item per entry; each entry lists its runs (a string is a text run). */
    function itemsOf(...items) {
        const doc = {
            body: [{
                type: 'list',
                ordered: false,
                items: items.map((runs) => ({ children: [{
                    type: 'paragraph',
                    runs: runs.map((r) => (typeof r === 'string' ? { type: 'text', value: r } : r))
                }] }))
            }]
        };
        const { ir, losses } = odtToIr(odt.read(odt.write(doc)));
        expect(oconvIr.validate(ir).ok).toBe(true);
        expect(losses).toEqual([]);
        return ir.children[0].children.map((li) => ({
            task: li.escapes?.md?.task,
            text: li.children[0].children.map((r) => r.text).join('')
        }));
    }

    test('☒ then a space in the first run, or ☐ and a space as a run of its own: checked / unchecked, the glyph stripped', () => {
        expect(itemsOf(['☒ done'], ['☐ ', { type: 'span', value: 'todo', bold: true }])).toEqual([
            { task: 'checked', text: 'done' },
            { task: 'unchecked', text: 'todo' }
        ]);
    });

    test('no space after the glyph, the glyph after text, or ☑: plain text', () => {
        expect(itemsOf(['☐x'], ['a ☒ b'], ['☑ ticked'])).toEqual([
            { task: undefined, text: '☐x' },
            { task: undefined, text: 'a ☒ b' },
            { task: undefined, text: '☑ ticked' }
        ]);
    });

    test('a paragraph outside a list keeps the glyph', () => {
        const doc = { body: [{ type: 'paragraph', runs: [{ type: 'text', value: '☐ not a task' }] }] };
        const { ir } = odtToIr(odt.read(odt.write(doc)));
        expect(ir.children[0].kind).toBe('paragraph');
        expect(ir.children[0].children[0].text).toBe('☐ not a task');
    });
});

describe('oconvOdtToIr — an empty paragraph is a spacer, skipped as in docx (T32 b1)', () => {
    const para = (runs, styleName) => ({ type: 'paragraph', styleName, runs });
    const text = (value) => ({ type: 'text', value });

    test('empty paragraphs between and after paragraphs, and in a table cell, are left out without a loss', () => {
        const { ir, losses } = odtToIr(odt.read(odt.write({ body: [
            para([text('First.')]), para([]), para([]), para([text('Second.')]), para([]),
            { type: 'table', rows: [{ type: 'row', cells: [{ type: 'cell', children: [para([]), para([text('Cell.')])] }] }] },
            para([])
        ] })));
        expect(oconvIr.validate(ir).ok).toBe(true);
        expect(losses).toEqual([]);
        expect(ir.children.map((b) => b.kind)).toEqual(['paragraph', 'paragraph', 'table']);
        expect(ir.children[2].children[0].children[0].children).toEqual([oconvIr.node('paragraph', {}, [run('Cell.')])]);
    });

    test('an empty heading, an empty rule paragraph and an empty preformatted line are unchanged', () => {
        const { ir } = odtToIr(odt.read(odt.write({ body: [
            { type: 'heading', outlineLevel: 1, runs: [] },
            para([], 'Horizontal_20_Line'),
            para([text('a')], 'Preformatted_20_Text'), para([], 'Preformatted_20_Text'), para([text('b')], 'Preformatted_20_Text')
        ] })));
        expect(ir.children.map((b) => b.kind)).toEqual(['heading', 'hr', 'codeBlock']);
        expect(ir.children[2].text).toBe('a\n\nb');
    });

    // T32 (b3c): an empty text run or span maps to no inline.
    test('a paragraph of empty text runs and spans is a spacer too', () => {
        const { ir, losses } = odtToIr({ body: [
            para([text('First.')]),
            para([text('')]),
            para([{ type: 'span', styleName: 'T9', value: '' }]),
            para([{ type: 'span', bold: true, value: '' }, text('')]),
            para([text('Second.')])
        ] });
        expect(oconvIr.validate(ir).ok).toBe(true);
        expect(ir.children).toEqual([oconvIr.node('paragraph', {}, [run('First.')]), oconvIr.node('paragraph', {}, [run('Second.')])]);
        // the unresolved span style is still recorded, as before
        expect(losses).toEqual([{ code: 'run/format-unresolved', detail: 'T9' }]);
    });

    test('an empty run adds nothing to a paragraph with text', () => {
        const { ir } = odtToIr({ body: [para([text(''), text('Kept.'), { type: 'span', italic: true, value: '' }])] });
        expect(ir.children).toEqual([oconvIr.node('paragraph', {}, [run('Kept.')])]);
    });
});

describe('oconvOdtToIr — a heading alone in a list item', () => {
    const N = oconvIr.node;
    const para = (text) => ({ type: 'paragraph', runs: [{ type: 'text', value: text }] });
    const heading = (text, level = 1) => ({ type: 'heading', outlineLevel: level, runs: [{ type: 'text', value: text }] });
    const p = (text) => N('paragraph', {}, [N('run', { text })]);

    test('is read as the heading at its place, the list split around it', () => {
        const { ir, losses } = odtToIr({ body: [{ type: 'list', ordered: true, items: [
            { children: [para('one')] }, { children: [heading('Title', 2)] }, { children: [para('two')] }
        ] }] });
        expect(oconvIr.validate(ir).ok).toBe(true);
        expect(losses).toEqual([]);
        expect(ir.children).toEqual([
            N('list', { ordered: true }, [N('listItem', {}, [p('one')])]),
            N('heading', { level: 2 }, [N('run', { text: 'Title' })]),
            N('list', { ordered: true }, [N('listItem', {}, [p('two')])])
        ]);
    });

    test('a heading at the bottom of one-item nested lists is read as the heading', () => {
        const nest = (inner) => ({ type: 'list', ordered: true, items: [{ children: [inner] }] });
        const { ir, losses } = odtToIr({ body: [para('b'), nest(nest(nest(heading('c', 3))))] });
        expect(losses).toEqual([]);
        expect(ir.children).toEqual([p('b'), N('heading', { level: 3 }, [N('run', { text: 'c' })])]);
    });

    test('an item holding two headings gives up both', () => {
        const { ir, losses } = odtToIr({ body: [{ type: 'list', ordered: false, items: [
            { children: [heading('One'), heading('Two')] }
        ] }] });
        expect(losses).toEqual([]);
        expect(ir.children).toEqual([
            N('heading', { level: 1 }, [N('run', { text: 'One' })]),
            N('heading', { level: 1 }, [N('run', { text: 'Two' })])
        ]);
    });

    test('an item holding a heading and a paragraph is unchanged', () => {
        const { ir } = odtToIr({ body: [{ type: 'list', ordered: false, items: [
            { children: [heading('H'), para('text')] }
        ] }] });
        expect(ir.children).toEqual([N('list', { ordered: false }, [N('listItem', {}, [
            N('heading', { level: 1 }, [N('run', { text: 'H' })]), p('text')
        ])])]);
    });
});
