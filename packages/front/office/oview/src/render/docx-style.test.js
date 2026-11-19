// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview The pure DOCX cascade module behind the painter and the
 * `cascade.js` sub-path: table styles and their conditional formats, and
 * the border / shading / unit helpers the painter shares with it. The
 * paragraph and run cascade is covered through the sub-path
 * (`src/cascade.test.js`).
 *
 * @module oview/render/docx-style.test
 */
import { describe, test, expect } from 'bun:test';
import { borderCss, bordersOf, createStyles, shadingOf, twips } from './docx-style.js';

/** A raw xml element node, as the typed model keeps it in `_extras`. */
const el = (name, attrs = {}, children = []) => ({ type: 'element', name, attrs, children });

describe('table styles', () => {
    const styles = createStyles({
        styles: [
            { type: 'table', styleId: 'Plain', name: 'Normal Table', tblPr: { cellMargins: { left: { w: 108 } } }, pPr: { spacing: { after: 0 } } },
            {
                type: 'table', styleId: 'Banded', name: 'Banded', basedOn: 'Plain', rPr: { size: 20 },
                tblPr: { _extras: [el('w:tblStyleRowBandSize', { 'w:val': '2' })] },
                _extras: [
                    el('w:tblStylePr', { 'w:type': 'firstRow' }, [
                        el('w:rPr', {}, [el('w:b'), el('w:color', { 'w:val': 'FFFFFF' })]),
                        el('w:tcPr', {}, [el('w:shd', { 'w:fill': '4472C4' })])
                    ]),
                    el('w:tblStylePr', { 'w:type': 'band1Horz' }, [el('w:tcPr', {}, [el('w:shd', { 'w:fill': 'D9E2F3' })])])
                ]
            }
        ]
    });

    test('table() merges the style chain under the direct tblPr', () => {
        expect(styles.table({ style: 'Banded', jc: 'center' }).cellMargins).toEqual({ left: { w: 108 } });
        expect(styles.table({ style: 'Banded', jc: 'center' }).jc).toBe('center');
    });

    test('tableStyle() gives the cell paragraphs their properties and the conditional formats by type', () => {
        const ts = styles.tableStyle('Banded');
        expect(ts.pPr).toEqual({ spacing: { after: 0 } });
        expect(ts.rPr).toEqual({ size: 20 });
        expect(ts.rowBand).toBe(2);
        expect(ts.colBand).toBe(1);
        expect(ts.cond.firstRow).toEqual({ rPr: { bold: true, color: 'FFFFFF' }, shd: '#4472c4', borders: null });
        expect(ts.cond.band1Horz.shd).toBe('#d9e2f3');
    });

    test('an unknown table style gives empty bags', () => {
        expect(styles.tableStyle('Nope')).toEqual({ pPr: {}, rPr: {}, cond: {}, rowBand: 1, colBand: 1 });
    });
});

describe('helpers', () => {
    test('borderCss: none, nil, double, dashed, hairline floored at 1px', () => {
        expect(borderCss(null)).toBe(null);
        expect(borderCss({ val: 'nil' })).toBe('none');
        expect(borderCss({ val: 'double', sz: 12, color: 'FF0000' })).toBe('2.0px double #ff0000');
        expect(borderCss({ 'w:val': 'dashSmallGap', 'w:sz': '2' })).toBe('1.0px dashed currentColor');
    });

    test('bordersOf reads typed borders first, else the raw element', () => {
        expect(bordersOf({ borders: { top: { val: 'single' } } }, 'borders', 'w:pBdr')).toEqual({ top: { val: 'single' } });
        const raw = { _extras: [el('w:tcBorders', {}, [el('w:left', { 'w:val': 'single', 'w:sz': '4', 'w:color': 'auto' })])] };
        expect(bordersOf(raw, 'borders', 'w:tcBorders')).toEqual({ left: { val: 'single', sz: '4', color: 'auto' } });
        expect(bordersOf({}, 'borders', 'w:tcBorders')).toBe(null);
    });

    test('shadingOf: typed or raw fill, auto is no shading', () => {
        expect(shadingOf({ shd: { fill: 'ABCDEF' } })).toBe('#abcdef');
        expect(shadingOf({ _extras: [el('w:shd', { 'w:fill': 'auto' })] })).toBe(null);
        expect(shadingOf({ _extras: [el('w:shd', { 'w:fill': '00FF00' })] })).toBe('#00ff00');
    });

    test('twips → CSS px, null when not a number', () => {
        expect(twips(1440)).toBe(96);
        expect(twips('720')).toBe(48);
        expect(twips('auto')).toBe(null);
    });
});
