// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { xml as fwXml } from '@awacloud/fw/io/codec/xml.js';
import { stylePropertiesTyped } from './style-properties-typed.js';

const xml = fwXml.factory();
const ext = stylePropertiesTyped.factory(xml);

describe('stylePropertiesTyped — factory', () => {
    test('contract', () => {
        expect(stylePropertiesTyped.name).toBe('stylePropertiesTyped');
        expect(stylePropertiesTyped.dependencies).toEqual(['xml']);
    });
});

describe('stylePropertiesTyped — parse/render', () => {
    test('promotes known attrs into typed fields, preserves unknowns', () => {
        const el = xml.el('style:text-properties', {
            'fo:font-size': '12pt',
            'fo:color': '#000000',
            'fo:unknown': 'X'
        });
        const props = ext.parseProperties(el);
        expect(props.fontSize).toBe('12pt');
        expect(props.color).toBe('#000000');
        expect(props.attrs['fo:unknown']).toBe('X');
        const back = ext.renderProperties(props);
        expect(back.attrs['fo:font-size']).toBe('12pt');
        expect(back.attrs['fo:unknown']).toBe('X');
    });
});

describe('stylePropertiesTyped — hooks', () => {
    test('hydrateStyles walks every style node child', () => {
        const styleEl = {
            type: 'element', name: 'style:style',
            attrs: { 'style:name': 'S' },
            children: [
                xml.el('style:text-properties', { 'fo:font-weight': 'bold' })
            ]
        };
        const styles = { styles: [styleEl] };
        ext.hydrateStyles(styles);
        expect(styles.styles[0].children[0].fontWeight).toBe('bold');
    });
});
