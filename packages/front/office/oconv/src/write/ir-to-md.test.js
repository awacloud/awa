// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { fw_require as mdFwRequire, modules as mdModules } from '@awacloud/md';
import { oconvIr } from '../ir/ir.js';
import { anchorIndex } from './anchors.js';
import { oconvIrToMd } from './ir-to-md.js';

// One runtime for the whole file: @awacloud/md's own manifest (fw_require +
// modules) provides `md` and `mdNode`; `oconvIr` provides the pivot.
const runtime = new ModuleRuntime();
for (const m of mdFwRequire) runtime.register(m);
for (const m of mdModules) runtime.register(m);
runtime.register(oconvIr);
runtime.register(oconvIrToMd);

const { irToMd } = runtime.resolve('oconvIrToMd');
const md = runtime.resolve('md');
const { Node } = runtime.resolve('mdNode');
const { node, doc } = oconvIr.factory();

/** Fixed provenance — `convertedAt` is caller-injected, never a clock read. */
const META = {
    sourceFormat: 'docx',
    sourceName: 'report.docx',
    sourceBytes: 1556,
    sourceSha256: '7be541047cdb2255188fdf68ed6ddc98c47ed22332093df494dcb3f5c7f60b7c',
    convertedAt: '2026-07-20T00:00:00Z',
    converter: 'oconv',
    converterVersion: '1.0.0',
    engine: 'bun'
};

/** `cell` holding a single text paragraph. */
function cell(text) {
    return node('cell', {}, [node('paragraph', {}, [node('run', { text })])]);
}

/** An IR document exercising every frozen node kind. */
function fullTree() {
    return doc([
        node('heading', { level: 1 }, [node('run', { text: 'Sovereign RAG ingestion' })]),
        node('paragraph', {}, [
            node('run', { text: 'plain ' }),
            node('run', { text: 'bold', bold: true }),
            node('run', { text: ' ' }),
            node('run', { text: 'em', italic: true }),
            node('run', { text: ' ' }),
            node('run', { text: 'gone', strike: true }),
            node('run', { text: ' ' }),
            node('run', { text: 'x()', code: true }),
            node('run', { text: ' ' }),
            node('run', { text: 'site', link: 'https://example.test/' })
        ]),
        node('heading', { level: 2 }, [node('run', { text: 'Why air-gap matters' })]),
        node('list', { ordered: true }, [
            node('listItem', {}, [node('paragraph', {}, [node('run', { text: 'first' })])]),
            node('listItem', {}, [
                node('paragraph', {}, [node('run', { text: 'second' })]),
                node('list', { ordered: false }, [
                    node('listItem', {}, [node('paragraph', {}, [node('run', { text: 'nested' })])])
                ])
            ])
        ]),
        node('table', {}, [
            node('row', { header: true }, [cell('Key'), cell('Value')]),
            node('row', {}, [cell('profile'), cell('v1')])
        ]),
        node('codeBlock', { info: 'js', text: 'const a = 1;\n' }),
        node('blockquote', {}, [node('paragraph', {}, [node('run', { text: 'quoted' })])]),
        node('hr'),
        node('image', { name: 'logo.png', alt: 'Logo' })
    ]);
}

/**
 * The frozen profile-v1 rendering of {@link fullTree}: front matter in the
 * §Axis 2 key order, then the CommonMark/GFM body produced by
 * `md.renderMarkdown`.
 */
const GOLDEN = [
    '---',
    'profile: v1',
    'ir: oconv-ir/v1',
    'sourceFormat: docx',
    'sourceName: report.docx',
    'sourceBytes: 1556',
    'sourceSha256: 7be541047cdb2255188fdf68ed6ddc98c47ed22332093df494dcb3f5c7f60b7c',
    'convertedAt: 2026-07-20T00:00:00Z',
    'converter: oconv',
    'converterVersion: 1.0.0',
    'engine: bun',
    'blocks: 9',
    'anchors:',
    '  - { level: 1, anchor: sovereign-rag-ingestion }',
    '  - { level: 2, anchor: why-air-gap-matters }',
    'lossy: false',
    'assets:',
    '  - { kind: image, name: logo.png }',
    '---',
    '# Sovereign RAG ingestion',
    '',
    'plain **bold** *em* ~~gone~~ `x()` [site](https://example.test/)',
    '',
    '## Why air-gap matters',
    '',
    '1. first',
    '2. second',
    '   - nested',
    '',
    '| Key | Value |',
    '| --- | --- |',
    '| profile | v1 |',
    '',
    '```js',
    'const a = 1;',
    '```',
    '',
    '> quoted',
    '>',
    '---',
    '',
    '![Logo](logo.png)',
    ''
].join('\n');

describe('oconvIrToMd — descriptor', () => {
    test('is the prescribed fw module descriptor', () => {
        expect(oconvIrToMd.name).toBe('oconvIrToMd');
        expect(oconvIrToMd.dependencies).toEqual(['oconvIr', 'md', 'mdNode']);
        expect(typeof oconvIrToMd.factory).toBe('function');
    });

    test('exposes exactly `irToMd`', () => {
        expect(Object.keys(runtime.resolve('oconvIrToMd'))).toEqual(['irToMd']);
    });

    test('does no disk I/O and imports only pure module descriptors', () => {
        const src = readFileSync(fileURLToPath(new URL('./ir-to-md.js', import.meta.url)), 'utf8');
        // Worker-safe: no filesystem, no network, no host globals.
        expect(src).not.toMatch(/node:fs|readFile|writeFile|fetch\(|Bun\./);
        // Never a runtime `import()` — the graph is fully static.
        expect(src).not.toMatch(/import\s*\(/);
        // W3 clause (vi): `fw-codegen deps` adds STATIC imports of the module
        // descriptors this writer depends on, referenced only by the inert
        // `deps:` field (never read by ModuleRuntime.resolve). Every static
        // import must be one of those pure, side-effect-free descriptor
        // specifiers — nothing else.
        const specifiers = [...src.matchAll(/^import\b[^;]*?from\s+['"]([^'"]+)['"]/gm)]
            .map((m) => m[1]);
        expect(specifiers).toEqual(['../ir/ir.js', '@awacloud/md', '@awacloud/md']);
    });
});

describe('oconvIrToMd — golden document (profile v1)', () => {
    test('renders every node kind to the exact expected markdown', () => {
        expect(irToMd(fullTree(), META).markdown).toBe(GOLDEN);
    });

    test('is byte-reproducible across two calls with a fixed convertedAt', () => {
        const a = irToMd(fullTree(), META).markdown;
        const b = irToMd(fullTree(), META).markdown;
        expect(b).toBe(a);
    });

    test('reports the top-level block count and the frozen versions', () => {
        const { markdown } = irToMd(fullTree(), META);
        expect(markdown).toContain('\nprofile: v1\n');
        expect(markdown).toContain('\nir: oconv-ir/v1\n');
        expect(markdown).toContain('\nblocks: 9\n');
    });
});

describe('oconvIrToMd — anchors', () => {
    test('emits the anchors block in document order, with collision suffixes', () => {
        const ir = doc([
            node('heading', { level: 1 }, [node('run', { text: 'Étude' })]),
            node('heading', { level: 2 }, [node('run', { text: 'Etude' })]),
            node('heading', { level: 3 }, [node('run', { text: 'Déjà vu' })])
        ]);
        const { markdown, anchors } = irToMd(ir, META);
        expect(anchors).toEqual([
            { level: 1, anchor: 'etude' },
            { level: 2, anchor: 'etude-1' },
            { level: 3, anchor: 'deja-vu' }
        ]);
        expect(markdown).toContain([
            'anchors:',
            '  - { level: 1, anchor: etude }',
            '  - { level: 2, anchor: etude-1 }',
            '  - { level: 3, anchor: deja-vu }'
        ].join('\n'));
    });

    test('agrees with anchors.js — the two copies never drift', () => {
        const ir = fullTree();
        expect(irToMd(ir, META).anchors).toEqual(anchorIndex(ir));
    });

    test('agrees with anchors.js on headings nested in every container', () => {
        // The containers where the two traversals could diverge: a cell
        // renders inline-only, so a heading there is NOT addressable and
        // neither side may index it; blockquote/listItem headings are.
        const ir = doc([
            node('heading', { level: 1 }, [node('run', { text: 'Top' })]),
            node('blockquote', {}, [
                node('heading', { level: 2 }, [node('run', { text: 'Quoted' })])
            ]),
            node('list', { ordered: false }, [
                node('listItem', {}, [
                    node('heading', { level: 3 }, [node('run', { text: 'In a list' })])
                ])
            ]),
            node('table', {}, [
                node('row', { header: true }, [
                    node('cell', {}, [
                        node('heading', { level: 4 }, [node('run', { text: 'In a cell' })])
                    ])
                ])
            ])
        ]);
        const { anchors, markdown } = irToMd(ir, META);
        expect(anchors.map(a => a.anchor)).toEqual(['top', 'quoted', 'in-a-list']);
        expect(anchors).toEqual(anchorIndex(ir));
        // The cell heading survives as cell TEXT, just not as an anchor.
        expect(markdown).toContain('| In a cell |');
    });

    test('omits the anchors block when the document has no heading', () => {
        const { markdown, anchors } = irToMd(doc([node('hr')]), META);
        expect(anchors).toEqual([]);
        expect(markdown).not.toContain('anchors:');
    });
});

describe('oconvIrToMd — loss ledger', () => {
    test('lossy: false and no losses key on a clean conversion', () => {
        const { markdown, lossy, losses } = irToMd(fullTree(), META);
        expect(lossy).toBe(false);
        expect(losses).toEqual([]);
        expect(markdown).toContain('\nlossy: false\n');
        expect(markdown).not.toContain('losses:');
    });

    test('merges reader losses ahead of writer losses and serialises them', () => {
        const ir = doc([
            node('paragraph', {}, [node('run', { text: 'kept' })]),
            // Not a v1 kind — the factory refuses to build one, so the test
            // supplies the raw shape a future/foreign producer would emit.
            { kind: 'footnote', children: [] }
        ]);
        const meta = {
            ...META,
            losses: [{ code: 'style/dropped', detail: 'Heading 7' }]
        };
        const { markdown, lossy, losses } = irToMd(ir, meta);
        expect(lossy).toBe(true);
        expect(losses).toEqual([
            { code: 'style/dropped', detail: 'Heading 7' },
            { code: 'block/dropped', detail: 'footnote' }
        ]);
        expect(markdown).toContain([
            'lossy: true',
            'losses:',
            '  - { code: style/dropped, detail: "Heading 7" }',
            '  - { code: block/dropped, detail: footnote }'
        ].join('\n'));
        // The body still renders everything markdown CAN express.
        expect(markdown).toContain('kept\n');
    });

    test('records link/target-missing when a run is a link with no target', () => {
        const ir = doc([
            node('paragraph', {}, [node('run', { text: 'orphan', link: '' })])
        ]);
        const { lossy, losses, markdown } = irToMd(ir, META);
        expect(lossy).toBe(true);
        expect(losses).toEqual([{ code: 'link/target-missing', detail: 'orphan' }]);
        expect(markdown).toContain('orphan\n');
        expect(markdown).not.toContain('[orphan]');
    });

    test('records a loss for block content a GFM cell cannot hold', () => {
        const ir = doc([
            node('table', {}, [
                node('row', { header: true }, [
                    node('cell', {}, [
                        node('paragraph', {}, [node('run', { text: 'Key' })]),
                        node('hr')
                    ])
                ])
            ])
        ]);
        const { losses } = irToMd(ir, META);
        expect(losses).toEqual([{ code: 'block/dropped', detail: 'table cell hr' }]);
    });
});

describe('oconvIrToMd — GFM tables', () => {
    test('table body matches an equivalent hand-built md AST rendering', () => {
        const ir = doc([
            node('table', {}, [
                node('row', { header: true }, [cell('Key'), cell('Value')]),
                node('row', {}, [cell('profile'), cell('v1')])
            ])
        ]);

        // The same table, built directly against the public mdNode API and
        // serialised by the public renderer — the writer must produce this.
        const expectedDoc = new Node('document');
        const table = new Node('table');
        table.align = [null, null];
        const rows = [['Key', 'Value'], ['profile', 'v1']];
        rows.forEach((cells, i) => {
            const tr = new Node('table_row');
            tr.isHeader = i === 0;
            for (const text of cells) {
                const tc = new Node('table_cell');
                tc.isHeader = tr.isHeader;
                const t = new Node('text');
                t.literal = text;
                tc.appendChild(t);
                tr.appendChild(tc);
            }
            table.appendChild(tr);
        });
        expectedDoc.appendChild(table);

        const { markdown } = irToMd(ir, META);
        expect(markdown).toContain(md.renderMarkdown(expectedDoc));
    });
});

describe('oconvIrToMd — assets', () => {
    test('collects image references, deduplicated, in document order', () => {
        const ir = doc([
            node('image', { name: 'logo.png', alt: 'Logo' }),
            node('paragraph', {}, [
                node('run', { text: 'see ' }),
                node('image', { name: 'chart.svg', alt: 'Chart' }),
                node('image', { name: 'logo.png', alt: 'Logo again' })
            ])
        ]);
        const { markdown, assets } = irToMd(ir, META);
        expect(assets).toEqual([
            { kind: 'image', name: 'logo.png' },
            { kind: 'image', name: 'chart.svg' }
        ]);
        expect(markdown).toContain([
            'assets:',
            '  - { kind: image, name: logo.png }',
            '  - { kind: image, name: chart.svg }'
        ].join('\n'));
        expect(markdown).toContain('![Logo](logo.png)');
    });

    test('passes reader-stored bytes (escapes.docx.bytes) through by reference, never in the YAML', () => {
        const bytes = new Uint8Array([1, 2, 3]);
        const ir = doc([
            node('image', {
                name: 'logo.png', alt: '',
                escapes: { docx: { bytes, contentType: 'image/png' } }
            })
        ]);
        const { markdown, assets } = irToMd(ir, META);
        expect(assets).toHaveLength(1);
        expect(assets[0].bytes).toBe(bytes);
        expect(markdown).toContain('  - { kind: image, name: logo.png }');
        expect(markdown).not.toContain('bytes');
    });

    test('ignores a flat escapes.bytes — the reader shape is the only one read', () => {
        const bytes = new Uint8Array([1, 2, 3]);
        const ir = doc([
            node('image', { name: 'logo.png', alt: '', escapes: { bytes } })
        ]);
        const { assets } = irToMd(ir, META);
        expect(assets).toHaveLength(1);
        expect(assets[0].bytes).toBeUndefined();
    });

    test('omits the assets block when the document references no image', () => {
        const { markdown, assets } = irToMd(doc([node('hr')]), META);
        expect(assets).toEqual([]);
        expect(markdown).not.toContain('assets:');
    });
});

describe('oconvIrToMd — provenance front matter', () => {
    test('emits the profile v1 keys in the frozen order', () => {
        const { markdown } = irToMd(doc([node('hr')]), META);
        const keys = markdown.split('---\n')[1].split('\n')
            .filter(Boolean).map(l => l.split(':')[0]);
        expect(keys).toEqual([
            'profile', 'ir', 'sourceFormat', 'sourceName', 'sourceBytes',
            'sourceSha256', 'convertedAt', 'converter', 'converterVersion',
            'engine', 'blocks', 'lossy'
        ]);
    });

    test('quotes scalars that are not bare-YAML safe', () => {
        const { markdown } = irToMd(doc([]), { ...META, sourceName: 'my report.docx' });
        expect(markdown).toContain('sourceName: "my report.docx"\n');
    });

    test('omits a provenance key the caller did not supply', () => {
        const { markdown } = irToMd(doc([]), { sourceFormat: 'odt' });
        expect(markdown).toContain('sourceFormat: odt\n');
        expect(markdown).not.toContain('sourceSha256');
    });
});
