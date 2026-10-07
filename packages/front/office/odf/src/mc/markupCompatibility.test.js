// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { odfMc } from './markupCompatibility.js';
import { xml as fwXml } from '@awacloud/fw/io/codec/xml.js';

function build() {
    const xml = fwXml.factory();
    const mc = odfMc.factory(xml);
    return { xml, mc };
}

describe('odfMc module', () => {
    test('factory shape', () => {
        expect(odfMc.name).toBe('odfMc');
        expect(odfMc.dependencies).toEqual(['xml']);
    });

    test('versionOf reads office:version', () => {
        const { xml, mc } = build();
        const el = xml.parse('<office:document-content office:version="1.4"/>');
        expect(mc.versionOf(el)).toBe('1.4');
    });

    test('versionOf returns null when absent', () => {
        const { xml, mc } = build();
        const el = xml.parse('<office:document-content/>');
        expect(mc.versionOf(el)).toBeNull();
    });

    test('meetsVersion compares dotted versions', () => {
        const { xml, mc } = build();
        const e14 = xml.parse('<x office:version="1.4"/>');
        const e12 = xml.parse('<x office:version="1.2"/>');
        const e2  = xml.parse('<x office:version="2.0"/>');
        const e0  = xml.parse('<x/>');
        expect(mc.meetsVersion(e14, '1.3')).toBe(true);
        expect(mc.meetsVersion(e14, '1.4')).toBe(true);
        expect(mc.meetsVersion(e12, '1.3')).toBe(false);
        expect(mc.meetsVersion(e2, '1.4')).toBe(true);
        expect(mc.meetsVersion(e0, '1.0')).toBe(false);
    });

    test('process is a no-op passthrough', () => {
        const { xml, mc } = build();
        const el = xml.parse('<office:document-content office:version="1.4"><office:body/></office:document-content>');
        expect(mc.process(el)).toBe(el);
    });
});
