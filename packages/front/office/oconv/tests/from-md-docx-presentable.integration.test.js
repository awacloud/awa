// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * md→docx presentable-output guard — BL-1766, office/BATCH_47 task 04
 * (`ai/batches/types/office/BATCH_47/04-oconv-docx-styles-borders.md`).
 *
 * Drives the PUBLIC facade (`oconv.fromMd({ markdown, target: 'docx' })`,
 * composed from `src/main.js`) on a business-shaped markdown document —
 * headings 1-3, bold/italic prose, one bullet list, three pipe tables —
 * and asserts the container is presentable by construction: a
 * `word/styles.xml` part defining every referenced paragraph style, and
 * every table carrying the `TableGrid` style reference plus direct single
 * borders.
 *
 * Oracle: the OPC parts (zip entry names via fw `zip.unzipSync`, the
 * typed model via `docx.read`). Rendering in Word / LibreOffice is NOT
 * reachable from a test — the owner opens the fixture output at review
 * time (BATCH_47 creation record, ruling Q5).
 */
import { readFileSync } from 'node:fs';
import { describe, test, expect } from 'bun:test';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { fw_require, modules } from '../src/main.js';

const runtime = new ModuleRuntime();
runtime.registerAll(fw_require);
runtime.registerAll(modules);
const oconv = runtime.resolve('oconv');
const docxApi = runtime.resolve('docx');
const zipApi = runtime.resolve('zip');

/**
 * Business-shaped markdown (headings 1-3, emphasis, a list, three 3x3
 * tables) — ONE committed fixture shared with the md->odt guard
 * (`from-md-odt-presentable.integration.test.js`). Resolved from
 * `import.meta.url`, never from the CWD.
 */
const FIXTURE = readFileSync(
    new URL('./_fixtures/md/presentable-report.md', import.meta.url), 'utf8');

/** The prescribed direct borders every table carries. */
const GRID_EDGE = { val: 'single', sz: 4, space: 0, color: 'auto' };
const GRID_BORDERS = {
    top: GRID_EDGE, left: GRID_EDGE, bottom: GRID_EDGE,
    right: GRID_EDGE, insideH: GRID_EDGE, insideV: GRID_EDGE
};
/** The prescribed cell padding every table carries (Word's `Table Grid` 108 dxa). */
const GRID_CELL_MARGINS = { left: { w: 108, type: 'dxa' }, right: { w: 108, type: 'dxa' } };

describe('fromMd docx — presentable output (BL-1766)', () => {
    test('styles part, defined pStyles, three bordered tables, numbering, empty ledger', async () => {
        const { bytes, losses } = await oconv.fromMd({ markdown: FIXTURE, target: 'docx' });

        // The five OPC parts BL-1766 measured, plus word/styles.xml.
        const entries = Object.keys(zipApi.unzipSync(bytes));
        for (const part of [
            '[Content_Types].xml',
            '_rels/.rels',
            'word/document.xml',
            'word/numbering.xml',
            'word/_rels/document.xml.rels',
            'word/styles.xml'
        ]) {
            expect(entries).toContain(part);
        }

        const read = docxApi.read(bytes);

        // Every referenced pStyle is defined in the styles part.
        const docXml = new TextDecoder().decode(zipApi.unzipSync(bytes)['word/document.xml']);
        const refs = [...docXml.matchAll(/<w:pStyle w:val="([^"]*)"/g)].map(m => m[1]);
        expect(refs).toEqual(['Heading1', 'Heading2', 'Heading3', 'Heading3', 'Heading2']);
        const ids = new Set(read.styles.styles.map(s => s.styleId));
        for (const ref of refs) expect(ids.has(ref)).toBe(true);

        // Exactly three tables, each with the TableGrid tblPr.
        const tables = read.document.body.filter(b => b.type === 'table');
        expect(tables).toHaveLength(3);
        for (const t of tables) {
            expect(t.tblPr).toEqual(
                { style: 'TableGrid', borders: GRID_BORDERS, cellMargins: GRID_CELL_MARGINS });
            expect(t.rows).toHaveLength(3);
            for (const row of t.rows) expect(row.cells).toHaveLength(3);
        }
        expect(ids.has('TableGrid')).toBe(true);

        // numbering.xml is there because of the bullet list.
        expect(read.numbering).toBeDefined();

        // BL-1799: the bullet levels write U+2022 and pin NO font.
        const bullet = read.numbering.abstractNums.find(a => a.abstractNumId === 0);
        expect(bullet.levels[0].lvlText).toBe('\u2022');
        expect(bullet.levels[0].rPr).toBeUndefined();
        const numXml = new TextDecoder().decode(zipApi.unzipSync(bytes)['word/numbering.xml']);
        const bulletChunk = /<w:abstractNum [^>]*w:abstractNumId="0"[^>]*>[\s\S]*?<\/w:abstractNum>/.exec(numXml);
        expect(bulletChunk).not.toBeNull();
        expect(bulletChunk[0]).not.toContain('w:rFonts');

        // No hr in the fixture: nothing is lost.
        expect(losses).toEqual([]);
    });

    test('return leg: md -> docx -> md keeps heading levels and inline emphasis', async () => {
        const { bytes } = await oconv.fromMd({ markdown: FIXTURE, target: 'docx' });
        const { markdown } = await oconv.toMd({
            name: 'presentable.docx', bytes, convertedAt: '2026-09-30T00:00:00Z'
        });

        expect(markdown).toContain('# Quarterly operations report');
        expect(markdown).toContain('## Highlights');
        expect(markdown).toContain('### Revenue by region');
        expect(markdown).toContain('**revenue**');
        expect(markdown).toContain('*headcount*');
        for (const cell of ['North', 'Engineering', 'Billing', 'In progress']) {
            expect(markdown).toContain(cell);
        }
    });
});
