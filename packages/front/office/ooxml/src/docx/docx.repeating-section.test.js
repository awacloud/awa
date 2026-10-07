// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * Repeating-section content controls through `docx.read` / `docx.write`.
 *
 * Word writes repeating sections in its 2012 namespace
 * (`http://schemas.microsoft.com/office/word/2012/wordml`, prefix `w15`) as
 * `<w15:repeatingSection>` / `<w15:repeatingSectionItem/>` children of
 * `w:sdtPr`, under a document root that lists `w15` in `mc:Ignorable`.
 *
 * PROVENANCE OF THE FIXTURE BELOW: the `word/document.xml` markup is
 * reconstructed by hand from the [MS-DOCX] specification — §2.5.1.10
 * (repeatingSection), §2.5.1.11 (repeatingSectionItem) and §2.5.3.8
 * (CT_SdtRepeatedSection: `sectionTitle`, then
 * `doNotAllowInsertDeleteSection`) — in the shape Word documents take
 * (root declarations, `mc:Ignorable`, `w:rPr` / `w:placeholder` inside
 * `w:sdtPr`). It was NOT produced by Microsoft Word.
 *
 * The last block reads a document created in Microsoft Word when one is
 * dropped at `tests/_fixtures/word-repeating-section.docx`; until then it
 * is skipped (see `tests/_fixtures/README.md`).
 */
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import * as ooxmlMods from '../main.js';

const runtime = new ModuleRuntime();
for (const m of [...ooxmlMods.fw_require, ...ooxmlMods.modules]) runtime.register(m);
const d = runtime.resolve('docx');
const opc = runtime.resolve('opcPackage');
const decoder = new TextDecoder();
const encoder = new TextEncoder();

const WORD_FIXTURE = new URL('../../tests/_fixtures/word-repeating-section.docx', import.meta.url);

const NS_W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const NS_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const NS_MC = 'http://schemas.openxmlformats.org/markup-compatibility/2006';
const NS_W14 = 'http://schemas.microsoft.com/office/word/2010/wordml';
const NS_W15 = 'http://schemas.microsoft.com/office/word/2012/wordml';

/** One repeating-section item: a block SDT wrapping a single paragraph. */
function itemXml(id, paraId, text) {
    return '<w:sdt><w:sdtPr>'
        + '<w:rPr><w:rFonts w:ascii="Calibri"/></w:rPr>'
        + `<w:id w:val="${id}"/>`
        + '<w:placeholder><w:docPart w:val="DefaultPlaceholder_-1854013436"/></w:placeholder>'
        + '<w15:repeatingSectionItem/>'
        + '</w:sdtPr><w:sdtContent>'
        + `<w:p w14:paraId="${paraId}" w14:textId="77777777"><w:r><w:t>${text}</w:t></w:r></w:p>`
        + '</w:sdtContent></w:sdt>';
}

const SYNTHETIC_DOCUMENT_XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n'
    + `<w:document xmlns:w="${NS_W}" xmlns:r="${NS_R}" xmlns:mc="${NS_MC}"`
    + ` xmlns:w14="${NS_W14}" xmlns:w15="${NS_W15}" mc:Ignorable="w14 w15">`
    + '<w:body>'
    + '<w:p><w:r><w:t>Orders</w:t></w:r></w:p>'
    + '<w:sdt><w:sdtPr>'
    + '<w:rPr><w:rFonts w:ascii="Calibri"/></w:rPr>'
    + '<w:alias w:val="Order rows"/>'
    + '<w:tag w:val="rows"/>'
    + '<w:id w:val="-1215347651"/>'
    + '<w15:repeatingSection>'
    + '<w15:sectionTitle w:val="Rows"/>'
    + '<w15:doNotAllowInsertDeleteSection/>'
    + '</w15:repeatingSection>'
    + '</w:sdtPr><w:sdtContent>'
    + itemXml('1475489261', '1A2B3C4D', 'First row')
    + itemXml('-418943510', '2B3C4D5E', 'Second row')
    + '</w:sdtContent></w:sdt>'
    // An unrelated w15 sdtPr child: still dropped on read.
    + '<w:sdt><w:sdtPr>'
    + '<w:tag w:val="note"/><w:id w:val="42"/>'
    + '<w15:color w:val="FF0000"/>'
    + '<w:text/>'
    + '</w:sdtPr><w:sdtContent>'
    + '<w:p><w:r><w:t>Note</w:t></w:r></w:p>'
    + '</w:sdtContent></w:sdt>'
    + '</w:body></w:document>';

/** Minimal docx package around a hand-written `word/document.xml`. */
function packageOf(documentXml) {
    const pkg = opc.empty();
    opc.setPart(pkg, '/word/document.xml', encoder.encode(documentXml), d.CT_DOCUMENT);
    opc.setRels(pkg, '/', [{ Id: 'rId1', Type: d.REL_TYPE_DOC, Target: 'word/document.xml' }]);
    return opc.write(pkg);
}

function documentXmlOf(bytes) {
    return decoder.decode(opc.read(bytes).parts['/word/document.xml']);
}

/** Opening tag of the `w:document` root element. */
function rootTagOf(documentXml) {
    return documentXml.match(/<w:document\b[^>]*>/)[0];
}

/** Every SDT kind in document order (`undefined` for an SDT without one). */
function kindsOf(document) {
    const kinds = [];
    d.walkSdts(document, sdt => kinds.push(sdt.properties && sdt.properties.kind));
    return kinds;
}

/** Every repeating section: its title and item count, in document order. */
function sectionsOf(document) {
    const out = [];
    d.walkSdts(document, sdt => {
        if (!sdt.properties || sdt.properties.kind !== 'repeatingSection') return;
        out.push({
            sectionTitle: sdt.properties.sectionTitle,
            items: sdt.children.filter(c => c.type === 'blockSdt'
                && c.properties && c.properties.kind === 'repeatingSectionItem').length
        });
    });
    return out;
}

/** Read-side auxiliary parts handed back to `write()` for a round trip. */
function writeOptsOf(r) {
    const opts = {};
    for (const k of ['styles', 'numbering', 'settings', 'comments',
        'footnotes', 'endnotes', 'headers', 'footers', 'hyperlinks']) {
        if (r[k] !== undefined) opts[k] = r[k];
    }
    return opts;
}

/**
 * The checks the Word-authored template must pass: at least one repeating
 * section with at least one item, and a write → re-read round trip keeping
 * the SDT kinds, the section titles and the item counts, with `w15`
 * declared and ignorable on the written root.
 */
function checkRepeatingSectionTemplate(bytes) {
    const first = d.read(bytes);
    const sections = sectionsOf(first.document);
    expect(sections.length).toBeGreaterThanOrEqual(1);
    for (const s of sections) expect(s.items).toBeGreaterThanOrEqual(1);

    const written = d.write(first.document, writeOptsOf(first));
    const root = rootTagOf(documentXmlOf(written));
    expect(root).toContain(`xmlns:w15="${NS_W15}"`);
    expect(root).toMatch(/mc:Ignorable="[^"]*\bw15\b[^"]*"/);

    const second = d.read(written);
    expect(kindsOf(second.document)).toEqual(kindsOf(first.document));
    expect(sectionsOf(second.document)).toEqual(sections);
}

describe('docx.read — repeating sections written by Word in the w15 namespace', () => {
    test('synthetic Word-shaped package: kind, sectionTitle, doNotAllowInsertDeleteSection and items', () => {
        const r = d.read(packageOf(SYNTHETIC_DOCUMENT_XML));
        const section = r.document.body[1];
        expect(section.type).toBe('blockSdt');
        expect(section.properties.kind).toBe('repeatingSection');
        expect(section.properties.sectionTitle).toBe('Rows');
        expect(section.properties.doNotAllowInsertDeleteSection).toBe(true);
        expect(section.properties.alias).toBe('Order rows');
        expect(section.properties.tag).toBe('rows');
        expect(section.properties.id).toBe(-1215347651);

        expect(section.children).toHaveLength(2);
        for (const item of section.children) {
            expect(item.type).toBe('blockSdt');
            expect(item.properties.kind).toBe('repeatingSectionItem');
        }
        expect(d.toText({ type: 'document', body: section.children[1].children }))
            .toContain('Second row');
    });

    test('an unrelated w15 element (w15:color) is still dropped', () => {
        const r = d.read(packageOf(SYNTHETIC_DOCUMENT_XML));
        const note = r.document.body[2];
        expect(note.properties.tag).toBe('note');
        expect(note.properties.kind).toBe('text');
        expect(note.properties._extras).toBeUndefined();
        expect(JSON.stringify(r.document)).not.toContain('w15:color');
    });

    test('synthetic package round trip: same kinds, title, lock and item count; w15 declared on the written root', () => {
        const first = d.read(packageOf(SYNTHETIC_DOCUMENT_XML));
        const xmlOut = documentXmlOf(d.write(first.document));
        expect(xmlOut).toContain('<w15:repeatingSection><w15:sectionTitle w:val="Rows"/>'
            + '<w15:doNotAllowInsertDeleteSection/></w15:repeatingSection>');
        expect(xmlOut.match(/<w15:repeatingSectionItem\/>/g)).toHaveLength(2);

        const second = d.read(d.write(first.document));
        expect(kindsOf(second.document)).toEqual(
            ['repeatingSection', 'repeatingSectionItem', 'repeatingSectionItem', 'text']);
        expect(second.document.body[1].properties.doNotAllowInsertDeleteSection).toBe(true);
        expect(sectionsOf(second.document)).toEqual([{ sectionTitle: 'Rows', items: 2 }]);
    });

    test('the Word-template checks pass on the synthetic package', () => {
        checkRepeatingSectionTemplate(packageOf(SYNTHETIC_DOCUMENT_XML));
    });

    test('legacy main-namespace markup (w:repeatingSection w:sectionTitle) still reads', () => {
        const legacy = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n'
            + `<w:document xmlns:w="${NS_W}" xmlns:r="${NS_R}"><w:body>`
            + '<w:sdt><w:sdtPr><w:repeatingSection w:sectionTitle="Old rows"/></w:sdtPr>'
            + '<w:sdtContent><w:sdt><w:sdtPr><w:repeatingSectionItem/></w:sdtPr>'
            + '<w:sdtContent><w:p><w:r><w:t>row</w:t></w:r></w:p></w:sdtContent></w:sdt>'
            + '</w:sdtContent></w:sdt>'
            + '</w:body></w:document>';
        const r = d.read(packageOf(legacy));
        expect(kindsOf(r.document)).toEqual(['repeatingSection', 'repeatingSectionItem']);
        expect(sectionsOf(r.document)).toEqual([{ sectionTitle: 'Old rows', items: 1 }]);
    });
});

describe('docx.write — repeating sections in the w15 namespace', () => {
    test('builder round trip: w15 elements, the three root declarations, equal kinds on re-read', () => {
        const item = d.repeatingSectionItem([d.paragraph('row')]);
        const doc = { type: 'document', body: [d.repeatingSection({ sectionTitle: 'Rows' }, [item])] };
        const xmlOut = documentXmlOf(d.write(doc));

        expect(xmlOut).toContain('<w15:repeatingSection>');
        expect(xmlOut).toContain('<w15:sectionTitle w:val="Rows"/>');
        expect(xmlOut).toContain('<w15:repeatingSectionItem/>');
        expect(xmlOut).not.toContain('<w:repeatingSection');
        expect(xmlOut).not.toContain('w:sectionTitle=');

        const root = rootTagOf(xmlOut);
        expect(root).toContain(`xmlns:mc="${NS_MC}"`);
        expect(root).toContain(`xmlns:w15="${NS_W15}"`);
        expect(root).toContain('mc:Ignorable="w15"');

        const back = d.read(d.write(doc));
        expect(kindsOf(back.document)).toEqual(kindsOf(doc));
        expect(sectionsOf(back.document)).toEqual([{ sectionTitle: 'Rows', items: 1 }]);
    });

    test('a document without w15 content is byte-identical to the output before w15 support', () => {
        const doc = {
            type: 'document',
            body: [
                d.paragraph('Intro'),
                d.blockSdt({ tag: 'note', alias: 'Note', id: 7 }, [d.paragraph('Body')]),
                { type: 'paragraph', children: [d.boundText({ tag: 'name' }, '(name)')] }
            ]
        };
        // Literal captured from `write()` before the w15 elements existed.
        const before = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n'
            + `<w:document xmlns:w="${NS_W}" xmlns:r="${NS_R}"><w:body>`
            + '<w:p><w:r><w:t xml:space="preserve">Intro</w:t></w:r></w:p>'
            + '<w:sdt><w:sdtPr><w:alias w:val="Note"/><w:tag w:val="note"/><w:id w:val="7"/></w:sdtPr>'
            + '<w:sdtContent><w:p><w:r><w:t xml:space="preserve">Body</w:t></w:r></w:p></w:sdtContent></w:sdt>'
            + '<w:p><w:sdt><w:sdtPr><w:tag w:val="name"/><w:text/></w:sdtPr>'
            + '<w:sdtContent><w:r><w:t xml:space="preserve">(name)</w:t></w:r></w:sdtContent></w:sdt></w:p>'
            + '</w:body></w:document>';
        expect(documentXmlOf(d.write(doc))).toBe(before);
    });
});

describe('docx — document created in Microsoft Word', () => {
    test('Word-authored repeating-section document (tests/_fixtures/word-repeating-section.docx)', () => {
        checkRepeatingSectionTemplate(new Uint8Array(readFileSync(WORD_FIXTURE)));
    });
});
