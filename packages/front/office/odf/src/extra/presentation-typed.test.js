// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { xml as fwXml } from '@awacloud/fw/io/codec/xml.js';
import { presentationTyped } from './presentation-typed.js';

const xml = fwXml.factory();
const ext = presentationTyped.factory(xml);

describe('presentationTyped — factory', () => {
    test('contract', () => {
        expect(presentationTyped.name).toBe('presentationTyped');
        expect(presentationTyped.dependencies).toEqual(['xml']);
    });
});

describe('presentationTyped — parse/render', () => {
    test('roundtrip transition', () => {
        const el = xml.el('presentation:transition',
            { 'presentation:transition-style': 'fade' });
        const n = ext.parseNode(el);
        expect(n.kind).toBe('presentation:transition');
        const back = ext.renderNode(n);
        expect(back.attrs['presentation:transition-style']).toBe('fade');
    });
});

describe('presentationTyped — hooks', () => {
    test('hydrateSlide promotes presentation:* nodes', () => {
        const placeholder = xml.el('presentation:placeholder', { 'presentation:object': 'title' });
        const slide = { type: 'slide', _extras: [placeholder] };
        ext.hydrateSlide(slide);
        expect(slide.presentation).toHaveLength(1);
        expect(slide.presentation[0].kind).toBe('presentation:placeholder');
    });
    test('dehydrateSlide demotes back', () => {
        const slide = { type: 'slide', presentation: [
            { kind: 'presentation:notes', attrs: {} }
        ] };
        const out = ext.dehydrateSlide(slide);
        expect(out._extras[0].name).toBe('presentation:notes');
    });
});
