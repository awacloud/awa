// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { bitstream } from '@awacloud/fw/io/compress/bitstream.js';
import { huffman } from '@awacloud/fw/io/compress/huffman.js';
import { deflate } from '@awacloud/fw/io/compress/deflate.js';
import { lz77 } from '@awacloud/fw/io/compress/lz77.js';
import { zip } from '@awacloud/fw/io/compress/zip.js';
import { crc32 } from '@awacloud/fw/io/calc/crc32.js';
import { xml as ooxmlXml } from '@awacloud/fw/io/codec/xml.js';
import { opcContentTypes } from './contentTypes.js';
import { opcRelationships } from './relationships.js';
import { opcPackage } from './package.js';
import { ooxmlErrors as _ooxmlErrors } from '../errors.js';
import { ooxmlShared as _ooxmlShared } from '../_shared/index.js';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import * as ooxmlMods from '../main.js';
const _errors = _ooxmlErrors.factory();
const _shared = _ooxmlShared.factory();

function buildOpc() {
    const bs = bitstream.factory();
    const hf = huffman.factory(bs);
    const zipInstance = zip.factory(deflate.factory(bs, hf, lz77.factory()), crc32.factory());
    const xmlInstance = ooxmlXml.factory();
    const ctInstance = opcContentTypes.factory(_errors, xmlInstance);
    const relsInstance = opcRelationships.factory(_errors, xmlInstance);
    return opcPackage.factory(_errors, zipInstance, ctInstance, relsInstance, _shared);
}

describe('opcPackage', () => {
    test('empty() produces a parseable shell', () => {
        const opc = buildOpc();
        const pkg = opc.empty();
        const bytes = opc.write(pkg);
        const back = opc.read(bytes);
        expect(back.contentTypes.defaults.xml).toBe('application/xml');
        expect(back.parts).toEqual({});
    });

    test('write/read roundtrip with a part and relationship', () => {
        const opc = buildOpc();
        const pkg = opc.empty();
        const partBytes = new TextEncoder().encode('<doc/>');
        opc.setPart(pkg, '/word/document.xml', partBytes,
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml');
        opc.setRels(pkg, '/', [{
            Id: 'rId1',
            Type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument',
            Target: 'word/document.xml'
        }]);

        const bytes = opc.write(pkg);
        const back = opc.read(bytes);

        expect(back.parts['/word/document.xml']).toEqual(partBytes);
        expect(back.contentTypes.overrides['/word/document.xml'])
            .toContain('wordprocessingml');
        expect(back.rels['/']).toHaveLength(1);
        expect(back.rels['/'][0].Target).toBe('word/document.xml');
    });

    test('isRelsPath / ownerPartFromRels', () => {
        const opc = buildOpc();
        expect(opc.isRelsPath('_rels/.rels')).toBe(true);
        expect(opc.isRelsPath('word/_rels/document.xml.rels')).toBe(true);
        expect(opc.isRelsPath('word/document.xml')).toBe(false);
        expect(opc.ownerPartFromRels('_rels/.rels')).toBe('/');
        expect(opc.ownerPartFromRels('word/_rels/document.xml.rels'))
            .toBe('/word/document.xml');
    });
});

/**
 * Decode every local file header of a ZIP byte stream: returns the DOS
 * date and time words (offsets 12 and 10, little endian) of each entry.
 * Walks the headers by their declared sizes, independent of the clock.
 */
function localHeaderStamps(bytes) {
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const out = [];
    let pos = 0;
    while (pos + 30 <= bytes.length && dv.getUint32(pos, true) === 0x04034b50) {
        const flags = dv.getUint16(pos + 6, true);
        expect(flags & 0x08).toBe(0); // sizes in the header, so the walk is exact
        const csize = dv.getUint32(pos + 18, true);
        const nameLen = dv.getUint16(pos + 26, true);
        const extraLen = dv.getUint16(pos + 28, true);
        out.push({ time: dv.getUint16(pos + 10, true), date: dv.getUint16(pos + 12, true) });
        pos += 30 + nameLen + extraLen + csize;
    }
    return out;
}

function samplePackage(opc) {
    const pkg = opc.empty();
    opc.setPart(pkg, '/word/document.xml', new TextEncoder().encode('<doc/>'),
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml');
    opc.setRels(pkg, '/', [{
        Id: 'rId1',
        Type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument',
        Target: 'word/document.xml'
    }]);
    return pkg;
}

describe('opcPackage.write — deterministic entry timestamp', () => {
    test('default: every entry is stamped 1980-01-01 00:00:00', () => {
        const opc = buildOpc();
        const stamps = localHeaderStamps(opc.write(samplePackage(opc)));
        expect(stamps.length).toBeGreaterThanOrEqual(3);
        for (const s of stamps) {
            expect(s.date).toBe((0 << 9) | (1 << 5) | 1);
            expect(s.time).toBe(0);
        }
    });

    test('two writes of the same package are byte-identical', () => {
        const opc = buildOpc();
        const pkg = samplePackage(opc);
        expect(Array.from(opc.write(pkg))).toEqual(Array.from(opc.write(pkg)));
    });

    test('opts.mtime as a Date overrides the default on every entry', () => {
        const opc = buildOpc();
        const bytes = opc.write(samplePackage(opc), { mtime: new Date(2020, 5, 15, 12, 0, 0) });
        const stamps = localHeaderStamps(bytes);
        expect(stamps.length).toBeGreaterThanOrEqual(3);
        for (const s of stamps) {
            expect(s.date).toBe(((2020 - 1980) << 9) | (6 << 5) | 15);
            expect(s.time).toBe(12 << 11);
        }
    });

    test('opts.mtime as a number overrides the default', () => {
        const opc = buildOpc();
        const t = new Date(2001, 1, 3, 4, 6, 8).getTime();
        const stamps = localHeaderStamps(opc.write(samplePackage(opc), { mtime: t }));
        for (const s of stamps) {
            expect(s.date).toBe(((2001 - 1980) << 9) | (2 << 5) | 3);
            expect(s.time).toBe((4 << 11) | (6 << 5) | (8 >> 1));
        }
    });

    test('opts.mtime outside the DOS range is wrapped as opc/zip-failed', () => {
        const opc = buildOpc();
        let err;
        try { opc.write(samplePackage(opc), { mtime: new Date(1970, 0, 1) }); } catch (e) { err = e; }
        expect(err).toBeDefined();
        expect(err.code).toBe('opc/zip-failed');
    });
});

describe('docx / xlsx / pptx write — byte-reproducible by default', () => {
    const runtime = new ModuleRuntime();
    for (const m of [...ooxmlMods.fw_require, ...ooxmlMods.modules]) runtime.register(m);
    const same = (a, b) => {
        expect(a.length).toBe(b.length);
        expect(a.every((v, i) => v === b[i])).toBe(true);
    };

    test('docx.write twice is byte-identical', () => {
        const d = runtime.resolve('docx');
        same(d.write(d.fromText(['a'])), d.write(d.fromText(['a'])));
    });

    test('xlsx.write twice is byte-identical', () => {
        const x = runtime.resolve('xlsx');
        const wb = () => ({ sheets: [{ name: 'S1', rows: [['a', 1]] }] });
        same(x.write(wb()), x.write(wb()));
    });

    test('pptx.write twice is byte-identical', () => {
        const p = runtime.resolve('pptx');
        const pres = () => ({ slides: [{ title: 't' }] });
        same(p.write(pres()), p.write(pres()));
    });

    test('facade output carries the 1980-01-01 stamp on every entry', () => {
        const d = runtime.resolve('docx');
        for (const s of localHeaderStamps(d.write(d.fromText(['a'])))) {
            expect(s.date).toBe(33);
            expect(s.time).toBe(0);
        }
    });
});

