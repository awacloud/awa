// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { buildXml, buildDocxProps } from './build.js';

describe('tests/_helpers/build', () => {
    test('buildXml returns a fresh xml factory', () => {
        const a = buildXml();
        const b = buildXml();
        expect(a).not.toBe(b);
        expect(typeof a.parse).toBe('function');
        expect(typeof a.serialize).toBe('function');
    });

    test('buildDocxProps wires xml + properties', () => {
        const { xml, props } = buildDocxProps();
        expect(typeof xml.parse).toBe('function');
        expect(typeof props.parseRunProperties).toBe('function');
        expect(typeof props.renderRunProperties).toBe('function');
    });

    test('buildDocxProps respects an injected xml', () => {
        const xml = buildXml();
        const { xml: returned, props } = buildDocxProps(xml);
        expect(returned).toBe(xml);
        expect(typeof props.parseRunProperties).toBe('function');
    });
});
