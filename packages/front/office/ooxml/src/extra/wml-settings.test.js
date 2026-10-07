// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { xml as ooxmlXml } from '@awacloud/fw/io/codec/xml.js';
import { docxProperties } from '../docx/properties.js';
import { wmlSettings } from './wml-settings.js';

const xml = ooxmlXml.factory();
const core = docxProperties.factory(xml);
const ext = wmlSettings.factory(xml, core);

function makeRoot(extras) { return { _extras: extras }; }

describe('extra/wml-settings — toggles + val fields', () => {
    test('hydrate toggles', () => {
        const r = makeRoot([
            xml.el('w:autoHyphenation', {}),
            xml.el('w:hideSpellingErrors', { 'w:val': '0' }),
            xml.el('w:trackRevisions', {})
        ]);
        ext.hydrate(r);
        expect(r.autoHyphenation).toBe(true);
        expect(r.hideSpellingErrors).toBe(false);
        expect(r.trackRevisions).toBe(true);
    });

    test('roundtrip toggles + val + complex', () => {
        const root = {
            autoHyphenation: true,
            evenAndOddHeaders: true,
            decimalSymbol: '.',
            characterSpacingControl: 'compressPunctuation',
            view: { val: 'print' },
            zoom: { val: 'none', percent: '125' },
            rsids: { rsidRoot: '00112233', rsids: ['00112233', 'AABBCCDD'] },
            compat: { settings: [
                { name: 'compatibilityMode', uri: 'http://schemas.microsoft.com/office/word', val: '14' }
            ]},
            themeFontLang: { val: 'en-US', eastAsia: 'zh-CN' },
            mailMerge: { attrs: {}, children: [] },
            trackChanges: {},
            proofState: { spelling: 'clean', grammar: 'clean' },
            footnotePr: { children: [] },
            endnotePr: { children: [] },
            documentProtection: { edit: 'readOnly', enforcement: '1' },
            writeProtection: { recommended: '1' },
            attachedSchemas: ['http://example.com/schema'],
            shapeDefaults: { children: [] },
            hdrShapeDefaults: { children: [] },
            revisionView: { markup: '1' },
            clrSchemeMapping: { bg1: 'light1' },
            smartTagPr: { children: [] }
        };
        const dehydrated = ext.dehydrate({ ...root });
        expect(dehydrated._extras.length).toBeGreaterThan(0);
        const re = ext.hydrate({ _extras: dehydrated._extras });
        expect(re.autoHyphenation).toBe(true);
        expect(re.evenAndOddHeaders).toBe(true);
        expect(re.decimalSymbol).toBe('.');
        expect(re.characterSpacingControl).toBe('compressPunctuation');
        expect(re.zoom.percent).toBe('125');
        expect(re.rsids.rsidRoot).toBe('00112233');
        expect(re.rsids.rsids).toHaveLength(2);
        expect(re.compat.settings[0].val).toBe('14');
        expect(re.themeFontLang.val).toBe('en-US');
        expect(re.attachedSchemas).toEqual(['http://example.com/schema']);
        expect(re.documentProtection.edit).toBe('readOnly');
    });

    test('unknown extras preserved', () => {
        const r = ext.hydrate({ _extras: [xml.el('w:zzUnknown', {})] });
        expect(r._extras).toHaveLength(1);
    });
});
