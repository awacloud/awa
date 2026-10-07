// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { xml as fwXml } from '@awacloud/fw/io/codec/xml.js';
import { buildTypedFamily, odfTypedHelper } from './_typed-helper.js';

const xml = fwXml.factory();

describe('_typed-helper — buildTypedFamily (legacy ESM)', () => {
    const NAMES = new Set(['demo:a', 'demo:b']);
    const f = buildTypedFamily(xml, NAMES, 'demo:', 'demo-node');

    test('parseElement recursive + typed type tag', () => {
        const el = xml.el('demo:a', { z: '1' }, [xml.el('demo:b', {}, [])]);
        const p = f.parseElement(el);
        expect(p.type).toBe('demo-node');
        expect(p.kind).toBe('a');
        expect(p.children[0].kind).toBe('b');
    });
    test('renderElement reverses', () => {
        const obj = { type: 'demo-node', kind: 'a', attrs: { z: '1' },
            children: [{ type: 'demo-node', kind: 'b', attrs: {} }] };
        const r = f.renderElement(obj);
        expect(r.name).toBe('demo:a');
        expect(r.children[0].name).toBe('demo:b');
    });
    test('isCovered', () => {
        expect(f.isCovered('demo:a')).toBe(true);
        expect(f.isCovered('text:p')).toBe(false);
    });
});

describe('odfTypedHelper — factory descriptor', () => {
    test('module contract', () => {
        expect(odfTypedHelper.name).toBe('odfTypedHelper');
        expect(odfTypedHelper.dependencies).toEqual(['xml']);
        expect(typeof odfTypedHelper.factory).toBe('function');
    });

    test('factory exposes buildTypedFamily', () => {
        const inst = odfTypedHelper.factory(xml);
        expect(typeof inst.buildTypedFamily).toBe('function');
    });

    test('buildTypedFamily returns same shape as legacy export', () => {
        const inst = odfTypedHelper.factory(xml);
        const NAMES = new Set(['demo:a']);
        const h = inst.buildTypedFamily(NAMES, 'demo:', 'demo-node');
        expect(typeof h.parseElement).toBe('function');
        const p = h.parseElement(xml.el('demo:a', { z: '1' }));
        expect(p.type).toBe('demo-node');
        expect(p.kind).toBe('a');
    });
});
