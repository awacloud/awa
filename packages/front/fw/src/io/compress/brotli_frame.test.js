// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { describe, test, expect } from 'bun:test';
import { brotliFrame } from './brotli_frame.js';

describe('brotliFrame module', () => {
    test('has correct module metadata', () => {
        expect(brotliFrame.name).toBe('brotliFrame');
        expect(brotliFrame.version).toBe('1.1.0');
        expect(brotliFrame.type).toBe('fw.io.compress');
        expect(brotliFrame.dependencies).toEqual([]);
        expect(typeof brotliFrame.factory).toBe('function');
    });

    describe('parse', () => {
        const f = brotliFrame.factory();

        test('rejects buffer shorter than the header', () => {
            try { f.parse(new Uint8Array([0x91, 0x0a])); }
            catch (e) { expect(e.code).toBe('EBADSTREAM'); return; }
            throw new Error('expected throw');
        });

        test('rejects invalid signature', () => {
            try { f.parse(new Uint8Array([0xFF, 0xFF, 0xFF, 0xFF, 0x00])); }
            catch (e) { expect(e.code).toBe('EBADSTREAM'); return; }
            throw new Error('expected throw');
        });

        test('rejects unsupported version (flags bits 0-1 != 0)', () => {
            try { f.parse(new Uint8Array([0x91, 0x0a, 0x42, 0x52, 0x01])); }
            catch (e) { expect(e.code).toBe('EBADSTREAM'); return; }
            throw new Error('expected throw');
        });

        test('rejects reserved flag bits', () => {
            try { f.parse(new Uint8Array([0x91, 0x0a, 0x42, 0x52, 0x10])); }
            catch (e) { expect(e.code).toBe('EBADSTREAM'); return; }
            throw new Error('expected throw');
        });

        test('parses empty container (signature + flags, no chunks)', () => {
            // flags = 0 → no final footer, no metadata, single-resource container
            const buf = new Uint8Array([0x91, 0x0a, 0x42, 0x52, 0x00]);
            const out = f.parse(buf);
            expect(out.flags).toBe(0);
            expect(out.hasFinalFooter).toBe(false);
            expect(out.chunks).toEqual([]);
            expect(out.finalFooter).toBeNull();
        });

        test('parses a padding chunk (varint=0)', () => {
            // signature + flags=0 + varint=0 (single-byte padding chunk of length 1)
            const buf = new Uint8Array([0x91, 0x0a, 0x42, 0x52, 0x00, 0x00]);
            const out = f.parse(buf);
            expect(out.chunks.length).toBe(1);
            expect(out.chunks[0].type).toBe(0);
            expect(out.chunks[0].typeName).toBe('padding');
        });

        test('parses a longer padding chunk', () => {
            // varint=3 → 3 bytes follow. First is chunk type (must be 0), then 2 zero bytes.
            const buf = new Uint8Array([0x91, 0x0a, 0x42, 0x52, 0x00, 0x03, 0x00, 0x00, 0x00]);
            const out = f.parse(buf);
            expect(out.chunks.length).toBe(1);
            expect(out.chunks[0].type).toBe(0);
        });

        test('rejects padding chunk with non-zero content', () => {
            const buf = new Uint8Array([0x91, 0x0a, 0x42, 0x52, 0x00, 0x03, 0x00, 0xFF, 0x00]);
            try { f.parse(buf); }
            catch (e) { expect(e.code).toBe('EBADSTREAM'); expect(e.message).toMatch(/padding/); return; }
            throw new Error('expected throw');
        });

        test('parses a data chunk with uncompressed codec', () => {
            // signature + flags=4 (hasFinalFooter - but we omit it; should fail)
            // Use flags=0 (single-resource) and a data chunk:
            //   varint length, chunk type=2 (data), codec=0 (uncompressed), flags=0, content
            // length = type(1) + codec(1) + flags(1) + content(N)
            const content = new Uint8Array([0x41, 0x42, 0x43]);
            const chunkBytes = [0x02, 0x00, 0x00, ...content];   // type, codec=uncompressed, dataChunkFlags=0
            const chunkLen = chunkBytes.length;
            const buf = new Uint8Array([0x91, 0x0a, 0x42, 0x52, 0x00, chunkLen, ...chunkBytes]);
            const out = f.parse(buf);
            expect(out.chunks.length).toBe(1);
            expect(out.chunks[0].type).toBe(2);
            expect(out.chunks[0].typeName).toBe('data');
            expect(out.chunks[0].codec).toBe(0);
            expect(out.chunks[0].codecName).toBe('uncompressed');
        });

        test('parses a data chunk with brotli codec + uncompressed size varint', () => {
            // Data chunk: type=2, codec=2 (brotli), uncompressedSize=10, flags=0, payload (3 bytes)
            const chunkBytes = [0x02, 0x02, 0x0A, 0x00, 0xDE, 0xAD, 0xBE];
            const buf = new Uint8Array([0x91, 0x0a, 0x42, 0x52, 0x00, chunkBytes.length, ...chunkBytes]);
            const out = f.parse(buf);
            expect(out.chunks[0].codec).toBe(2);
            expect(out.chunks[0].codecName).toBe('brotli');
            expect(out.chunks[0].uncompressedSize).toBe(10);
            expect(out.chunks[0].payload.length).toBe(3);
        });

        test('parses a final-footer chunk when flags indicate it', () => {
            // flags=0x04 → hasFinalFooter required. Add a type-10 chunk with some content.
            const footerContent = new Uint8Array([0x12, 0x34]);
            const chunkBytes = [0x0A, ...footerContent];   // type=10 (final-footer)
            const buf = new Uint8Array([0x91, 0x0a, 0x42, 0x52, 0x04, chunkBytes.length, ...chunkBytes]);
            const out = f.parse(buf);
            expect(out.hasFinalFooter).toBe(true);
            expect(out.chunks.length).toBe(1);
            expect(out.chunks[0].type).toBe(10);
            expect(out.finalFooter).toBeInstanceOf(Uint8Array);
            expect(Array.from(out.finalFooter)).toEqual([0x12, 0x34]);
        });

        test('rejects when flags require final footer but it is missing', () => {
            const buf = new Uint8Array([0x91, 0x0a, 0x42, 0x52, 0x04]);
            try { f.parse(buf); }
            catch (e) { expect(e.code).toBe('EBADSTREAM'); expect(e.message).toMatch(/final footer/); return; }
            throw new Error('expected throw');
        });

        test('parses a partial-data sequence (types 3 → 4 → 5)', () => {
            // Each partial-data chunk has: type(1) + codec(1) + uSize(varint) + flags(1) + payload.
            const c1 = [0x03, 0x02, 0x10, 0x00, 0xAA, 0xBB];   // first-partial brotli, uSize=16, flags=0, payload=AA BB
            const c2 = [0x04, 0x01, 0x08, 0x00, 0xCC, 0xDD];   // middle-partial keep-decoder, uSize=8, flags=0, payload=CC DD
            const c3 = [0x05, 0x01, 0x00, 0x00, 0xEE, 0xFF];   // last-partial keep-decoder, uSize=0, flags=0, payload=EE FF
            const bytes = [];
            for (const c of [c1, c2, c3]) {
                bytes.push(c.length);
                for (const b of c) bytes.push(b);
            }
            const buf = new Uint8Array([0x91, 0x0a, 0x42, 0x52, 0x04, ...bytes,
                                         /* required final footer */ 1, 0x0A]);
            const out = f.parse(buf);
            expect(out.chunks.length).toBe(4);
            expect(out.chunks[0].typeName).toBe('first-partial-data');
            expect(out.chunks[1].typeName).toBe('middle-partial-data');
            expect(out.chunks[2].typeName).toBe('last-partial-data');
            expect(out.chunks[3].typeName).toBe('final-footer');
        });

        test('parses a central directory chunk (type 9)', () => {
            const cdContent = new Uint8Array([0x00, 0x01, 0x02]);
            const chunkBytes = [0x09, ...cdContent];
            const buf = new Uint8Array([0x91, 0x0a, 0x42, 0x52, 0x04, chunkBytes.length, ...chunkBytes,
                                         1, 0x0A]);
            const out = f.parse(buf);
            expect(out.chunks.length).toBe(2);
            expect(out.chunks[0].type).toBe(9);
            expect(out.chunks[0].codec).toBe(-1);  // CD has no codec field
            expect(out.chunks[1].type).toBe(10);
        });

        test('rejects chunk length exceeding buffer', () => {
            // signature + flags=0 + varint length=10 but only 2 bytes follow
            const buf = new Uint8Array([0x91, 0x0a, 0x42, 0x52, 0x00, 0x0A, 0x02, 0x00]);
            try { f.parse(buf); }
            catch (e) { expect(e.code).toBe('EBADSTREAM'); return; }
            throw new Error('expected throw');
        });
    });

    describe('extractResources', () => {
        const f = brotliFrame.factory();

        test('returns one resource per data chunk', () => {
            const c1 = [0x02, 0x02, 0x05, 0x00, 0xAA];   // data: type=2, brotli, uncompressed=5, flags=0, payload AA
            const c2 = [0x02, 0x02, 0x06, 0x00, 0xBB];   // data: type=2, brotli, uncompressed=6, flags=0, payload BB
            const bytes = [];
            for (const c of [c1, c2]) { bytes.push(c.length); for (const b of c) bytes.push(b); }
            const buf = new Uint8Array([0x91, 0x0a, 0x42, 0x52, 0x04, ...bytes, 1, 0x0A]);
            const parsed = f.parse(buf);
            const res = f.extractResources(parsed);
            expect(res.length).toBe(2);
            expect(res[0].codecName).toBe('brotli');
            expect(Array.from(res[0].payload)).toEqual([0xAA]);
            expect(Array.from(res[1].payload)).toEqual([0xBB]);
        });

        test('concatenates partial data chunks into one resource', () => {
            const c1 = [0x03, 0x02, 0x10, 0x00, 0xAA, 0xBB];
            const c2 = [0x04, 0x01, 0x08, 0x00, 0xCC, 0xDD];
            const c3 = [0x05, 0x01, 0x00, 0x00, 0xEE, 0xFF];
            const bytes = [];
            for (const c of [c1, c2, c3]) { bytes.push(c.length); for (const b of c) bytes.push(b); }
            const buf = new Uint8Array([0x91, 0x0a, 0x42, 0x52, 0x04, ...bytes, 1, 0x0A]);
            const parsed = f.parse(buf);
            const res = f.extractResources(parsed);
            expect(res.length).toBe(1);
            expect(Array.from(res[0].payload)).toEqual([0xAA, 0xBB, 0xCC, 0xDD, 0xEE, 0xFF]);
        });

        test('rejects partial sequence missing the last-partial chunk', () => {
            const c1 = [0x03, 0x02, 0x10, 0x00, 0xAA];   // first-partial only (no last-partial)
            const buf = new Uint8Array([0x91, 0x0a, 0x42, 0x52, 0x04, c1.length, ...c1, 1, 0x0A]);
            const parsed = f.parse(buf);
            try { f.extractResources(parsed); }
            catch (e) { expect(e.code).toBe('EBADSTREAM'); expect(e.message).toMatch(/unterminated/); return; }
            throw new Error('expected throw');
        });
    });

    describe('parseMetadataFields', () => {
        const f = brotliFrame.factory();

        function encVarint(n) {
            const out = [];
            while (n >= 128) { out.push((n & 0x7F) | 0x80); n = Math.floor(n / 128); }
            out.push(n & 0x7F);
            return out;
        }

        test('parses an empty payload as zero fields', () => {
            const fields = f.parseMetadataFields(new Uint8Array(0));
            expect(fields).toEqual([]);
        });

        test('parses a single standard field "id"', () => {
            // "id" + varint(5) + "abcde"
            const payload = new Uint8Array([0x69, 0x64, 0x05, 0x61, 0x62, 0x63, 0x64, 0x65]);
            const fields = f.parseMetadataFields(payload);
            expect(fields).toHaveLength(1);
            expect(fields[0].name).toBe('id');
            expect(fields[0].kind).toBe('standard');
            expect(Array.from(fields[0].content)).toEqual([0x61, 0x62, 0x63, 0x64, 0x65]);
        });

        test('parses a custom uppercase field', () => {
            // "AP" + varint(2) + "ok"
            const payload = new Uint8Array([0x41, 0x50, 0x02, 0x6F, 0x6B]);
            const fields = f.parseMetadataFields(payload);
            expect(fields[0].name).toBe('AP');
            expect(fields[0].kind).toBe('custom');
            expect(Array.from(fields[0].content)).toEqual([0x6F, 0x6B]);
        });

        test('parses multiple fields back-to-back', () => {
            const payload = new Uint8Array([
                0x69, 0x64, 0x03, 0x66, 0x6F, 0x6F,        // "id" len=3 "foo"
                0x6D, 0x74, 0x0A,                          // "mt" len=10
                0x74, 0x65, 0x78, 0x74, 0x2F, 0x70, 0x6C, 0x61, 0x69, 0x6E, // "text/plain"
            ]);
            const fields = f.parseMetadataFields(payload);
            expect(fields).toHaveLength(2);
            expect(fields[0].name).toBe('id');
            expect(new TextDecoder().decode(fields[0].content)).toBe('foo');
            expect(fields[1].name).toBe('mt');
            expect(new TextDecoder().decode(fields[1].content)).toBe('text/plain');
        });

        test('handles varint-encoded length > 127', () => {
            const length = 300;
            const data = new Uint8Array(length).fill(0x41);
            const payload = new Uint8Array([0x69, 0x64, ...encVarint(length), ...data]);
            const fields = f.parseMetadataFields(payload);
            expect(fields[0].content.length).toBe(length);
        });

        test('rejects truncated name', () => {
            try { f.parseMetadataFields(new Uint8Array([0x69])); }
            catch (e) { expect(e.code).toBe('EBADSTREAM'); return; }
            throw new Error('expected throw');
        });

        test('rejects non-letter name bytes', () => {
            try { f.parseMetadataFields(new Uint8Array([0x30, 0x31, 0x00])); }
            catch (e) { expect(e.code).toBe('EBADSTREAM'); return; }
            throw new Error('expected throw');
        });

        test('rejects mixed-case name', () => {
            try { f.parseMetadataFields(new Uint8Array([0x69, 0x44, 0x00])); }
            catch (e) {
                expect(e.code).toBe('EBADSTREAM');
                expect(e.message).toMatch(/mixes cases/);
                return;
            }
            throw new Error('expected throw');
        });

        test('rejects content length exceeding payload', () => {
            // "id" + varint(100) + only 2 content bytes
            const payload = new Uint8Array([0x69, 0x64, 100, 0x61, 0x62]);
            try { f.parseMetadataFields(payload); }
            catch (e) { expect(e.code).toBe('EBADSTREAM'); return; }
            throw new Error('expected throw');
        });

        test('integrates with parse() on a hand-crafted metadata chunk', () => {
            // Container: signature + flags=0 + one metadata chunk (type 1)
            // containing the uncompressed "id"="x" field.
            // Chunk content = type byte (1) + CODEC byte (0 = uncompressed)
            //                + field bytes "id" + varint(1) + "x"
            const chunkBody = [0x01, 0x00, 0x69, 0x64, 0x01, 0x78];
            const container = new Uint8Array([
                0x91, 0x0a, 0x42, 0x52, 0x00,  // header
                chunkBody.length,              // chunk length varint (≤127 → 1 byte)
                ...chunkBody,
            ]);
            const parsed = f.parse(container);
            expect(parsed.chunks).toHaveLength(1);
            expect(parsed.chunks[0].typeName).toBe('metadata');
            expect(parsed.chunks[0].codecName).toBe('uncompressed');
            const fields = f.parseMetadataFields(parsed.chunks[0].payload);
            expect(fields[0].name).toBe('id');
            expect(new TextDecoder().decode(fields[0].content)).toBe('x');
        });
    });
});
