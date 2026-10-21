// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Builds `rich.xlsx` with `@awacloud/ooxml`'s own writer:
 * fonts, fills, borders, alignments, number formats, merged cells, column
 * widths, a formula with its cached value, a hidden sheet and a second
 * visible one. The repository's XLSX corpus carries no styles; this one
 * exercises the sheet painter's style mapping.
 *
 * Run: `bun apps/services/viewer/tests/fixtures/build-ooxml.js` (the output
 * is committed).
 *
 * @module viewer/tests/fixtures/build-ooxml
 */
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { xlsx as xlsxModule } from '@awacloud/ooxml';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const rt = new ModuleRuntime();
rt.registerDeep(xlsxModule);
const xlsx = rt.resolve('xlsx');

const thin = { style: 'thin', color: { rgb: 'FF003462' } };
const styles = {
    numFmts: [{ id: 164, formatCode: '#,##0.00 [$€-40C]' }, { id: 165, formatCode: 'd mmmm yyyy' }],
    fonts: [
        { size: 11, name: 'Calibri' },
        { size: 11, name: 'Calibri', bold: true, color: { rgb: 'FFFFFFFF' } },
        { size: 14, name: 'Calibri', bold: true, color: { theme: 4 } },
        { size: 11, name: 'Calibri', italic: true, color: { rgb: 'FFC00000' } }
    ],
    fills: [
        { patternType: 'none' },
        { patternType: 'gray125' },
        { patternType: 'solid', fgColor: { rgb: 'FF00263D' } },
        { patternType: 'solid', fgColor: { theme: 4, tint: 0.7999 } }
    ],
    borders: [{}, { left: thin, right: thin, top: thin, bottom: thin }],
    cellStyleXfs: [{ numFmtId: 0, fontId: 0, fillId: 0, borderId: 0 }],
    cellXfs: [
        { numFmtId: 0, fontId: 0, fillId: 0, borderId: 0, xfId: 0 },
        { numFmtId: 0, fontId: 1, fillId: 2, borderId: 1, xfId: 0, applyFont: true, applyFill: true, applyBorder: true, applyAlignment: true, alignment: { horizontal: 'center', vertical: 'center' } },
        { numFmtId: 164, fontId: 0, fillId: 0, borderId: 1, xfId: 0, applyNumberFormat: true, applyBorder: true },
        { numFmtId: 9, fontId: 0, fillId: 3, borderId: 1, xfId: 0, applyNumberFormat: true, applyFill: true, applyBorder: true },
        { numFmtId: 0, fontId: 2, fillId: 0, borderId: 0, xfId: 0, applyFont: true },
        { numFmtId: 165, fontId: 3, fillId: 0, borderId: 0, xfId: 0, applyNumberFormat: true, applyFont: true },
        { numFmtId: 0, fontId: 0, fillId: 0, borderId: 1, xfId: 0, applyBorder: true, applyAlignment: true, alignment: { wrapText: true, vertical: 'top' } }
    ],
    cellStyles: [{ name: 'Normal', xfId: 0, builtinId: 0 }]
};

const c = (value, s, extra = {}) => ({ type: 'cell', value, t: typeof value === 'number' ? 'n' : 'inlineStr', s, ...extra });
const wb = {
    type: 'workbook',
    sheets: [
        {
            name: 'Budget',
            cols: [{ min: 1, max: 1, width: 24, customWidth: true }, { min: 2, max: 4, width: 14, customWidth: true }],
            merges: ['A1:D1'],
            rows: [
                [c('Budget 2026 — awa viewer fixture', 4)],
                [c('Poste', 1), c('Prévu', 1), c('Réalisé', 1), c('Écart', 1)],
                [c('Matériel', 0), c(12500, 2), c(11980.4, 2), c(-0.0416, 3)],
                [c('Logiciels', 0), c(8400, 2), c(9120, 2), c(0.0857, 3)],
                [c('Formation', 0), c(3000, 2), c(2450, 2), c(-0.1833, 3)],
                [c('Total', 1), c(23900, 2, { formula: 'SUM(B3:B5)' }), c(23550.4, 2, { formula: 'SUM(C3:C5)' }), c(-0.0146, 3)],
                [],
                [c('Mis à jour le', 0), c(46305, 5)],
                [c('Note longue qui passe à la ligne dans une cellule encadrée.', 6)]
            ]
        },
        { name: 'Masquée', state: 'hidden', rows: [[c('Ne doit pas apparaître', 0)]] },
        { name: 'Notes', rows: [[c('Deuxième feuille visible.', 0)], [c(42, 0), c(3.14159, 0)]] }
    ],
    styles
};

writeFileSync(fileURLToPath(new URL('rich.xlsx', import.meta.url)), xlsx.write(wb));
