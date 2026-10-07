// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { xml as ooxmlXml } from '@awacloud/fw/io/codec/xml.js';
import { xlsxStyles } from './styles.js';
import { ooxmlErrors as _ooxmlErrors } from '../errors.js';
import { ooxmlShared as _ooxmlShared } from '../_shared/index.js';
const _errors = _ooxmlErrors.factory();
const _shared = _ooxmlShared.factory();

const xml = ooxmlXml.factory();
const styles = xlsxStyles.factory(_errors, xml, _shared);

describe('xlsxStyles', () => {
    test('roundtrip defaults', () => {
        const obj = styles.defaults();
        const back = styles.parse(styles.serialize(obj));
        expect(back.fonts).toHaveLength(1);
        expect(back.fonts[0].name).toBe('Calibri');
        expect(back.fills).toHaveLength(2);
        expect(back.fills[1].patternType).toBe('gray125');
        expect(back.cellXfs[0]).toMatchObject({
            numFmtId: 0, fontId: 0, fillId: 0, borderId: 0
        });
        expect(back.cellStyles[0]).toMatchObject({
            name: 'Normal', xfId: 0, builtinId: 0
        });
    });

    test('roundtrip custom font + fill + border + xf', () => {
        const obj = {
            numFmts: [{ id: 164, formatCode: '0.00%' }],
            fonts: [
                { size: 11, name: 'Calibri', family: 2 },
                { size: 14, name: 'Arial', bold: true, italic: true,
                  underline: 'single', color: { rgb: 'FFFF0000' } }
            ],
            fills: [
                { patternType: 'none' },
                { patternType: 'solid',
                  fgColor: { rgb: 'FFFFFF00' },
                  bgColor: { rgb: 'FF000000' } }
            ],
            borders: [
                { left: {}, right: {}, top: {}, bottom: {}, diagonal: {} },
                { left:   { style: 'thin',   color: { rgb: 'FF000000' } },
                  right:  { style: 'thin',   color: { rgb: 'FF000000' } },
                  top:    { style: 'medium', color: { rgb: 'FF000000' } },
                  bottom: { style: 'medium', color: { rgb: 'FF000000' } },
                  diagonal: {} }
            ],
            cellStyleXfs: [{ numFmtId: 0, fontId: 0, fillId: 0, borderId: 0 }],
            cellXfs: [
                { numFmtId: 0, fontId: 0, fillId: 0, borderId: 0, xfId: 0 },
                { numFmtId: 164, fontId: 1, fillId: 1, borderId: 1, xfId: 0,
                  applyNumberFormat: true, applyFont: true, applyFill: true,
                  applyBorder: true, applyAlignment: true,
                  alignment: { horizontal: 'center', vertical: 'center',
                               wrapText: true } }
            ],
            cellStyles: [{ name: 'Normal', xfId: 0, builtinId: 0 }],
            dxfs: []
        };
        const back = styles.parse(styles.serialize(obj));
        expect(back).toEqual(obj);
    });

    test('parses dxfs and preserves tableStyles verbatim', () => {
        const xmlText = '<?xml version="1.0"?>'
            + '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
            + '<dxfs count="1">'
            + '<dxf><font><b/><color rgb="FF9C0006"/></font>'
            + '<fill><patternFill><bgColor rgb="FFFFC7CE"/></patternFill></fill></dxf>'
            + '</dxfs>'
            + '<tableStyles count="0" defaultTableStyle="TableStyleMedium2"/>'
            + '</styleSheet>';
        const obj = styles.parse(xmlText);
        expect(obj.dxfs).toHaveLength(1);
        expect(obj.dxfs[0].font.bold).toBe(true);
        expect(obj.dxfs[0].font.color.rgb).toBe('FF9C0006');
        expect(obj.dxfs[0].fill.bgColor.rgb).toBe('FFFFC7CE');
        expect(obj.tableStyles).toBeDefined();
        // Round-trip preserves both.
        const back = styles.parse(styles.serialize(obj));
        expect(back.dxfs).toHaveLength(1);
        expect(back.tableStyles).toBeDefined();
    });

    test('withDxfs appends and returns indices', () => {
        const obj = styles.defaults();
        const idx = styles.withDxfs(obj, [
            { font: { bold: true } },
            { fill: { patternType: 'solid', bgColor: { rgb: 'FFFFFF00' } } }
        ]);
        expect(idx).toEqual([0, 1]);
        expect(obj.dxfs).toHaveLength(2);
    });

    test('withCellXfs builds an indexable styles object', () => {
        const { styles: built, indices } = styles.withCellXfs([
            { fontId: 1, applyFont: true },
            { fontId: 2, applyFont: true, fillId: 1, applyFill: true }
        ]);
        expect(indices).toEqual([1, 2]);
        expect(built.cellXfs).toHaveLength(3);
    });
});
