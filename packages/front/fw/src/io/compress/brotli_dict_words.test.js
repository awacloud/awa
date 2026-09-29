// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { describe, test, expect } from 'bun:test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { brotliDictWords } from './brotli_dict_words.js';
import { brotliDict } from './brotli_dict.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BIN_PATH = path.join(__dirname, 'brotli_dict.bin');

// Read the .bin once for the whole test file (immutable input).
const BIN_BYTES = new Uint8Array(fs.readFileSync(BIN_PATH));

describe('brotliDictWords module', () => {

    test('has correct module metadata', () => {
        expect(brotliDictWords.name).toBe('brotliDictWords');
        expect(brotliDictWords.version).toBe('2.0.0');
        expect(brotliDictWords.type).toBe('fw.io.compress');
        expect(brotliDictWords.dependencies).toEqual([]);
        expect(typeof brotliDictWords.factory).toBe('function');
    });

    describe('factory', () => {
        test('returns expected API shape with blob unloaded', () => {
            const w = brotliDictWords.factory();
            expect(w.blob).toBeNull();
            expect(w.isLoaded).toBe(false);
            expect(w.EXPECTED_SIZE).toBe(122784);
            expect(w.EXPECTED_CRC32).toBe(0x5136CB04);
            expect(typeof w.setBlob).toBe('function');
            expect(typeof w.load).toBe('function');
        });

        test('factory is self-contained (constants declared inside body)', () => {
            // Worker-serialisable rule: factory.toString() must reference
            // size, CRC and helpers from inside its own body - no closure
            // on outer-scope module-level identifiers.
            const src = brotliDictWords.factory.toString();
            expect(src.includes('EXPECTED_SIZE')).toBe(true);
            expect(src.includes('EXPECTED_CRC32')).toBe(true);
            expect(src.includes('_crc32')).toBe(true);
            expect(src.includes('_validate')).toBe(true);
        });

        test('factory.toString() does NOT contain the blob bytes (lazy-loaded)', () => {
            // Critical: the binary must live in brotli_dict.bin, NOT inlined
            // in the JS. Sanity-check the factory body stays small.
            const src = brotliDictWords.factory.toString();
            expect(src.length).toBeLessThan(5000);
        });
    });

    describe('setBlob', () => {
        test('rejects non-Uint8Array', () => {
            const w = brotliDictWords.factory();
            expect(() => w.setBlob('nope')).toThrow();
            expect(() => w.setBlob(new ArrayBuffer(122784))).toThrow();
        });

        test('rejects wrong size', () => {
            const w = brotliDictWords.factory();
            expect(() => w.setBlob(new Uint8Array(100))).toThrow();
            expect(() => w.setBlob(new Uint8Array(122785))).toThrow();
        });

        test('rejects correct-size blob with wrong CRC', () => {
            const w = brotliDictWords.factory();
            const garbage = new Uint8Array(122784);
            garbage.fill(0x42);
            try { w.setBlob(garbage); }
            catch (e) { expect(e.message).toMatch(/CRC32 mismatch/); return; }
            throw new Error('expected throw');
        });

        test('accepts the vendored blob and flips isLoaded', () => {
            const w = brotliDictWords.factory();
            w.setBlob(BIN_BYTES);
            expect(w.isLoaded).toBe(true);
            expect(w.blob).toBe(BIN_BYTES);
            expect(w.blob.length).toBe(122784);
        });

        test('first 4-letter word is "time" (canonical content check)', () => {
            const w = brotliDictWords.factory();
            w.setBlob(BIN_BYTES);
            expect(new TextDecoder().decode(w.blob.subarray(0, 4))).toBe('time');
        });

        test('first 5-letter word is "first" (canonical content check)', () => {
            const w = brotliDictWords.factory();
            w.setBlob(BIN_BYTES);
            // DOFFSET[5] = 4 * NWORDS[4] = 4096
            expect(new TextDecoder().decode(w.blob.subarray(4096, 4096 + 5))).toBe('first');
        });
    });

    describe('load', () => {
        test('throws when url is missing and blob not yet loaded', async () => {
            const w = brotliDictWords.factory();
            try { await w.load(); }
            catch (e) { expect(e.message).toMatch(/url required/); return; }
            throw new Error('expected throw');
        });

        test('fetches via injected fetch and loads the blob', async () => {
            const w = brotliDictWords.factory();
            // Stub fetch to feed the local .bin bytes - exercises the
            // load() path without an HTTP server.
            const originalFetch = globalThis.fetch;
            globalThis.fetch = async () => ({
                ok: true,
                arrayBuffer: async () => BIN_BYTES.buffer.slice(
                    BIN_BYTES.byteOffset,
                    BIN_BYTES.byteOffset + BIN_BYTES.byteLength
                ),
            });
            try {
                await w.load('/whatever');
                expect(w.isLoaded).toBe(true);
                expect(w.blob.length).toBe(122784);
                expect(new TextDecoder().decode(w.blob.subarray(0, 4))).toBe('time');
            } finally {
                globalThis.fetch = originalFetch;
            }
        });

        test('throws on HTTP error', async () => {
            const w = brotliDictWords.factory();
            const originalFetch = globalThis.fetch;
            globalThis.fetch = async () => ({ ok: false, status: 404 });
            try {
                try { await w.load('/missing'); }
                catch (e) { expect(e.message).toMatch(/HTTP 404/); return; }
                throw new Error('expected throw');
            } finally {
                globalThis.fetch = originalFetch;
            }
        });

        test('idempotent: returns cached blob when already loaded', async () => {
            const w = brotliDictWords.factory();
            w.setBlob(BIN_BYTES);
            let fetchCalled = false;
            const originalFetch = globalThis.fetch;
            globalThis.fetch = async () => { fetchCalled = true; throw new Error('should not be called'); };
            try {
                const r = await w.load('/anywhere');
                expect(r).toBe(BIN_BYTES);
                expect(fetchCalled).toBe(false);
            } finally {
                globalThis.fetch = originalFetch;
            }
        });
    });

    describe('integration with brotliDict.setWords', () => {
        test('vendored blob wires into brotliDict and decodes canonical words', () => {
            const w = brotliDictWords.factory();
            w.setBlob(BIN_BYTES);

            const dict = brotliDict.factory();
            dict.setWords(w.blob);

            expect(dict.hasWords()).toBe(true);
            expect(new TextDecoder().decode(dict.lookupWord(4, 0))).toBe('time');
            expect(new TextDecoder().decode(dict.lookupWord(5, 0))).toBe('first');
        });
    });
});
