// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { xml as ooxmlXml } from '@awacloud/fw/io/codec/xml.js';
import { xlsxTables } from './tables.js';
import { ooxmlErrors as _ooxmlErrors } from '../errors.js';
import { ooxmlShared as _ooxmlShared } from '../_shared/index.js';
const _errors = _ooxmlErrors.factory();
const _shared = _ooxmlShared.factory();

const xml = ooxmlXml.factory();
const tables = xlsxTables.factory(_errors, xml, _shared);

describe('xlsxTables', () => {
    test('roundtrip table with columns + autoFilter + style info', () => {
        const obj = {
            id: 1, name: 'Table1', displayName: 'People', ref: 'A1:C4',
            headerRowCount: 1, totalsRowCount: 1, totalsRowShown: false,
            autoFilter: { ref: 'A1:C4' },
            columns: [
                { id: 1, name: 'Name' },
                { id: 2, name: 'Age', totalsRowFunction: 'sum' },
                { id: 3, name: 'Score', totalsRowLabel: 'Total' }
            ],
            tableStyleInfo: {
                name: 'TableStyleMedium2',
                showRowStripes: true, showFirstColumn: false,
                showLastColumn: false, showColumnStripes: false
            }
        };
        const back = tables.parse(tables.serialize(obj));
        expect(back).toEqual(obj);
    });
});
