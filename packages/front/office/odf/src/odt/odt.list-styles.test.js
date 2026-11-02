// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * An untouched save keeps a list's own numbering (T56 (a)): the read
 * consumes only an automatic list style the write regenerates as it is;
 * any other one stays in `autoStyles`, the list keeps its `styleName`
 * beside the numbering read from it, and the write gives both back.
 */
import { describe, test, expect } from 'bun:test';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import * as odfMods from '../main.js';

const rt = new ModuleRuntime();
for (const m of [...odfMods.fw_require, ...odfMods.modules]) rt.register(m);
const odt = rt.resolve('odt');
const pkg = rt.resolve('pkgPackage');
const enc = new TextEncoder();
const dec = new TextDecoder();

const NS = 'xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"'
    + ' xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"'
    + ' xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0"'
    + ' xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0"';
// A two-level list style with its own prefix, suffix and label position.
const LIST_STYLE = '<text:list-style style:name="L1">'
    + '<text:list-level-style-number text:level="1" style:num-prefix="[" style:num-suffix="]" style:num-format="1">'
    + '<style:list-level-properties text:list-level-position-and-space-mode="label-alignment">'
    + '<style:list-level-label-alignment text:label-followed-by="listtab" text:list-tab-stop-position="0.5in" fo:text-indent="-0.25in" fo:margin-left="0.5in"/>'
    + '</style:list-level-properties></text:list-level-style-number>'
    + '<text:list-level-style-number text:level="2" style:num-suffix=")" style:num-format="a"/>'
    + '</text:list-style>';

/** An .odt whose content.xml holds `autoStyles` and `body` as given. */
function odtWith(autoStyles, body) {
    const p = pkg.read(odt.write({ body: [] }));
    p.parts['content.xml'] = enc.encode('<?xml version="1.0" encoding="UTF-8"?>'
        + `<office:document-content ${NS} office:version="1.3">`
        + `<office:automatic-styles>${autoStyles}</office:automatic-styles>`
        + `<office:body><office:text>${body}</office:text></office:body></office:document-content>`);
    return pkg.write(p);
}
const content = (bytes) => dec.decode(pkg.read(bytes).parts['content.xml']);
const LIST = '<text:list text:style-name="L1"><text:list-item><text:p>one</text:p></text:list-item></text:list>';

describe('odt list styles: kept as read (T56 a)', () => {
    test('a list naming a style the write would not regenerate keeps it, numbering derived', () => {
        const r = odt.read(odtWith(LIST_STYLE, LIST));
        expect(r.body[0]).toMatchObject({ type: 'list', styleName: 'L1', ordered: true, numFormat: '1' });
        const out = content(odt.write(r));
        expect(out).toContain(LIST_STYLE);
        expect(out).toContain('<text:list text:style-name="L1">');
        expect(out).not.toContain('awa-l-');
    });

    test('a list whose style odt.write generated is consumed as before', () => {
        const written = odt.write({ body: [{ type: 'list', ordered: true, numFormat: 'A',
            items: [{ children: [{ type: 'paragraph', children: [{ type: 'text', value: 'x' }] }] }] }] });
        const r = odt.read(written);
        expect(r.body[0].styleName).toBeUndefined();
        expect(r.body[0]).toMatchObject({ ordered: true, numFormat: 'A' });
        expect(content(odt.write(r))).toBe(content(written));
    });
});

const STYLES_NS = NS + ' xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0"';
/** An .odt whose styles.xml holds `styles` in `office:styles`, content as `odtWith`. */
function odtWithStyles(styles, autoStyles, body) {
    const p = pkg.read(odtWith(autoStyles, body));
    p.parts['styles.xml'] = enc.encode('<?xml version="1.0" encoding="UTF-8"?>'
        + `<office:document-styles ${STYLES_NS} office:version="1.3"><office:styles>${styles}</office:styles></office:document-styles>`);
    return pkg.write(p);
}
function thrown(fn) {
    try { fn(); } catch (e) { return e; }
    return null;
}

describe('odt list attributes kept (T56 b)', () => {
    test('a list\'s id and continue-list, an item\'s start value and id, read and written back', () => {
        const body = '<text:list xml:id="list1" text:continue-list="list0" text:style-name="L1">'
            + '<text:list-item text:start-value="4" xml:id="item1"><text:p>four</text:p></text:list-item>'
            + '<text:list-item><text:p>five</text:p></text:list-item></text:list>';
        const r = odt.read(odtWith(LIST_STYLE, body));
        expect(r.body[0]).toMatchObject({ id: 'list1', continueList: 'list0', styleName: 'L1' });
        expect(r.body[0].items[0]).toMatchObject({ startValue: 4, id: 'item1' });
        const out = content(odt.write(r));
        expect(out).toMatch(/<text:list [^>]*xml:id="list1"/);
        expect(out).toMatch(/<text:list [^>]*text:continue-list="list0"/);
        expect(out).toMatch(/<text:list-item [^>]*text:start-value="4"/);
        expect(out).toMatch(/<text:list-item [^>]*xml:id="item1"/);
    });
});

describe('odt listStyles (T56 b)', () => {
    const NAMED = '<text:list-style style:name="Numbering_20_123" style:display-name="Numbering 123">'
        + '<text:list-level-style-number text:level="1" text:style-name="Numbering_20_Symbols" style:num-suffix="." style:num-format="1" text:display-levels="1">'
        + '<style:list-level-properties text:space-before="0.25in" text:min-label-width="0.25in"/></text:list-level-style-number>'
        + '<text:list-level-style-bullet text:level="2" text:bullet-char="•"><style:text-properties style:font-name="OpenSymbol"/></text:list-level-style-bullet>'
        + '</text:list-style>'
        + '<text:outline-style style:name="Outline"><text:outline-level-style text:level="1" style:num-format="I" style:num-suffix=" "/></text:outline-style>';

    test('the automatic, named and outline list styles, level by level', () => {
        const r = odt.read(odtWithStyles(NAMED, LIST_STYLE, LIST), { listStyles: true });
        expect(r.listStyles.L1).toEqual({ source: 'auto', levels: [
            { level: 1, kind: 'number', numFormat: '1', prefix: '[', suffix: ']',
                position: { mode: 'label-alignment', labelFollowedBy: 'listtab', tabStopPosition: '0.5in', textIndent: '-0.25in', marginLeft: '0.5in' } },
            { level: 2, kind: 'number', numFormat: 'a', suffix: ')' }
        ] });
        expect(r.listStyles.Numbering_20_123).toEqual({ source: 'named', levels: [
            { level: 1, kind: 'number', numFormat: '1', suffix: '.', displayLevels: 1, textStyleName: 'Numbering_20_Symbols',
                position: { mode: 'label-width-and-position', spaceBefore: '0.25in', minLabelWidth: '0.25in' } },
            { level: 2, kind: 'bullet', bulletChar: '•', textProperties: { 'style:font-name': 'OpenSymbol' } }
        ] });
        expect(r.listStyles.Outline).toEqual({ source: 'outline', levels: [{ level: 1, kind: 'number', numFormat: 'I', suffix: ' ' }] });
    });

    test('without the option there is no map; another value throws', () => {
        expect(odt.read(odtWith(LIST_STYLE, LIST)).listStyles).toBeUndefined();
        for (const v of ['yes', 1, null]) {
            const e = thrown(() => odt.read(odtWith(LIST_STYLE, LIST), { listStyles: v }));
            expect(e && e.code).toBe('odf/contract-error/odt');
            expect(e.context).toMatchObject({ module: 'odt', argument: 'opts.listStyles' });
        }
    });
});

describe('odt sectionStyles (T58)', () => {
    const SECTION = '<style:style style:name="Sect1" style:family="section">'
        + '<style:section-properties text:dont-balance-text-columns="true" style:editable="false" fo:background-color="#ffffcc">'
        + '<style:columns fo:column-count="2" fo:column-gap="0.5in">'
        + '<style:column style:rel-width="4818*" fo:start-indent="0in" fo:end-indent="0.25in"/>'
        + '<style:column style:rel-width="4820*" fo:start-indent="0.25in" fo:end-indent="0in"/>'
        + '</style:columns></style:section-properties></style:style>';
    const NAMED_SECTION = '<style:style style:name="Wide" style:family="section">'
        + '<style:section-properties style:editable="true"><style:columns fo:column-count="3"/></style:section-properties></style:style>';
    const BODY = '<text:section text:style-name="Sect1" text:name="Section1"><text:p>a</text:p></text:section>';

    test('an automatic and a named section style, columns included', () => {
        const r = odt.read(odtWithStyles(NAMED_SECTION, SECTION, BODY), { sectionStyles: true });
        expect(r.body[0]).toMatchObject({ type: 'section', name: 'Section1', styleName: 'Sect1' });
        expect(r.sectionStyles.Sect1).toEqual({
            source: 'auto', balance: false, editable: false, backgroundColor: '#ffffcc',
            columns: { count: 2, gap: '0.5in', columns: [
                { relWidth: '4818*', startIndent: '0in', endIndent: '0.25in' },
                { relWidth: '4820*', startIndent: '0.25in', endIndent: '0in' }
            ] }
        });
        expect(r.sectionStyles.Wide).toEqual({ source: 'named', editable: true, columns: { count: 3 } });
    });

    test('without the option there is no map; another value throws', () => {
        expect(odt.read(odtWith(SECTION, BODY)).sectionStyles).toBeUndefined();
        for (const v of ['yes', 1, null]) {
            const e = thrown(() => odt.read(odtWith(SECTION, BODY), { sectionStyles: v }));
            expect(e && e.code).toBe('odf/contract-error/odt');
            expect(e.context).toMatchObject({ module: 'odt', argument: 'opts.sectionStyles' });
        }
    });
});
