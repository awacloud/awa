// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { xml as ooxmlXml } from '@awacloud/fw/io/codec/xml.js';
import { pmlLayoutsTyped } from './pml-layouts-typed.js';

const xml = ooxmlXml.factory();
const ext = pmlLayoutsTyped.factory(xml);

describe('extra/pml-layouts-typed', () => {
    test('builds a layout for every primary type', () => {
        for (const type of ext.PRIMARY_LAYOUT_TYPES) {
            const text = ext.buildLayout({ type, name: 'L_' + type });
            expect(text).toContain(`type="${type}"`);
            expect(text).toContain('<p:cSld');
            expect(text).toContain('<p:clrMapOvr');
            expect(ext.parseLayoutType(text)).toBe(type);
        }
    });

    test('builds for all 37 layout types in the catalog', () => {
        for (const type of ext.LAYOUT_TYPES) {
            const text = ext.buildLayout({ type });
            expect(text).toContain(`type="${type}"`);
        }
    });

    test('parseLayout surfaces attrs and children', () => {
        const text = ext.buildLayout({
            type: 'twoObj', name: 'two-obj',
            preserve: '1', userDrawn: '0',
            showMasterSp: '1', showMasterPhAnim: '1'
        });
        const layout = ext.parseLayout(text);
        expect(layout.type).toBe('twoObj');
        expect(layout.preserve).toBe('1');
        expect(layout.userDrawn).toBe('0');
        expect(layout.showMasterSp).toBe('1');
        expect(layout.showMasterPhAnim).toBe('1');
        expect(layout.cSld.name).toBe('two-obj');
        expect(layout.clrMapOvr.masterClrMapping).toBe(true);
    });

    test('parseLayout reads transition / timing / hf children', () => {
        const text = `<p:sldLayout xmlns:p="x" xmlns:a="a" type="obj" preserve="1">
            <p:cSld><p:spTree/></p:cSld>
            <p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>
            <p:transition spd="med"><p:fade/></p:transition>
            <p:timing/>
            <p:hf hdr="0"/>
        </p:sldLayout>`;
        const l = ext.parseLayout(text);
        expect(l.transition.attrs.spd).toBe('med');
        expect(l.timing).toBeDefined();
        expect(l.hf.attrs.hdr).toBe('0');
    });
});
