// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { textBookmarks } from './bookmarks.js';
import { xml as fwXml } from '@awacloud/fw/io/codec/xml.js';

function build() {
    const xml = fwXml.factory();
    const b = textBookmarks.factory(xml);
    return { xml, b };
}

describe('textBookmarks module', () => {
    test('factory shape', () => {
        expect(textBookmarks.name).toBe('textBookmarks');
        expect(textBookmarks.dependencies).toEqual(['xml']);
        expect(typeof textBookmarks.factory).toBe('function');
    });

    describe('isMarkerName', () => {
        test('recognises all kinds', () => {
            const { b } = build();
            for (const k of ['text:bookmark', 'text:bookmark-start', 'text:bookmark-end',
                'text:reference-mark', 'text:reference-mark-start', 'text:reference-mark-end']) {
                expect(b.isMarkerName(k)).toBe(true);
            }
            expect(b.isMarkerName('text:span')).toBe(false);
        });
    });

    describe('parseMarker / renderMarker', () => {
        test('roundtrip preserves name', () => {
            const { xml, b } = build();
            const el = xml.parse('<text:bookmark-start text:name="bm1"/>');
            const m = b.parseMarker(el);
            expect(m.kind).toBe('text:bookmark-start');
            expect(m.name).toBe('bm1');
            const out = xml.serialize(b.renderMarker(m));
            expect(out).toContain('<text:bookmark-start text:name="bm1"/>');
        });

        test('preserves extra attributes', () => {
            const { xml, b } = build();
            const el = xml.parse('<text:bookmark text:name="x" foo:bar="42"/>');
            const m = b.parseMarker(el);
            expect(m._extras.attrs['foo:bar']).toBe('42');
            const out = xml.serialize(b.renderMarker(m));
            expect(out).toContain('foo:bar="42"');
        });
    });
});
