// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/* global Bun */
import { describe, test, expect, afterEach, setSystemTime } from 'bun:test';
import { fileURLToPath } from 'node:url';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { fw_require as odfFwRequire, modules as odfModules } from '@awacloud/odf';
import { fw_require as mdFwRequire, modules as mdModules } from '@awacloud/md';
import { mdFrontmatter } from '@awacloud/md/extra/frontmatter.js';
import { oconvIr } from '../ir/ir.js';
import { oconvIrToOdt } from './ir-to-odt.js';
import { oconvMdToIr } from '../read/md-to-ir.js';

// One runtime for the whole file: `@awacloud/odf`'s own manifest
// (fw_require + modules) provides `odt`; `oconvIr` provides the pivot.
const runtime = new ModuleRuntime();
for (const m of odfFwRequire) runtime.register(m);
for (const m of odfModules) runtime.register(m);
runtime.register(oconvIr);
runtime.register(oconvIrToOdt);

const { irToOdt } = runtime.resolve('oconvIrToOdt');
const odt = runtime.resolve('odt');
const odfStyles = runtime.resolve('odfStyles');
const zipApi = runtime.resolve('zip');
const xmlApi = runtime.resolve('xml');
const { node, doc, validate } = oconvIr.factory();

/** `cell` holding a single text paragraph. */
function cell(text) {
    return node('cell', {}, [node('paragraph', {}, [node('run', { text })])]);
}

describe('oconvIrToOdt — descriptor', () => {
    test('has the frozen name/dependencies/factory shape', () => {
        expect(oconvIrToOdt.name).toBe('oconvIrToOdt');
        expect(oconvIrToOdt.dependencies).toEqual(['oconvIr', 'odt']);
        expect(typeof oconvIrToOdt.factory).toBe('function');
    });
});

describe('oconvIrToOdt — irToOdt() — headings and paragraphs', () => {
    test('heading levels 1/3/6 round-trip through odt.read with exact outlineLevel', () => {
        const ir = doc([
            node('heading', { level: 1 }, [node('run', { text: 'Title' })]),
            node('heading', { level: 3 }, [node('run', { text: 'Sub' })]),
            node('heading', { level: 6 }, [node('run', { text: 'Deep' })]),
            node('paragraph', {}, [node('run', { text: 'plain text' })])
        ]);
        const { bytes, losses } = irToOdt(ir);
        const read = odt.read(bytes);

        expect(read.body[0].type).toBe('heading');
        expect(read.body[0].outlineLevel).toBe(1);
        expect(read.body[0].runs).toEqual([{ type: 'text', value: 'Title' }]);
        expect(read.body[1].outlineLevel).toBe(3);
        expect(read.body[2].outlineLevel).toBe(6);
        expect(read.body[3].type).toBe('paragraph');
        expect(read.body[3].runs).toEqual([{ type: 'text', value: 'plain text' }]);
        expect(losses).toEqual([]);
    });
});

describe('oconvIrToOdt — irToOdt() — lists', () => {
    test('nested bullet list: nesting preserved, item text preserved, ordered:false, no loss', () => {
        const ir = doc([
            node('list', { ordered: false }, [
                node('listItem', {}, [node('paragraph', {}, [node('run', { text: 'first' })])]),
                node('listItem', {}, [
                    node('paragraph', {}, [node('run', { text: 'second' })]),
                    node('list', { ordered: false }, [
                        node('listItem', {}, [
                            node('paragraph', {}, [node('run', { text: 'nested' })])
                        ])
                    ])
                ])
            ])
        ]);
        const { bytes, losses } = irToOdt(ir);
        const read = odt.read(bytes);
        const list = read.body[0];

        expect(list.type).toBe('list');
        expect(list.ordered).toBe(false);
        expect(list.items).toHaveLength(2);
        expect(list.items[0].children[0].runs).toEqual([{ type: 'text', value: 'first' }]);
        expect(list.items[1].children[0].runs).toEqual([{ type: 'text', value: 'second' }]);
        const nestedList = list.items[1].children[1];
        expect(nestedList.type).toBe('list');
        expect(nestedList.ordered).toBe(false);
        expect(nestedList.items[0].children[0].runs)
            .toEqual([{ type: 'text', value: 'nested' }]);
        expect(losses).toEqual([]);
    });

    test('ordered list: written as a typed ordered list (numFormat "1"), NO loss', () => {
        const ir = doc([
            node('list', { ordered: true }, [
                node('listItem', {}, [node('paragraph', {}, [node('run', { text: 'one' })])])
            ])
        ]);
        const { bytes, losses } = irToOdt(ir);
        const read = odt.read(bytes);

        expect(read.body[0].type).toBe('list');
        expect(read.body[0].ordered).toBe(true);
        expect(read.body[0].numFormat).toBe('1');
        expect(read.body[0].items[0].children[0].runs)
            .toEqual([{ type: 'text', value: 'one' }]);
        expect(losses).toEqual([]);
    });

    test('adjacent ordered + bullet lists keep distinct ordered values end to end (BL-739)', () => {
        const ir = doc([
            node('list', { ordered: true }, [
                node('listItem', {}, [node('paragraph', {}, [node('run', { text: 'a1' })])])
            ]),
            node('list', { ordered: false }, [
                node('listItem', {}, [node('paragraph', {}, [node('run', { text: 'b1' })])])
            ])
        ]);
        const { bytes, losses } = irToOdt(ir);
        const read = odt.read(bytes);

        expect(read.body).toHaveLength(2);
        expect(read.body[0].type).toBe('list');
        expect(read.body[0].ordered).toBe(true);
        expect(read.body[1].type).toBe('list');
        expect(read.body[1].ordered).toBe(false);
        expect(losses).toEqual([]);
    });

    test('task items: a ☐ / ☒ text run leads the first paragraph, no loss', () => {
        const task = (t, text) => node('listItem', { escapes: { md: { task: t } } }, [
            node('paragraph', {}, [node('run', { text, bold: true })])
        ]);
        const ir = doc([
            node('list', { ordered: false }, [
                task('unchecked', 'todo'),
                task('checked', 'done'),
                node('listItem', {}, [node('paragraph', {}, [node('run', { text: 'plain' })])])
            ])
        ]);
        const { bytes, losses } = irToOdt(ir);
        const items = odt.read(bytes).body[0].items;

        expect(losses).toEqual([]);
        expect(items[0].children[0].runs[0]).toEqual({ type: 'text', value: '☐ ' });
        expect(items[1].children[0].runs[0]).toEqual({ type: 'text', value: '☒ ' });
        expect(items[0].children[0].runs).toHaveLength(2);
        expect(items[2].children[0].runs).toEqual([{ type: 'text', value: 'plain' }]);
    });

    test('a task flag on an item without a leading paragraph is a writer loss', () => {
        const ir = doc([
            node('list', { ordered: false }, [
                node('listItem', { escapes: { md: { task: 'unchecked' } } }, [
                    node('codeBlock', { info: '', text: 'x\n' })
                ])
            ])
        ]);
        const { losses } = irToOdt(ir);

        expect(losses).toEqual([{ code: 'list/task-marker-dropped', detail: '[ ]' }]);
    });
});

describe('oconvIrToOdt — irToOdt() — run emphasis and links (no loss)', () => {
    test('formatted run: written as a typed span, flags preserved, NO loss', () => {
        const ir = doc([
            node('paragraph', {}, [
                node('run', { text: 'bold+italic', bold: true, italic: true })
            ])
        ]);
        const { bytes, losses } = irToOdt(ir);
        const read = odt.read(bytes);

        expect(read.body[0].runs).toEqual([
            { type: 'span', value: 'bold+italic', bold: true, italic: true }
        ]);
        expect(losses).toEqual([]);
    });

    test('all four flags combined → span with bold/italic/strike/monospace, NO loss', () => {
        const ir = doc([
            node('paragraph', {}, [
                node('run', {
                    text: 'x', bold: true, italic: true, strike: true, code: true
                })
            ])
        ]);
        const { bytes, losses } = irToOdt(ir);
        const read = odt.read(bytes);

        expect(read.body[0].runs).toEqual([
            { type: 'span', value: 'x', bold: true, italic: true, strike: true, monospace: true }
        ]);
        expect(losses).toEqual([]);
    });

    test('link: written as a typed link run with href, text preserved, NO loss', () => {
        const ir = doc([
            node('paragraph', {}, [
                node('run', { text: 'site', link: 'https://example.test/' })
            ])
        ]);
        const { bytes, losses } = irToOdt(ir);
        const read = odt.read(bytes);

        expect(read.body[0].runs).toEqual([
            {
                type: 'link',
                href: 'https://example.test/',
                runs: [{ type: 'text', value: 'site' }]
            }
        ]);
        expect(losses).toEqual([]);
    });

    test('formatted link: inner run is the flags-mapped span, NO loss', () => {
        const ir = doc([
            node('paragraph', {}, [
                node('run', { text: 'bold site', bold: true, link: 'https://example.test/b' })
            ])
        ]);
        const { bytes, losses } = irToOdt(ir);
        const read = odt.read(bytes);

        expect(read.body[0].runs).toEqual([
            {
                type: 'link',
                href: 'https://example.test/b',
                runs: [{ type: 'span', value: 'bold site', bold: true }]
            }
        ]);
        expect(losses).toEqual([]);
    });
});

describe('oconvIrToOdt — irToOdt() — tables (no loss)', () => {
    test('2x2 header table: typed table with headerRows:1, cell paragraph text, NO loss', () => {
        const ir = doc([
            node('table', {}, [
                node('row', { header: true }, [cell('Key'), cell('Value')]),
                node('row', {}, [cell('profile'), cell('v1')])
            ])
        ]);
        const { bytes, losses } = irToOdt(ir);
        const read = odt.read(bytes);

        expect(read.body).toHaveLength(1);
        // BL-1794: every table now reads back `grid: true` (bordered cells
        // + margins alignment, consumed-and-dropped by `@awacloud/odf`).
        expect(read.body[0]).toEqual({
            type: 'table',
            grid: true,
            columns: [{ repeated: 2 }],
            headerRows: 1,
            rows: [
                {
                    type: 'row',
                    cells: [
                        { type: 'cell', children: [{ type: 'paragraph', runs: [{ type: 'text', value: 'Key' }] }] },
                        { type: 'cell', children: [{ type: 'paragraph', runs: [{ type: 'text', value: 'Value' }] }] }
                    ]
                },
                {
                    type: 'row',
                    cells: [
                        { type: 'cell', children: [{ type: 'paragraph', runs: [{ type: 'text', value: 'profile' }] }] },
                        { type: 'cell', children: [{ type: 'paragraph', runs: [{ type: 'text', value: 'v1' }] }] }
                    ]
                }
            ]
        });
        expect(losses).toEqual([]);
    });

    test('single-column table with no header rows: columns has one bare entry, no headerRows on read', () => {
        const ir = doc([
            node('table', {}, [
                node('row', {}, [cell('only')])
            ])
        ]);
        const { bytes, losses } = irToOdt(ir);
        const read = odt.read(bytes);

        expect(read.body[0].type).toBe('table');
        expect(read.body[0].columns).toEqual([{}]);
        expect(read.body[0].headerRows).toBeUndefined();
        expect(read.body[0].rows[0].cells[0].children)
            .toEqual([{ type: 'paragraph', runs: [{ type: 'text', value: 'only' }] }]);
        expect(losses).toEqual([]);
    });
});

describe('oconvIrToOdt — irToOdt() — exhaustive absence of the four retired loss codes', () => {
    test('a document exercising formatted runs, links, ordered lists and tables together produces NO loss', () => {
        const ir = doc([
            node('paragraph', {}, [
                node('run', { text: 'bold', bold: true }),
                node('run', { text: ' and a ' }),
                node('run', { text: 'link', link: 'https://example.test/all' })
            ]),
            node('list', { ordered: true }, [
                node('listItem', {}, [node('paragraph', {}, [node('run', { text: 'one' })])])
            ]),
            node('table', {}, [
                node('row', { header: true }, [cell('K'), cell('V')]),
                node('row', {}, [cell('a'), cell('b')])
            ])
        ]);
        const { losses } = irToOdt(ir);

        // Exhaustive — not a `some`/`toContain` check: this fixture exercises
        // every formerly-degraded construct and must produce ZERO losses,
        // proving `run/format-unwritable`, `link/target-unwritable`,
        // `list/ordered-unwritable` and `block/table-degraded` are all gone.
        expect(losses).toEqual([]);
    });
});

describe('oconvIrToOdt — irToOdt() — code blocks, quotes and rules', () => {
    test('codeBlock: one Preformatted Text paragraph per line, no loss', () => {
        const ir = doc([node('codeBlock', { info: 'js', text: 'const a = 1;\nconst b = 2;' })]);
        const { bytes, losses } = irToOdt(ir);
        const read = odt.read(bytes);

        expect(losses).toEqual([]);
        expect(read.body.map(p => p.styleName)).toEqual(['Preformatted_20_Text', 'Preformatted_20_Text']);
        expect(read.body[0].runs).toEqual([{ type: 'text', value: 'const a = 1;' }]);
        expect(read.body[1].runs).toEqual([{ type: 'text', value: 'const b = 2;' }]);
    });

    test('codeBlock: indentation and inner runs of spaces become text:s, tabs text:tab', () => {
        const ir = doc([node('codeBlock', { info: '', text: '  if (a)  b();\n\tc;\n x\n' })]);
        const { bytes } = irToOdt(ir);
        const read = odt.read(bytes);

        expect(read.body.map(p => p.runs)).toEqual([
            [{ type: 'space', count: 2 }, { type: 'text', value: 'if (a)' },
                { type: 'space', count: 2 }, { type: 'text', value: 'b();' }],
            [{ type: 'tab' }, { type: 'text', value: 'c;' }],
            [{ type: 'space', count: 1 }, { type: 'text', value: 'x' }]
        ]);
        // A single interior space stays in the text.
        expect(partText(bytes, 'content.xml')).toContain('<text:s text:c="2"/>if (a)<text:s text:c="2"/>b();');
    });

    test('codeBlock: exactly one trailing newline is dropped; interior and second empty lines kept', () => {
        const { bytes: one } = irToOdt(doc([node('codeBlock', { info: 'js', text: 'x\ny\n' })]));
        expect(odt.read(one).body).toHaveLength(2);

        const { bytes: two } = irToOdt(doc([node('codeBlock', { info: '', text: 'x\n\n' })]));
        expect(odt.read(two).body.map(p => p.runs.length)).toEqual([1, 0]);

        const { bytes: interior } = irToOdt(doc([node('codeBlock', { info: '', text: 'a\n\nb\n' })]));
        const body = odt.read(interior).body;
        expect(body.map(p => p.runs.length)).toEqual([1, 0, 1]);
        expect(body.every(p => p.styleName === 'Preformatted_20_Text')).toBe(true);
    });

    test('blockquote: its paragraphs styled Quotations, no loss', () => {
        const ir = doc([
            node('blockquote', {}, [
                node('paragraph', {}, [node('run', { text: 'quoted' })]),
                node('paragraph', {}, [node('run', { text: 'again', italic: true })])
            ])
        ]);
        const { bytes, losses } = irToOdt(ir);
        const read = odt.read(bytes);

        expect(losses).toEqual([]);
        expect(read.body.map(p => p.styleName)).toEqual(['Quotations', 'Quotations']);
        expect(read.body[0].runs).toEqual([{ type: 'text', value: 'quoted' }]);
    });

    test('blockquote: a nested quote and a non-paragraph child record their degrades', () => {
        const ir = doc([
            node('blockquote', {}, [
                node('paragraph', {}, [node('run', { text: 'outer' })]),
                node('blockquote', {}, [node('paragraph', {}, [node('run', { text: 'inner' })])]),
                node('heading', { level: 2 }, [node('run', { text: 'quoted heading' })])
            ])
        ]);
        const { bytes, losses } = irToOdt(ir);
        const read = odt.read(bytes);

        expect(losses).toEqual([
            { code: 'block/degraded', detail: 'blockquote:nested' },
            { code: 'block/degraded', detail: 'blockquote-child:heading' }
        ]);
        expect(read.body.map(b => [b.type, b.styleName]))
            .toEqual([['paragraph', 'Quotations'], ['paragraph', 'Quotations'], ['heading', 'Heading_20_2']]);
    });

    test('hr: an empty Horizontal Line paragraph between its neighbours, no loss', () => {
        const ir = doc([
            node('paragraph', {}, [node('run', { text: 'before' })]),
            node('hr'),
            node('paragraph', {}, [node('run', { text: 'after' })])
        ]);
        const { bytes, losses } = irToOdt(ir);
        const read = odt.read(bytes);

        expect(losses).toEqual([]);
        expect(read.body).toHaveLength(3);
        expect(read.body[1].styleName).toBe('Horizontal_20_Line');
        expect(read.body[1].runs).toEqual([]);
    });

    test('the three styles are defined in styles.xml, LibreOffice names and display names', () => {
        const { bytes } = irToOdt(doc([
            node('codeBlock', { info: '', text: 'x' }),
            node('blockquote', {}, [node('paragraph', {}, [node('run', { text: 'q' })])]),
            node('hr')
        ]));
        const stylesXml = partText(bytes, 'styles.xml');
        for (const [name, display] of [['Preformatted_20_Text', 'Preformatted Text'],
            ['Quotations', 'Quotations'], ['Horizontal_20_Line', 'Horizontal Line']]) {
            expect(stylesXml).toContain(`style:name="${name}" style:display-name="${display}"`);
        }
        expect(stylesXml).toContain('style:font-pitch="fixed"');
        expect(stylesXml).toContain('fo:border-bottom=');
    });

    test('block-level image: dropped, exact image/dropped loss', () => {
        const ir = doc([node('image', { name: 'logo.png', alt: 'Logo' })]);
        const { bytes, losses } = irToOdt(ir);
        const read = odt.read(bytes);

        expect(read.body).toHaveLength(0);
        expect(losses).toEqual([{ code: 'image/dropped', detail: 'logo.png' }]);
    });

    test('inline image inside a paragraph: dropped, exact image/dropped loss, text flow kept', () => {
        const ir = doc([
            node('paragraph', {}, [
                node('run', { text: 'Photo: ' }),
                node('image', { name: 'pic.png', alt: 'Pic' })
            ])
        ]);
        const { bytes, losses } = irToOdt(ir);
        const read = odt.read(bytes);

        expect(read.body[0].runs).toEqual([{ type: 'text', value: 'Photo: ' }]);
        expect(losses).toEqual([{ code: 'image/dropped', detail: 'pic.png' }]);
    });

    test('image-only paragraph: emits NO odt node, exactly one image/dropped loss', () => {
        const ir = doc([
            node('paragraph', {}, [node('image', { name: 'only.png', alt: 'Only' })])
        ]);
        const { bytes, losses } = irToOdt(ir);
        const read = odt.read(bytes);

        expect(read.body).toHaveLength(0);
        expect(losses).toEqual([{ code: 'image/dropped', detail: 'only.png' }]);
    });

    test('text + image paragraph: one paragraph, text kept, image/dropped recorded', () => {
        const ir = doc([
            node('paragraph', {}, [
                node('run', { text: 'caption' }),
                node('image', { name: 'mix.png', alt: 'Mix' })
            ])
        ]);
        const { bytes, losses } = irToOdt(ir);
        const read = odt.read(bytes);

        expect(read.body).toHaveLength(1);
        expect(read.body[0].runs).toEqual([{ type: 'text', value: 'caption' }]);
        expect(losses).toEqual([{ code: 'image/dropped', detail: 'mix.png' }]);
    });

    test('a paragraph with no children emits nothing and no loss', () => {
        const { bytes, losses } = irToOdt(doc([node('paragraph', {}, [])]));
        const read = odt.read(bytes);

        expect(read.body).toHaveLength(0);
        expect(losses).toEqual([]);
    });
});

describe('oconvIrToOdt — irToOdt() — non-vacuity and determinism', () => {
    test('loss-free fixture (headings + plain paragraphs + bullet list) → losses.length === 0', () => {
        const ir = doc([
            node('heading', { level: 1 }, [node('run', { text: 'Title' })]),
            node('paragraph', {}, [node('run', { text: 'Plain paragraph.' })]),
            node('list', { ordered: false }, [
                node('listItem', {}, [node('paragraph', {}, [node('run', { text: 'item' })])])
            ])
        ]);
        const { losses } = irToOdt(ir);
        expect(losses).toEqual([]);
    });

    // The model leg stays; the byte claim is the md -> odt leg below
    // (BL-2744: the ODF package writer stamps a fixed entry date).
    test('model determinism: two calls deep-equal on odt.read models', () => {
        const ir = doc([
            node('heading', { level: 2 }, [node('run', { text: 'Repeat' })]),
            node('paragraph', {}, [node('run', { text: 'same content twice' })]),
            node('list', { ordered: true }, [
                node('listItem', {}, [node('paragraph', {}, [node('run', { text: 'a' })])])
            ])
        ]);
        const first = irToOdt(ir);
        const second = irToOdt(ir);

        expect(odt.read(first.bytes).body).toEqual(odt.read(second.bytes).body);
        expect(first.losses).toEqual(second.losses);
    });
});

describe('oconvIrToOdt — md -> odt is byte-reproducible (BL-2744)', () => {
    // Own runtime: the md reader's manifest on top of odf's, so the leg
    // runs the facade's md -> IR -> odt path without the facade.
    const mdRuntime = new ModuleRuntime();
    for (const m of [...odfFwRequire, ...odfModules, ...mdFwRequire, ...mdModules,
                     mdFrontmatter, oconvIr, oconvMdToIr, oconvIrToOdt]) {
        mdRuntime.register(m);
    }
    const { mdToIr } = mdRuntime.resolve('oconvMdToIr');
    const { irToOdt: mdIrToOdt } = mdRuntime.resolve('oconvIrToOdt');
    const markdown = [
        '# Title', '',
        'A *plain* paragraph with a [link](https://example.org).', '',
        '- one', '- two', '',
        '| a | b |', '|---|---|', '| 1 | 2 |', ''
    ].join('\n');
    afterEach(() => { setSystemTime(); });

    test('the same Markdown converted twice with the clock moved between the runs gives identical bytes', () => {
        setSystemTime(new Date(2026, 9, 20, 9, 15, 0));
        const first = mdIrToOdt(mdToIr(markdown).ir).bytes;
        setSystemTime(new Date(2031, 2, 7, 18, 42, 10));
        const second = mdIrToOdt(mdToIr(markdown).ir).bytes;
        expect(first.length).toBeGreaterThan(0);
        expect(second).toEqual(first);
    });
});

describe('oconvIrToOdt — irToOdt() — validation', () => {
    test('throws the frozen message on an invalid ir (same shape as task 02)', () => {
        const bad = { kind: 'document', children: [{ kind: 'not-a-real-kind' }] };
        expect(validate(bad).ok).toBe(false);
        expect(() => irToOdt(bad)).toThrow(
            'oconv: invalid ir (bad-child at $.children[0])'
        );
    });
});

/* ── images: placed through odf's typed image run + Pictures/ parts ──── */

// The committed first-party 1x1 greyscale PNG and 1x1 JPEG (top-level
// await, the idiom the sibling `pdf/render/image.test.js` uses).
const PNG = new Uint8Array(await Bun.file(
    fileURLToPath(new URL('../../tests/_fixtures/corpus/assets/px.png', import.meta.url))
).arrayBuffer());
const JPG = new Uint8Array(await Bun.file(
    fileURLToPath(new URL('../../tests/_fixtures/corpus/assets/px.jpg', import.meta.url))
).arrayBuffer());
// The writer sniffs only the leading signature; these need not be decodable.
const GIF = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00, 0x3b]);
const BIN = new Uint8Array([0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08]);

/** The `Pictures/` entries of a produced `.odt`, zip order, with their bytes. */
function pictureParts(bytes) {
    const files = zipApi.unzipSync(bytes);
    return Object.keys(files)
        .filter(path => path.startsWith('Pictures/'))
        .map(path => [path, files[path]]);
}

/** Every `draw:frame` of `content.xml`, document order. */
function framesOf(bytes) {
    return descendants(xmlApi.parse(partText(bytes, 'content.xml')), 'draw:frame');
}

/** The `xlink:href` of each frame's single `draw:image`, document order. */
function frameHrefs(bytes) {
    return framesOf(bytes).map(f => {
        const images = descendants(f, 'draw:image');
        expect(images).toHaveLength(1);
        return images[0].attrs['xlink:href'];
    });
}

/**
 * A writer bound to a spy `odt`: records every `write(doc, opts)` call and
 * delegates to the real one, so the CALL SHAPE (`pictures` key present or
 * omitted) is asserted directly, not inferred from the bytes.
 */
function spiedWriter() {
    const calls = [];
    const spy = {
        write(d, o) {
            calls.push({ doc: d, opts: o });
            return odt.write(d, o);
        }
    };
    const api = oconvIrToOdt.factory(oconvIr.factory(), spy);
    return { irToOdt: api.irToOdt, calls };
}

describe('oconvIrToOdt — opts.assets: images are placed', () => {
    test('irToOdt accepts `opts` — the same signature as the docx and pdf writers', () => {
        expect(irToOdt.length).toBe(2);
        expect(() => irToOdt(doc([]), { assets: { 'a.png': PNG } })).not.toThrow();
    });

    // NON-VACUITY: the fixture's assets KEY is asserted equal to the image
    // node's own `name`, so the lookup genuinely hits.
    test('a block image with assets bytes is PLACED: Pictures/image1.png part, one frame at the image\'s own size, no loss', () => {
        const image = node('image', { name: 'logo.png', alt: 'Logo' });
        const assets = { 'logo.png': PNG };
        expect(Object.keys(assets)).toEqual([image.name]);      // non-vacuity

        const { bytes, losses } = irToOdt(doc([image]), { assets });

        expect(losses).toEqual([]);
        const parts = pictureParts(bytes);
        expect(parts.map(([path]) => path)).toEqual(['Pictures/image1.png']);
        expect(parts[0][1]).toEqual(PNG);

        const frames = framesOf(bytes);
        expect(frames).toHaveLength(1);
        // The 1 x 1 px fixture at 96 dpi: 1/96 in = 0.026 cm.
        expect(frames[0].attrs['svg:width']).toBe('0.026cm');
        expect(frames[0].attrs['svg:height']).toBe('0.026cm');
        expect(frameHrefs(bytes)).toEqual(['Pictures/image1.png']);

        // A block image becomes ONE paragraph holding the frame.
        const paras = descendants(xmlApi.parse(partText(bytes, 'content.xml')), 'text:p');
        expect(paras).toHaveLength(1);
        expect(paras[0].children.map(c => c.name)).toEqual(['draw:frame']);
        expect(odt.read(bytes).body).toHaveLength(1);
        expect(odt.read(bytes).body[0].type).toBe('paragraph');
    });

    test('an inline image with bytes is placed IN PLACE: text flow kept, frame between the two text runs', () => {
        const ir = doc([node('paragraph', {}, [
            node('run', { text: 'Photo: ' }),
            node('image', { name: 'pic.png', alt: 'Pic' }),
            node('run', { text: ' after' })
        ])]);
        const { bytes, losses } = irToOdt(ir, { assets: { 'pic.png': PNG } });

        expect(losses).toEqual([]);
        const paras = descendants(xmlApi.parse(partText(bytes, 'content.xml')), 'text:p');
        expect(paras).toHaveLength(1);
        expect(paras[0].children.map(c => (c.type === 'text' ? 'text:' + c.value : c.name)))
            .toEqual(['text:Photo: ', 'draw:frame', 'text: after']);
        expect(frameHrefs(bytes)).toEqual(['Pictures/image1.png']);
        expect(odt.read(bytes).body[0].runs).toEqual([
            { type: 'text', value: 'Photo: ' },
            { type: 'text', value: ' after' }
        ]);
    });

    test('an image-only paragraph whose image is placed now produces ONE paragraph', () => {
        const ir = doc([node('paragraph', {}, [node('image', { name: 'only.png', alt: '' })])]);
        const { bytes, losses } = irToOdt(ir, { assets: { 'only.png': PNG } });

        expect(losses).toEqual([]);
        expect(odt.read(bytes).body).toHaveLength(1);
        expect(frameHrefs(bytes)).toEqual(['Pictures/image1.png']);
    });

    test('an inline image inside a heading is placed in the heading', () => {
        const ir = doc([node('heading', { level: 2 }, [
            node('run', { text: 'Logo ' }),
            node('image', { name: 'h.png', alt: '' })
        ])]);
        const { bytes, losses } = irToOdt(ir, { assets: { 'h.png': PNG } });

        expect(losses).toEqual([]);
        const hs = descendants(xmlApi.parse(partText(bytes, 'content.xml')), 'text:h');
        expect(hs).toHaveLength(1);
        expect(descendants(hs[0], 'draw:frame')).toHaveLength(1);
    });

    test('reader-carried bytes (escapes.docx.bytes) place too', () => {
        const image = node('image', { name: 'carried.gif', alt: '' });
        image.escapes = { docx: { bytes: GIF, contentType: 'image/gif' } };
        const { bytes, losses } = irToOdt(doc([image]));

        expect(losses).toEqual([]);
        const parts = pictureParts(bytes);
        expect(parts.map(([path]) => path)).toEqual(['Pictures/image1.gif']);
        expect(parts[0][1]).toEqual(GIF);
    });

    test('caller assets WIN over reader-carried bytes (same precedence as the docx writer)', () => {
        const image = node('image', { name: 'both', alt: '' });
        image.escapes = { docx: { bytes: GIF, contentType: 'image/gif' } };
        const { bytes, losses } = irToOdt(doc([image]), { assets: { both: PNG } });

        expect(losses).toEqual([]);
        const parts = pictureParts(bytes);
        expect(parts.map(([path]) => path)).toEqual(['Pictures/image1.png']);
        expect(parts[0][1]).toEqual(PNG);
    });

    test('the same name twice → ONE part written once, TWO frames; the first occurrence\'s bytes win', () => {
        const first = node('image', { name: 'dup', alt: '' });
        first.escapes = { docx: { bytes: PNG, contentType: 'image/png' } };
        const second = node('image', { name: 'dup', alt: '' });
        second.escapes = { docx: { bytes: GIF, contentType: 'image/gif' } };
        const { bytes, losses } = irToOdt(doc([first, second]));

        expect(losses).toEqual([]);
        const parts = pictureParts(bytes);
        expect(parts.map(([path]) => path)).toEqual(['Pictures/image1.png']);
        expect(parts[0][1]).toEqual(PNG);
        expect(frameHrefs(bytes)).toEqual(['Pictures/image1.png', 'Pictures/image1.png']);
    });

    test('distinct names → image1, image2 in order of FIRST occurrence (never derived from the name)', () => {
        const ir = doc([
            node('paragraph', {}, [node('image', { name: 'Grafik 1', alt: '' })]),
            node('paragraph', {}, [node('image', { name: 'a/b c.png', alt: '' })]),
            node('paragraph', {}, [node('image', { name: 'Grafik 1', alt: '' })])
        ]);
        const { bytes, losses } = irToOdt(ir, { assets: { 'Grafik 1': PNG, 'a/b c.png': JPG } });

        expect(losses).toEqual([]);
        expect(pictureParts(bytes).map(([path]) => path))
            .toEqual(['Pictures/image1.png', 'Pictures/image2.jpg']);
        expect(frameHrefs(bytes))
            .toEqual(['Pictures/image1.png', 'Pictures/image2.jpg', 'Pictures/image1.png']);
    });

    test('extension sniff from the leading bytes: png / jpg / gif / anything else → bin', () => {
        const NEAR_PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x00, 0x00, 0x00, 0x00]);
        const SHORT = new Uint8Array([0xff, 0xd8]);
        const NEAR_GIF = new Uint8Array([0x47, 0x49, 0x46, 0x37]);
        const assets = { p: PNG, j: JPG, g: GIF, u: BIN, np: NEAR_PNG, s: SHORT, ng: NEAR_GIF, e: new Uint8Array(0) };
        const ir = doc(Object.keys(assets).map(name => node('image', { name, alt: '' })));
        const { bytes, losses } = irToOdt(ir, { assets });

        // The three readable headers are sized; the five others keep the
        // default box and record it.
        expect(losses.map(l => l.detail)).toEqual(['u', 'np', 's', 'ng', 'e']);
        expect(losses.every(l => l.code === 'image/size-defaulted')).toBe(true);
        const parts = pictureParts(bytes);
        expect(parts.map(([path]) => path)).toEqual([
            'Pictures/image1.png', 'Pictures/image2.jpg', 'Pictures/image3.gif',
            'Pictures/image4.bin', 'Pictures/image5.bin', 'Pictures/image6.bin',
            'Pictures/image7.bin', 'Pictures/image8.bin'
        ]);
        expect(parts.map(([, b]) => b)).toEqual(Object.values(assets));
    });

    test('no bytes anywhere → the unchanged image/dropped, no Pictures/ entry, `pictures` NOT passed', () => {
        const { irToOdt: spied, calls } = spiedWriter();
        const ir = doc([
            node('paragraph', {}, [node('run', { text: 'x ' }), node('image', { name: 'x.png', alt: '' })])
        ]);
        const { bytes, losses } = spied(ir, { assets: { 'other.png': PNG } });

        expect(losses).toEqual([{ code: 'image/dropped', detail: 'x.png' }]);
        expect(pictureParts(bytes)).toEqual([]);
        expect(framesOf(bytes)).toEqual([]);
        expect(calls).toHaveLength(1);
        expect(Object.keys(calls[0].doc)).toEqual(['body']);
    });

    test('a placed image passes `pictures` (path → bytes, first-occurrence order) beside `body`', () => {
        const { irToOdt: spied, calls } = spiedWriter();
        const ir = doc([
            node('image', { name: 'b', alt: '' }),
            node('image', { name: 'a', alt: '' })
        ]);
        spied(ir, { assets: { a: JPG, b: PNG } });

        expect(calls).toHaveLength(1);
        expect(Object.keys(calls[0].doc)).toEqual(['body', 'pictures']);
        expect(Object.keys(calls[0].doc.pictures)).toEqual(['Pictures/image1.png', 'Pictures/image2.jpg']);
        expect(calls[0].doc.pictures['Pictures/image1.png']).toBe(PNG);
        expect(calls[0].doc.body[0]).toEqual({
            type: 'paragraph',
            runs: [{
                type: 'frame', anchorType: 'as-char', width: '0.026cm', height: '0.026cm',
                child: { kind: 'image', href: 'Pictures/image1.png' }
            }]
        });
    });

    test('a paragraph whose images are ALL dropped keeps the zero-node rule (one placed, one dropped elsewhere)', () => {
        const ir = doc([
            node('paragraph', {}, [node('image', { name: 'gone.png', alt: '' })]),
            node('paragraph', {}, [node('image', { name: 'kept.png', alt: '' })])
        ]);
        const { bytes, losses } = irToOdt(ir, { assets: { 'kept.png': PNG } });

        expect(losses).toEqual([{ code: 'image/dropped', detail: 'gone.png' }]);
        expect(odt.read(bytes).body).toHaveLength(1);
        expect(frameHrefs(bytes)).toEqual(['Pictures/image1.png']);
    });

    test('an image nested in a table cell and in a list item is placed too — `assets` reaches every path', () => {
        const ir = doc([
            node('table', {}, [node('row', {}, [
                node('cell', {}, [node('paragraph', {}, [
                    node('image', { name: 'in-cell.png', alt: '' })
                ])])
            ])]),
            node('list', { ordered: false }, [
                node('listItem', {}, [node('paragraph', {}, [
                    node('image', { name: 'in-item.png', alt: '' })
                ])])
            ])
        ]);
        const { bytes, losses } = irToOdt(ir, {
            assets: { 'in-cell.png': PNG, 'in-item.png': JPG }
        });
        expect(losses).toEqual([]);
        const content = xmlApi.parse(partText(bytes, 'content.xml'));
        const cells = descendants(content, 'table:table-cell');
        expect(cells).toHaveLength(1);
        expect(descendants(cells[0], 'draw:frame')).toHaveLength(1);
        const items = descendants(content, 'text:list-item');
        expect(items).toHaveLength(1);
        expect(descendants(items[0], 'draw:frame')).toHaveLength(1);
        expect(frameHrefs(bytes)).toEqual(['Pictures/image1.png', 'Pictures/image2.jpg']);
    });
});

/* ── presentation — BL-1794 ──────────────────────────────────────────── */

/** Text of one named part of the produced `.odt`. */
function partText(bytes, name) {
    return new TextDecoder().decode(zipApi.unzipSync(bytes)[name]);
}

/** Every descendant element of `root` named `name`, document order. */
function descendants(root, name, out = []) {
    for (const c of (root && root.children) || []) {
        if (c && c.type === 'element') {
            if (c.name === name) out.push(c);
            descendants(c, name, out);
        }
    }
    return out;
}

const STYLE_NAMES = [
    'Standard', 'Text_20_body', 'Heading',
    'Heading_20_1', 'Heading_20_2', 'Heading_20_3',
    'Heading_20_4', 'Heading_20_5', 'Heading_20_6',
    'Preformatted_20_Text', 'Quotations', 'Horizontal_20_Line'
];

/** Headings 1..6, one paragraph and a 2x2 header table. */
function presentableIr() {
    const blocks = [];
    for (let level = 1; level <= 6; level++) {
        blocks.push(node('heading', { level }, [node('run', { text: 'H' + level })]));
    }
    blocks.push(node('paragraph', {}, [node('run', { text: 'body' })]));
    blocks.push(node('table', {}, [
        node('row', { header: true }, [cell('a'), cell('b')]),
        node('row', {}, [cell('c'), cell('d')])
    ]));
    return doc(blocks);
}

describe('oconvIrToOdt — presentation (BL-1794)', () => {
    test('styles.xml carries the 12 fixed named styles, in order', () => {
        const { bytes } = irToOdt(presentableIr());
        const parsed = odfStyles.parse(partText(bytes, 'styles.xml'));
        expect(parsed.styles.map(e => e.attrs['style:name'])).toEqual(STYLE_NAMES);
        for (const e of parsed.styles) expect(e.name).toBe('style:style');
        expect(parsed.automaticStyles).toEqual([]);
        expect(parsed.masterStyles).toEqual([]);
    });

    test('each heading style is named, parented, chained and carries its outline level and size', () => {
        const { bytes } = irToOdt(presentableIr());
        const styles = odfStyles.parse(partText(bytes, 'styles.xml')).styles;
        const byName = Object.fromEntries(styles.map(e => [e.attrs['style:name'], e]));
        const sizes = ['16pt', '14pt', '13pt', '12pt', '11pt', '11pt'];
        for (let level = 1; level <= 6; level++) {
            const e = byName['Heading_20_' + level];
            expect(e.attrs['style:display-name']).toBe('Heading ' + level);
            expect(e.attrs['style:family']).toBe('paragraph');
            expect(e.attrs['style:parent-style-name']).toBe('Heading');
            expect(e.attrs['style:next-style-name']).toBe('Text_20_body');
            expect(e.attrs['style:default-outline-level']).toBe(String(level));
            const text = descendants(e, 'style:text-properties');
            expect(text).toHaveLength(1);
            expect(text[0].attrs).toEqual({ 'fo:font-size': sizes[level - 1], 'fo:font-weight': 'bold' });
        }
        // The two base styles of the chain are what the headings point at.
        expect(byName.Standard.attrs['style:parent-style-name']).toBeUndefined();
        expect(byName.Text_20_body.attrs['style:parent-style-name']).toBe('Standard');
        expect(byName.Text_20_body.attrs['style:display-name']).toBe('Text body');
        expect(byName.Heading.attrs['style:parent-style-name']).toBe('Standard');
        expect(byName.Heading.attrs['style:next-style-name']).toBe('Text_20_body');
        const hp = descendants(byName.Heading, 'style:paragraph-properties')[0];
        expect(hp.attrs).toEqual({
            'fo:margin-top': '0.423cm',
            'fo:margin-bottom': '0.141cm',
            'fo:keep-with-next': 'always'
        });
    });

    test('a document with NO heading (and one with no block at all) still emits the 12 styles', () => {
        for (const ir of [
            doc([node('paragraph', {}, [node('run', { text: 'plain' })])]),
            doc([])
        ]) {
            const { bytes } = irToOdt(ir);
            const names = odfStyles.parse(partText(bytes, 'styles.xml')).styles
                .map(e => e.attrs['style:name']);
            expect(names).toEqual(STYLE_NAMES);
        }
    });

    test('content.xml: every text:h names Heading_20_<outline-level>', () => {
        const { bytes } = irToOdt(presentableIr());
        const content = xmlApi.parse(partText(bytes, 'content.xml'));
        const hs = descendants(content, 'text:h');
        expect(hs).toHaveLength(6);
        expect(hs.map(h => h.attrs['text:outline-level'])).toEqual(['1', '2', '3', '4', '5', '6']);
        for (const h of hs) {
            expect(h.attrs['text:style-name']).toBe('Heading_20_' + h.attrs['text:outline-level']);
        }
    });

    test('a 2x2 table: 4 bordered cells and a margins-aligned table (synthesised by odf)', () => {
        const { bytes } = irToOdt(presentableIr());
        const content = xmlApi.parse(partText(bytes, 'content.xml'));
        const auto = new Map(descendants(content, 'style:style')
            .map(e => [e.attrs['style:name'], e]));

        const cells = descendants(content, 'table:table-cell');
        expect(cells).toHaveLength(4);
        for (const c of cells) {
            const style = auto.get(c.attrs['table:style-name']);
            expect(style).toBeDefined();
            const props = descendants(style, 'style:table-cell-properties');
            expect(props).toHaveLength(1);
            expect(typeof props[0].attrs['fo:border']).toBe('string');
            expect(props[0].attrs['fo:border']).not.toBe('none');
            expect(props[0].attrs['fo:border']).toContain('solid');
        }

        const tables = descendants(content, 'table:table');
        expect(tables).toHaveLength(1);
        const tstyle = auto.get(tables[0].attrs['table:style-name']);
        expect(tstyle).toBeDefined();
        expect(descendants(tstyle, 'style:table-properties')[0].attrs['table:align']).toBe('margins');
    });

    test('odt.read: headings carry styleName, tables grid:true, cells no styleName, no leftover autoStyles', () => {
        const { bytes, losses } = irToOdt(presentableIr());
        const read = odt.read(bytes);
        expect(losses).toEqual([]);

        const headings = read.body.filter(b => b.type === 'heading');
        expect(headings.map(h => h.styleName))
            .toEqual(['Heading_20_1', 'Heading_20_2', 'Heading_20_3', 'Heading_20_4', 'Heading_20_5', 'Heading_20_6']);
        expect(headings.map(h => h.outlineLevel)).toEqual([1, 2, 3, 4, 5, 6]);

        const table = read.body.find(b => b.type === 'table');
        expect(table.grid).toBe(true);
        for (const row of table.rows) {
            for (const c of row.cells) {
                expect(c.styleName).toBeUndefined();
                expect(c.cellStyle).toBeUndefined();
            }
        }
        expect(table.styleName).toBeUndefined();
        // The synthesised styles were consumed-and-dropped: nothing leaks
        // into the model's raw leftover bag.
        expect(read.autoStyles).toBeUndefined();
    });

    test('a table with no header rows is also a grid table', () => {
        const ir = doc([node('table', {}, [node('row', {}, [cell('only')])])]);
        const read = odt.read(irToOdt(ir).bytes);
        expect(read.body[0].grid).toBe(true);
        expect(read.body[0].headerRows).toBeUndefined();
    });

    test('determinism: content.xml and styles.xml are byte-identical across two writes', () => {
        const a = irToOdt(presentableIr()).bytes;
        const b = irToOdt(presentableIr()).bytes;
        for (const part of ['content.xml', 'styles.xml']) {
            expect(partText(a, part)).toBe(partText(b, part));
        }
        // Non-vacuity: the compared parts are the presentation-bearing ones.
        expect(partText(a, 'styles.xml')).toContain('Heading_20_6');
        expect(partText(a, 'content.xml')).toContain('awa-c-b');
    });
});

/* ── images: intrinsic size and alt text ─────────────────────────────── */

const be32 = v => [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255];

/** A header-only PNG: signature, IHDR (`w` × `h`), IEND; zero CRCs. */
function pngHeader(w, h) {
    const chunk = (type, data) =>
        [...be32(data.length), ...[...type].map(c => c.charCodeAt(0)), ...data, 0, 0, 0, 0];
    return new Uint8Array([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
        ...chunk('IHDR', [...be32(w), ...be32(h), 8, 2, 0, 0, 0]),
        ...chunk('IEND', [])
    ]);
}

describe('oconvIrToOdt — image intrinsic size and alt text', () => {
    test('a readable header sets the frame size (96 dpi default), no loss', () => {
        // 192 × 96 px at 96 dpi = 2 in × 1 in = 5.08 cm × 2.54 cm.
        const { bytes, losses } = irToOdt(doc([node('image', { name: 'a', alt: '' })]),
            { assets: { a: pngHeader(192, 96) } });

        expect(losses).toEqual([]);
        const frames = framesOf(bytes);
        expect(frames).toHaveLength(1);
        expect(frames[0].attrs['svg:width']).toBe('5.080cm');
        expect(frames[0].attrs['svg:height']).toBe('2.540cm');
    });

    test('wider than 6 in: scaled to 6 in (15.24 cm), aspect kept', () => {
        const { bytes } = irToOdt(doc([node('image', { name: 'w', alt: '' })]),
            { assets: { w: pngHeader(1152, 192) } });
        const [frame] = framesOf(bytes);
        expect([frame.attrs['svg:width'], frame.attrs['svg:height']]).toEqual(['15.240cm', '2.540cm']);
    });

    test('an unreadable header keeps the default 5.08 cm × 3.81 cm frame and image/size-defaulted', () => {
        const { bytes, losses } = irToOdt(doc([node('image', { name: 'b', alt: '' })]),
            { assets: { b: BIN } });

        expect(losses).toEqual([{ code: 'image/size-defaulted', detail: 'b' }]);
        const [frame] = framesOf(bytes);
        expect([frame.attrs['svg:width'], frame.attrs['svg:height']]).toEqual(['5.08cm', '3.81cm']);
    });

    test('alt text → an svg:title after the draw:image; none when alt is empty', () => {
        const ir = doc([node('paragraph', {}, [
            node('image', { name: 'p', alt: 'A diagram' }),
            node('run', { text: ' and ' }),
            node('image', { name: 'q', alt: '' })
        ])]);
        const { bytes, losses } = irToOdt(ir, { assets: { p: pngHeader(96, 96), q: pngHeader(96, 96) } });

        expect(losses).toEqual([]);
        const frames = framesOf(bytes);
        expect(frames.map(f => f.children.map(c => c.name))).toEqual([
            ['draw:image', 'svg:title'],
            ['draw:image']
        ]);
        expect(descendants(frames[0], 'svg:title')[0].children[0].value).toBe('A diagram');
        // The frame stays an as-char frame in its paragraph, between the runs.
        const [para] = descendants(xmlApi.parse(partText(bytes, 'content.xml')), 'text:p');
        expect(para.children.map(c => (c.type === 'text' ? 'text:' + c.value : c.name)))
            .toEqual(['draw:frame', 'text: and ', 'draw:frame']);
        expect(frames[0].attrs['text:anchor-type']).toBe('as-char');
    });
});
