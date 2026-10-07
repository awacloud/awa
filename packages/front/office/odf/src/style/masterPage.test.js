// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { styleMasterPage } from './masterPage.js';
import { xml as fwXml } from '@awacloud/fw/io/codec/xml.js';

function build() {
    const xml = fwXml.factory();
    return { xml, mp: styleMasterPage.factory(xml) };
}

describe('styleMasterPage module', () => {
    test('factory shape', () => {
        expect(styleMasterPage.name).toBe('styleMasterPage');
        expect(styleMasterPage.dependencies).toEqual(['xml']);
        expect(typeof styleMasterPage.factory).toBe('function');
    });

    describe('parseMasterPage / renderMasterPage', () => {
        test('with header + footer', () => {
            const { xml, mp } = build();
            const el = xml.parse('<style:master-page style:name="Std" style:page-layout-name="pm1"><style:header><text:p>Hdr</text:p></style:header><style:footer><text:p>Ftr</text:p></style:footer></style:master-page>');
            const m = mp.parseMasterPage(el);
            expect(m.name).toBe('Std');
            expect(m.pageLayoutName).toBe('pm1');
            expect(m.headers.default).toHaveLength(1);
            expect(m.footers.default).toHaveLength(1);
            const out = xml.serialize(mp.renderMasterPage(m));
            expect(out).toContain('style:name="Std"');
            expect(out).toContain('<style:header>');
            expect(out).toContain('Hdr');
            expect(out).toContain('Ftr');
        });

        test('display name preserved', () => {
            const { xml, mp } = build();
            const m = mp.parseMasterPage(xml.parse('<style:master-page style:name="S" style:page-layout-name="L" style:display-name="Standard"/>'));
            expect(m.displayName).toBe('Standard');
        });
    });
});
