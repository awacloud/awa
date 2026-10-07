// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { ooxmlShared } from './index.js';
import { xml as ooxmlXml } from '@awacloud/fw/io/codec/xml.js';

describe('ooxmlShared module', () => {
    test('module metadata', () => {
        expect(ooxmlShared.name).toBe('ooxmlShared');
        expect(ooxmlShared.dependencies).toEqual([]);
        expect(typeof ooxmlShared.factory).toBe('function');
    });

    describe('factory', () => {
        test('exposes expected API', () => {
            const s = ooxmlShared.factory();
            expect(typeof s.NS).toBe('object');
            expect(typeof s.REL_TYPE).toBe('object');
            expect(typeof s.CT).toBe('object');
            expect(typeof s.toEmu).toBe('function');
            expect(typeof s.readBoolAttr).toBe('function');
            expect(typeof s.writeBoolAttr).toBe('function');
            expect(typeof s.partExt).toBe('function');
            expect(typeof s.EMU_PER_INCH).toBe('number');
        });
    });

    describe('NS', () => {
        const { NS } = ooxmlShared.factory();
        test('canonical namespaces match ECMA-376', () => {
            expect(NS.W).toBe('http://schemas.openxmlformats.org/wordprocessingml/2006/main');
            expect(NS.A).toBe('http://schemas.openxmlformats.org/drawingml/2006/main');
            expect(NS.R).toBe('http://schemas.openxmlformats.org/officeDocument/2006/relationships');
            expect(NS.SS).toBe('http://schemas.openxmlformats.org/spreadsheetml/2006/main');
            expect(NS.P).toBe('http://schemas.openxmlformats.org/presentationml/2006/main');
            expect(NS.C).toBe('http://schemas.openxmlformats.org/drawingml/2006/chart');
            expect(NS.M).toBe('http://schemas.openxmlformats.org/officeDocument/2006/math');
            expect(NS.MC).toBe('http://schemas.openxmlformats.org/markup-compatibility/2006');
            expect(NS.WP).toBe('http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing');
            expect(NS.PIC).toBe('http://schemas.openxmlformats.org/drawingml/2006/picture');
            expect(NS.XDR).toBe('http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing');
        });
        test('is frozen', () => {
            expect(Object.isFrozen(NS)).toBe(true);
        });
    });

    describe('REL_TYPE', () => {
        const { REL_TYPE, NS } = ooxmlShared.factory();
        test('canonical relationship URIs', () => {
            expect(REL_TYPE.DOC).toBe(NS.R + '/officeDocument');
            expect(REL_TYPE.HYPERLINK).toBe(NS.R + '/hyperlink');
            expect(REL_TYPE.IMAGE).toBe(NS.R + '/image');
            expect(REL_TYPE.SLIDE_LAYOUT).toBe(NS.R + '/slideLayout');
            expect(REL_TYPE.THREADED_COMMENT).toBe('http://schemas.microsoft.com/office/2017/10/relationships/threadedComment');
        });
    });

    describe('CT', () => {
        const { CT } = ooxmlShared.factory();
        test('canonical content types', () => {
            expect(CT.DOCUMENT).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml');
            expect(CT.WORKBOOK).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml');
            expect(CT.PRESENTATION).toBe('application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml');
            expect(CT.CHART).toBe('application/vnd.openxmlformats-officedocument.drawingml.chart+xml');
        });
    });

    describe('toEmu', () => {
        const { toEmu } = ooxmlShared.factory();
        test('number passthrough', () => {
            expect(toEmu(12345)).toBe(12345);
            expect(toEmu(12345.6)).toBe(12346);
        });
        test('inch conversion', () => { expect(toEmu('1in')).toBe(914400); });
        test('cm conversion', () => { expect(toEmu('1cm')).toBe(360000); });
        test('mm conversion', () => { expect(toEmu('10mm')).toBe(360000); });
        test('pt conversion', () => { expect(toEmu('72pt')).toBe(914400); });
        test('px conversion', () => { expect(toEmu('96px')).toBe(914400); });
        test('negative values', () => { expect(toEmu('-1in')).toBe(-914400); });
        test('no unit defaults to EMU', () => { expect(toEmu('500')).toBe(500); });
        test('unparseable returns 0', () => {
            expect(toEmu('abc')).toBe(0);
            expect(toEmu('')).toBe(0);
        });
    });

    describe('readBoolAttr / writeBoolAttr', () => {
        const { readBoolAttr, writeBoolAttr } = ooxmlShared.factory();
        test('readBoolAttr semantics', () => {
            expect(readBoolAttr('1')).toBe(true);
            expect(readBoolAttr('true')).toBe(true);
            expect(readBoolAttr('0')).toBe(false);
            expect(readBoolAttr('false')).toBe(false);
            expect(readBoolAttr(null)).toBeUndefined();
            expect(readBoolAttr(undefined)).toBeUndefined();
        });
        test('writeBoolAttr semantics', () => {
            expect(writeBoolAttr(true)).toBe('1');
            expect(writeBoolAttr(false)).toBe('0');
        });
        test('round-trip', () => {
            const { readBoolAttr: r, writeBoolAttr: w } = ooxmlShared.factory();
            expect(r(w(true))).toBe(true);
            expect(r(w(false))).toBe(false);
        });
    });

    describe('partExt', () => {
        const { partExt } = ooxmlShared.factory();
        test('basic extraction', () => {
            expect(partExt('word/document.xml')).toBe('xml');
            expect(partExt('media/image1.PNG')).toBe('png');
            expect(partExt('foo.tar.gz')).toBe('gz');
        });
        test('no extension returns empty', () => {
            expect(partExt('Makefile')).toBe('');
            expect(partExt('')).toBe('');
            expect(partExt(null)).toBe('');
        });
    });

    describe('createDmlColorCodec', () => {
        const xml = ooxmlXml.factory();
        const { createDmlColorCodec } = ooxmlShared.factory();
        const codec = createDmlColorCodec(xml);

        test('srgbClr round-trip without mods', () => {
            const node = codec.renderColor({ kind: 'srgbClr', attrs: { val: 'FF0000' } });
            const back = codec.parseColor(node);
            expect(back).toEqual({ kind: 'srgbClr', attrs: { val: 'FF0000' } });
        });

        test('schemeClr with lumMod / lumOff preserved when withMods', () => {
            const src = {
                kind: 'schemeClr',
                attrs: { val: 'accent1' },
                mods: [
                    { kind: 'lumMod', attrs: { val: '60000' } },
                    { kind: 'lumOff', attrs: { val: '40000' } }
                ]
            };
            const node = codec.renderColor(src, { withMods: true });
            const back = codec.parseColor(node, { withMods: true });
            expect(back).toEqual(src);
        });

        test('mods dropped when withMods is false (fills-advanced semantics)', () => {
            const src = {
                kind: 'schemeClr',
                attrs: { val: 'accent2' },
                mods: [{ kind: 'tint', attrs: { val: '50000' } }]
            };
            // Render without mods → output node has no children.
            const node = codec.renderColor(src, { withMods: false });
            expect(node.children).toEqual([]);
            const back = codec.parseColor(node, { withMods: false });
            expect(back).toEqual({ kind: 'schemeClr', attrs: { val: 'accent2' } });
        });

        test('alpha mod chain (alphaMod + shade) round-trip', () => {
            const src = {
                kind: 'srgbClr',
                attrs: { val: '00FF00' },
                mods: [
                    { kind: 'alphaMod', attrs: { val: '50000' } },
                    { kind: 'shade',    attrs: { val: '75000' } }
                ]
            };
            const back = codec.parseColor(codec.renderColor(src, { withMods: true }), { withMods: true });
            expect(back).toEqual(src);
        });

        test('srgbClr builder uppercases and strips leading #', () => {
            const n = codec.srgbClr('#aaBBcc');
            expect(n.name).toBe('a:srgbClr');
            expect(n.attrs.val).toBe('AABBCC');
        });

        test('returns null for non-color elements', () => {
            expect(codec.parseColor({ name: 'a:foo', attrs: {}, children: [] })).toBe(null);
            expect(codec.parseColor(null)).toBe(null);
            expect(codec.renderColor(null)).toBe(null);
        });
    });

    describe('createXlsxColorCodec', () => {
        const xml = ooxmlXml.factory();
        const { createXlsxColorCodec } = ooxmlShared.factory();
        const codec = createXlsxColorCodec(xml);

        test('full attribute set round-trip', () => {
            const src = { rgb: 'FFAABBCC', theme: 4, tint: -0.249977111117893, indexed: 64, auto: true };
            const node = codec.renderColor('color', src);
            const back = codec.parseColor(node);
            expect(back.rgb).toBe('FFAABBCC');
            expect(back.theme).toBe(4);
            expect(back.tint).toBeCloseTo(-0.249977111117893, 10);
            expect(back.indexed).toBe(64);
            expect(back.auto).toBe(true);
        });

        test('absent auto does not leak on render (cf flavour)', () => {
            const src = { theme: 3, tint: 0.4 };
            const node = codec.renderColor('color', src);
            expect(node.attrs.auto).toBeUndefined();
            const back = codec.parseColor(node);
            expect(back.auto).toBeUndefined();
            expect(back.theme).toBe(3);
        });

        test('empty color → element with no attrs', () => {
            const node = codec.renderColor('bgColor', {});
            expect(node.attrs).toEqual({});
        });
    });

    describe('UTF-8 codec (encodeText / decodeText)', () => {
        const { encodeText, decodeText } = ooxmlShared.factory();

        test('ascii round-trip is byte-identical to TextEncoder', () => {
            const s = '<doc>hello</doc>';
            const a = encodeText(s);
            const b = new TextEncoder().encode(s);
            expect(a).toEqual(b);
            expect(decodeText(a)).toBe(s);
        });

        test('accented + multi-byte + emoji round-trip', () => {
            const s = 'éàü — 世界 — 😀 — NUL end';
            const a = encodeText(s);
            const b = new TextEncoder().encode(s);
            expect(a).toEqual(b);
            expect(decodeText(a)).toBe(s);
        });

        test('XML BOM encoded as bytes matches reference encoder', () => {
            // U+FEFF (BOM). Note: TextDecoder strips a leading BOM by
            // default, so we only assert the encoded byte sequence is
            // identical to a fresh TextEncoder's output — the decode
            // half is covered by the other round-trip tests.
            const s = '﻿<?xml version="1.0"?><root/>';
            const a = encodeText(s);
            const b = new TextEncoder().encode(s);
            expect(a).toEqual(b);
        });

        test('encodeText returns a Uint8Array', () => {
            expect(encodeText('x')).toBeInstanceOf(Uint8Array);
        });
    });

    describe('createRidAllocator', () => {
        const { createRidAllocator } = ooxmlShared.factory();

        test('produces rId1, rId2, ... by default', () => {
            const a = createRidAllocator();
            expect(a.next()).toBe('rId1');
            expect(a.next()).toBe('rId2');
            expect(a.next()).toBe('rId3');
        });

        test('peek does not consume', () => {
            const a = createRidAllocator();
            expect(a.peek()).toBe('rId1');
            expect(a.peek()).toBe('rId1');
            expect(a.next()).toBe('rId1');
            expect(a.peek()).toBe('rId2');
        });

        test('reset re-arms to start', () => {
            const a = createRidAllocator({ start: 5 });
            expect(a.next()).toBe('rId5');
            expect(a.next()).toBe('rId6');
            a.reset();
            // Already-consumed ids are still tracked → next free above 5.
            expect(a.next()).toBe('rId7');
        });

        test('custom prefix', () => {
            const a = createRidAllocator({ prefix: 'rImg' });
            expect(a.next()).toBe('rImg1');
            expect(a.next()).toBe('rImg2');
        });

        test('custom start', () => {
            const a = createRidAllocator({ start: 10 });
            expect(a.next()).toBe('rId10');
            expect(a.next()).toBe('rId11');
        });

        test('existing as id-string array', () => {
            const a = createRidAllocator({ existing: ['rId1', 'rId3'] });
            expect(a.next()).toBe('rId2');
            expect(a.next()).toBe('rId4');
        });

        test('existing as rel-object array', () => {
            const a = createRidAllocator({
                existing: [{ Id: 'rId1' }, { Id: 'rId5' }]
            });
            expect(a.next()).toBe('rId2');
            expect(a.next()).toBe('rId3');
        });

        test('claim returns preferred if not used', () => {
            const a = createRidAllocator();
            expect(a.claim('rId7')).toBe('rId7');
            // Next sequential id skips the claimed one.
            expect(a.next()).toBe('rId1');
            expect(a.next()).toBe('rId2');
        });

        test('claim falls back to next() when preferred collides', () => {
            const a = createRidAllocator();
            a.next();                    // rId1 consumed
            expect(a.claim('rId1')).toBe('rId2');
        });

        test('claim without preferred falls back to next()', () => {
            const a = createRidAllocator();
            expect(a.claim()).toBe('rId1');
            expect(a.claim(null)).toBe('rId2');
        });

        test('register marks foreign id as used', () => {
            const a = createRidAllocator();
            a.register('rId1');
            a.register('rId3');
            expect(a.next()).toBe('rId2');
            expect(a.next()).toBe('rId4');
        });

        test('usedIds reflects every id (existing + produced)', () => {
            const a = createRidAllocator({ existing: ['rId99'] });
            a.next();
            a.claim('rId50');
            const ids = a.usedIds();
            expect(ids).toContain('rId99');
            expect(ids).toContain('rId1');
            expect(ids).toContain('rId50');
        });

        test('each call returns an independent allocator', () => {
            const a = createRidAllocator();
            const b = createRidAllocator();
            a.next();
            a.next();
            expect(b.next()).toBe('rId1');
        });
    });
});

describe('ooxmlShared.wordRootAttrs', () => {
    const { wordRootAttrs } = ooxmlShared.factory();
    const xml = ooxmlXml.factory();
    const URI_W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
    const URI_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
    const URI_MC = 'http://schemas.openxmlformats.org/markup-compatibility/2006';
    const URI_WORD_2012 = 'http://schemas.microsoft.com/office/word/2012/wordml';

    test('no node: w and r only, in that order', () => {
        const attrs = wordRootAttrs([]);
        expect(Object.keys(attrs)).toEqual(['xmlns:w', 'xmlns:r']);
        expect(attrs).toEqual({ 'xmlns:w': URI_W, 'xmlns:r': URI_R });
    });

    test('a nested w15 element: the five keys in order', () => {
        const nodes = [
            xml.el('w:p'),
            xml.el('w:sdt', {}, [
                xml.el('w:sdtPr', {}, [xml.el('w15:repeatingSectionItem')])
            ])
        ];
        const attrs = wordRootAttrs(nodes);
        expect(Object.keys(attrs))
            .toEqual(['xmlns:w', 'xmlns:r', 'xmlns:mc', 'xmlns:w15', 'mc:Ignorable']);
        expect(attrs['xmlns:w']).toBe(URI_W);
        expect(attrs['xmlns:r']).toBe(URI_R);
        expect(attrs['xmlns:mc']).toBe(URI_MC);
        expect(attrs['xmlns:w15']).toBe(URI_WORD_2012);
        expect(attrs['mc:Ignorable']).toBe('w15');
    });

    test('a w14 element alone: w and r only', () => {
        const attrs = wordRootAttrs([xml.el('w:r', {}, [xml.el('w14:glow', { 'w14:rad': '1' })])]);
        expect(Object.keys(attrs)).toEqual(['xmlns:w', 'xmlns:r']);
    });

    test('non-element entries are ignored', () => {
        const attrs = wordRootAttrs([null, undefined, 'w15:text', { type: 'text', value: 'w15:x' },
            { name: 'w15:noType' }, xml.el('w:p', {}, [xml.text('w15:in-text')])]);
        expect(Object.keys(attrs)).toEqual(['xmlns:w', 'xmlns:r']);
    });

    test('returns a fresh object on every call', () => {
        const a = wordRootAttrs([]);
        const b = wordRootAttrs([]);
        expect(a).not.toBe(b);
        a['xmlns:x'] = 'mutated';
        expect(wordRootAttrs([])).toEqual({ 'xmlns:w': URI_W, 'xmlns:r': URI_R });
    });
});
