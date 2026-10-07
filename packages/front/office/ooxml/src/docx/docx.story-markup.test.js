// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * Story parts (headers, footers, footnotes, endnotes, comments) through
 * `docx.read` / `docx.write`: markup-compatibility processing on read and
 * namespace-well-formed roots on write.
 *
 * The oracle below is an independent namespace-scope checker: it parses a
 * written part, walks it with a stack of the prefixes declared by each
 * element and its ancestors (`xmlns:*` attributes) and lists every element
 * or attribute prefix used outside the scope of a declaration (`xml` and
 * `xmlns` are exempt). It does not use the writer's own helper.
 *
 * The story-part fixtures are hand-written: Word puts only extension
 * ATTRIBUTES (`w14:paraId` / `w14:textId`) in its story parts, which the
 * paragraph model does not keep, so extension ELEMENTS (`w14:glow` in a
 * run's properties, a `w15` repeating section) are built here to reach the
 * defect.
 */
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import * as ooxmlMods from '../main.js';

const runtime = new ModuleRuntime();
for (const m of [...ooxmlMods.fw_require, ...ooxmlMods.modules]) runtime.register(m);
const d = runtime.resolve('docx');
const opc = runtime.resolve('opcPackage');
const xml = runtime.resolve('xml');
const headersMod = runtime.resolve('docxHeaders');
const footnotesMod = runtime.resolve('docxFootnotes');
const commentsMod = runtime.resolve('docxComments');
const decoder = new TextDecoder();
const encoder = new TextEncoder();

const WORD_FIXTURE = new URL('../../tests/_fixtures/word-repeating-section.docx', import.meta.url);

const NS_W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const NS_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const NS_MC = 'http://schemas.openxmlformats.org/markup-compatibility/2006';
const NS_W14 = 'http://schemas.microsoft.com/office/word/2010/wordml';
const NS_W15 = 'http://schemas.microsoft.com/office/word/2012/wordml';
const NS_WPS = 'http://schemas.microsoft.com/office/word/2010/wordprocessingShape';

const DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n';

// ---------------------------------------------------------------------------
// Independent oracle: namespace-scope checker
// ---------------------------------------------------------------------------

/**
 * Every prefix used by an element or attribute name outside the scope of
 * its declaration, as `prefix (qualified name)` strings in document order.
 * `[]` means the part is namespace-well-formed for prefixes.
 */
function undeclaredPrefixes(xmlText) {
    const missing = [];
    function check(qname, scope) {
        const i = qname.indexOf(':');
        if (i < 0) return;
        const prefix = qname.slice(0, i);
        if (prefix === 'xml' || prefix === 'xmlns') return;
        if (!scope.has(prefix)) missing.push(`${prefix} (${qname})`);
    }
    function walk(node, parentScope) {
        if (!node || node.type !== 'element') return;
        const scope = new Set(parentScope);
        const attrs = node.attrs || {};
        for (const k of Object.keys(attrs)) {
            if (k.startsWith('xmlns:')) scope.add(k.slice('xmlns:'.length));
        }
        check(node.name, scope);
        for (const k of Object.keys(attrs)) check(k, scope);
        for (const c of node.children || []) walk(c, scope);
    }
    walk(xml.parse(xmlText), new Set());
    return missing;
}

// ---------------------------------------------------------------------------
// Patched package: Word-shaped story parts holding extension elements
// ---------------------------------------------------------------------------

const ROOT_NS = `xmlns:w="${NS_W}" xmlns:r="${NS_R}" xmlns:mc="${NS_MC}"`
    + ` xmlns:w14="${NS_W14}" xmlns:w15="${NS_W15}" xmlns:wps="${NS_WPS}"`
    + ' mc:Ignorable="w14 w15"';

/** A paragraph whose single run carries a `w14:glow` in its properties. */
function glowParagraph(text, rad) {
    return `<w:p><w:r><w:rPr><w:b/><w14:glow w14:rad="${rad}"/></w:rPr>`
        + `<w:t>${text}</w:t></w:r></w:p>`;
}

/** A repeating section with one item, in the Word 2012 namespace. */
const REPEATING_SECTION_XML = '<w:sdt><w:sdtPr>'
    + '<w:alias w:val="Rows"/><w:id w:val="5"/>'
    + '<w15:repeatingSection><w15:sectionTitle w:val="Rows"/></w15:repeatingSection>'
    + '</w:sdtPr><w:sdtContent>'
    + '<w:sdt><w:sdtPr><w:id w:val="6"/><w15:repeatingSectionItem/></w:sdtPr>'
    + '<w:sdtContent><w:p><w:r><w:t>row</w:t></w:r></w:p></w:sdtContent></w:sdt>'
    + '</w:sdtContent></w:sdt>';

/** A body-level alternate content: a `wps` Choice and a Fallback paragraph. */
const ALTERNATE_CONTENT_XML = '<mc:AlternateContent>'
    + '<mc:Choice Requires="wps"><w:p><w:r><w:t>choice</w:t></w:r></w:p></mc:Choice>'
    + '<mc:Fallback><w:p><w:r><w:t>fallback</w:t></w:r></w:p></mc:Fallback>'
    + '</mc:AlternateContent>';

const HEADER1_XML = DECL + `<w:hdr ${ROOT_NS}>`
    + glowParagraph('Header', 63500)
    + REPEATING_SECTION_XML
    + '</w:hdr>';

const HEADER2_XML = DECL + `<w:hdr ${ROOT_NS}>`
    + ALTERNATE_CONTENT_XML
    + '</w:hdr>';

const FOOTER1_XML = DECL + `<w:ftr ${ROOT_NS}>`
    + glowParagraph('Footer', 1)
    + '</w:ftr>';

const FOOTNOTES_XML = DECL + `<w:footnotes ${ROOT_NS}>`
    + '<w:footnote w:type="separator" w:id="-1"><w:p/></w:footnote>'
    + '<w:footnote w:id="1">' + glowParagraph('Footnote', 1) + '</w:footnote>'
    + '</w:footnotes>';

const ENDNOTES_XML = DECL + `<w:endnotes ${ROOT_NS}>`
    + '<w:endnote w:type="separator" w:id="-1"><w:p/></w:endnote>'
    + '<w:endnote w:id="1">' + glowParagraph('Endnote', 1) + '</w:endnote>'
    + '</w:endnotes>';

const COMMENTS_XML = DECL + `<w:comments ${ROOT_NS}>`
    + '<w:comment w:id="0" w:author="Alice" w:initials="A">'
    + glowParagraph('Comment', 1)
    + '</w:comment>'
    + '</w:comments>';

const DOCUMENT_XML = DECL + `<w:document ${ROOT_NS}><w:body>`
    + '<w:p><w:r><w:t>Body</w:t></w:r></w:p>'
    + '<w:sectPr>'
    + '<w:headerReference w:type="default" r:id="rIdH1"/>'
    + '<w:headerReference w:type="first" r:id="rIdH2"/>'
    + '<w:footerReference w:type="default" r:id="rIdF1"/>'
    + '<w:titlePg/>'
    + '</w:sectPr>'
    + '</w:body></w:document>';

/** The docx package holding the patched story parts. */
function patchedPackage() {
    const pkg = opc.empty();
    const parts = [
        ['/word/document.xml', DOCUMENT_XML, d.CT_DOCUMENT],
        ['/word/header1.xml', HEADER1_XML, headersMod.CT_HEADER],
        ['/word/header2.xml', HEADER2_XML, headersMod.CT_HEADER],
        ['/word/footer1.xml', FOOTER1_XML, headersMod.CT_FOOTER],
        ['/word/footnotes.xml', FOOTNOTES_XML, footnotesMod.CT_FOOTNOTES],
        ['/word/endnotes.xml', ENDNOTES_XML, footnotesMod.CT_ENDNOTES],
        ['/word/comments.xml', COMMENTS_XML, commentsMod.CT_COMMENTS]
    ];
    for (const [name, text, ct] of parts) opc.setPart(pkg, name, encoder.encode(text), ct);
    opc.setRels(pkg, '/', [{ Id: 'rId1', Type: d.REL_TYPE_DOC, Target: 'word/document.xml' }]);
    opc.setRels(pkg, '/word/document.xml', [
        { Id: 'rIdH1', Type: headersMod.REL_TYPE_HEADER, Target: 'header1.xml' },
        { Id: 'rIdH2', Type: headersMod.REL_TYPE_HEADER, Target: 'header2.xml' },
        { Id: 'rIdF1', Type: headersMod.REL_TYPE_FOOTER, Target: 'footer1.xml' },
        { Id: 'rIdFn', Type: footnotesMod.REL_TYPE_FOOTNOTES, Target: 'footnotes.xml' },
        { Id: 'rIdEn', Type: footnotesMod.REL_TYPE_ENDNOTES, Target: 'endnotes.xml' },
        { Id: 'rIdCm', Type: commentsMod.REL_TYPE_COMMENTS, Target: 'comments.xml' }
    ]);
    return opc.write(pkg);
}

/** Minimal docx package around a hand-written `word/document.xml`. */
function documentPackage(documentXml) {
    const pkg = opc.empty();
    opc.setPart(pkg, '/word/document.xml', encoder.encode(documentXml), d.CT_DOCUMENT);
    opc.setRels(pkg, '/', [{ Id: 'rId1', Type: d.REL_TYPE_DOC, Target: 'word/document.xml' }]);
    return opc.write(pkg);
}

/** `write(read(x).document, { headers, footers, footnotes, endnotes, comments })`. */
function rewritePatched() {
    const r = d.read(patchedPackage());
    const written = d.write(r.document, {
        headers: r.headers, footers: r.footers,
        footnotes: r.footnotes, endnotes: r.endnotes,
        comments: r.comments
    });
    return { r, parts: opc.read(written).parts };
}

function textOf(parts, name) {
    return decoder.decode(parts[name]);
}

/** Opening tag of the root element named `tag`. */
function rootTagOf(xmlText, tag) {
    return xmlText.match(new RegExp(`<${tag}\\b[^>]*>`))[0];
}

/** The written story-part names of a package, sorted. */
function storyPartNames(parts) {
    return Object.keys(parts)
        .filter(n => /^\/word\/(header\d+|footer\d+|footnotes|endnotes|comments)\.xml$/.test(n))
        .sort();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('oracle — namespace-scope checker', () => {
    test('goes red on an undeclared extension element (non-vacuity)', () => {
        expect(undeclaredPrefixes(`<w:hdr xmlns:w="${NS_W}"><w14:x/></w:hdr>`))
            .toEqual(['w14 (w14:x)']);
    });

    test('goes red on an undeclared attribute prefix', () => {
        expect(undeclaredPrefixes(`<w:comments xmlns:w="${NS_W}"><w:hyperlink r:id="x"/></w:comments>`))
            .toEqual(['r (r:id)']);
    });

    test('accepts a declaration made on an ancestor or on the element itself', () => {
        expect(undeclaredPrefixes(`<w:hdr xmlns:w="${NS_W}"><w14:x xmlns:w14="${NS_W14}" w14:a="1"/>`
            + '<w:p xml:space="preserve"/></w:hdr>')).toEqual([]);
    });
});

describe('docx story parts — markup compatibility on read', () => {
    test('every written story part and word/document.xml are namespace-well-formed', () => {
        const { parts } = rewritePatched();
        const names = storyPartNames(parts);
        expect(names).toEqual([
            '/word/comments.xml', '/word/endnotes.xml', '/word/footer1.xml',
            '/word/footnotes.xml', '/word/header1.xml', '/word/header2.xml'
        ]);
        for (const name of [...names, '/word/document.xml']) {
            expect({ name, undeclared: undeclaredPrefixes(textOf(parts, name)) })
                .toEqual({ name, undeclared: [] });
        }
    });

    test('the header run keeps no w14:glow, neither in rPr nor in _extras', () => {
        const { r } = rewritePatched();
        const header = r.headers.rIdH1;
        const para = header.body[0];
        expect(para.type).toBe('paragraph');
        const runNode = para.children[0];
        expect(runNode.type).toBe('run');
        expect(JSON.stringify(runNode)).not.toContain('w14:glow');
        expect(JSON.stringify(header)).not.toContain('w14:');
        // Same as the body today: other ignorable content of footers,
        // notes and comments is dropped too.
        for (const obj of [r.footers.rIdF1, r.footnotes, r.endnotes, r.comments]) {
            expect(JSON.stringify(obj)).not.toContain('w14:');
        }
    });

    test('the header repeating section reads as the body reads it', () => {
        const { r } = rewritePatched();
        const section = r.headers.rIdH1.body[1];
        expect(section.type).toBe('blockSdt');
        expect(section.properties.kind).toBe('repeatingSection');
        expect(section.properties.sectionTitle).toBe('Rows');
        expect(section.children).toHaveLength(1);
        expect(section.children[0].type).toBe('blockSdt');
        expect(section.children[0].properties.kind).toBe('repeatingSectionItem');

        const inBody = d.read(documentPackage(DECL + `<w:document ${ROOT_NS}><w:body>`
            + REPEATING_SECTION_XML + '</w:body></w:document>'));
        expect(section).toEqual(inBody.document.body[0]);
    });

    test('mc:AlternateContent in a header body: the Fallback content lands in the header body', () => {
        const { r } = rewritePatched();
        const header = r.headers.rIdH2;
        expect(header.body).toHaveLength(1);
        expect(header.body[0].type).toBe('paragraph');
        expect(d.toText({ type: 'document', body: header.body })).toBe('fallback');
        expect(header._extras).toBeUndefined();

        const inBody = d.read(documentPackage(DECL + `<w:document ${ROOT_NS}><w:body>`
            + ALTERNATE_CONTENT_XML + '</w:body></w:document>'));
        expect(header.body).toEqual(inBody.document.body);
    });
});

describe('docx story parts — namespace declarations on the written roots', () => {
    test('a header holding a repeating section declares mc, w15 and mc:Ignorable="w15"', () => {
        const { parts } = rewritePatched();
        const root = rootTagOf(textOf(parts, '/word/header1.xml'), 'w:hdr');
        expect(root).toBe(`<w:hdr xmlns:w="${NS_W}" xmlns:r="${NS_R}"`
            + ` xmlns:mc="${NS_MC}" xmlns:w15="${NS_W15}" mc:Ignorable="w15">`);
        expect(textOf(parts, '/word/header1.xml')).toContain('<w15:repeatingSection>');
    });

    test('a header and a footnotes part without w15 content declare w and r only', () => {
        const { parts } = rewritePatched();
        expect(textOf(parts, '/word/header2.xml')
            .startsWith(DECL + `<w:hdr xmlns:w="${NS_W}" xmlns:r="${NS_R}">`)).toBe(true);
        expect(textOf(parts, '/word/footnotes.xml')
            .startsWith(DECL + `<w:footnotes xmlns:w="${NS_W}" xmlns:r="${NS_R}">`)).toBe(true);
    });

    test('w:comments declares r; a comment holding a hyperlink passes the checker', () => {
        const comments = {
            comments: [{
                id: 1, author: 'Alice',
                body: [{
                    type: 'paragraph',
                    children: [d.hyperlink('site', 'https://example.com/', { rId: 'rIdLink1' })]
                }]
            }]
        };
        const written = d.write({ type: 'document', body: [d.paragraph('Body')] }, { comments });
        const text = textOf(opc.read(written).parts, '/word/comments.xml');
        expect(rootTagOf(text, 'w:comments'))
            .toBe(`<w:comments xmlns:w="${NS_W}" xmlns:r="${NS_R}">`);
        expect(text).toContain('<w:hyperlink r:id="rIdLink1">');
        expect(undeclaredPrefixes(text)).toEqual([]);
    });
});

describe('docx story parts — document created in Microsoft Word', () => {
    test('read → write keeps document.xml and every header, footer and note part well-formed', () => {
        const r = d.read(new Uint8Array(readFileSync(WORD_FIXTURE)));
        const written = d.write(r.document, {
            headers: r.headers, footers: r.footers,
            footnotes: r.footnotes, endnotes: r.endnotes,
            numbering: r.numbering, styles: r.styles
        });
        const parts = opc.read(written).parts;
        const names = storyPartNames(parts);
        expect(names.filter(n => n.includes('/header'))).toHaveLength(3);
        expect(names.filter(n => n.includes('/footer'))).toHaveLength(3);
        expect(names).toContain('/word/footnotes.xml');
        expect(names).toContain('/word/endnotes.xml');
        for (const name of [...names, '/word/document.xml']) {
            expect({ name, undeclared: undeclaredPrefixes(textOf(parts, name)) })
                .toEqual({ name, undeclared: [] });
        }
    });
});

describe('story-part parse functions — a parsed root gives the same model as its text', () => {
    const HEADER_TEXT = `<w:hdr xmlns:w="${NS_W}" xmlns:r="${NS_R}">`
        + '<w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Head</w:t></w:r></w:p>'
        + '<w:zzUnknown w:val="1"/></w:hdr>';
    const FOOTNOTES_TEXT = `<w:footnotes xmlns:w="${NS_W}">`
        + '<w:footnote w:type="separator" w:id="-1"><w:p/></w:footnote>'
        + '<w:footnote w:id="1"><w:p><w:r><w:t>Note</w:t></w:r></w:p></w:footnote>'
        + '<w:zzExtra/></w:footnotes>';
    const ENDNOTES_TEXT = `<w:endnotes xmlns:w="${NS_W}">`
        + '<w:endnote w:id="2"><w:p><w:r><w:t>End</w:t></w:r></w:p></w:endnote>'
        + '</w:endnotes>';
    const COMMENTS_TEXT = `<w:comments xmlns:w="${NS_W}">`
        + '<w:comment w:id="0" w:author="Alice" w:date="2024-01-15T10:00:00Z">'
        + '<w:p><w:r><w:t>Really?</w:t></w:r></w:p></w:comment>'
        + '</w:comments>';

    test('headers.parse (header and footer)', () => {
        const fromText = headersMod.parse(HEADER_TEXT, 'header');
        expect(fromText.body).toHaveLength(1);
        expect(headersMod.parse(xml.parse(HEADER_TEXT), 'header')).toEqual(fromText);
        const footerText = HEADER_TEXT.replace(/w:hdr/g, 'w:ftr');
        expect(headersMod.parse(xml.parse(footerText), 'footer'))
            .toEqual(headersMod.parse(footerText, 'footer'));
    });

    test('footnotes.parseFootnotes', () => {
        const fromText = footnotesMod.parseFootnotes(FOOTNOTES_TEXT);
        expect(fromText.notes).toHaveLength(2);
        expect(footnotesMod.parseFootnotes(xml.parse(FOOTNOTES_TEXT))).toEqual(fromText);
    });

    test('footnotes.parseEndnotes', () => {
        const fromText = footnotesMod.parseEndnotes(ENDNOTES_TEXT);
        expect(fromText.notes).toHaveLength(1);
        expect(footnotesMod.parseEndnotes(xml.parse(ENDNOTES_TEXT))).toEqual(fromText);
    });

    test('comments.parse', () => {
        const fromText = commentsMod.parse(COMMENTS_TEXT);
        expect(fromText.comments).toHaveLength(1);
        expect(commentsMod.parse(xml.parse(COMMENTS_TEXT))).toEqual(fromText);
    });

    /** The `code` of the error `fn` throws (`null` when it does not throw). */
    function thrownCode(fn) {
        try { fn(); } catch (e) { return e.code; }
        return null;
    }

    test('a parsed root with the wrong name still raises the bad-root error', () => {
        expect(thrownCode(() => headersMod.parse(xml.parse(HEADER_TEXT), 'footer')))
            .toBe('docx/footer-bad-root');
        expect(thrownCode(() => footnotesMod.parseEndnotes(xml.parse(FOOTNOTES_TEXT))))
            .toBe('docx/endnotes-bad-root');
        expect(thrownCode(() => commentsMod.parse(xml.parse(HEADER_TEXT))))
            .toBe('docx/comments-bad-root');
    });
});
