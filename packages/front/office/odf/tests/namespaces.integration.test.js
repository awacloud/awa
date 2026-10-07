// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * Integration test — every XML part the package writes declares, on its
 * root (or on the element that uses it), every namespace prefix used by an
 * element or attribute name below it.
 *
 * The checker parses each written part with fw `xml.parse` and walks it
 * with a declaration scope stack. Legs: fresh writes (image runs, image
 * frames, empty documents), read-then-write of synthetic
 * LibreOffice-shaped packages whose source parts declare extension
 * prefixes, the typed refusal for a prefix nobody declares, byte stability
 * of the root start tags, carried-before-known precedence, the formula
 * value clause, and the chart / math sub-document writers.
 */
import { describe, test, expect } from 'bun:test';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import * as odfMods from '../src/main.js';

const runtime = new ModuleRuntime();
for (const m of [...odfMods.fw_require, ...odfMods.modules]) runtime.register(m);

const xml = runtime.resolve('xml');
const odt = runtime.resolve('odt');
const ods = runtime.resolve('ods');
const odp = runtime.resolve('odp');
const pkg = runtime.resolve('pkgPackage');
const chart = runtime.resolve('chartChart');
const math = runtime.resolve('mathMath');
const { RenderError } = runtime.resolve('odfErrors');
const { ODF_NS } = runtime.resolve('odfShared');

const te = new TextEncoder();
const td = new TextDecoder();

const PNG = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
    ...new Array(16).fill(0).map((_, i) => i + 1)]);

const LOEXT = 'urn:org:documentfoundation:names:experimental:office:xmlns:loext:1.0';
const CALCEXT = 'urn:org:documentfoundation:names:experimental:calc:xmlns:calcext:1.0';
const ACME = 'urn:example:acme';
const DECL = '<?xml version="1.0" encoding="UTF-8"?>\n';

// ---------------------------------------------------------------------------
// Checker
// ---------------------------------------------------------------------------

/** Prefix of a qualified name, or `null` when unprefixed. */
function prefixOf(name) {
    const i = name.indexOf(':');
    return i > 0 ? name.slice(0, i) : null;
}

/**
 * Undeclared prefixes (sorted) of the element and attribute names of an XML
 * string. `xml` is implicit; `xmlns` / `xmlns:*` attributes are
 * declarations, not uses; a declaration on an element is in scope for that
 * element's subtree only.
 */
function undeclaredPrefixes(xmlString) {
    const root = xml.parse(xmlString);
    const missing = new Set();
    const scope = [];
    function inScope(p) {
        if (p === 'xml') return true;
        for (let i = scope.length - 1; i >= 0; i--) if (scope[i].has(p)) return true;
        return false;
    }
    function use(name) {
        const p = prefixOf(name);
        if (p && !inScope(p)) missing.add(p);
    }
    function walk(node) {
        if (!node || node.type !== 'element') return;
        const local = new Set();
        for (const k of Object.keys(node.attrs || {})) {
            if (k.startsWith('xmlns:')) local.add(k.slice(6));
        }
        scope.push(local);
        use(node.name);
        for (const k of Object.keys(node.attrs || {})) {
            if (k === 'xmlns' || k.startsWith('xmlns:')) continue;
            use(k);
        }
        for (const c of node.children || []) walk(c);
        scope.pop();
    }
    walk(root);
    return [...missing].sort();
}

/** `{ partPath: [undeclared…] }` for every XML part of a package that has any. */
function undeclaredByPart(bytes) {
    const p = pkg.read(bytes);
    const out = {};
    for (const path of Object.keys(p.parts)) {
        if (!path.endsWith('.xml')) continue;
        const u = undeclaredPrefixes(td.decode(p.parts[path]));
        if (u.length) out[path] = u;
    }
    const m = undeclaredPrefixes(manifestText(bytes));
    if (m.length) out['META-INF/manifest.xml'] = m;
    return out;
}

/** The written `META-INF/manifest.xml` text (the package reader parses it away). */
function manifestText(bytes) {
    const zip = runtime.resolve('zip');
    const files = zip.unzipSync(bytes);
    return td.decode(files['META-INF/manifest.xml']);
}

/** The parsed root element of one written part. */
function rootOf(bytes, path) {
    const text = path === 'META-INF/manifest.xml'
        ? manifestText(bytes)
        : td.decode(pkg.read(bytes).parts[path]);
    return xml.parse(text);
}

/** Replace the text of some parts of a written package and re-zip it. */
function patchParts(bytes, replacements) {
    const p = pkg.read(bytes);
    for (const path of Object.keys(replacements)) p.parts[path] = te.encode(replacements[path]);
    return pkg.write(p);
}

function attempt(fn) {
    try { return { value: fn() }; } catch (error) { return { error }; }
}

// ---------------------------------------------------------------------------
// Checker non-vacuity
// ---------------------------------------------------------------------------

describe('namespaces — checker non-vacuity', () => {
    test('reports an undeclared attribute prefix', () => {
        expect(undeclaredPrefixes('<a:x xmlns:a="u" b:y="1"/>')).toEqual(['b']);
    });

    test('reports nothing for a fully declared string', () => {
        expect(undeclaredPrefixes(
            '<a:x xmlns:a="u" xmlns:b="v" b:y="1" xml:lang="en"><b:z a:k="2"/></a:x>')).toEqual([]);
    });

    test('honours a descendant-local declaration, for that subtree only', () => {
        expect(undeclaredPrefixes(
            '<a:x xmlns:a="u"><a:y xmlns:c="w"><c:z/></a:y></a:x>')).toEqual([]);
        expect(undeclaredPrefixes(
            '<a:x xmlns:a="u"><a:y xmlns:c="w"/><c:z/></a:x>')).toEqual(['c']);
    });
});

// ---------------------------------------------------------------------------
// Fresh writes
// ---------------------------------------------------------------------------

describe('namespaces — fresh writes declare every prefix', () => {
    test('(a) odt: paragraph with an image run carrying mimeType + pictures', () => {
        const doc = {
            body: [{ type: 'paragraph', runs: [
                { type: 'text', value: 'Before ' },
                { type: 'image', href: 'Pictures/a.png', width: '2cm', height: '1cm',
                  name: 'img1', mimeType: 'image/png' },
                { type: 'text', value: ' after' }
            ] }],
            pictures: { 'Pictures/a.png': PNG }
        };
        expect(undeclaredByPart(odt.write(doc))).toEqual({});
    });

    test('(b) odp: a slide frame with an image child carrying mimeType', () => {
        const doc = { slides: [{ type: 'slide', name: 'Slide1', frames: [{
            type: 'frame', name: 'pic', width: '4cm', height: '3cm', x: '1cm', y: '1cm',
            child: { kind: 'image', href: 'Pictures/a.png', mimeType: 'image/png' }
        }] }] };
        expect(undeclaredByPart(odp.write(doc))).toEqual({});
    });

    test('(c) empty() writes of odt, ods and odp', () => {
        expect(undeclaredByPart(odt.write(odt.empty()))).toEqual({});
        expect(undeclaredByPart(ods.write(ods.empty()))).toEqual({});
        expect(undeclaredByPart(odp.write(odp.empty()))).toEqual({});
    });
});

// ---------------------------------------------------------------------------
// Read-then-write of synthetic LibreOffice-shaped packages
// ---------------------------------------------------------------------------

const NS = {
    office: ODF_NS.OFFICE, text: ODF_NS.TEXT, style: ODF_NS.STYLE, table: ODF_NS.TABLE,
    fo: ODF_NS.FO, draw: ODF_NS.DRAW, svg: ODF_NS.SVG, form: ODF_NS.FORM,
    meta: ODF_NS.META, dc: ODF_NS.DC, presentation: ODF_NS.PRESENTATION,
    anim: ODF_NS.ANIM, smil: ODF_NS.SMIL, xlink: ODF_NS.XLINK,
    ooo: 'http://openoffice.org/2004/office',
    ooow: 'http://openoffice.org/2004/writer',
    loext: LOEXT, calcext: CALCEXT, acme: ACME,
    // Carried-only prefix: never in any known table.
    lotest: 'urn:example:carried-only'
};

function decls(...prefixes) {
    return prefixes.map(p => ` xmlns:${p}="${NS[p]}"`).join('');
}

const ODT_CONTENT = DECL
    + `<office:document-content${decls('office', 'text', 'style', 'fo', 'xlink', 'form', 'loext', 'lotest', 'acme')} office:version="1.3">`
    + '<office:body><office:text>'
    + '<office:forms form:automatic-focus="false" form:apply-design-mode="false"/>'
    // The paragraph reader keeps a link's attributes and unknown inline
    // elements verbatim: those are the carriers of the extension markup.
    + '<text:p><text:a xlink:type="simple" xlink:href="https://example.org/" acme:tag="1"'
    + ' loext:marker="x" lotest:rsid="00ab12">Hello</text:a><acme:note acme:k="v"/></text:p>'
    + '</office:text></office:body></office:document-content>';

const ODT_STYLES = DECL
    + `<office:document-styles${decls('office', 'style', 'text', 'fo', 'draw')} office:version="1.3">`
    + '<office:styles><style:style style:name="Graphics" style:family="graphic">'
    + '<style:graphic-properties draw:fill="none"/></style:style></office:styles>'
    + '<office:automatic-styles/><office:master-styles/></office:document-styles>';

const ODT_META = DECL
    + `<office:document-meta${decls('office', 'meta', 'dc', 'ooo')} office:version="1.3">`
    + '<office:meta><meta:generator>LibreOffice/7.1</meta:generator>'
    + '<ooo:template-note>kept</ooo:template-note></office:meta></office:document-meta>';

function libreOfficeOdt() {
    return patchParts(odt.write(odt.empty()),
        { 'content.xml': ODT_CONTENT, 'styles.xml': ODT_STYLES, 'meta.xml': ODT_META });
}

describe('namespaces — read-then-write of a LibreOffice-shaped .odt (d)', () => {
    test('the synthetic source itself is fully declared', () => {
        expect(undeclaredByPart(libreOfficeOdt())).toEqual({});
    });

    test('every re-written part declares every prefix it uses', () => {
        const out = odt.write(odt.read(libreOfficeOdt()));
        expect(undeclaredByPart(out)).toEqual({});
    });

    test('carried and known prefixes are bound to the right URIs', () => {
        const out = odt.write(odt.read(libreOfficeOdt()));
        const content = rootOf(out, 'content.xml');
        expect(content.attrs['xmlns:acme']).toBe(ACME);
        expect(content.attrs['xmlns:lotest']).toBe(NS.lotest);
        expect(content.attrs['xmlns:loext']).toBe(LOEXT);
        expect(content.attrs['xmlns:form']).toBe(ODF_NS.FORM);
        const styles = rootOf(out, 'styles.xml');
        expect(styles.attrs['xmlns:draw']).toBe(ODF_NS.DRAW);
        const meta = rootOf(out, 'meta.xml');
        expect(meta.attrs['xmlns:ooo']).toBe(NS.ooo);
    });
});

const ODS_CONTENT = DECL
    + `<office:document-content${decls('office', 'text', 'style', 'table', 'fo', 'calcext')} office:version="1.3">`
    + '<office:body><office:spreadsheet><table:table table:name="Sheet1">'
    + '<table:table-column/><table:table-row>'
    + '<table:table-cell office:value-type="string" calcext:value-type="string"><text:p>a</text:p></table:table-cell>'
    + '</table:table-row></table:table></office:spreadsheet></office:body></office:document-content>';

const ODP_CONTENT = DECL
    + `<office:document-content${decls('office', 'text', 'style', 'draw', 'presentation', 'svg', 'form', 'anim', 'smil')} office:version="1.3">`
    + '<office:body><office:presentation><draw:page draw:name="Slide1">'
    + '<office:forms form:automatic-focus="false" form:apply-design-mode="false"/>'
    + '<anim:par presentation:node-type="timing-root"><anim:seq presentation:node-type="main-sequence">'
    + '<anim:set smil:begin="0s" smil:attributeName="visibility" smil:to="visible"/>'
    + '</anim:seq></anim:par>'
    + '</draw:page></office:presentation></office:body></office:document-content>';

describe('namespaces — read-then-write of LibreOffice-shaped .ods / .odp (e)', () => {
    test('ods: a carried calcext cell attribute stays declared', () => {
        const src = patchParts(ods.write(ods.empty()), { 'content.xml': ODS_CONTENT });
        expect(undeclaredByPart(src)).toEqual({});
        const out = ods.write(ods.read(src));
        expect(td.decode(pkg.read(out).parts['content.xml'])).toContain('calcext:value-type="string"');
        expect(undeclaredByPart(out)).toEqual({});
        expect(rootOf(out, 'content.xml').attrs['xmlns:calcext']).toBe(CALCEXT);
    });

    test('odp: anim / smil under a slide and form in the body stay declared', () => {
        const src = patchParts(odp.write(odp.empty()), { 'content.xml': ODP_CONTENT });
        expect(undeclaredByPart(src)).toEqual({});
        const out = odp.write(odp.read(src));
        const text = td.decode(pkg.read(out).parts['content.xml']);
        expect(text).toContain('<anim:set');
        expect(text).toContain('<office:forms');
        expect(undeclaredByPart(out)).toEqual({});
        const root = rootOf(out, 'content.xml');
        expect(root.attrs['xmlns:anim']).toBe(ODF_NS.ANIM);
        expect(root.attrs['xmlns:smil']).toBe(ODF_NS.SMIL);
        expect(root.attrs['xmlns:form']).toBe(ODF_NS.FORM);
    });
});

// ---------------------------------------------------------------------------
// Refusal, byte stability, precedence, formula clause
// ---------------------------------------------------------------------------

describe('namespaces — a prefix nobody can resolve is refused', () => {
    test('odt.write throws RenderError odf/render-error/namespace for zzz', () => {
        const doc = { body: [{ type: 'paragraph', runs: [{ type: 'link', href: 'https://example.org/',
            runs: [{ type: 'text', value: 'x' }], _extras: { attrs: { 'zzz:attr': '1' } } }] }] };
        const r = attempt(() => odt.write(doc));
        expect(r.value).toBeUndefined();
        expect(r.error).toBeInstanceOf(RenderError);
        expect(r.error && r.error.code).toBe('odf/render-error/namespace');
        expect(r.error && r.error.context && r.error.context.prefix).toBe('zzz');
    });
});

describe('namespaces — root start tags of empty() writes are unchanged', () => {
    const SIDECARS = {
        'meta.xml': ['xmlns:office', 'xmlns:meta', 'xmlns:dc', 'office:version'],
        'settings.xml': ['xmlns:office', 'xmlns:config', 'office:version'],
        'styles.xml': ['xmlns:office', 'xmlns:style', 'xmlns:text', 'xmlns:fo', 'xmlns:svg',
            'xmlns:table', 'office:version'],
        'META-INF/manifest.xml': ['xmlns:manifest', 'manifest:version']
    };
    const CONTENT = {
        odt: ['xmlns:office', 'xmlns:text', 'xmlns:style', 'xmlns:table', 'xmlns:draw',
            'xmlns:fo', 'xmlns:svg', 'xmlns:xlink', 'office:version'],
        ods: ['xmlns:office', 'xmlns:text', 'xmlns:style', 'xmlns:table', 'xmlns:draw',
            'xmlns:fo', 'xmlns:svg', 'xmlns:number', 'xmlns:of', 'xmlns:xlink', 'office:version'],
        odp: ['xmlns:office', 'xmlns:text', 'xmlns:style', 'xmlns:table', 'xmlns:draw',
            'xmlns:presentation', 'xmlns:fo', 'xmlns:svg', 'xmlns:xlink', 'office:version']
    };
    for (const [name, mod] of [['odt', odt], ['ods', ods], ['odp', odp]]) {
        test(`${name}: every part keeps today's root attribute key list`, () => {
            const bytes = mod.write(mod.empty());
            expect(Object.keys(rootOf(bytes, 'content.xml').attrs)).toEqual(CONTENT[name]);
            for (const path of Object.keys(SIDECARS)) {
                expect(Object.keys(rootOf(bytes, path).attrs)).toEqual(SIDECARS[path]);
            }
        });
    }
});

describe('namespaces — carried declarations win over the known table', () => {
    test('a source binding loext to another URI keeps the source URI', () => {
        const other = 'urn:example:other-loext';
        const content = DECL
            + `<office:document-content${decls('office', 'text', 'xlink')} xmlns:loext="${other}" office:version="1.3">`
            + '<office:body><office:text><text:p><text:a xlink:type="simple" xlink:href="https://example.org/"'
            + ' loext:marker="x">a</text:a></text:p></office:text></office:body>'
            + '</office:document-content>';
        const src = patchParts(odt.write(odt.empty()), { 'content.xml': content });
        const out = odt.write(odt.read(src));
        expect(undeclaredByPart(out)).toEqual({});
        expect(rootOf(out, 'content.xml').attrs['xmlns:loext']).toBe(other);
    });
});

describe('namespaces — formula values', () => {
    test('a table:formula value prefix carried by the source is declared on re-write', () => {
        const content = DECL
            + `<office:document-content${decls('office', 'text', 'style', 'table', 'ooow')} office:version="1.3">`
            + '<office:body><office:text><table:table table:name="T1">'
            + '<table:table-column/><table:table-row>'
            + '<table:table-cell table:formula="ooow:&lt;A1&gt;+1" office:value-type="float" office:value="2">'
            + '<text:p>2</text:p></table:table-cell>'
            + '</table:table-row></table:table></office:text></office:body></office:document-content>';
        const src = patchParts(odt.write(odt.empty()), { 'content.xml': content });
        const out = odt.write(odt.read(src));
        const text = td.decode(pkg.read(out).parts['content.xml']);
        expect(text).toContain('table:formula="ooow:&lt;A1&gt;+1"');
        expect(rootOf(out, 'content.xml').attrs['xmlns:ooow']).toBe(NS.ooow);
    });
});

// ---------------------------------------------------------------------------
// Sub-document writers
// ---------------------------------------------------------------------------

describe('namespaces — chart and math sub-documents', () => {
    test('chart.bytesOf declares every prefix it uses', () => {
        const model = { type: 'chart', chartClass: 'chart:bar',
            plotArea: { attrs: { 'svg:width': '10cm', 'table:cell-range-address': 'local-table.A1:B3' },
                axes: [{ kind: 'axis', attrs: { 'chart:dimension': 'x' } }],
                series: [{ kind: 'series', attrs: { 'chart:values-cell-range-address': 'local-table.B1:B3' },
                    dataPoints: [] }] } };
        const text = td.decode(chart.bytesOf(model));
        expect(undeclaredPrefixes(text)).toEqual([]);
        expect(xml.parse(text).attrs['xmlns:chart']).toBe(ODF_NS.CHART);
    });

    test('math.bytesOf of the empty fallback declares math', () => {
        const fallback = math.parseBytes(DECL + `<office:document-content${decls('office')}/>`);
        const text = td.decode(math.bytesOf(fallback));
        expect(undeclaredPrefixes(text)).toEqual([]);
        expect(xml.parse(text).attrs['xmlns:math']).toBe(ODF_NS.MATH);
        expect(undeclaredPrefixes(td.decode(math.bytesOf(null)))).toEqual([]);
    });
});
