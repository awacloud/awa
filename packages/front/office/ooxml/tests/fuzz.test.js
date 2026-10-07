// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * Fuzz / malformed-input tests — verify each format orchestrator
 * surfaces a typed error (or an explicit empty result) when handed
 * garbage, instead of silently corrupting state or throwing a stray
 * Error string.
 *
 * Conventions :
 * - Reads on garbage bytes → throw an Error (ideally `OoxmlError`).
 * - Reads on empty / truncated bytes → throw.
 * - Reads on valid ZIP without ooxml content → throw.
 * - Writes with malformed model → throw (best-effort).
 */
import { describe, test, expect } from 'bun:test';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { bitstream } from '@awacloud/fw/io/compress/bitstream.js';
import { huffman } from '@awacloud/fw/io/compress/huffman.js';
import { deflate } from '@awacloud/fw/io/compress/deflate.js';
import { lz77 } from '@awacloud/fw/io/compress/lz77.js';
import { zip } from '@awacloud/fw/io/compress/zip.js';
import { crc32 } from '@awacloud/fw/io/calc/crc32.js';
import { xml } from '@awacloud/fw/io/codec/xml.js';
import * as ooxmlMods from '../src/main.js';
import { ooxmlErrors } from '../src/errors.js';
const { OoxmlError } = ooxmlErrors.factory();

const runtime = new ModuleRuntime();
for (const m of [xml, bitstream, huffman, lz77, deflate, crc32, zip, ...ooxmlMods.modules]) runtime.register(m);
const docx = runtime.resolve('docx');
const xlsx = runtime.resolve('xlsx');
const pptx = runtime.resolve('pptx');

const GARBAGE = new Uint8Array([0xff, 0xfe, 0xfd, 0xfc, 0x00, 0x01, 0x02]);
const EMPTY = new Uint8Array(0);
// A minimal ZIP with EOCD only — no parts inside.
const EMPTY_ZIP = (() => {
    const eocd = new Uint8Array(22);
    eocd.set([0x50, 0x4b, 0x05, 0x06], 0);
    return eocd;
})();

function expectThrows(fn) {
    let caught = null;
    try { fn(); } catch (e) { caught = e; }
    expect(caught).toBeInstanceOf(Error);
    return caught;
}

describe('fuzz — docx.read on bad input', () => {
    test('garbage bytes throw', () => { expectThrows(() => docx.read(GARBAGE)); });
    test('empty bytes throw', () => { expectThrows(() => docx.read(EMPTY)); });
    test('empty ZIP without document part throws', () => { expectThrows(() => docx.read(EMPTY_ZIP)); });
});

describe('fuzz — xlsx.read on bad input', () => {
    test('garbage bytes throw', () => { expectThrows(() => xlsx.read(GARBAGE)); });
    test('empty bytes throw', () => { expectThrows(() => xlsx.read(EMPTY)); });
    test('empty ZIP without workbook part throws', () => { expectThrows(() => xlsx.read(EMPTY_ZIP)); });
});

describe('fuzz — pptx.read on bad input', () => {
    test('garbage bytes throw', () => { expectThrows(() => pptx.read(GARBAGE)); });
    test('empty bytes throw', () => { expectThrows(() => pptx.read(EMPTY)); });
    test('empty ZIP without presentation part throws', () => { expectThrows(() => pptx.read(EMPTY_ZIP)); });
});

describe('fuzz — write with bad model', () => {
    test('docx.write(undefined) throws', () => { expectThrows(() => docx.write(undefined)); });
    test('xlsx.write(undefined) throws', () => { expectThrows(() => xlsx.write(undefined)); });
    test('pptx.write(undefined) throws', () => { expectThrows(() => pptx.write(undefined)); });
});

describe('fuzz — typed error class is reachable', () => {
    test('OoxmlError exported and instanceable', () => {
        expect(typeof OoxmlError).toBe('function');
        const e = new OoxmlError('test/code', 'msg');
        expect(e).toBeInstanceOf(Error);
        expect(e.code).toBe('test/code');
    });
});

describe('fuzz — XXE / billion-laughs (R2)', () => {
    // Documented policy : the underlying XML parser (`@awacloud/fw/io/codec/xml.js`)
    // SKIPS every `<!...>` declaration — DOCTYPE / internal subset / ENTITY
    // / NOTATION. No entity is expanded, no external resource fetched.
    // These tests pin the behavior as a regression fence.

    test('XML with DOCTYPE + ENTITY does not expand entities', () => {
        const xmlInstance = xml.factory();
        const src =
            '<?xml version="1.0"?>' +
            '<!DOCTYPE root [ <!ENTITY xxe "PWNED"> ]>' +
            '<root>&xxe;</root>';
        // Parser must either skip silently OR throw a typed error;
        // it MUST NOT expand `&xxe;` into `"PWNED"`.
        let parsed = null;
        try { parsed = xmlInstance.parse(src); } catch (e) { /* OK */ }
        if (parsed) {
            const serialized = xmlInstance.serialize(parsed);
            expect(serialized.includes('PWNED')).toBe(false);
        }
    });

    test('billion-laughs payload does not blow up parser', () => {
        const xmlInstance = xml.factory();
        const src =
            '<?xml version="1.0"?>' +
            '<!DOCTYPE lolz [' +
            '<!ENTITY lol "lol">' +
            '<!ENTITY lol1 "&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;">' +
            '<!ENTITY lol2 "&lol1;&lol1;&lol1;&lol1;&lol1;&lol1;&lol1;&lol1;&lol1;&lol1;">' +
            '<!ENTITY lol3 "&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;">' +
            ']>' +
            '<lolz>&lol3;</lolz>';
        const t0 = Date.now();
        let parsed = null;
        try { parsed = xmlInstance.parse(src); } catch (e) { /* OK */ }
        // Should return quickly (no exponential expansion).
        expect(Date.now() - t0).toBeLessThan(500);
        if (parsed) {
            const serialized = xmlInstance.serialize(parsed);
            // Reference kept as text or dropped — but never expanded.
            expect(serialized.length).toBeLessThan(10000);
        }
    });
});

describe('fuzz — ZIP-bomb guards (R1)', () => {
    // Verifies opc.read enforces the documented bounds. We don't craft
    // an actual bomb (expensive); the live boundary checks for
    // `maxParts`, `maxUncompressed` and `maxRatio` live in
    // src/opc/package.limits.test.js, alongside this surface-level smoke
    // test.
    test('opc surface exposes defaultLimits constant', async () => {
        const { opcPackage } = await import('../src/opc/package.js');
        // Module factory must declare DEFAULT_LIMITS through return value;
        // resolved here via the runtime so callers can inspect them.
        const opc = runtime.resolve('opcPackage');
        expect(opc.defaultLimits.maxParts).toBeGreaterThan(0);
        expect(opc.defaultLimits.maxUncompressed).toBeGreaterThan(0);
        expect(opc.defaultLimits.maxRatio).toBeGreaterThan(0);
    });
});
