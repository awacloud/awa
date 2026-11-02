// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview `odt.read` option `headerFooterContent`: each header and
 * footer of the `styles.xml` master pages typed with the body's model
 * (`content`), the raw children kept; core and large bundle alike.
 */

import { describe, test, expect } from 'bun:test';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import * as odf from '../main.js';

const core = new ModuleRuntime();
for (const m of [...odf.fw_require, ...odf.modules]) core.register(m);
const odt = core.resolve('odt');
const stylesMod = core.resolve('odfStyles');
const large = (() => {
    const rt = new ModuleRuntime();
    rt.registerDeep(odf.odtLargeBundle);
    return rt.resolve('odtLargeBundle');
})();

const NS = 'xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0"'
    + ' xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0"'
    + ' xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0"';
const STYLES_XML = `<?xml version="1.0" encoding="UTF-8"?><office:document-styles ${NS} office:version="1.3">`
    + '<office:styles><style:style style:name="Standard" style:family="paragraph"/><style:style style:name="Header" style:family="paragraph"/></office:styles>'
    + '<office:automatic-styles><style:style style:name="MT1" style:family="text"><style:text-properties fo:font-weight="bold"/></style:style>'
    + '<style:page-layout style:name="pm1"><style:page-layout-properties fo:page-width="21cm" fo:page-height="29.7cm"/></style:page-layout></office:automatic-styles>'
    + '<office:master-styles><style:master-page style:name="Standard" style:page-layout-name="pm1">'
    + '<style:header><text:p text:style-name="Header">Report, page <text:page-number text:select-page="current">1</text:page-number></text:p></style:header>'
    + '<style:footer><text:p text:style-name="Standard"><text:span text:style-name="MT1">Confidential</text:span></text:p></style:footer>'
    + '<style:footer-first><text:p text:style-name="Standard">First page</text:p></style:footer-first>'
    + '</style:master-page></office:master-styles></office:document-styles>';
const bytes = odt.write({ body: [{ type: 'paragraph', runs: [{ type: 'text', value: 'Body' }] }] }, { styles: stylesMod.parse(STYLES_XML) });

const KINDS = /^style:(header|footer)(-left|-first)?$/;
/** Every header / footer node of a read result's master pages, core (raw) or bundle (bags). */
function headerFooters(r) {
    const out = [];
    const masters = [...(r.styles.masterStyles || []), ...(r.styles.masterPages || [])];
    for (const mp of masters) {
        const isMaster = mp.name === 'style:master-page' || mp.kind === 'style:master-page';
        if (!isMaster) continue;
        for (const c of mp.children || []) if (KINDS.test(c.name || c.kind || '')) out.push(c);
    }
    return out;
}
const textOf = (nodes) => JSON.stringify(nodes).match(/"value":"[^"]*"/g)?.map((v) => v.slice(9, -1)).join('') ?? '';

describe('odt.read headerFooterContent', () => {
    test('off by default: no content field, the read result as before', () => {
        for (const api of [odt, large]) {
            expect(headerFooters(api.read(bytes)).some((h) => 'content' in h)).toBe(false);
        }
    });

    test('core: each header and footer typed with the body model, raw children kept', () => {
        const hf = headerFooters(odt.read(bytes, { headerFooterContent: true }));
        expect(hf.map((h) => h.name)).toEqual(['style:header', 'style:footer', 'style:footer-first']);
        for (const h of hf) {
            expect(Array.isArray(h.content)).toBe(true);
            expect(h.children.length).toBeGreaterThan(0);
        }
        expect(hf[0].content[0].type).toBe('paragraph');
        expect(hf[0].content[0].styleName).toBe('Header');
        expect(textOf(hf[2].content)).toBe('First page');
        expect(textOf(hf[1].content)).toContain('Confidential');
    });

    test('elementsInRuns keeps a field in place inside the header paragraph', () => {
        const [header] = headerFooters(odt.read(bytes, { headerFooterContent: true, elementsInRuns: true }));
        const runs = header.content[0].runs;
        expect(runs.some((r) => r.name === 'text:page-number' || (r.type === 'element' && r.name === 'text:page-number'))).toBe(true);
    });

    test('large bundle: the bags carry content too', () => {
        const r = large.read(bytes, { headerFooterContent: true });
        const hf = headerFooters(r);
        expect(hf.length).toBe(3);
        for (const h of hf) expect(Array.isArray(h.content)).toBe(true);
        expect(textOf(hf[2].content)).toBe('First page');
    });

    test('a non-boolean value throws odf/contract-error/odt', () => {
        let caught;
        try { odt.read(bytes, { headerFooterContent: 'yes' }); } catch (e) { caught = e; }
        expect(caught && caught.code).toBe('odf/contract-error/odt');
    });

    test('until written from content, the write equals the default read', () => {
        const plain = odt.write(odt.read(bytes), {});
        const typed = odt.write(odt.read(bytes, { headerFooterContent: true }), {});
        expect(typed).toEqual(plain);
    });
});

describe('odt.write: header and footer content written back', () => {
    const readBack = (api, out) => headerFooters(api.read(out, { headerFooterContent: true, elementsInRuns: true }));
    const stylesXml = (out) => new TextDecoder().decode(core.resolve('pkgPackage').read(out).parts['styles.xml']);

    test('unedited, core and large bundle: the bytes of the default read\'s write', () => {
        for (const api of [odt, large]) {
            const plain = api.write(api.read(bytes), {});
            expect(api.write(api.read(bytes, { headerFooterContent: true, elementsInRuns: true }), {})).toEqual(plain);
            expect(api.write(api.read(bytes, { headerFooterContent: true }), { preserveInput: true })).toEqual(plain);
        }
    });

    test('edited text, the field kept in place, core and large bundle', () => {
        for (const api of [odt, large]) {
            const r = api.read(bytes, { headerFooterContent: true, elementsInRuns: true });
            const [header] = headerFooters(r);
            const runs = header.content[0].runs;
            const i = runs.findIndex((x) => x.type === 'text');
            runs[i] = { type: 'text', value: 'Annual report, page ' };
            const out = api.write(r, {});
            const [back] = readBack(api, out);
            expect(textOf(back.content)).toContain('Annual report, page ');
            expect(back.content[0].runs.some((x) => x.type === 'element' && x.name === 'text:page-number')).toBe(true);
            expect(stylesXml(out)).toContain('<text:page-number');
        }
    });

    test('a bold run gets an automatic style in styles.xml, its name defined once', () => {
        const r = odt.read(bytes, { headerFooterContent: true });
        const footer = headerFooters(r)[1];
        footer.content[0].runs.push({ type: 'span', value: ' — draft', bold: true });
        const out = odt.write(r, {});
        const xml = stylesXml(out);
        const name = xml.match(/<text:span text:style-name="([^"]+)">\s*— draft/)?.[1];
        expect(name).toBeTruthy();
        expect(xml).toContain(`<style:style style:name="${name}" style:family="text">`);
        expect(xml.match(new RegExp(`style:name="${name}"`, 'g')).length).toBe(1);
        const back = headerFooters(odt.read(out, { headerFooterContent: true }))[1];
        expect(textOf(back.content)).toContain('— draft');
    });
});

// A36 (the writer lane's N18): lists in headers and footers, the large
// bundle's typed list styles (`styles.listStyles`) included.
describe('header and footer lists', () => {
    const stylesXml = (out) => new TextDecoder().decode(core.resolve('pkgPackage').read(out).parts['styles.xml']);
    const LIST_STYLES = `<?xml version="1.0" encoding="UTF-8"?><office:document-styles ${NS} office:version="1.3">`
        + '<office:styles/><office:automatic-styles>'
        + '<text:list-style style:name="awa-l-b"><text:list-level-style-number text:level="1" style:num-format="1"/></text:list-style>'
        + '<style:page-layout style:name="pm1"/></office:automatic-styles>'
        + '<office:master-styles><style:master-page style:name="Standard" style:page-layout-name="pm1">'
        + '<style:header><text:list text:style-name="awa-l-b"><text:list-item><text:p>one</text:p></text:list-item></text:list></style:header>'
        + '</style:master-page></office:master-styles></office:document-styles>';
    const listed = odt.write({ body: [{ type: 'paragraph', runs: [{ type: 'text', value: 'Body' }] }] }, { styles: stylesMod.parse(LIST_STYLES) });
    const bullets = (value) => ({ type: 'list', ordered: false, items: [{ children: [{ type: 'paragraph', runs: [{ type: 'text', value }] }] }] });

    test('a header list whose style sits in styles.xml reads ordered, core and large bundle', () => {
        for (const api of [odt, large]) {
            const [header] = headerFooters(api.read(listed, { headerFooterContent: true }));
            const list = header.content.find((n) => n.type === 'list');
            expect(list.ordered).toBe(true);
            expect(list.numFormat).toBe('1');
        }
    });

    test('a list added beside a styles.xml list style of the registry\'s name gets a fresh name', () => {
        for (const api of [odt, large]) {
            const r = api.read(listed, { headerFooterContent: true });
            headerFooters(r)[0].content.push(bullets('two'));
            const xml = stylesXml(api.write(r, {}));
            const names = [...xml.matchAll(/<text:list-style style:name="([^"]+)"/g)].map((m) => m[1]);
            expect(new Set(names).size).toBe(names.length);
        }
    });

    test('a list made in a header is written with its list style defined, core and large bundle', () => {
        for (const api of [odt, large]) {
            const r = api.read(bytes, { headerFooterContent: true });
            headerFooters(r)[0].content.push(bullets('item'));
            const xml = stylesXml(api.write(r, {}));
            const used = xml.match(/<text:list text:style-name="([^"]+)"/)[1];
            expect(xml).toContain(`<text:list-style style:name="${used}"`);
            const back = headerFooters(api.read(api.write(r, {}), { headerFooterContent: true }))[0];
            expect(back.content.find((n) => n.type === 'list').ordered).toBe(false);
        }
    });
});
