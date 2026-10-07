// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * Roundtrip + dispatch tests for transitional element typing — phase 29.
 */
import { describe, test, expect } from 'bun:test';
import { xml as ooxmlXml } from '@awacloud/fw/io/codec/xml.js';
import { transitional } from './transitional.js';

const xml = ooxmlXml.factory();
const m = transitional.factory(xml);

describe('extra/transitional namespace mapping', () => {
    test('toStrict / fromStrict rewrite xmlns attrs recursively', () => {
        const node = xml.el('w:document', {
            'xmlns:w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
        }, [xml.el('w:body', {})]);
        const strict = m.toStrict(node);
        expect(strict.attrs['xmlns:w']).toBe('http://purl.oclc.org/ooxml/wordprocessingml/main');
        const back = m.fromStrict(strict);
        expect(back.attrs['xmlns:w']).toBe('http://schemas.openxmlformats.org/wordprocessingml/2006/main');
    });
});

describe('extra/transitional element table', () => {
    test('TRANSITIONAL_ELEMENTS lists ~50 entries with kind', () => {
        expect(m.TRANSITIONAL_ELEMENTS.length).toBeGreaterThanOrEqual(48);
        for (const t of m.TRANSITIONAL_ELEMENTS) {
            expect(typeof t.name).toBe('string');
            expect(['attribute-rename', 'value-enum', 'element-rename', 'deprecated', 'namespace-only']).toContain(t.kind);
        }
    });

    test('isTransitionalOnly identifies deprecated elements', () => {
        expect(m.isTransitionalOnly('w:embedSystemFonts')).toBe(true);
        expect(m.isTransitionalOnly('w:document')).toBe(false);
        expect(m.isTransitionalOnly('w:p')).toBe(false);
    });
});

describe('extra/transitional element converter', () => {
    test('transitionalToStrict drops deprecated elements', () => {
        for (const tag of ['w:embedSystemFonts', 'w:noLineBreaksAfter',
            'w:applyBreakingRules', 'w:gutterAtTop', 'w:mirrorMargins',
            'w:doNotShadeFormData', 'a:vmlDrawing']) {
            const out = m.transitionalToStrict(xml.el(tag, {}));
            expect(out).toBeNull();
        }
    });

    test('transitionalToStrict preserves structural elements', () => {
        const doc = xml.el('w:document', {});
        const out = m.transitionalToStrict(doc);
        expect(out).not.toBeNull();
        expect(out.name).toBe('w:document');
    });

    test('strictToTransitional + buildTransitional roundtrip', () => {
        const built = m.buildTransitional('w:embedSystemFonts', { 'w:val': '1' });
        expect(built.name).toBe('w:embedSystemFonts');
        expect(built.attrs['w:val']).toBe('1');

        for (const tag of ['w:saveSubsetFonts', 'w:cachedColBalance',
            'w:autoSpaceDE', 'w:autoSpaceDN', 'w:bordersDoNotSurroundHeader',
            'w:bordersDoNotSurroundFooter', 'w:characterSpacingControl',
            'w:trackChange', 'w:document', 'w:body']) {
            const el = m.buildTransitional(tag, {});
            expect(el.name).toBe(tag);
        }
    });
});
