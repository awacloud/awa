// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * `odt.read(bytes, { semanticStyles: true })`: the emphasis a text style
 * states is read even where the style holds more than the four flags or
 * inherits from a parent (keep-and-gain: the style kept, never consumed),
 * and a nested list with no style takes its ancestor's style at its level.
 * The default read is the fully-mapped one.
 */
import { describe, test, expect } from 'bun:test';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import * as odfMods from '../main.js';

const runtime = new ModuleRuntime();
for (const m of [...odfMods.fw_require, ...odfMods.modules]) runtime.register(m);
const odt = runtime.resolve('odt');
const pkg = runtime.resolve('pkgPackage');
const { ContractError } = runtime.resolve('odfErrors');
const enc = new TextEncoder();
const dec = new TextDecoder();

const NS = 'xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"'
    + ' xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"'
    + ' xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0"'
    + ' xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0"'
    + ' xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0"'
    + ' xmlns:officeooo="http://openoffice.org/2009/office"';

const AUTO = '<office:font-face-decls><style:font-face style:name="Mono" svg:font-family="Courier" style:font-pitch="fixed"/></office:font-face-decls>'
    + '<office:automatic-styles>'
    + '<style:style style:name="T1" style:family="text"><style:text-properties officeooo:rsid="00123" fo:font-weight="bold"/></style:style>'
    + '<style:style style:name="T2" style:family="text"><style:text-properties fo:font-size="14pt" fo:color="#ff0000"/></style:style>'
    + '<style:style style:name="T3" style:family="text" style:parent-style-name="BoldParent"><style:text-properties fo:font-style="italic" fo:color="#000000"/></style:style>'
    + '<style:style style:name="T4" style:family="text" style:parent-style-name="BoldParent"><style:text-properties fo:font-weight="normal"/></style:style>'
    + '<style:style style:name="T5" style:family="text"><style:text-properties fo:font-weight="700" style:font-weight-asian="bold"/></style:style>'
    + '<style:style style:name="T6" style:family="text"><style:text-properties style:font-name="Mono" fo:font-size="9pt"/></style:style>'
    + '<style:style style:name="T7" style:family="text"><style:text-properties style:text-line-through-style="solid" fo:font-style="oblique" fo:color="#00ff00"/></style:style>'
    + '<text:list-style style:name="L1"><text:list-level-style-bullet text:level="1" text:bullet-char="•"/>'
    + '<text:list-level-style-number text:level="2" style:num-format="a"/></text:list-style>'
    + '</office:automatic-styles>';
const NAMED = '<office:styles>'
    + '<style:style style:name="BoldParent" style:family="text"><style:text-properties fo:font-weight="bold"/></style:style>'
    + '<style:style style:name="Strong" style:family="text"><style:text-properties fo:font-weight="bold" style:font-weight-asian="bold" style:font-weight-complex="bold"/></style:style>'
    + '</office:styles>';
const span = (name, text) => `<text:span text:style-name="${name}">${text}</text:span>`;
const SPANS = '<text:p>' + ['T1', 'T2', 'T3', 'T4', 'T5', 'Strong', 'T6', 'T7'].map((n) => span(n, n)).join(' ') + '</text:p>';
const LIST = '<text:list text:style-name="L1"><text:list-item><text:p>outer</text:p>'
    + '<text:list><text:list-item><text:p>inner</text:p></text:list-item></text:list></text:list-item></text:list>';

/** An .odt with the styles above and `bodyXml` as its body. */
function odtWith(bodyXml) {
    const p = pkg.read(odt.write({ body: [] }));
    p.parts['content.xml'] = enc.encode('<?xml version="1.0" encoding="UTF-8"?>'
        + `<office:document-content ${NS} office:version="1.3">${AUTO}<office:body><office:text>`
        + `${bodyXml}</office:text></office:body></office:document-content>`);
    p.parts['styles.xml'] = enc.encode('<?xml version="1.0" encoding="UTF-8"?>'
        + `<office:document-styles ${NS} office:version="1.3">${NAMED}</office:document-styles>`);
    return pkg.write(p);
}
const flagsOf = (read) => read.body[0].runs.filter((r) => r.type === 'span').map((r) => {
    const f = ['bold', 'italic', 'strike', 'monospace'].filter((k) => r[k]);
    return `${r.styleName || '-'}:${f.join('+')}`;
});
const ON = { semanticStyles: true };

describe('semanticStyles — spans', () => {
    test('the default read leaves every one of these styles unresolved', () => {
        expect(flagsOf(odt.read(odtWith(SPANS)))).toEqual(['T1:', 'T2:', 'T3:', 'T4:', 'T5:', 'Strong:', 'T6:', 'T7:']);
        expect(odt.read(odtWith(SPANS), { semanticStyles: false })).toEqual(odt.read(odtWith(SPANS)));
    });

    test('the emphasis each style states, its other keys ignored, its parents walked, the style kept', () => {
        expect(flagsOf(odt.read(odtWith(SPANS), ON))).toEqual([
            'T1:bold', 'T2:', 'T3:bold+italic', 'T4:', 'T5:bold', 'Strong:bold', 'T6:monospace', 'T7:italic+strike'
        ]);
    });

    test('no automatic style is consumed: they all stay in autoStyles', () => {
        const names = (r) => (r.autoStyles ? r.autoStyles.styles.map((s) => s.name) : []);
        expect(names(odt.read(odtWith(SPANS), ON))).toEqual(names(odt.read(odtWith(SPANS))));
    });

    test('written back, the content is the default read\'s', () => {
        const content = (model) => dec.decode(pkg.read(odt.write(model)).parts['content.xml']);
        expect(content(odt.read(odtWith(SPANS), ON))).toBe(content(odt.read(odtWith(SPANS))));
    });
});

describe('semanticStyles — nested lists', () => {
    test('an unstyled nested list takes its ancestor\'s style at its level', () => {
        const plain = odt.read(odtWith(LIST)).body[0];
        const inner = (l) => l.items[0].children[1];
        expect(plain.ordered).toBe(false);
        expect(inner(plain).ordered).toBeUndefined();
        const sem = odt.read(odtWith(LIST), ON).body[0];
        expect(sem.ordered).toBe(false);
        expect(inner(sem)).toMatchObject({ type: 'list', ordered: true, numFormat: 'a' });
        expect(inner(sem).styleName).toBeUndefined();
    });
});

describe('semanticStyles — the option', () => {
    test('anything but a boolean is a contract error', () => {
        for (const bad of ['yes', 1, null]) {
            let err;
            try { odt.read(odtWith(SPANS), { semanticStyles: bad }); } catch (e) { err = e; }
            expect(err).toBeInstanceOf(ContractError);
        }
    });
});
