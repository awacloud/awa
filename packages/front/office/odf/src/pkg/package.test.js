// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { deflate } from '@awacloud/fw/io/compress/deflate.js';
import { bitstream } from '@awacloud/fw/io/compress/bitstream.js';
import { huffman } from '@awacloud/fw/io/compress/huffman.js';
import { lz77 } from '@awacloud/fw/io/compress/lz77.js';
import { crc32 } from '@awacloud/fw/io/calc/crc32.js';
import { zip } from '@awacloud/fw/io/compress/zip.js';
import { xml as fwXml } from '@awacloud/fw/io/codec/xml.js';
import { pkgMimetype } from './mimetype.js';
import { pkgManifest } from './manifest.js';
import { pkgPackage } from './package.js';
import { odfErrors } from '../errors.js';
import { odfShared } from '../_shared/index.js';

const runtime = new ModuleRuntime();
for (const m of [bitstream, huffman, lz77, deflate, crc32, zip,
                 fwXml, odfErrors, odfShared, pkgMimetype, pkgManifest, pkgPackage]) {
    runtime.register(m);
}
const zipMod = runtime.resolve('zip');
const mimetype = runtime.resolve('pkgMimetype');
const pkg = runtime.resolve('pkgPackage');
// Resolve error classes via the same runtime so `instanceof` matches
// the actual classes thrown by the resolved modules.
const { ParseError, ContractError } = runtime.resolve('odfErrors');

describe('pkgPackage module', () => {
    test('has the expected factory shape', () => {
        expect(pkgPackage.name).toBe('pkgPackage');
        expect(pkgPackage.dependencies).toEqual(['odfErrors', 'odfShared', 'zip', 'pkgMimetype', 'pkgManifest']);
        expect(typeof pkgPackage.factory).toBe('function');
    });

    describe('empty', () => {
        test('produces a package with mimetype + manifest root entry only', () => {
            const p = pkg.empty(mimetype.CT_ODT);
            expect(p.mimetype).toBe(mimetype.CT_ODT);
            expect(p.manifest.entries).toHaveLength(1);
            expect(p.manifest.entries[0].fullPath).toBe('/');
            expect(p.parts).toEqual({});
        });
    });

    describe('write + read roundtrip', () => {
        test('preserves mimetype + manifest + parts', () => {
            const p = pkg.empty(mimetype.CT_ODT);
            pkg.setPart(p, 'content.xml',
                new TextEncoder().encode('<x/>'), 'text/xml');
            pkg.setPart(p, 'styles.xml',
                new TextEncoder().encode('<y/>'), 'text/xml');
            const bytes = pkg.write(p);
            const back = pkg.read(bytes);
            expect(back.mimetype).toBe(mimetype.CT_ODT);
            expect(back.manifest.entries.length).toBe(3);
            expect(Object.keys(back.parts).sort()).toEqual(['content.xml', 'styles.xml']);
            expect(new TextDecoder().decode(back.parts['content.xml'])).toBe('<x/>');
        });

        test('mimetype is first ZIP entry and STORED', () => {
            const p = pkg.empty(mimetype.CT_ODS);
            const bytes = pkg.write(p);
            expect(bytes[0]).toBe(0x50);
            expect(bytes[1]).toBe(0x4B);
            expect(bytes[2]).toBe(0x03);
            expect(bytes[3]).toBe(0x04);
            // Compression method at offset 8: 0 = STORED
            expect(bytes[8]).toBe(0);
            expect(bytes[9]).toBe(0);
            // Filename "mimetype" appears at offset 30
            const fname = new TextDecoder().decode(bytes.subarray(30, 38));
            expect(fname).toBe('mimetype');
        });
    });

    describe('read errors', () => {
        test('garbage throws ParseError', () => {
            expect(() => pkg.read(new Uint8Array([0xff, 0xfe]))).toThrow(ParseError);
        });

        test('ZIP without mimetype throws', () => {
            const bytes = zipMod.zipSync({ 'other.txt': new Uint8Array([1, 2, 3]) });
            expect(() => pkg.read(bytes)).toThrow(/missing mimetype/);
        });

        test('ZIP with mimetype but no manifest throws', () => {
            const bytes = zipMod.zipSync({
                'mimetype': [mimetype.render(mimetype.CT_ODT), { level: 0 }],
                'content.xml': new TextEncoder().encode('<x/>')
            });
            expect(() => pkg.read(bytes)).toThrow(/manifest/);
        });
    });

    describe('setPart', () => {
        test('adds part bytes + manifest entry', () => {
            const p = pkg.empty(mimetype.CT_ODT);
            pkg.setPart(p, 'content.xml', new Uint8Array([1, 2]), 'text/xml');
            expect(p.parts['content.xml']).toEqual(new Uint8Array([1, 2]));
            expect(p.manifest.entries.find(e => e.fullPath === 'content.xml').mediaType)
                .toBe('text/xml');
        });
    });

    test('write throws ContractError on missing mimetype', () => {
        expect(() => pkg.write({ parts: {} })).toThrow(ContractError);
    });

    test('ParseError class is reachable (unused-import guard)', () => {
        expect(typeof ParseError).toBe('function');
    });
});

/** Capture the error thrown by `fn` (fails the test when nothing throws). */
function thrown(fn) {
    try { fn(); } catch (e) { return e; }
    throw new Error('expected a throw');
}

describe('pkgPackage ZIP bomb guards', () => {
    const enc = new TextEncoder();

    /** Package whose `Pictures/pad.bin` is 1 MiB of zeros (deflates far above 200:1). */
    function padPackage() {
        const p = pkg.empty(mimetype.CT_ODT);
        pkg.setPart(p, 'content.xml', enc.encode('<x/>'), 'text/xml');
        pkg.setPart(p, 'Pictures/pad.bin', new Uint8Array(1024 * 1024));
        return pkg.write(p);
    }

    /** Package with `n` one-byte parts `p-0000` … plus mimetype + manifest. */
    function manyPartsPackage(n) {
        const p = pkg.empty(mimetype.CT_ODT);
        for (let i = 0; i < n; i++) {
            pkg.setPart(p, 'p-' + String(i).padStart(4, '0'), new Uint8Array([i & 0xff]));
        }
        return pkg.write(p);
    }

    test('DEFAULT_LIMITS carries the odf values (4096 entries) and is frozen', () => {
        expect(pkg.DEFAULT_LIMITS).toEqual({ maxParts: 4096, maxUncompressed: 268435456, maxRatio: 200 });
        expect(pkg.DEFAULT_LIMITS.maxParts).toBe(4096);
        expect(Object.isFrozen(pkg.DEFAULT_LIMITS)).toBe(true);
    });

    describe('maxRatio', () => {
        test('the 1 MiB fixture measures a per-entry ratio above 200 (non-vacuity)', () => {
            const bytes = padPackage();
            let ratio = 0;
            zipMod.unzipSync(bytes, {
                filter(entry) {
                    if (entry.name === 'Pictures/pad.bin') ratio = entry.originalSize / entry.size;
                    return false;
                }
            });
            expect(ratio).toBeGreaterThan(200);
        });

        test('default cap throws a typed zip-bomb ParseError naming the entry', () => {
            const e = thrown(() => pkg.read(padPackage()));
            expect(e).toBeInstanceOf(ParseError);
            expect(e.code).toBe('odf/parse-error/zip-bomb');
            expect(e.context.limit).toBe('maxRatio');
            expect(e.context.name).toBe('Pictures/pad.bin');
            expect(e.context.ratio).toBeGreaterThan(200);
        });

        test('maxRatio: 0 disables the check and the part reads back byte-equal', () => {
            const back = pkg.read(padPackage(), { maxRatio: 0 });
            expect(back.parts['Pictures/pad.bin']).toEqual(new Uint8Array(1024 * 1024));
        });

        test('a raised maxRatio reads the package', () => {
            const back = pkg.read(padPackage(), { maxRatio: 5000 });
            expect(back.parts['Pictures/pad.bin'].length).toBe(1024 * 1024);
        });
    });

    describe('maxParts', () => {
        test('4096 entries read with the default cap', () => {
            const back = pkg.read(manyPartsPackage(4094));
            expect(Object.keys(back.parts).length).toBe(4094);
        });

        test('4097 entries breach the default cap', () => {
            const e = thrown(() => pkg.read(manyPartsPackage(4095)));
            expect(e).toBeInstanceOf(ParseError);
            expect(e.code).toBe('odf/parse-error/zip-bomb');
            expect(e.context.limit).toBe('maxParts');
            expect(e.context.max).toBe(4096);
            expect(e.context.actual).toBe(4097);
        });

        test('an explicit maxParts: 1024 trips on 1025 entries', () => {
            const e = thrown(() => pkg.read(manyPartsPackage(1023), { maxParts: 1024 }));
            expect(e.code).toBe('odf/parse-error/zip-bomb');
            expect(e.context.limit).toBe('maxParts');
            expect(e.context.max).toBe(1024);
            expect(e.context.actual).toBe(1025);
        });

        test('maxParts: 0 disables the check', () => {
            const back = pkg.read(manyPartsPackage(4095), { maxParts: 0 });
            expect(Object.keys(back.parts).length).toBe(4095);
        });

        test('maxParts: 2 on a 3-entry package throws', () => {
            const e = thrown(() => pkg.read(manyPartsPackage(1), { maxParts: 2 }));
            expect(e.code).toBe('odf/parse-error/zip-bomb');
            expect(e.context.limit).toBe('maxParts');
        });
    });

    describe('maxUncompressed', () => {
        function normalPackage() {
            const p = pkg.empty(mimetype.CT_ODT);
            pkg.setPart(p, 'content.xml', enc.encode('<office:document-content/>'), 'text/xml');
            return pkg.write(p);
        }

        test('a 64-byte total cap breaches on a normal package', () => {
            const e = thrown(() => pkg.read(normalPackage(), { maxUncompressed: 64 }));
            expect(e.code).toBe('odf/parse-error/zip-bomb');
            expect(e.context.limit).toBe('maxUncompressed');
            expect(e.context.actual).toBeGreaterThan(64);
        });

        test('maxUncompressed: 0 disables the check', () => {
            const back = pkg.read(normalPackage(), { maxUncompressed: 0 });
            expect(Object.keys(back.parts)).toEqual(['content.xml']);
        });
    });

    describe('error wrapping', () => {
        test('the bomb error is not re-wrapped as odf/parse-error/pkg', () => {
            const e = thrown(() => pkg.read(padPackage()));
            expect(e.code).not.toBe('odf/parse-error/pkg');
            expect(e.cause).toBeUndefined();
        });

        test('garbage bytes still give odf/parse-error/pkg with a cause', () => {
            const e = thrown(() => pkg.read(new Uint8Array([0xff, 0xfe])));
            expect(e).toBeInstanceOf(ParseError);
            expect(e.code).toBe('odf/parse-error/pkg');
            expect(e.cause).toBeDefined();
        });
    });

    describe('option validation', () => {
        for (const [label, opts] of [['maxRatio: -1', { maxRatio: -1 }],
                                     ["maxRatio: 'x'", { maxRatio: 'x' }],
                                     ['maxParts: NaN', { maxParts: NaN }]]) {
            test(`${label} → ContractError`, () => {
                const e = thrown(() => pkg.read(padPackage(), opts));
                expect(e).toBeInstanceOf(ContractError);
                expect(e.code).toBe('odf/contract-error/pkg');
            });
        }
    });
});
