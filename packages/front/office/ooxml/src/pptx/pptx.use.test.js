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
import { drawingml } from '../drawingml/drawingml.js';
import { drawingmlChart } from '../drawingml/chart.js';
import { drawingmlShape } from '../drawingml/shape.js';
import { ooxmlMath } from '../math/math.js';
import { pptxTheme } from './theme.js';
import { pptxPicture } from './picture.js';
import { pptxTable } from './table.js';
import { pptxChart } from './chart.js';
import { pptxSlide } from './slide.js';
import { markupCompatibility } from '../mc/markupCompatibility.js';
import { pptxWalker } from './pptx-walker.js';
import { pptx } from './pptx.js';
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
    const mathInst = ooxmlMath.factory(_errors, xmlInst);
    const dml = drawingml.factory(xmlInst, mathInst, _shared);
    const chartPart = drawingmlChart.factory(_errors, xmlInst, _shared);
    const themeInst = pptxTheme.factory(_errors, xmlInst, _shared);
    const picInst = pptxPicture.factory(xmlInst, _shared);
    const tblInst = pptxTable.factory(xmlInst, dml, _shared);
    const chartInst = pptxChart.factory(xmlInst, chartPart, _shared);
    const shapeInst = drawingmlShape.factory(xmlInst, _shared);
    const slideInst = pptxSlide.factory(_errors, xmlInst, dml, picInst, tblInst,
        chartInst, shapeInst, _shared);
    const mcInst = markupCompatibility.factory(xmlInst);
    const walkerInst = pptxWalker.factory();
    return pptx.factory(_errors, opcInst, xmlInst, relsInst,
        slideInst, themeInst, mcInst, picInst, chartPart, shapeInst, walkerInst, _shared);
}

describe('pptx — use(...) wiring', () => {
    test('use returns same instance for chaining', () => {
        const p = build();
        expect(p.use({})).toBe(p);
    });

    test('hydrateRunProperties is invoked on slide text body runs', () => {
        const p = build();
        const seen = [];
        p.use({
            hydrateRunProperties(rPr) {
                seen.push(rPr);
                rPr._touched = true;
            }
        });
        // Build a deck with explicit run rPr (size, bold).
        const bytes = p.write({
            slides: [{
                shapes: [{
                    type: 'shape',
                    txBody: {
                        paragraphs: [{
                            runs: [{ type: 'text', value: 'hi',
                                     rPr: { size: 2400, bold: true } }]
                        }]
                    }
                }]
            }]
        });
        const back = p.read(bytes);
        // After read(), our hook should have run.
        expect(seen.length).toBeGreaterThan(0);
        const slide = back.presentation.slides[0];
        const runs = slide.shapes[0].txBody.paragraphs[0].runs;
        expect(runs[0].rPr._touched).toBe(true);
    });

    test('extension without matching hooks is a no-op', () => {
        const p = build();
        p.use({ unrelatedHook() {} });
        const bytes = p.write({ slides: [{ paragraphs: ['One'] }] });
        const back = p.read(bytes);
        expect(back.presentation.slides).toHaveLength(1);
    });
});
