// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * `odt.write`'s opt-in `cleanup: ['emptyProperties']`, at parity with
 * `docx.write`'s: a `style:*-properties` element with no attribute and no
 * child is dropped from the automatic styles of `content.xml` and from
 * the styles of `styles.xml`, without touching the caller's model.
 */
import { describe, test, expect } from 'bun:test';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import * as odfMods from '../main.js';

const core = new ModuleRuntime();
for (const m of [...odfMods.fw_require, ...odfMods.modules]) core.register(m);
const odt = core.resolve('odt');
const pkg = core.resolve('pkgPackage');
const enc = new TextEncoder();
const dec = new TextDecoder();

const NS = 'xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"'
    + ' xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"'
    + ' xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0"'
    + ' xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0"';

/** An .odt whose automatic and named styles hold empty and non-empty property elements. */
function source() {
    const p = pkg.read(odt.write({ body: [] }));
    p.parts['content.xml'] = enc.encode('<?xml version="1.0" encoding="UTF-8"?>'
        + `<office:document-content ${NS} office:version="1.3"><office:automatic-styles>`
        + '<style:style style:name="P1" style:family="paragraph"><style:paragraph-properties/><style:text-properties fo:font-weight="bold"/></style:style>'
        + '<style:style style:name="P2" style:family="paragraph"><style:paragraph-properties><style:tab-stops/></style:paragraph-properties></style:style>'
        + '</office:automatic-styles><office:body><office:text>'
        + '<text:p text:style-name="P1">a</text:p><text:p text:style-name="P2">b</text:p></office:text></office:body></office:document-content>');
    p.parts['styles.xml'] = enc.encode('<?xml version="1.0" encoding="UTF-8"?>'
        + `<office:document-styles ${NS} office:version="1.3"><office:styles>`
        + '<style:style style:name="Standard" style:family="paragraph"><style:text-properties/><style:paragraph-properties fo:margin-top="0cm"/></style:style>'
        + '</office:styles></office:document-styles>');
    return pkg.write(p);
}

const part = (bytes, name) => dec.decode(pkg.read(bytes).parts[name]);
const docOf = (r) => ({ body: r.body, autoStyles: r.autoStyles, fontFaces: r.fontFaces, meta: r.meta, settings: r.settings, styles: r.styles, package: r.package });

describe('odt.write — cleanup: emptyProperties', () => {
    test('empty property elements are dropped from content.xml and styles.xml; the rest stays', () => {
        const out = odt.write(docOf(odt.read(source())), { cleanup: ['emptyProperties'] });
        const content = part(out, 'content.xml');
        expect(content).not.toMatch(/<style:paragraph-properties\s*\/>/);
        expect(content).toContain('<style:text-properties fo:font-weight="bold"/>');
        expect(content).toMatch(/<style:paragraph-properties><style:tab-stops\s*\/><\/style:paragraph-properties>/);
        const styles = part(out, 'styles.xml');
        expect(styles).not.toMatch(/<style:text-properties\s*\/>/);
        expect(styles).toContain('fo:margin-top="0cm"');
    });

    test("the caller's model is not changed; without the option the empty elements are written", () => {
        const doc = docOf(odt.read(source()));
        const before = JSON.stringify(doc.autoStyles) + JSON.stringify(doc.styles);
        odt.write(doc, { cleanup: ['emptyProperties'] });
        expect(JSON.stringify(doc.autoStyles) + JSON.stringify(doc.styles)).toBe(before);
        const plain = odt.write(doc);
        expect(part(plain, 'content.xml')).toMatch(/<style:paragraph-properties\s*\/>/);
        expect(part(plain, 'styles.xml')).toMatch(/<style:text-properties\s*\/>/);
        expect(part(odt.write(doc, { cleanup: [] }), 'content.xml')).toBe(part(plain, 'content.xml'));
    });

    test('a bad cleanup value throws the odt contract error naming opts.cleanup', () => {
        for (const cleanup of ['emptyProperties', ['nope'], ['emptyProperties', 'emptyProperties'], [1], null]) {
            let err;
            try { odt.write({ body: [] }, { cleanup }); } catch (e) { err = e; }
            expect(err && err.code).toBe('odf/contract-error/odt');
            expect(err.context && err.context.argument).toBe('opts.cleanup');
        }
    });
});
