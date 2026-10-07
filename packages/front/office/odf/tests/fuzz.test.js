// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * Fuzz / malformed-input tests — verify the orchestrator surfaces a
 * typed `OdfError` (`ParseError`) when handed garbage, instead of
 * silently corrupting state.
 */
import { describe, test, expect } from 'bun:test';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { deflate } from '@awacloud/fw/io/compress/deflate.js';
import { bitstream } from '@awacloud/fw/io/compress/bitstream.js';
import { huffman } from '@awacloud/fw/io/compress/huffman.js';
import { lz77 } from '@awacloud/fw/io/compress/lz77.js';
import { zip } from '@awacloud/fw/io/compress/zip.js';
import { crc32 } from '@awacloud/fw/io/calc/crc32.js';
import { xml as fwXml } from '@awacloud/fw/io/codec/xml.js';
import * as odfMods from '../src/main.js';

const runtime = new ModuleRuntime();
for (const m of [bitstream, huffman, lz77, deflate, crc32, zip, fwXml, ...odfMods.modules]) {
    runtime.register(m);
}
const odt = runtime.resolve('odt');
const pkg = runtime.resolve('pkgPackage');
const zipMod = runtime.resolve('zip');
const mimetype = runtime.resolve('pkgMimetype');
const { OdfError, ParseError, ContractError } = runtime.resolve('odfErrors');

const GARBAGE = new Uint8Array([0xff, 0xfe, 0xfd, 0xfc, 0x00, 0x01, 0x02]);
const EMPTY = new Uint8Array(0);
const EMPTY_ZIP = (() => {
    const eocd = new Uint8Array(22);
    eocd.set([0x50, 0x4b, 0x05, 0x06], 0);
    return eocd;
})();
const ZIP_NO_CONTENT = (() => {
    const p = pkg.empty(mimetype.CT_ODT);
    return pkg.write(p);
})();

function expectThrows(fn) {
    let caught = null;
    try { fn(); } catch (e) { caught = e; }
    expect(caught).toBeInstanceOf(Error);
    return caught;
}

describe('fuzz — odt.read on bad input', () => {
    test('garbage bytes throw', () => {
        const e = expectThrows(() => odt.read(GARBAGE));
        expect(e).toBeInstanceOf(ParseError);
    });
    test('empty bytes throw', () => {
        expectThrows(() => odt.read(EMPTY));
    });
    test('empty ZIP (EOCD only) without mimetype throws', () => {
        const e = expectThrows(() => odt.read(EMPTY_ZIP));
        expect(e).toBeInstanceOf(ParseError);
    });
    test('ZIP with mimetype + manifest but no content.xml throws', () => {
        const e = expectThrows(() => odt.read(ZIP_NO_CONTENT));
        expect(e.message).toMatch(/content\.xml/);
    });
    test('ZIP with wrong mimetype (.ods bytes) throws', () => {
        const p = pkg.empty(mimetype.CT_ODS);
        pkg.setPart(p, 'content.xml', new TextEncoder().encode('<x/>'), 'text/xml');
        const bytes = pkg.write(p);
        const e = expectThrows(() => odt.read(bytes));
        expect(e.message).toMatch(/mimetype/);
    });
});

describe('fuzz — odt.write with bad model', () => {
    test('write(undefined) throws', () => {
        expectThrows(() => odt.write(undefined));
    });
    test('write(null) throws', () => {
        expectThrows(() => odt.write(null));
    });
});

describe('fuzz — L1 malformed parts', () => {
    test('malformed manifest XML throws ParseError', () => {
        const te = new TextEncoder();
        const files = {};
        files['mimetype'] = [te.encode(mimetype.CT_ODT), { level: 0 }];
        files['META-INF/manifest.xml'] = te.encode('<<<not xml');
        files['content.xml'] = te.encode('<office:document-content><office:body><office:text/></office:body></office:document-content>');
        const bytes = zipMod.zipSync(files);
        const e = expectThrows(() => odt.read(bytes));
        expect(e).toBeInstanceOf(ParseError);
    });

    test('empty body (no children in <office:text>) is tolerated', () => {
        const p = pkg.empty(mimetype.CT_ODT);
        const te = new TextEncoder();
        pkg.setPart(p, 'content.xml',
            te.encode('<office:document-content><office:body><office:text/></office:body></office:document-content>'),
            'text/xml');
        const back = odt.read(pkg.write(p));
        expect(back.body).toEqual([]);
    });

    test('missing styles.xml is tolerated (skipped on read)', () => {
        const p = pkg.empty(mimetype.CT_ODT);
        const te = new TextEncoder();
        pkg.setPart(p, 'content.xml',
            te.encode('<office:document-content><office:body><office:text><text:p>hi</text:p></office:text></office:body></office:document-content>'),
            'text/xml');
        const back = odt.read(pkg.write(p));
        expect(back.styles).toBeUndefined();
        expect(back.body).toHaveLength(1);
    });

    test('garbage styles.xml throws ParseError', () => {
        const p = pkg.empty(mimetype.CT_ODT);
        const te = new TextEncoder();
        pkg.setPart(p, 'content.xml',
            te.encode('<office:document-content><office:body><office:text/></office:body></office:document-content>'),
            'text/xml');
        pkg.setPart(p, 'styles.xml', te.encode('<<<garbage'), 'text/xml');
        const e = expectThrows(() => odt.read(pkg.write(p)));
        expect(e).toBeInstanceOf(ParseError);
    });
});

describe('fuzz — ods / odp orchestrators', () => {
    const ods = runtime.resolve('ods');
    const odp = runtime.resolve('odp');

    test('ods read: wrong mimetype throws ParseError', () => {
        const p = pkg.empty(mimetype.CT_ODT);
        pkg.setPart(p, 'content.xml', new TextEncoder().encode('<x/>'), 'text/xml');
        const e = expectThrows(() => ods.read(pkg.write(p)));
        expect(e).toBeInstanceOf(ParseError);
        expect(e.message).toMatch(/mimetype/);
    });

    test('ods read: missing content.xml throws ParseError', () => {
        const p = pkg.empty(mimetype.CT_ODS);
        const e = expectThrows(() => ods.read(pkg.write(p)));
        expect(e).toBeInstanceOf(ParseError);
        expect(e.message).toMatch(/content\.xml/);
    });

    test('odp read: wrong mimetype throws ParseError', () => {
        const p = pkg.empty(mimetype.CT_ODT);
        pkg.setPart(p, 'content.xml', new TextEncoder().encode('<x/>'), 'text/xml');
        const e = expectThrows(() => odp.read(pkg.write(p)));
        expect(e).toBeInstanceOf(ParseError);
        expect(e.message).toMatch(/mimetype/);
    });

    test('odp read: missing content.xml throws ParseError', () => {
        const p = pkg.empty(mimetype.CT_ODP);
        const e = expectThrows(() => odp.read(pkg.write(p)));
        expect(e).toBeInstanceOf(ParseError);
        expect(e.message).toMatch(/content\.xml/);
    });

    test('ods write(undefined) throws ContractError', () => {
        const e = expectThrows(() => ods.write(undefined));
        expect(e).toBeInstanceOf(ContractError);
        expect(e).toBeInstanceOf(OdfError);
    });

    test('odp write(undefined) throws ContractError', () => {
        const e = expectThrows(() => odp.write(undefined));
        expect(e).toBeInstanceOf(ContractError);
        expect(e).toBeInstanceOf(OdfError);
    });
});

describe('fuzz — L3 modules tolerate empty / garbage input', () => {
    const xml = runtime.resolve('xml');
    const tracked = runtime.resolve('textTracked');
    const chart = runtime.resolve('chartChart');
    const math = runtime.resolve('mathMath');
    const forms = runtime.resolve('formForms');
    const dr3d = runtime.resolve('dr3dScene');
    const shape = runtime.resolve('drawShape');
    const animations = runtime.resolve('odpAnimations');
    const mc = runtime.resolve('odfMc');

    test('tracked-changes: empty container yields empty list', () => {
        const el = xml.parse('<text:tracked-changes/>');
        expect(tracked.parseTrackedChanges(el).trackedChanges).toEqual([]);
    });

    test('chart.parseBytes tolerates missing chart:chart root', () => {
        const back = chart.parseBytes('<office:document-content/>');
        expect(back.type).toBe('chart');
    });

    test('math.parseBytes tolerates wrapping containers', () => {
        const back = math.parseBytes('<office:document-content><office:body><office:math><math:math/></office:math></office:body></office:document-content>');
        expect(back.type).toBe('math');
    });

    test('forms: empty office:forms', () => {
        const back = forms.parseOfficeForms(xml.parse('<office:forms/>'));
        expect(back.forms).toEqual([]);
    });

    test('dr3d: empty scene', () => {
        const back = dr3d.parseScene(xml.parse('<dr3d:scene/>'));
        expect(back.shapes).toEqual([]);
        expect(back.lights).toEqual([]);
    });

    test('drawShape: parses without children', () => {
        const m = shape.parseShape(xml.parse('<draw:rect/>'));
        expect(m.kind).toBe('draw:rect');
    });

    test('animations: malformed non-element root yields empty par', () => {
        const tree = animations.parseAnimations(null);
        expect(tree.kind).toBe('anim:par');
        expect(tree.children).toEqual([]);
    });

    test('mc.versionOf is null when missing', () => {
        const el = xml.parse('<x/>');
        expect(mc.versionOf(el)).toBeNull();
    });
});

describe('fuzz — typed error class is reachable', () => {
    test('OdfError exported and instanceable', () => {
        expect(typeof OdfError).toBe('function');
        const e = new OdfError('test/code', 'msg');
        expect(e).toBeInstanceOf(Error);
        expect(e.code).toBe('test/code');
    });

    test('ParseError extends OdfError', () => {
        const p = new ParseError('odf/parse-error', 'x');
        expect(p).toBeInstanceOf(OdfError);
    });
});
