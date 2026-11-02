// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * `toMd` reads odt with `@awacloud/odf`'s `semanticStyles`: the emphasis a
 * style states reaches the Markdown though the style holds more (an rsid,
 * a size, Asian variants) or inherits it, and a nested unstyled list takes
 * its ancestor's numbering.
 */
import { describe, test, expect, beforeAll } from 'bun:test';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { fw_require, modules } from '../main.js';

let oconvApi;
let odtApi;
let pkg;

beforeAll(() => {
    const rt = new ModuleRuntime();
    rt.registerAll(fw_require);
    rt.registerAll(modules);
    oconvApi = rt.resolve('oconv');
    odtApi = rt.resolve('odt');
    pkg = rt.resolve('pkgPackage');
});

const enc = new TextEncoder();
const NS = 'xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"'
    + ' xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"'
    + ' xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0"'
    + ' xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0"'
    + ' xmlns:officeooo="http://openoffice.org/2009/office"';

function odt() {
    const p = pkg.read(odtApi.write({ body: [] }));
    p.parts['content.xml'] = enc.encode('<?xml version="1.0" encoding="UTF-8"?>'
        + `<office:document-content ${NS} office:version="1.3"><office:automatic-styles>`
        + '<style:style style:name="T1" style:family="text"><style:text-properties officeooo:rsid="0042" fo:font-weight="bold"/></style:style>'
        + '<text:list-style style:name="L1"><text:list-level-style-bullet text:level="1" text:bullet-char="•"/>'
        + '<text:list-level-style-number text:level="2" style:num-format="1"/></text:list-style>'
        + '</office:automatic-styles><office:body><office:text>'
        + '<text:p>A <text:span text:style-name="T1">bold</text:span> and <text:span text:style-name="Strong">strong</text:span> word.</text:p>'
        + '<text:list text:style-name="L1"><text:list-item><text:p>outer</text:p>'
        + '<text:list><text:list-item><text:p>inner</text:p></text:list-item></text:list></text:list-item></text:list>'
        + '</office:text></office:body></office:document-content>');
    p.parts['styles.xml'] = enc.encode('<?xml version="1.0" encoding="UTF-8"?>'
        + `<office:document-styles ${NS} office:version="1.3"><office:styles>`
        + '<style:style style:name="Strong" style:family="text"><style:text-properties fo:font-weight="bold" style:font-weight-asian="bold"/></style:style>'
        + '</office:styles></office:document-styles>');
    return pkg.write(p);
}

describe('oconv.toMd — odt style semantics', () => {
    test('the emphasis and the nested numbering reach the Markdown, without their losses', async () => {
        const r = await oconvApi.toMd({ name: 's.odt', bytes: odt(), convertedAt: '2026-10-26T00:00:00Z', opts: { frontMatter: 'none' } });
        expect(r.markdown).toContain('A **bold** and **strong** word.');
        expect(r.markdown).toMatch(/- outer\n\s+1\. inner/);
        expect(r.losses.map((l) => l.code)).not.toContain('run/format-unresolved');
        expect(r.losses.map((l) => l.code)).not.toContain('list/numbering-unresolved');
    });
});
