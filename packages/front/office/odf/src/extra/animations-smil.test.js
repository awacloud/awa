// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { xml as fwXml } from '@awacloud/fw/io/codec/xml.js';
import { animationsSmil } from './animations-smil.js';
import { odfTypedHelper } from './_typed-helper.js';

const xml = fwXml.factory();
const helper = odfTypedHelper.factory(xml);
const ext = animationsSmil.factory(xml, helper);

describe('animationsSmil', () => {
    test('contract', () => {
        expect(animationsSmil.name).toBe('animationsSmil');
        expect(animationsSmil.dependencies).toEqual(['xml', 'odfTypedHelper']);
    });
    test('parse anim:par with nested anim:set', () => {
        const el = xml.el('anim:par', {}, [xml.el('anim:set', { 'smil:dur': '1s' })]);
        const p = ext.parseAnim(el);
        expect(p.kind).toBe('par');
        expect(p.children[0].kind).toBe('set');
        expect(ext.renderAnim(p).name).toBe('anim:par');
    });
    test('hydrate/dehydrate slide', () => {
        const slide = { _extras: [xml.el('anim:seq', {})] };
        ext.hydrateSlide(slide);
        expect(slide.animations).toHaveLength(1);
        const back = ext.dehydrateSlide(slide);
        expect(back._extras[0].name).toBe('anim:seq');
    });
});
