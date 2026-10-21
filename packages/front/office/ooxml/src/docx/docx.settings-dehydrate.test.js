// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * Tests — `docx.write` writes the settings an extension's
 * `dehydrateSettings` returns. `wmlSettings.dehydrate` returns a new
 * object (the caller's settings are left alone): the typed toggles it
 * demotes must reach `word/settings.xml`.
 */
import { describe, test, expect } from 'bun:test';
import { ooxmlRuntime } from '../../tests/_helpers/written-documents.js';
import { wmlSettings } from '../extra/wml-settings.js';

const rt = ooxmlRuntime();
const d = rt.resolve('docx');
d.use(wmlSettings.factory(rt.resolve('xml'), rt.resolve('docxProperties')));
const opc = rt.resolve('opcPackage');
const decoder = new TextDecoder();
const doc = { type: 'document', body: [d.paragraph('x')] };
const settingsXml = (bytes) => decoder.decode(opc.read(bytes).parts['/word/settings.xml']);

describe('docx.write — settings demoted by an extension are written', () => {
    test('typed toggles and values of wmlSettings reach settings.xml', () => {
        const text = settingsXml(d.write(doc, { settings: { autoHyphenation: true, decimalSymbol: ',', defaultTabStop: 720 } }));
        expect(text).toContain('<w:autoHyphenation/>');
        expect(text).toContain('<w:decimalSymbol w:val=","/>');
        expect(text).toContain('<w:defaultTabStop w:val="720"/>');
    });

    test('read → write → read keeps them; the caller\'s settings object is left as given', () => {
        const settings = { autoHyphenation: true, defaultTabStop: 720 };
        const once = d.write(doc, { settings });
        expect(settings).toEqual({ autoHyphenation: true, defaultTabStop: 720 });
        const back = d.read(once).settings;
        expect(back.autoHyphenation).toBe(true);
        expect(back.defaultTabStop).toBe(720);
    });
});
