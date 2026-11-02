// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * The bundles' extensions write back what they type. Their dehydrate hooks
 * render the elements they promoted into the node's `_extras`; when the
 * hydrate pass had promoted every extra (and so removed `_extras`), they
 * built an `_extras` ARRAY, which the core renderers never read — the
 * elements were lost. The oracle here: `write(read(x))` through a large or
 * full bundle writes the same elements, counted by name, as through the
 * core runtime (the extensions are lossless; positions inside a paragraph
 * are the core's, re-emitted after the runs).
 */
import { describe, test, expect } from 'bun:test';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import * as odf from '../src/main.js';

const core = new ModuleRuntime();
for (const m of [...odf.fw_require, ...odf.modules]) core.register(m);
const pkg = core.resolve('pkgPackage');
const zip = core.resolve('zip');
const enc = new TextEncoder();
const dec = new TextDecoder();

const NS = 'xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"'
    + ' xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"'
    + ' xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0"'
    + ' xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0"'
    + ' xmlns:xlink="http://www.w3.org/1999/xlink"'
    + ' xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0"';

/** A document of format `fmt` written by the core writer, its content.xml body replaced. */
function withBody(fmt, rootTag, bodyXml) {
    const api = core.resolve(fmt);
    const p = pkg.read(api.write(fmt === 'ods' ? api.empty() : fmt === 'odp' ? api.empty() : { body: [] }));
    p.parts['content.xml'] = enc.encode('<?xml version="1.0" encoding="UTF-8"?>'
        + `<office:document-content ${NS} office:version="1.3"><office:body><${rootTag}>`
        + `${bodyXml}</${rootTag}></office:body></office:document-content>`);
    return pkg.write(p);
}

/** Element counts of the written content.xml. */
function counts(bytes) {
    const s = dec.decode(zip.unzipSync(bytes)['content.xml']);
    const m = {};
    for (const x of s.matchAll(/<([A-Za-z][\w.-]*:[\w.-]+)[\s/>]/g)) m[x[1]] = (m[x[1]] || 0) + 1;
    return m;
}

// Paragraphs whose only untyped children are the ones an extension types:
// change marks, extended fields, notes and soft page breaks (text-misc),
// ruby and meta (text-meta).
const ODT_BODY = [
    '<text:p>a<text:change-start text:change-id="ct1"/>b<text:change-end text:change-id="ct1"/></text:p>',
    '<text:p><text:change text:change-id="ct2"/></text:p>',
    '<text:p><text:placeholder text:placeholder-type="text">&lt;Name&gt;</text:placeholder></text:p>',
    '<text:p>Page <text:page-number text:select-page="current">3</text:page-number></text:p>',
    '<text:p>x<text:soft-page-break/>y</text:p>',
    '<text:p>Body<text:note text:id="n1" text:note-class="footnote"><text:note-citation>1</text:note-citation>'
        + '<text:note-body><text:p>Note text</text:p></text:note-body></text:note></text:p>',
    '<text:p><text:ruby><text:ruby-base>漢</text:ruby-base><text:ruby-text>かん</text:ruby-text></text:ruby></text:p>'
].join('');
const ODS_BODY = '<table:table table:name="S"><table:shapes><draw:frame draw:name="F" svg:width="1cm" svg:height="1cm">'
    + '<draw:image xlink:href="Pictures/a.png"/></draw:frame></table:shapes><table:table-column/>'
    + '<table:table-row><table:table-cell/></table:table-row></table:table>'
    + '<table:named-expressions><table:named-range table:name="R" table:base-cell-address="S.A1" table:cell-range-address="S.A1"/></table:named-expressions>';

const CASES = [
    ['odt', 'office:text', ODT_BODY, ['text:change-start', 'text:change', 'text:placeholder', 'text:page-number',
        'text:soft-page-break', 'text:note', 'text:ruby']],
    ['ods', 'office:spreadsheet', ODS_BODY, ['table:shapes', 'draw:frame', 'draw:image', 'table:named-range']]
];

describe('bundle extensions write back what they type', () => {
    for (const [fmt, rootTag, body, names] of CASES) {
        const source = withBody(fmt, rootTag, body);
        const api = core.resolve(fmt);
        const expected = counts(api.write(api.read(source)));

        test(`${fmt}: the core round trip keeps every element (premise)`, () => {
            for (const n of names) expect(expected[n]).toBeGreaterThan(0);
        });

        for (const size of ['Large', 'Full']) {
            test(`${fmt} ${size.toLowerCase()} bundle: the same elements as the core`, () => {
                const rt = new ModuleRuntime();
                rt.registerDeep(odf[`${fmt}${size}Bundle`]);
                const b = rt.resolve(`${fmt}${size}Bundle`);
                expect(counts(b.write(b.read(source)))).toEqual(expected);
            });
        }
    }
});
