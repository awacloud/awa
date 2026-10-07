// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { tableColr } from './colr.js';
import { testRuntime } from './_test-runtime.js';
const {
    parseColr, decodePaint, decodeColorLine, decodePaintGraph,
    PAINT_FORMAT, BLEND_MODES
} = testRuntime.resolve('tableColr');
const { BinaryWriter } = testRuntime.resolve('fontWriter');
const { ParseError } = testRuntime.resolve('fontErrors');

describe('tableColr', () => {
    test('module metadata', () => { expect(tableColr.name).toBe('tableColr'); });

    test('parses v0 with one base + two layers', () => {
        const w = new BinaryWriter();
        w.writeUint16(0);
        w.writeUint16(1);
        const bgrOffPos = w.pos; w.writeUint32(0);
        const layerOffPos = w.pos; w.writeUint32(0);
        w.writeUint16(2);
        const bgrPos = w.pos;
        w.writeUint16(5).writeUint16(0).writeUint16(2);
        const layerPos = w.pos;
        w.writeUint16(10).writeUint16(0);
        w.writeUint16(11).writeUint16(1);
        const bytes = w.finalize();
        bytes[bgrOffPos]     = (bgrPos >>> 24) & 0xFF;
        bytes[bgrOffPos + 1] = (bgrPos >>> 16) & 0xFF;
        bytes[bgrOffPos + 2] = (bgrPos >>>  8) & 0xFF;
        bytes[bgrOffPos + 3] =  bgrPos         & 0xFF;
        bytes[layerOffPos]     = (layerPos >>> 24) & 0xFF;
        bytes[layerOffPos + 1] = (layerPos >>> 16) & 0xFF;
        bytes[layerOffPos + 2] = (layerPos >>>  8) & 0xFF;
        bytes[layerOffPos + 3] =  layerPos         & 0xFF;
        const c = parseColr(bytes);
        expect(c.version).toBe(0);
        expect(c.baseGlyphs.length).toBe(1);
        expect(c.layers.length).toBe(2);
        expect(c.baseLayer(5)).toEqual([
            { glyphID: 10, paletteIndex: 0 },
            { glyphID: 11, paletteIndex: 1 }
        ]);
        expect(c.baseLayer(99)).toBeNull();
    });

    test('decodePaint SOLID', () => {
        const w = new BinaryWriter();
        w.writeUint8(PAINT_FORMAT.SOLID);
        w.writeUint16(3);
        w.writeInt16(16384);
        const p = decodePaint(w.finalize(), 0);
        expect(p.format).toBe(PAINT_FORMAT.SOLID);
        expect(p.paletteIndex).toBe(3);
        expect(p.alpha).toBe(1);
    });

    test('rejects bad version', () => {
        const w = new BinaryWriter();
        w.writeUint16(9).writeUint16(0).writeUint32(0).writeUint32(0).writeUint16(0);
        expect(() => parseColr(w.finalize())).toThrow(ParseError);
    });

    test('BLEND_MODES exposes srcOver=3 and hslLuminosity=27', () => {
        expect(BLEND_MODES.SRC_OVER).toBe(3);
        expect(BLEND_MODES.HSL_LUMINOSITY).toBe(27);
    });

    test('decodeColorLine reads stops', () => {
        const w = new BinaryWriter();
        w.writeUint8(1);       // extend = repeat
        w.writeUint16(2);      // numStops
        w.writeInt16(0).writeUint16(0).writeInt16(16384);
        w.writeInt16(16384).writeUint16(1).writeInt16(16384);
        const cl = decodeColorLine(w.finalize(), 0);
        expect(cl.extend).toBe(1);
        expect(cl.numStops).toBe(2);
        expect(cl.stops[0].stopOffset).toBe(0);
        expect(cl.stops[1].stopOffset).toBe(1);
        expect(cl.stops[1].paletteIndex).toBe(1);
    });

    test('decodePaint VAR_LINEAR_GRADIENT', () => {
        const w = new BinaryWriter();
        w.writeUint8(PAINT_FORMAT.VAR_LINEAR_GRADIENT);
        w.writeUint24(0x10).writeInt16(0).writeInt16(0)
            .writeInt16(100).writeInt16(0).writeInt16(0).writeInt16(100);
        w.writeUint32(42);
        const p = decodePaint(w.finalize(), 0);
        expect(p.format).toBe(PAINT_FORMAT.VAR_LINEAR_GRADIENT);
        expect(p.x1).toBe(100);
        expect(p.varIndexBase).toBe(42);
    });

    test('decodePaint VAR_RADIAL_GRADIENT', () => {
        const w = new BinaryWriter();
        w.writeUint8(PAINT_FORMAT.VAR_RADIAL_GRADIENT);
        w.writeUint24(0).writeInt16(1).writeInt16(2).writeUint16(3)
            .writeInt16(4).writeInt16(5).writeUint16(6).writeUint32(9);
        const p = decodePaint(w.finalize(), 0);
        expect(p.r1).toBe(6);
        expect(p.varIndexBase).toBe(9);
    });

    test('decodePaint SWEEP_GRADIENT', () => {
        const w = new BinaryWriter();
        w.writeUint8(PAINT_FORMAT.SWEEP_GRADIENT);
        w.writeUint24(0x20).writeInt16(50).writeInt16(60).writeInt16(0).writeInt16(16384);
        const p = decodePaint(w.finalize(), 0);
        expect(p.format).toBe(PAINT_FORMAT.SWEEP_GRADIENT);
        expect(p.centerX).toBe(50);
        expect(p.endAngle).toBe(1);
    });

    test('decodePaint VAR_SWEEP_GRADIENT', () => {
        const w = new BinaryWriter();
        w.writeUint8(PAINT_FORMAT.VAR_SWEEP_GRADIENT);
        w.writeUint24(0).writeInt16(0).writeInt16(0).writeInt16(0).writeInt16(0).writeUint32(7);
        const p = decodePaint(w.finalize(), 0);
        expect(p.varIndexBase).toBe(7);
    });

    test('decodePaint TRANSFORM + VAR_TRANSFORM', () => {
        const w = new BinaryWriter();
        w.writeUint8(PAINT_FORMAT.TRANSFORM).writeUint24(8).writeUint24(16);
        const p = decodePaint(w.finalize(), 0);
        expect(p.paintOffset).toBe(8);
        expect(p.affineOffset).toBe(16);

        const w2 = new BinaryWriter();
        w2.writeUint8(PAINT_FORMAT.VAR_TRANSFORM).writeUint24(8).writeUint24(16);
        const p2 = decodePaint(w2.finalize(), 0);
        expect(p2.format).toBe(PAINT_FORMAT.VAR_TRANSFORM);
    });

    test('decodePaint TRANSLATE / VAR_TRANSLATE', () => {
        const w = new BinaryWriter();
        w.writeUint8(PAINT_FORMAT.TRANSLATE).writeUint24(5).writeInt16(-7).writeInt16(9);
        const p = decodePaint(w.finalize(), 0);
        expect(p.dx).toBe(-7); expect(p.dy).toBe(9);

        const w2 = new BinaryWriter();
        w2.writeUint8(PAINT_FORMAT.VAR_TRANSLATE).writeUint24(0).writeInt16(0).writeInt16(0).writeUint32(11);
        expect(decodePaint(w2.finalize(), 0).varIndexBase).toBe(11);
    });

    test('decodePaint SCALE + SCALE_AROUND_CENTER', () => {
        const w = new BinaryWriter();
        w.writeUint8(PAINT_FORMAT.SCALE).writeUint24(4).writeInt16(8192).writeInt16(16384);
        const p = decodePaint(w.finalize(), 0);
        expect(p.scaleX).toBe(0.5); expect(p.scaleY).toBe(1);

        const w2 = new BinaryWriter();
        w2.writeUint8(PAINT_FORMAT.SCALE_AROUND_CENTER)
            .writeUint24(4).writeInt16(16384).writeInt16(16384).writeInt16(10).writeInt16(20);
        const p2 = decodePaint(w2.finalize(), 0);
        expect(p2.centerX).toBe(10); expect(p2.centerY).toBe(20);
    });

    test('decodePaint ROTATE + SKEW', () => {
        const w = new BinaryWriter();
        w.writeUint8(PAINT_FORMAT.ROTATE).writeUint24(4).writeInt16(8192);
        expect(decodePaint(w.finalize(), 0).angle).toBe(0.5);

        const w2 = new BinaryWriter();
        w2.writeUint8(PAINT_FORMAT.SKEW).writeUint24(4).writeInt16(4096).writeInt16(-4096);
        const p2 = decodePaint(w2.finalize(), 0);
        expect(p2.xSkewAngle).toBe(0.25);
        expect(p2.ySkewAngle).toBe(-0.25);
    });

    test('decodePaint COMPOSITE', () => {
        const w = new BinaryWriter();
        w.writeUint8(PAINT_FORMAT.COMPOSITE)
            .writeUint24(10).writeUint8(BLEND_MODES.SRC_OVER).writeUint24(20);
        const p = decodePaint(w.finalize(), 0);
        expect(p.paintOffsetSrc).toBe(10);
        expect(p.compositeMode).toBe(BLEND_MODES.SRC_OVER);
        expect(p.paintOffsetDst).toBe(20);
    });

    test('decodePaintGraph walks GLYPH -> SOLID', () => {
        // Build a small buffer:
        //  offset 0:  PaintGlyph (format 10) â€” paintOffset uint24 = 8 (relative), glyphID uint16 = 42
        //  total header size = 1+3+2 = 6 bytes
        //  offset 8:  PaintSolid (format 2) â€” paletteIndex=5, alpha=16384
        const w = new BinaryWriter();
        w.writeUint8(PAINT_FORMAT.GLYPH);
        w.writeUint24(8);          // child paint at +8
        w.writeUint16(42);         // glyph
        w.writeUint8(0).writeUint8(0); // padding to reach offset 8
        // offset 8
        w.writeUint8(PAINT_FORMAT.SOLID);
        w.writeUint16(5);
        w.writeInt16(16384);
        const tree = decodePaintGraph(w.finalize(), 0);
        expect(tree.format).toBe(PAINT_FORMAT.GLYPH);
        expect(tree.glyphID).toBe(42);
        expect(tree.paint.format).toBe(PAINT_FORMAT.SOLID);
        expect(tree.paint.paletteIndex).toBe(5);
        expect(tree.paint.alpha).toBe(1);
    });

    test('decodePaintGraph walks COMPOSITE src/dst with nested depth > 1', () => {
        // Root @0: PaintComposite (format 32) â€” src -> TRANSLATE @8 (nests a
        // further SOLID child @24, depth 2), dst -> SOLID @16 (depth 1).
        const w = new BinaryWriter();
        w.writeUint8(PAINT_FORMAT.COMPOSITE)
            .writeUint24(8)                          // paintOffsetSrc -> 8
            .writeUint8(BLEND_MODES.SRC_OVER)
            .writeUint24(16);                        // paintOffsetDst -> 16
        // offset 8: TRANSLATE, child paint at 8+16=24
        w.writeUint8(PAINT_FORMAT.TRANSLATE)
            .writeUint24(16)
            .writeInt16(1).writeInt16(2);
        // offset 16: SOLID (dst leaf, depth 1)
        w.writeUint8(PAINT_FORMAT.SOLID)
            .writeUint16(9).writeInt16(8192);
        // padding [21,24) to reach offset 24
        w.writeUint8(0).writeUint8(0).writeUint8(0);
        // offset 24: SOLID (src's nested child, depth 2)
        w.writeUint8(PAINT_FORMAT.SOLID)
            .writeUint16(7).writeInt16(16384);
        const tree = decodePaintGraph(w.finalize(), 0);
        expect(tree.format).toBe(PAINT_FORMAT.COMPOSITE);
        expect(tree.compositeMode).toBe(BLEND_MODES.SRC_OVER);
        expect(tree.paintSrc.format).toBe(PAINT_FORMAT.TRANSLATE);
        expect(tree.paintSrc.dx).toBe(1);
        expect(tree.paintSrc.paint.format).toBe(PAINT_FORMAT.SOLID);
        expect(tree.paintSrc.paint.paletteIndex).toBe(7);
        expect(tree.paintDst.format).toBe(PAINT_FORMAT.SOLID);
        expect(tree.paintDst.paletteIndex).toBe(9);
    });

    // Chain of three PaintTranslate records (8 bytes each: uint8 format,
    // Offset24 paintOffset, int16 dx, int16 dy) ending in a PaintSolid.
    // Each child offset is relative to its parent record.
    //   @0  TRANSLATE dx=1 -> @8   (depth 0)
    //   @8  TRANSLATE dx=2 -> @16  (depth 1)
    //   @16 TRANSLATE dx=3 -> @24  (depth 2)
    //   @24 SOLID paletteIndex=7   (depth 3)
    const chain = () => {
        const w = new BinaryWriter();
        for (const dx of [1, 2, 3])
            w.writeUint8(PAINT_FORMAT.TRANSLATE).writeUint24(8)
                .writeInt16(dx).writeInt16(0);
        w.writeUint8(PAINT_FORMAT.SOLID).writeUint16(7).writeInt16(16384);
        return w.finalize();
    };

    test('decodePaintGraph truncates below maxDepth', () => {
        const tree = decodePaintGraph(chain(), 0, 1);
        expect(tree.format).toBe(PAINT_FORMAT.TRANSLATE);
        expect(tree.dx).toBe(1);
        expect(tree.paint.format).toBe(PAINT_FORMAT.TRANSLATE);
        expect(tree.paint.dx).toBe(2);
        expect(tree.paint.paint).toEqual({ truncated: true, offset: 16 });
    });

    test('maxDepth boundary: a node at exactly maxDepth is decoded', () => {
        const full = decodePaintGraph(chain(), 0, 3);
        const leaf = full.paint.paint.paint;
        expect(leaf.truncated).toBeUndefined();
        expect(leaf.format).toBe(PAINT_FORMAT.SOLID);
        expect(leaf.offset).toBe(24);
        expect(leaf.paletteIndex).toBe(7);

        const cut = decodePaintGraph(chain(), 0, 2);
        expect(cut.paint.paint.format).toBe(PAINT_FORMAT.TRANSLATE);
        expect(cut.paint.paint.dx).toBe(3);
        expect(cut.paint.paint.paint).toEqual({ truncated: true, offset: 24 });
    });

    test('default maxDepth decodes the whole chain', () => {
        const tree = decodePaintGraph(chain(), 0);
        const leaf = tree.paint.paint.paint;
        expect(leaf.format).toBe(PAINT_FORMAT.SOLID);
        expect(leaf.paletteIndex).toBe(7);
        expect(leaf.alpha).toBe(1);
    });

    test('paintOffset 0 leaves the child undecoded', () => {
        // A zero paintOffset means "no child": the walk never descends,
        // so maxDepth is not consulted and `paint` stays unset.
        const w = new BinaryWriter();
        w.writeUint8(PAINT_FORMAT.TRANSLATE).writeUint24(0).writeInt16(0).writeInt16(0);
        const tree = decodePaintGraph(w.finalize(), 0, 2);
        expect(tree.format).toBe(PAINT_FORMAT.TRANSLATE);
        expect(tree.paint).toBeUndefined();
    });
});
