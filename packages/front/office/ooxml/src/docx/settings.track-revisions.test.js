// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * Tests — the settings flag that turns revision tracking on is
 * `<w:trackRevisions>` (ECMA-376 Part 1 § 17.15.1.89; `CT_Settings` has no
 * `w:trackChanges`). The core model keeps its `trackChanges` field; the
 * opt-in `wmlSettings` keeps its own `trackRevisions` toggle.
 */
import { describe, test, expect } from 'bun:test';
import { ooxmlRuntime } from '../../tests/_helpers/written-documents.js';
import { wmlSettings } from '../extra/wml-settings.js';

const rt = ooxmlRuntime();
const d = rt.resolve('docx');
const settingsMod = rt.resolve('docxSettings');
const opc = rt.resolve('opcPackage');
const xml = rt.resolve('xml');
const decoder = new TextDecoder();

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
const settingsXml = (inner) => `<w:settings ${W}>${inner}</w:settings>`;
const names = (text) => xml.parse(text).children.filter(c => c.type === 'element').map(c => c.name);
const doc = { type: 'document', body: [d.paragraph('x')] };
const writtenSettings = (bytes) => decoder.decode(opc.read(bytes).parts['/word/settings.xml']);

/** A docx runtime with the opt-in settings extension installed. */
function withExtra() {
    const rt2 = ooxmlRuntime();
    const d2 = rt2.resolve('docx');
    d2.use(wmlSettings.factory(rt2.resolve('xml'), rt2.resolve('docxProperties')));
    return d2;
}

describe('docx settings — core trackChanges is w:trackRevisions', () => {
    test('trackChanges: true is written as w:trackRevisions, in CT_Settings order', () => {
        const text = settingsMod.serialize({ zoom: { percent: 100 }, trackChanges: true, defaultTabStop: 720 });
        expect(names(text)).toEqual(['w:zoom', 'w:trackRevisions', 'w:defaultTabStop']);
    });

    test('false or absent writes nothing', () => {
        expect(names(settingsMod.serialize({ trackChanges: false, defaultTabStop: 720 }))).toEqual(['w:defaultTabStop']);
    });

    test('a real file\'s w:trackRevisions reads as trackChanges, toggle rules included', () => {
        expect(settingsMod.parse(settingsXml('<w:trackRevisions/>'))).toEqual({ trackChanges: true });
        expect(settingsMod.parse(settingsXml('<w:trackRevisions w:val="0"/>'))).toEqual({ trackChanges: false });
    });

    test('the w:trackChanges 1.0.0 wrote still reads', () => {
        expect(settingsMod.parse(settingsXml('<w:trackChanges/>'))).toEqual({ trackChanges: true });
    });

    test('a typed boolean is not written twice beside an _extras copy', () => {
        const text = settingsMod.serialize({ trackChanges: true, _extras: [xml.el('w:trackRevisions', {}), xml.el('w:trackChanges', {})] });
        expect(names(text)).toEqual(['w:trackRevisions']);
        // A typed false wins over an _extras copy too: nothing is written.
        expect(names(settingsMod.serialize({ trackChanges: false, _extras: [xml.el('w:trackRevisions', {})] }))).toEqual([]);
    });

    test('docx read → write → read keeps trackChanges, written once', () => {
        const once = d.write(doc, { settings: { trackChanges: true } });
        expect(names(writtenSettings(once))).toEqual(['w:trackRevisions']);
        const back = d.read(once);
        expect(back.settings.trackChanges).toBe(true);
        expect(back.settings._extras).toBeUndefined();
        expect(writtenSettings(d.write(back.document, { settings: back.settings }))).toBe(writtenSettings(once));
    });
});

describe('docx settings — the wmlSettings extra keeps its model', () => {
    test('a real file\'s w:trackRevisions still hydrates the trackRevisions toggle', () => {
        const d2 = withExtra();
        const pkg = opc.read(d.write(doc, { settings: { defaultTabStop: 720 } }));
        pkg.parts['/word/settings.xml'] = new TextEncoder().encode(settingsXml('<w:trackRevisions/><w:defaultTabStop w:val="720"/>'));
        const s = d2.read(opc.write(pkg)).settings;
        expect(s.trackRevisions).toBe(true);
        expect(s.trackChanges).toBeUndefined();
    });

    test('a file 1.0.0 wrote with w:trackChanges reads through the extra as trackRevisions', () => {
        const d2 = withExtra();
        const pkg = opc.read(d.write(doc, { settings: { defaultTabStop: 720 } }));
        pkg.parts['/word/settings.xml'] = new TextEncoder().encode(settingsXml('<w:trackChanges/>'));
        const s = d2.read(opc.write(pkg)).settings;
        expect(s.trackRevisions).toBe(true);
        expect(s.trackChanges).toBeUndefined();
    });

    test('the core boolean is written as w:trackRevisions, not w:trackChanges', () => {
        const d2 = withExtra();
        expect(names(writtenSettings(d2.write(doc, { settings: { trackChanges: true } })))).toEqual(['w:trackRevisions']);
    });

    test('read → write → read keeps the toggle, written once', () => {
        const d2 = withExtra();
        const once = d2.write(doc, { settings: { trackRevisions: true } });
        expect(names(writtenSettings(once))).toEqual(['w:trackRevisions']);
        const back = d2.read(once);
        expect(back.settings.trackRevisions).toBe(true);
        expect(writtenSettings(d2.write(back.document, { settings: back.settings }))).toBe(writtenSettings(once));
    });

    test('the extra\'s object-form trackChanges is still written as before', () => {
        const ext = wmlSettings.factory(rt.resolve('xml'), rt.resolve('docxProperties'));
        const out = ext.dehydrate({ trackChanges: { foo: '1' } });
        expect(out._extras.map(e => [e.name, e.attrs])).toEqual([['w:trackChanges', { 'w:foo': '1' }]]);
    });
});
