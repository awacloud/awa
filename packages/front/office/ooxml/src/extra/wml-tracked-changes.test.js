// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { xml as ooxmlXml } from '@awacloud/fw/io/codec/xml.js';
import { wmlTrackedChanges } from './wml-tracked-changes.js';

const xml = ooxmlXml.factory();
const ext = wmlTrackedChanges.factory(xml);

describe('extra/wml-tracked-changes — *Change with snapshot', () => {
    test('pPrChange roundtrip captures pPr snapshot', () => {
        const c = {
            kind: 'pPrChange',
            id: '1', author: 'Alice', date: '2026-05-09T10:00:00Z',
            snapshot: xml.el('w:pPr', {}, [xml.el('w:jc', { 'w:val': 'left' })])
        };
        const el = ext.renderChange(c);
        expect(el.name).toBe('w:pPrChange');
        const back = ext.parseChange(el);
        expect(back.id).toBe('1');
        expect(back.author).toBe('Alice');
        expect(back.snapshot.name).toBe('w:pPr');
    });

    test.each([
        ['rPrChange', 'w:rPr'],
        ['tblPrChange', 'w:tblPr'],
        ['tblPrExChange', 'w:tblPrEx'],
        ['trPrChange', 'w:trPr'],
        ['tcPrChange', 'w:tcPr'],
        ['sectPrChange', 'w:sectPr'],
        ['tblGridChange', 'w:tblGrid']
    ])('%s roundtrip', (kind, snapTag) => {
        const c = { kind, id: '2', author: 'Bob', date: '2026-05-09',
                    snapshot: xml.el(snapTag, {}) };
        const el = ext.renderChange(c);
        const back = ext.parseChange(el);
        expect(back.kind).toBe(kind);
        expect(back.snapshot.name).toBe(snapTag);
    });
});

describe('extra/wml-tracked-changes — range markers', () => {
    test.each([
        'customXmlInsRangeStart', 'customXmlInsRangeEnd',
        'customXmlDelRangeStart', 'customXmlDelRangeEnd',
        'customXmlMoveFromRangeStart', 'customXmlMoveFromRangeEnd',
        'customXmlMoveToRangeStart', 'customXmlMoveToRangeEnd',
        'moveFromRangeStart', 'moveFromRangeEnd',
        'moveToRangeStart', 'moveToRangeEnd'
    ])('%s roundtrip', (kind) => {
        const r = { kind, id: '5' };
        const el = ext.renderRange(r);
        expect(el.name).toBe('w:' + kind);
        const back = ext.parseRange(el);
        expect(back.kind).toBe(kind);
        expect(back.id).toBe('5');
    });
});

describe('extra/wml-tracked-changes — cell ops', () => {
    test.each(['cellMerge', 'cellIns', 'cellDel'])('%s roundtrip', (kind) => {
        const c = { kind, id: '3', author: 'A', date: '2026-05-09' };
        const el = ext.renderCellChange(c);
        expect(el.name).toBe('w:' + kind);
        const back = ext.parseCellChange(el);
        expect(back.kind).toBe(kind);
        expect(back.author).toBe('A');
    });
});
