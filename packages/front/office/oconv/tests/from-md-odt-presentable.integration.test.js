// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * md->odt presentable-output guard — BL-1794, office/BATCH_48 task 03.
 * Mirrors `from-md-docx-presentable.integration.test.js` (BL-1766) and is
 * fed by the SAME committed fixture (`_fixtures/md/presentable-report.md`).
 *
 * Drives the PUBLIC facade (`oconv.fromMd({ markdown, target: 'odt' })`,
 * composed from `src/main.js`) on a business-shaped markdown document —
 * headings 1-3, bold/italic prose, one bullet list, three pipe tables —
 * and asserts the container is presentable by construction: a
 * `styles.xml` defining the nine named paragraph styles every heading
 * references, every table cell bordered, every table margins-aligned, and
 * list levels carrying the label-alignment geometry with no bullet font.
 *
 * Oracle: the ODF package parts (zip entry names via fw `zip.unzipSync`,
 * `styles.xml` via `odfStyles.parse`, `content.xml` via fw `xml.parse`, the
 * typed model via `odt.read`). Rendering in LibreOffice is NOT reachable
 * from a test — the owner opens `tools/review-artefacts.mjs` output at
 * review time.
 */
import { readFileSync } from 'node:fs';
import { describe, test, expect } from 'bun:test';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { fw_require, modules } from '../src/main.js';

const runtime = new ModuleRuntime();
runtime.registerAll(fw_require);
runtime.registerAll(modules);
const oconv = runtime.resolve('oconv');
const odtApi = runtime.resolve('odt');
const odfStyles = runtime.resolve('odfStyles');
const zipApi = runtime.resolve('zip');
const xmlApi = runtime.resolve('xml');

/** The one committed business-shaped fixture, resolved from `import.meta.url`. */
const FIXTURE = readFileSync(
    new URL('./_fixtures/md/presentable-report.md', import.meta.url), 'utf8');

const STYLE_NAMES = [
    'Standard', 'Text_20_body', 'Heading',
    'Heading_20_1', 'Heading_20_2', 'Heading_20_3',
    'Heading_20_4', 'Heading_20_5', 'Heading_20_6'
];

/** Text of one named part of the produced `.odt`. */
const partText = (bytes, name) => new TextDecoder().decode(zipApi.unzipSync(bytes)[name]);

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

describe('fromMd odt — presentable output (BL-1794)', () => {
    test('styles part, named heading styles, bordered tables, list geometry, empty ledger', async () => {
        const { bytes, losses } = await oconv.fromMd({ markdown: FIXTURE, target: 'odt' });

        // The ODF package parts, including `styles.xml`.
        const entries = Object.keys(zipApi.unzipSync(bytes));
        for (const part of ['mimetype', 'META-INF/manifest.xml', 'content.xml', 'styles.xml']) {
            expect(entries).toContain(part);
        }

        // Nine named styles, in order.
        const styles = odfStyles.parse(partText(bytes, 'styles.xml')).styles;
        expect(styles.map(e => e.attrs['style:name'])).toEqual(STYLE_NAMES);

        const content = xmlApi.parse(partText(bytes, 'content.xml'));

        // Headings: names in document order, outline levels, all defined.
        const hs = descendants(content, 'text:h');
        const refs = hs.map(h => h.attrs['text:style-name']);
        expect(refs).toEqual(['Heading_20_1', 'Heading_20_2', 'Heading_20_3', 'Heading_20_3', 'Heading_20_2']);
        expect(hs.map(h => Number(h.attrs['text:outline-level']))).toEqual([1, 2, 3, 3, 2]);
        const defined = new Set(styles.map(e => e.attrs['style:name']));
        for (const ref of refs) expect(defined.has(ref)).toBe(true);

        // Automatic styles of content.xml, by name.
        const auto = new Map(descendants(content, 'style:style')
            .map(e => [e.attrs['style:name'], e]));

        // Exactly three tables, 3 rows x 3 cells each, 27 bordered cells,
        // every table margins-aligned.
        const tables = descendants(content, 'table:table');
        expect(tables).toHaveLength(3);
        let bordered = 0;
        for (const t of tables) {
            const tstyle = auto.get(t.attrs['table:style-name']);
            expect(tstyle).toBeDefined();
            expect(descendants(tstyle, 'style:table-properties')[0].attrs['table:align'])
                .toBe('margins');
            const rows = descendants(t, 'table:table-row');
            expect(rows).toHaveLength(3);
            for (const row of rows) {
                const cells = descendants(row, 'table:table-cell');
                expect(cells).toHaveLength(3);
                for (const c of cells) {
                    const cstyle = auto.get(c.attrs['table:style-name']);
                    expect(cstyle).toBeDefined();
                    const border = descendants(cstyle, 'style:table-cell-properties')[0].attrs['fo:border'];
                    expect(typeof border).toBe('string');
                    expect(border).not.toBe('none');
                    bordered++;
                }
            }
        }
        expect(bordered).toBe(27);

        // The one list references a style whose level 1 carries the
        // label-alignment geometry and whose bullet level has no font.
        const lists = descendants(content, 'text:list');
        expect(lists).toHaveLength(1);
        const listStyle = descendants(content, 'text:list-style')
            .find(e => e.attrs['style:name'] === lists[0].attrs['text:style-name']);
        expect(listStyle).toBeDefined();
        const level1 = descendants(listStyle, 'text:list-level-style-bullet')
            .find(e => e.attrs['text:level'] === '1');
        expect(level1).toBeDefined();
        const lp = descendants(level1, 'style:list-level-properties');
        expect(lp).toHaveLength(1);
        expect(lp[0].attrs['text:list-level-position-and-space-mode']).toBe('label-alignment');
        const align = descendants(lp[0], 'style:list-level-label-alignment');
        expect(align).toHaveLength(1);
        expect(align[0].attrs['fo:margin-left']).toBe('1.27cm');
        expect(descendants(level1, 'style:text-properties')).toHaveLength(0);

        // Nothing is lost.
        expect(losses).toEqual([]);
    });

    test('odt.read symmetry: headings carry styleName, tables grid:true, cells bare, no autoStyles', async () => {
        const { bytes } = await oconv.fromMd({ markdown: FIXTURE, target: 'odt' });
        const read = odtApi.read(bytes);

        const headings = read.body.filter(b => b.type === 'heading');
        expect(headings.map(h => h.styleName))
            .toEqual(['Heading_20_1', 'Heading_20_2', 'Heading_20_3', 'Heading_20_3', 'Heading_20_2']);
        expect(headings.map(h => h.outlineLevel)).toEqual([1, 2, 3, 3, 2]);

        const tables = read.body.filter(b => b.type === 'table');
        expect(tables).toHaveLength(3);
        for (const t of tables) {
            expect(t.grid).toBe(true);
            for (const row of t.rows) {
                for (const c of row.cells) expect(c.styleName).toBeUndefined();
            }
        }
        expect(read.autoStyles).toBeUndefined();
    });

    test('return leg: md -> odt -> md keeps headings, emphasis, cells and list markers', async () => {
        const { bytes } = await oconv.fromMd({ markdown: FIXTURE, target: 'odt' });
        const { markdown, losses } = await oconv.toMd({
            name: 'presentable.odt', bytes, convertedAt: '2026-10-01T00:00:00Z'
        });
        // The named-style parent chain (Heading_20_N -> Heading -> Standard)
        // does not cost the read leg anything: no run/list resolution loss.
        expect(losses).toEqual([]);

        expect(markdown).toContain('# Quarterly operations report');
        expect(markdown).toContain('## Highlights');
        expect(markdown).toContain('### Revenue by region');
        expect(markdown).toContain('### Headcount by team');
        expect(markdown).toContain('## Delivery');
        expect(markdown).toContain('**revenue**');
        expect(markdown).toContain('*headcount*');
        for (const cell of ['North', 'Engineering', 'Billing', 'In progress']) {
            expect(markdown).toContain(cell);
        }
        // The list: its three items come back as bullet markers.
        for (const item of ['Revenue grew in every region', 'Two new offices opened', 'Delivery backlog halved']) {
            expect(markdown).toMatch(new RegExp('^[-*+] ' + item + '$', 'm'));
        }
    });

    test('nested-lists fixture: bullet and ordered nesting survive md -> odt -> md', async () => {
        const nested = readFileSync(
            new URL('./_fixtures/md/nested-lists.md', import.meta.url), 'utf8');
        const { bytes, losses: writeLosses } = await oconv.fromMd({ markdown: nested, target: 'odt' });
        expect(writeLosses).toEqual([]);
        const { markdown, losses } = await oconv.toMd({
            name: 'nested.odt', bytes, convertedAt: '2026-10-01T00:00:00Z'
        });
        expect(losses).toEqual([]);
        const body = markdown.slice(markdown.indexOf('# Lists'));
        // Byte-for-byte the same list markup the fixture was authored with.
        expect(body.trimEnd()).toBe(nested.trimEnd());
    });
});
