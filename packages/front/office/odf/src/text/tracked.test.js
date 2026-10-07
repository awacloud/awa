// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { textTracked } from './tracked.js';
import { xml as fwXml } from '@awacloud/fw/io/codec/xml.js';

function build() {
    const xml = fwXml.factory();
    const t = textTracked.factory(xml);
    return { xml, t };
}

describe('textTracked module', () => {
    test('factory shape', () => {
        expect(textTracked.name).toBe('textTracked');
        expect(textTracked.dependencies).toEqual(['xml']);
        expect(typeof textTracked.factory).toBe('function');
    });

    describe('change markers', () => {
        test('isChangeMarkerName recognises markers', () => {
            const { t } = build();
            expect(t.isChangeMarkerName('text:change')).toBe(true);
            expect(t.isChangeMarkerName('text:change-start')).toBe(true);
            expect(t.isChangeMarkerName('text:change-end')).toBe(true);
            expect(t.isChangeMarkerName('text:span')).toBe(false);
        });

        test('parse + render roundtrip', () => {
            const { xml, t } = build();
            const el = xml.parse('<text:change-start text:change-id="c1"/>');
            const m = t.parseChangeMarker(el);
            expect(m.kind).toBe('text:change-start');
            expect(m.id).toBe('c1');
            const out = xml.serialize(t.renderChangeMarker(m));
            expect(out).toContain('text:change-id="c1"');
        });

        test('preserves extra attributes on markers', () => {
            const { xml, t } = build();
            const el = xml.parse('<text:change text:change-id="c1" foo:bar="42"/>');
            const m = t.parseChangeMarker(el);
            expect(m._extras.attrs['foo:bar']).toBe('42');
            const out = xml.serialize(t.renderChangeMarker(m));
            expect(out).toContain('foo:bar="42"');
        });
    });

    describe('tracked-changes container', () => {
        test('parses insertion + deletion + format-change', () => {
            const { xml, t } = build();
            const src =
                '<text:tracked-changes>' +
                '<text:changed-region text:id="r1">' +
                '<text:insertion>' +
                '<office:change-info><dc:creator>Alice</dc:creator><dc:date>2026-05-13T10:00:00</dc:date></office:change-info>' +
                '</text:insertion></text:changed-region>' +
                '<text:changed-region text:id="r2">' +
                '<text:deletion>' +
                '<office:change-info><dc:creator>Bob</dc:creator><dc:date>2026-05-13T11:00:00</dc:date></office:change-info>' +
                '<text:p>deleted body</text:p>' +
                '</text:deletion></text:changed-region>' +
                '<text:changed-region text:id="r3">' +
                '<text:format-change>' +
                '<office:change-info><dc:creator>Carol</dc:creator><dc:date>2026-05-13T12:00:00</dc:date></office:change-info>' +
                '</text:format-change></text:changed-region>' +
                '</text:tracked-changes>';
            const el = xml.parse(src);
            const m = t.parseTrackedChanges(el);
            expect(m.trackedChanges).toHaveLength(3);
            expect(m.trackedChanges[0].kind).toBe('insertion');
            expect(m.trackedChanges[0].creator).toBe('Alice');
            expect(m.trackedChanges[1].kind).toBe('deletion');
            expect(m.trackedChanges[1].body).toBeDefined();
            expect(m.trackedChanges[2].kind).toBe('format-change');
        });

        test('render roundtrip', () => {
            const { xml, t } = build();
            const m = {
                trackedChanges: [
                    { id: 'r1', kind: 'insertion', creator: 'Alice', date: '2026-05-13T10:00:00' }
                ]
            };
            const out = xml.serialize(t.renderTrackedChanges(m));
            expect(out).toContain('<text:changed-region text:id="r1">');
            expect(out).toContain('<text:insertion>');
            expect(out).toContain('<dc:creator>Alice</dc:creator>');
        });

        test('parse → render → parse stability', () => {
            const { xml, t } = build();
            const src =
                '<text:tracked-changes>' +
                '<text:changed-region text:id="r1">' +
                '<text:insertion>' +
                '<office:change-info><dc:creator>X</dc:creator><dc:date>2026-01-01</dc:date></office:change-info>' +
                '</text:insertion></text:changed-region></text:tracked-changes>';
            const m = t.parseTrackedChanges(xml.parse(src));
            const re = t.parseTrackedChanges(xml.parse(xml.serialize(t.renderTrackedChanges(m))));
            expect(re.trackedChanges).toHaveLength(1);
            expect(re.trackedChanges[0].creator).toBe('X');
        });
    });
});
