// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

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

function build() {
    const xmlInst = ooxmlXml.factory();
    const relsInst = opcRelationships.factory(_errors, xmlInst);
    const bs = bitstream.factory();
    const hf = huffman.factory(bs);
    const opcInst = opcPackage.factory(_errors,
        zip.factory(deflate.factory(bs, hf, lz77.factory()), crc32.factory()),
        opcContentTypes.factory(_errors, xmlInst), relsInst, _shared);
    const stylesInst = xlsxStyles.factory(_errors, xmlInst, _shared);
    const tablesInst = xlsxTables.factory(_errors, xmlInst, _shared);
    const cfInst = xlsxConditionalFormatting.factory(xmlInst, _shared);
    const commentsInst = xlsxComments.factory(_errors, xmlInst, _shared);
    const mcInst = markupCompatibility.factory(xmlInst);
    const drawingmlShapeInst = drawingmlShape.factory(xmlInst, _shared);
    const drawingmlInst = drawingml.factory(xmlInst, null, _shared);
    const drawingsInst = xlsxDrawings.factory(_errors, xmlInst,
        drawingmlShapeInst, drawingmlInst, _shared);
    const chartInst = drawingmlChart.factory(_errors, xmlInst, _shared);
    const tcInst = xlsxThreadedComments.factory(_errors, xmlInst, _shared);
    const walkerInst = xlsxWalker.factory();
    return xlsx.factory(_errors, opcInst, xmlInst, relsInst,
        stylesInst, tablesInst, cfInst, commentsInst, mcInst,
        drawingsInst, chartInst, tcInst, walkerInst, _shared);
}

describe('xlsx — use(...) wiring', () => {
    test('use returns same instance for chaining', () => {
        const x = build();
        const r = x.use({});
        expect(r).toBe(x);
    });

    test('hydrateWorkbook hook is invoked after read()', () => {
        const x = build();
        const seen = [];
        x.use({
            hydrateWorkbook(wb) {
                seen.push(wb.type);
                wb._touched = true;
            }
        });
        const wb = {
            type: 'workbook',
            sheets: [{ name: 'Sheet1', rows: [[{ value: 1 }]] }]
        };
        const bytes = x.write(wb);
        const back = x.read(bytes);
        expect(seen).toContain('workbook');
        expect(back.workbook._touched).toBe(true);
    });

    test('hydrateSheet runs per sheet', () => {
        const x = build();
        let count = 0;
        x.use({
            hydrateSheet(sheet) { count++; sheet._marked = true; }
        });
        const wb = {
            type: 'workbook',
            sheets: [
                { name: 'A', rows: [[{ value: 1 }]] },
                { name: 'B', rows: [[{ value: 2 }]] }
            ]
        };
        const back = x.read(x.write(wb));
        expect(count).toBe(2);
        expect(back.workbook.sheets.every(s => s._marked)).toBe(true);
    });

    test('dehydrate hooks fire before write', () => {
        const x = build();
        const seen = [];
        x.use({
            dehydrateWorkbook(wb) { seen.push('wb'); },
            dehydrateSheet(sh) { seen.push('sh'); }
        });
        x.write({ type: 'workbook', sheets: [{ name: 'A', rows: [[{ value: 1 }]] }] });
        expect(seen).toContain('wb');
        expect(seen).toContain('sh');
    });
});
