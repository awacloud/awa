// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

// Boundary tests for the xlsx.read resource caps: maxSheets,
// maxRowsPerSheet and maxCellsPerSheet. Every cap has an at-boundary leg
// (reads), an over-boundary leg (throws xlsx/limit-exceeded naming the cap)
// and a `0` leg (the check is disabled). The archive limits of opc.read
// (maxParts, maxUncompressed, maxRatio) travel in the same options object
// and are forwarded to opc.read.

import { describe, test, expect } from 'bun:test';
import { bitstream } from '@awacloud/fw/io/compress/bitstream.js';
import { huffman } from '@awacloud/fw/io/compress/huffman.js';
import { deflate } from '@awacloud/fw/io/compress/deflate.js';
import { lz77 } from '@awacloud/fw/io/compress/lz77.js';
import { zip } from '@awacloud/fw/io/compress/zip.js';
import { crc32 } from '@awacloud/fw/io/calc/crc32.js';
import { xml as ooxmlXml } from '@awacloud/fw/io/codec/xml.js';
import { opcContentTypes } from '../opc/contentTypes.js';
import { opcRelationships } from '../opc/relationships.js';
import { opcPackage } from '../opc/package.js';
import { xlsxStyles } from './styles.js';
import { xlsxTables } from './tables.js';
import { xlsxConditionalFormatting } from './conditionalFormatting.js';
import { xlsxComments } from './comments.js';
import { xlsxThreadedComments } from './threadedComments.js';
import { xlsxDrawings } from './drawings.js';
import { markupCompatibility } from '../mc/markupCompatibility.js';
import { drawingmlChart } from '../drawingml/chart.js';
import { drawingmlShape } from '../drawingml/shape.js';
import { drawingml } from '../drawingml/drawingml.js';
import { xlsxWalker } from './xlsx-walker.js';
import { xlsx } from './xlsx.js';
import { ooxmlErrors as _ooxmlErrors } from '../errors.js';
import { ooxmlShared as _ooxmlShared } from '../_shared/index.js';
const _errors = _ooxmlErrors.factory();
const _shared = _ooxmlShared.factory();

/** Wire an xlsx instance and keep the opc instance for raw-part edits. */
function build() {
    const xmlInst = ooxmlXml.factory();
    const relsInst = opcRelationships.factory(_errors, xmlInst);
    const bs = bitstream.factory();
    const hf = huffman.factory(bs);
    const opc = opcPackage.factory(_errors,
        zip.factory(deflate.factory(bs, hf, lz77.factory()), crc32.factory()),
        opcContentTypes.factory(_errors, xmlInst), relsInst, _shared);
    const x = xlsx.factory(_errors, opc, xmlInst, relsInst,
        xlsxStyles.factory(_errors, xmlInst, _shared),
        xlsxTables.factory(_errors, xmlInst, _shared),
        xlsxConditionalFormatting.factory(xmlInst, _shared),
        xlsxComments.factory(_errors, xmlInst, _shared),
        markupCompatibility.factory(xmlInst),
        xlsxDrawings.factory(_errors, xmlInst,
            drawingmlShape.factory(xmlInst, _shared),
            drawingml.factory(xmlInst, null, _shared), _shared),
        drawingmlChart.factory(_errors, xmlInst, _shared),
        xlsxThreadedComments.factory(_errors, xmlInst, _shared),
        xlsxWalker.factory(), _shared);
    return { x, opc };
}

const SS_NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';

/** Run `fn` and return what it threw (or `null`). */
function thrown(fn) {
    try { fn(); } catch (e) { return e; }
    return null;
}

/** A rows × cols grid of numbers. */
function grid(rows, cols) {
    const out = [];
    for (let r = 0; r < rows; r++) {
        const row = [];
        for (let c = 0; c < cols; c++) row.push(r * cols + c);
        out.push(row);
    }
    return out;
}

/**
 * Write a one-sheet workbook, then replace the worksheet part with raw XML
 * through opcPackage.read / write — the writer never emits the shapes these
 * tests need (far column refs, malformed XML).
 */
function withSheetXml(x, opc, sheetDataXml, tail = '</worksheet>') {
    const pkg = opc.read(x.write({ sheets: [{ name: 'S', rows: [[1]] }] }));
    const sheetPart = Object.keys(pkg.parts)
        .find(p => p.startsWith('/xl/worksheets/'));
    expect(sheetPart).toBeDefined();
    pkg.parts[sheetPart] = new TextEncoder().encode(
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        + `<worksheet xmlns="${SS_NS}">${sheetDataXml}${tail}`);
    return opc.write(pkg);
}

function expectLimit(err, limit, max) {
    expect(err).not.toBeNull();
    expect(err.code).toBe('xlsx/limit-exceeded');
    expect(err.context.limit).toBe(limit);
    expect(err.context.max).toBe(max);
}

describe('xlsx.read — maxCellsPerSheet', () => {
    test('3x3 sheet: cap 9 reads, cap 8 throws, cap 0 reads', () => {
        const { x } = build();
        const bytes = x.write({ sheets: [{ name: 'S', rows: grid(3, 3) }] });

        const atCap = x.read(bytes, { maxCellsPerSheet: 9 });
        expect(atCap.workbook.sheets[0].rows.flat()).toHaveLength(9);

        const err = thrown(() => x.read(bytes, { maxCellsPerSheet: 8 }));
        expectLimit(err, 'maxCellsPerSheet', 8);
        expect(err.context.actual).toBe(9);
        expect(err.context.partName).toMatch(/^\/xl\/worksheets\//);

        const disabled = x.read(bytes, { maxCellsPerSheet: 0 });
        expect(disabled.workbook.sheets[0].rows.flat()).toHaveLength(9);
    });

    test('gap padding counts: one XFD1 cell under cap 100 throws', () => {
        const { x, opc } = build();
        const bytes = withSheetXml(x, opc,
            '<sheetData><row r="1"><c r="XFD1"><v>1</v></c></row></sheetData>');
        const err = thrown(() => x.read(bytes, { maxCellsPerSheet: 100 }));
        expectLimit(err, 'maxCellsPerSheet', 100);
        // In-parse budget: the throw happens on the first materialised cell
        // past the cap, inside the gap padding.
        expect(err.context.actual).toBe(101);
    });

    test('gap padding with cap 0: the row materialises 16384 cells', () => {
        const { x, opc } = build();
        const bytes = withSheetXml(x, opc,
            '<sheetData><row r="1"><c r="XFD1"><v>1</v></c></row></sheetData>');
        const back = x.read(bytes, { maxCellsPerSheet: 0 });
        const row = back.workbook.sheets[0].rows[0];
        expect(row).toHaveLength(16384);
        expect(row[16383].value).toBe(1);
        expect(row[0].value).toBeNull();
    });

    test('far column ref under the default caps throws', () => {
        const { x, opc } = build();
        const bytes = withSheetXml(x, opc,
            '<sheetData><row r="1"><c r="ZZZZZZZ1"><v>1</v></c></row></sheetData>');
        const err = thrown(() => x.read(bytes));
        expectLimit(err, 'maxCellsPerSheet', 5000000);
    });
});

describe('xlsx.read — maxRowsPerSheet', () => {
    test('N rows: cap N reads, cap N-1 throws, cap 0 reads', () => {
        const { x } = build();
        const N = 5;
        const bytes = x.write({ sheets: [{ name: 'S', rows: grid(N, 2) }] });

        expect(x.read(bytes, { maxRowsPerSheet: N }).workbook.sheets[0].rows)
            .toHaveLength(N);

        const err = thrown(() => x.read(bytes, { maxRowsPerSheet: N - 1 }));
        expectLimit(err, 'maxRowsPerSheet', N - 1);
        expect(err.context.actual).toBe(N);
        expect(err.context.partName).toMatch(/^\/xl\/worksheets\//);

        expect(x.read(bytes, { maxRowsPerSheet: 0 }).workbook.sheets[0].rows)
            .toHaveLength(N);
    });

    test('the row cap fires on a pre-scan of the part text, before parsing', () => {
        // The sheet is well formed for its first maxRowsPerSheet + 1 rows and
        // malformed after them. Were the cap checked only once the XML tree
        // is built, the parse error would surface first; a limit error proves
        // the cap ran on the raw text. The cap-0 leg is the control: with the
        // check disabled the same bytes do fail to parse.
        const { x, opc } = build();
        const cap = 3;
        let rows = '';
        for (let r = 1; r <= cap + 1; r++) {
            rows += `<row r="${r}"><c r="A${r}"><v>${r}</v></c></row>`;
        }
        const bytes = withSheetXml(x, opc,
            `<sheetData>${rows}<row r="${cap + 2}"><c r="A${cap + 2}"></nope>`,
            '</sheetData></worksheet>');

        const err = thrown(() => x.read(bytes, { maxRowsPerSheet: cap }));
        expectLimit(err, 'maxRowsPerSheet', cap);
        expect(err.context.actual).toBe(cap + 2);

        const control = thrown(() => x.read(bytes, { maxRowsPerSheet: 0 }));
        expect(control).not.toBeNull();
        expect(control.code).not.toBe('xlsx/limit-exceeded');
    });
});

describe('xlsx.read — maxSheets', () => {
    test('N sheets: cap N reads, cap N-1 throws, cap 0 reads', () => {
        const { x } = build();
        const N = 4;
        const sheets = [];
        for (let i = 0; i < N; i++) sheets.push({ name: `S${i + 1}`, rows: [[i]] });
        const bytes = x.write({ sheets });

        expect(x.read(bytes, { maxSheets: N }).workbook.sheets).toHaveLength(N);

        const err = thrown(() => x.read(bytes, { maxSheets: N - 1 }));
        expectLimit(err, 'maxSheets', N - 1);
        expect(err.context.actual).toBe(N);

        expect(x.read(bytes, { maxSheets: 0 }).workbook.sheets).toHaveLength(N);
    });
});

const ZERO_PART = '/xl/media/zeros.bin';

/** The number of entries (parts, content types, relationships) of a package. */
function entryCount(bytes) {
    const bs = bitstream.factory();
    const zipInst = zip.factory(
        deflate.factory(bs, huffman.factory(bs), lz77.factory()), crc32.factory());
    let n = 0;
    zipInst.unzipSync(bytes, { filter() { n++; return false; } });
    return n;
}

/** A `write` output of a 3x3 sheet plus one 1 MiB zero-filled part. */
function zeroBytes(x, opc) {
    const pkg = opc.read(x.write({ sheets: [{ name: 'S', rows: grid(3, 3) }] }));
    pkg.parts[ZERO_PART] = new Uint8Array(1024 * 1024);
    return opc.write(pkg);
}

describe('xlsx.read — archive limits', () => {
    test('defaults are unchanged', () => {
        const { opc } = build();
        expect(opc.defaultLimits).toEqual(
            { maxParts: 1024, maxUncompressed: 268435456, maxRatio: 200 });
    });

    test('zero-filled part: default throws opc/zip-bomb on maxRatio', () => {
        const { x, opc } = build();
        const err = thrown(() => x.read(zeroBytes(x, opc)));
        expect(err).not.toBeNull();
        expect(err.code).toBe('opc/zip-bomb');
        expect(err.context.limit).toBe('maxRatio');
    });

    test('maxRatio 0 and maxRatio 1e9 read it and list the part', () => {
        const { x, opc } = build();
        const bytes = zeroBytes(x, opc);
        for (const maxRatio of [0, 1e9]) {
            const r = x.read(bytes, { maxRatio, maxParts: 1e9 });
            expect(r.unmodelledParts.map(u => u.partName)).toContain(ZERO_PART);
        }
    });

    test('maxParts: N - 1 throws, N reads', () => {
        const { x } = build();
        const bytes = x.write({ sheets: [{ name: 'S', rows: grid(3, 3) }] });
        const n = entryCount(bytes);
        const err = thrown(() => x.read(bytes, { maxParts: n - 1 }));
        expect(err).not.toBeNull();
        expect(err.code).toBe('opc/zip-bomb');
        expect(err.context.limit).toBe('maxParts');
        expect(x.read(bytes, { maxParts: n }).workbook.sheets).toHaveLength(1);
    });

    test('maxUncompressed below the total throws', () => {
        const { x } = build();
        const bytes = x.write({ sheets: [{ name: 'S', rows: grid(3, 3) }] });
        const err = thrown(() => x.read(bytes, { maxUncompressed: 100 }));
        expect(err).not.toBeNull();
        expect(err.code).toBe('opc/zip-bomb');
        expect(err.context.limit).toBe('maxUncompressed');
    });

    test('an empty or unrelated options object behaves as no options', () => {
        const { x, opc } = build();
        const bytes = zeroBytes(x, opc);
        for (const readOpts of [{}, { unrelated: 1 }]) {
            const err = thrown(() => x.read(bytes, readOpts));
            expect(err).not.toBeNull();
            expect(err.context.limit).toBe('maxRatio');
        }
    });

    test('both families honoured from one object: the cell cap still throws', () => {
        const { x, opc } = build();
        const bytes = zeroBytes(x, opc);
        const err = thrown(() => x.read(bytes, { maxRatio: 0, maxCellsPerSheet: 2 }));
        expectLimit(err, 'maxCellsPerSheet', 2);
    });
});
