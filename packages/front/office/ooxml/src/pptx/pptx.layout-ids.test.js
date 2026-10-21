// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * Tests — `pptx.write` writes each master's `p:sldLayoutIdLst` from the
 * layouts it writes: the master's relationships name them `rId1`…`rIdK`,
 * so an entry naming any other relationship would dangle (ECMA-376 Part 1
 * § 19.3.1.41), and a written layout without an entry gets one.
 */
import { describe, test, expect } from 'bun:test';
import { ooxmlRuntime } from '../../tests/_helpers/written-documents.js';

const rt = ooxmlRuntime();
const p = rt.resolve('pptx');
const opc = rt.resolve('opcPackage');
const xml = rt.resolve('xml');
const decoder = new TextDecoder();

const MASTER = '/ppt/slideMasters/slideMaster1.xml';
const layout = (name) => ({ type: 'slideLayout', layoutType: 'obj', cSldName: name, shapes: [] });

/** `[id, r:id]` of every `p:sldLayoutId` of a written master. */
function layoutIdList(bytes, part = MASTER) {
    const root = xml.parse(decoder.decode(opc.read(bytes).parts[part]));
    const lst = root.children.find(c => c.name === 'p:sldLayoutIdLst');
    return lst ? lst.children.filter(c => c.type === 'element').map(c => [c.attrs.id, c.attrs['r:id']]) : [];
}
/** The layout relationship ids of a written master. */
const layoutRels = (bytes, part = MASTER) => opc.read(bytes).rels[part]
    .filter(r => r.Type.endsWith('/slideLayout')).map(r => r.Id).sort();

/** A presentation as `pptx.read` gives it, with three layouts written. */
function readDeck() {
    return p.read(p.write({ slides: [{ title: 'one' }], slideLayouts: [layout('A'), layout('B'), layout('C')] })).presentation;
}

describe('pptx — the master lists exactly the written layouts', () => {
    test('a deck whose slides use fewer layouts than the master lists writes no dangling entry', () => {
        const deck = p.read(p.write({ slides: [{ title: 'one', layoutRef: 1 }], slideLayouts: [layout('A'), layout('B'), layout('C')] })).presentation;
        expect(deck.slideLayouts).toHaveLength(1);
        expect(deck.slideMasters[0].layoutIds.map(l => l.rId)).toEqual(['rId1', 'rId2', 'rId3']);
        const bytes = p.write(deck);
        expect(layoutIdList(bytes)).toEqual([['2147483649', 'rId1']]);
        expect(layoutRels(bytes)).toEqual(['rId1']);
    });

    test('given entries keep their id and order; a layout without one gets a fresh id', () => {
        const deck = readDeck();
        deck.slideLayouts = [layout('A'), layout('B'), layout('C')];
        // The dropped entry's id is free again: it does not raise the fresh id.
        deck.slideMasters[0].layoutIds = [{ id: '2147483700', rId: 'rId3' }, { id: '2147483790', rId: 'rId9' }, { id: '2147483655', rId: 'rId1' }];
        expect(layoutIdList(p.write(deck))).toEqual([['2147483700', 'rId3'], ['2147483655', 'rId1'], ['2147483701', 'rId2']]);
    });

    test('a fresh id is above every master id too', () => {
        const deck = readDeck();
        deck.slideLayouts = [layout('A'), layout('B')];
        deck.slideMasters = [deck.slideMasters[0], { ...deck.slideMasters[0] }, { ...deck.slideMasters[0] }];
        for (const m of deck.slideMasters) m.layoutIds = [{ id: '2147483648', rId: 'rId9' }];
        const bytes = p.write(deck);
        // Master ids are 2147483648 … 2147483650.
        expect(layoutIdList(bytes)).toEqual([['2147483651', 'rId1'], ['2147483652', 'rId2']]);
    });

    test('the model is not modified and a second write gives the same bytes', () => {
        const deck = readDeck();
        deck.slideMasters[0].layoutIds = [{ id: '2147483649', rId: 'rId1' }, { id: '2147483650', rId: 'rId7' }];
        const before = JSON.stringify(deck.slideMasters[0].layoutIds);
        const once = p.write(deck);
        expect(JSON.stringify(deck.slideMasters[0].layoutIds)).toBe(before);
        const twice = p.write(deck);
        expect(decoder.decode(opc.read(twice).parts[MASTER])).toBe(decoder.decode(opc.read(once).parts[MASTER]));
    });

    test('a matching list and the defaults give the bytes they gave before', () => {
        const built = p.write({ slides: [{ title: 'one' }, { title: 'two', layoutRef: 1 }], slideLayouts: [layout('A'), layout('B')] });
        expect(layoutIdList(built)).toEqual([['2147483649', 'rId1'], ['2147483650', 'rId2']]);
        expect(layoutIdList(p.write({ slides: [{ title: 'one' }] }))).toEqual([['2147483649', 'rId1']]);
    });
});
