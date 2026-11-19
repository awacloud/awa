// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { xml as ooxmlXml } from '@awacloud/fw/io/codec/xml.js';
import { docxSettings } from './settings.js';
import { ooxmlErrors as _ooxmlErrors } from '../errors.js';
import { ooxmlShared as _ooxmlShared } from '../_shared/index.js';
const _errors = _ooxmlErrors.factory();
const _shared = _ooxmlShared.factory();

const xml = ooxmlXml.factory();
const settings = docxSettings.factory(_errors, xml, _shared);

describe('docxSettings', () => {
    test('roundtrip known toggles + zoom + tabStop', () => {
        const obj = {
            defaultTabStop: 720,
            evenAndOddHeaders: true,
            updateFields: true,
            zoom: { val: 'none', percent: 150 }
        };
        const back = settings.parse(settings.serialize(obj));
        expect(back).toEqual(obj);
    });

    test('preserves unknown elements verbatim', () => {
        const xmlText = '<?xml version="1.0"?>'
            + '<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
            + '<w:defaultTabStop w:val="720"/>'
            + '<w:characterSpacingControl w:val="doNotCompress"/>'
            + '<w:rsids><w:rsid w:val="00112233"/></w:rsids>'
            + '</w:settings>';
        const obj = settings.parse(xmlText);
        expect(obj.defaultTabStop).toBe(720);
        expect(obj._extras.map(n => n.name))
            .toEqual(['w:characterSpacingControl', 'w:rsids']);

        // Roundtrip should re-emit the unknowns.
        const back = settings.parse(settings.serialize(obj));
        expect(back._extras.map(n => n.name))
            .toEqual(['w:characterSpacingControl', 'w:rsids']);
    });
});

// T71: a toggle the part states false is written back, w:val="0".
describe('docxSettings — a false toggle kept (T71)', () => {
    const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
    test('evenAndOddHeaders, updateFields and trackRevisions stated false are written back with w:val="0"', () => {
        const obj = settings.parse(`<w:settings ${W}><w:evenAndOddHeaders w:val="0"/><w:updateFields w:val="false"/><w:trackRevisions w:val="0"/></w:settings>`);
        expect(obj.evenAndOddHeaders).toBe(false);
        expect(obj.updateFields).toBe(false);
        expect(obj.trackChanges).toBe(false);
        const out = settings.serialize(obj);
        expect(out).toContain('<w:evenAndOddHeaders w:val="0"/>');
        expect(out).toContain('<w:updateFields w:val="0"/>');
        expect(out).toContain('<w:trackRevisions w:val="0"/>');
        expect(settings.parse(out)).toEqual(obj);
    });

    test('a true toggle as before, an absent one not written', () => {
        const out = settings.serialize({ evenAndOddHeaders: true });
        expect(out).toContain('<w:evenAndOddHeaders/>');
        expect(out).not.toContain('w:updateFields');
        expect(out).not.toContain('w:trackRevisions');
    });
});
