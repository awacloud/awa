// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { xml as fwXml } from '@awacloud/fw/io/codec/xml.js';
import { buildMiscPassthrough, odfMiscHelper } from './_misc-helper.js';

const xml = fwXml.factory();

describe('_misc-helper — buildMiscPassthrough (legacy ESM)', () => {
    const NAMES = new Set(['demo:a', 'demo:b']);
    const h = buildMiscPassthrough(xml, NAMES, 'demo:');

    test('parseElement → typed bag with _passthrough flag', () => {
        const el = xml.el('demo:a', { 'x': '1' }, [xml.el('demo:b', {}, [])]);
        const p = h.parseElement(el);
        expect(p._passthrough).toBe(true);
        expect(p.kind).toBe('a');
        expect(p.children).toHaveLength(1);
        expect(p.children[0].kind).toBe('b');
    });

    test('renderElement reverses', () => {
        const obj = { _passthrough: true, kind: 'a', attrs: { x: '1' },
            children: [{ _passthrough: true, kind: 'b', attrs: {}, children: [] }] };
        const r = h.renderElement(obj);
        expect(r.name).toBe('demo:a');
        expect(r.children[0].name).toBe('demo:b');
    });

    test('isCovered + ELEMENTS exposed', () => {
        expect(h.isCovered('demo:a')).toBe(true);
        expect(h.isCovered('demo:z')).toBe(false);
        expect(h.ELEMENTS).toBe(NAMES);
    });

    test('parseElement returns null for non-covered or non-element', () => {
        expect(h.parseElement(null)).toBeNull();
        expect(h.parseElement({ type: 'text', value: 'x' })).toBeNull();
        expect(h.parseElement(xml.el('demo:zzz', {}, []))).toBeNull();
    });
});

describe('odfMiscHelper — factory descriptor', () => {
    test('module contract', () => {
        expect(odfMiscHelper.name).toBe('odfMiscHelper');
        expect(odfMiscHelper.dependencies).toEqual(['xml']);
        expect(typeof odfMiscHelper.factory).toBe('function');
    });

    test('factory exposes buildMiscPassthrough', () => {
        const inst = odfMiscHelper.factory(xml);
        expect(typeof inst.buildMiscPassthrough).toBe('function');
    });

    test('buildMiscPassthrough returns same shape as legacy export', () => {
        const inst = odfMiscHelper.factory(xml);
        const NAMES = new Set(['demo:a']);
        const h = inst.buildMiscPassthrough(NAMES, 'demo:');
        expect(typeof h.parseElement).toBe('function');
        expect(typeof h.renderElement).toBe('function');
        expect(typeof h.isCovered).toBe('function');
        expect(h.ELEMENTS).toBe(NAMES);
        const el = xml.el('demo:a', { x: '1' });
        const p = h.parseElement(el);
        expect(p._passthrough).toBe(true);
        expect(p.kind).toBe('a');
    });
});
