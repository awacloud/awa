// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * `styles.xml` through the large and full bundles: read, then write, keeps
 * what the source holds — named and automatic list styles, the outline
 * style, page layouts, master pages with the text of their header, and the
 * font-face declarations — for `.odt`, `.ods` and `.odp`. The bundles'
 * opt-in extensions type list styles (`textListDetailed`) and page styles
 * (`stylePage`) on read and render them back on write.
 *
 * The sources are written by the core writers from one hand-written
 * `styles.xml`; the comparison is per container, as a multiset of the
 * serialised children (the extensions put an element back after the ones
 * that stayed, and the containers' content is unordered in ODF).
 */
import { describe, test, expect } from 'bun:test';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import * as odf from '../src/main.js';

const core = new ModuleRuntime();
for (const m of [...odf.fw_require, ...odf.modules]) core.register(m);
const xml = core.resolve('xml');
const zip = core.resolve('zip');
const stylesMod = core.resolve('odfStyles');
const dec = new TextDecoder();

const STYLES_XML = `<?xml version="1.0" encoding="UTF-8"?>
<office:document-styles xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0" xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" office:version="1.3">
<office:font-face-decls><style:font-face style:name="Liberation Serif" svg:font-family="'Liberation Serif'"/></office:font-face-decls>
<office:styles>
<style:style style:name="Standard" style:family="paragraph"/>
<text:outline-style style:name="Outline"><text:outline-level-style text:level="1" style:num-format=""/></text:outline-style>
<text:list-style style:name="WWNum1"><text:list-level-style-number text:level="1" style:num-format="01, 02, 03, ..."/></text:list-style>
</office:styles>
<office:automatic-styles>
<text:list-style style:name="L9"><text:list-level-style-bullet text:level="1" text:bullet-char="•"/></text:list-style>
<style:page-layout style:name="pm1"><style:page-layout-properties fo:page-width="21cm" fo:page-height="29.7cm"/></style:page-layout>
</office:automatic-styles>
<office:master-styles>
<style:master-page style:name="Standard" style:page-layout-name="pm1"><style:header><text:p text:style-name="Standard">Quarterly report, page </text:p></style:header></style:master-page>
</office:master-styles>
</office:document-styles>`;

const FORMATS = [
    ['odt', (m) => m.paragraph ? { body: [m.paragraph('Body')] } : { body: [] }],
    ['ods', (m) => m.empty()],
    // a slide naming the master page, or the writer adds its `Default` one
    ['odp', () => ({ slides: [{ type: 'slide', name: 'Slide1', frames: [], masterPageName: 'Standard' }] })]
];

/** Per container of a styles.xml text: the sorted serialisations of its element children. */
function containers(stylesXml) {
    const root = xml.parse(stylesXml);
    const out = {};
    for (const c of root.children || []) {
        if (c.type !== 'element') continue;
        out[c.name] = (c.children || []).filter((k) => k.type === 'element').map((k) => xml.serialize(k)).sort();
    }
    return out;
}

const stylesOf = (bytes) => dec.decode(zip.unzipSync(bytes)['styles.xml']);

describe('styles.xml through the large and full bundles', () => {
    for (const [fmt, make] of FORMATS) {
        const coreApi = core.resolve(fmt);
        const source = coreApi.write({ ...make(coreApi), styles: stylesMod.parse(STYLES_XML) });
        const expected = containers(stylesOf(source));

        test(`${fmt}: the source written by the core writer holds every element (premise)`, () => {
            expect(expected['office:font-face-decls']).toHaveLength(1);
            expect(expected['office:styles']).toHaveLength(3);
            expect(expected['office:automatic-styles']).toHaveLength(2);
            expect(expected['office:master-styles']).toHaveLength(1);
        });

        for (const size of ['Large', 'Full']) {
            test(`${fmt} ${size.toLowerCase()} bundle: read then write keeps styles.xml`, () => {
                const rt = new ModuleRuntime();
                rt.registerDeep(odf[`${fmt}${size}Bundle`]);
                const api = rt.resolve(`${fmt}${size}Bundle`);
                const m1 = api.read(source);
                // the extensions typed them on read
                expect(m1.styles.listStyles.map((s) => s.name).sort()).toEqual(['L9', 'Outline', 'WWNum1']);
                expect(m1.styles.masterPages).toHaveLength(1);
                const out = api.write(m1);
                expect(containers(stylesOf(out))).toEqual(expected);
                expect(stylesOf(out)).toContain('Quarterly report, page ');
            });
        }
    }
});
