// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { xml as fwXml } from '@awacloud/fw/io/codec/xml.js';
import { textTrackedChanges } from './text-tracked-changes.js';

const xml = fwXml.factory();
const ext = textTrackedChanges.factory(xml);

describe('textTrackedChanges — factory shape', () => {
    test('contract', () => {
        expect(textTrackedChanges.name).toBe('textTrackedChanges');
        expect(textTrackedChanges.dependencies).toEqual(['xml']);
        expect(typeof textTrackedChanges.factory).toBe('function');
    });
    test('exposes parse/render + hooks', () => {
        expect(typeof ext.parseTrackedChanges).toBe('function');
        expect(typeof ext.renderTrackedChanges).toBe('function');
        expect(typeof ext.hydrateParagraph).toBe('function');
        expect(typeof ext.dehydrateParagraph).toBe('function');
    });
});

describe('textTrackedChanges — parse/render', () => {
    test('roundtrip of a single insertion region', () => {
        const tc = {
            type: 'tracked-changes',
            regions: [
                { type: 'changed-region', id: 'r1', kind: 'insertion',
                  change: { attrs: {}, info: { creator: 'Alice', date: '2026-01-01' }, body: [] } }
            ]
        };
        const el = ext.renderTrackedChanges(tc);
        const parsed = ext.parseTrackedChanges(el);
        expect(parsed.regions).toHaveLength(1);
        expect(parsed.regions[0].kind).toBe('insertion');
        expect(parsed.regions[0].change.info.creator).toBe('Alice');
    });
});

describe('textTrackedChanges — change marker hooks', () => {
    test('hydrateParagraph promotes change markers', () => {
        const el = xml.el('text:change-start', { 'text:change-id': 'c1' });
        const p = { type: 'paragraph', _extras: [el] };
        ext.hydrateParagraph(p);
        expect(p.changeMarkers).toBeDefined();
        expect(p.changeMarkers).toHaveLength(1);
        expect(p.changeMarkers[0].id).toBe('c1');
        expect(p._extras).toBeUndefined();
    });
    test('dehydrateParagraph demotes change markers', () => {
        const p = { type: 'paragraph', changeMarkers: [{ type: 'change-marker', kind: 'text:change-end', id: 'c1' }] };
        const out = ext.dehydrateParagraph(p);
        expect(out.changeMarkers).toBeUndefined();
        expect(out._extras).toBeDefined();
        expect(out._extras[0].name).toBe('text:change-end');
    });
});
