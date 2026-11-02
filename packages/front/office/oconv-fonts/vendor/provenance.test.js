/**
 * Provenance ratification for the Liberation 2.1.5 font payload.
 *
 * The payload (`vendor/liberation/*.ttf` x12, `vendor/OFL.txt`,
 * `vendor/NOTICE-liberation`, `vendor/PROVENANCE.json`) was placed and
 * tracked by an owner act in BATCH_36. This suite turns that act into a
 * TESTED INVARIANT: it re-derives every sha256 and the total byte count
 * from the tracked bytes on disk, pins the TrueType flavour
 * (`subsetForPdf` rejects CFF — W0 leg D), and checks the PROVENANCE.json
 * record and the accompanying licence notices. It never re-downloads and
 * never modifies a font byte.
 *
 * Two-layer shape (mirrors packages/front/fw-wasm-crypto/vendor/provenance-trees.test.ts):
 *   1. FILE-SET + INTEGRITY + FLAVOUR — measured directly against the
 *      tracked bytes under vendor/liberation/.
 *   2. PROVENANCE-RECORD — read from vendor/PROVENANCE.json and checked
 *      against the same measured facts.
 *
 * Run: bun test packages/front/office/oconv-fonts/vendor/
 */

import { describe, it, expect } from 'bun:test';
import { existsSync, readFileSync, readdirSync, writeFileSync, mkdtempSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const VENDOR = join(import.meta.dir);
const LIBERATION = join(VENDOR, 'liberation');
const PROVENANCE_PATH = join(VENDOR, 'PROVENANCE.json');
const OFL_PATH = join(VENDOR, 'OFL.txt');
const NOTICE_PATH = join(VENDOR, 'NOTICE-liberation');

const EXPECTED_TOTAL_BYTES = 4359164;

/** @param {string} path @returns {string} */
function sha256File(path) {
    return createHash('sha256').update(readFileSync(path)).digest('hex');
}

const EXPECTED_NAMES = [
    'LiberationSans-Regular.ttf',
    'LiberationSans-Bold.ttf',
    'LiberationSans-Italic.ttf',
    'LiberationSans-BoldItalic.ttf',
    'LiberationSerif-Regular.ttf',
    'LiberationSerif-Bold.ttf',
    'LiberationSerif-Italic.ttf',
    'LiberationSerif-BoldItalic.ttf',
    'LiberationMono-Regular.ttf',
    'LiberationMono-Bold.ttf',
    'LiberationMono-Italic.ttf',
    'LiberationMono-BoldItalic.ttf'
].sort();

// ---------------------------------------------------------------------------
// 1. FILE SET — exactly the 12 Liberation faces, no more, no fewer
// ---------------------------------------------------------------------------

describe('liberation — file set', () => {
    it('vendor/liberation/ contains exactly the 12 Liberation TrueType faces', () => {
        const present = readdirSync(LIBERATION).filter((f) => f.endsWith('.ttf')).sort();
        expect(present).toEqual(EXPECTED_NAMES);
    });
});

// ---------------------------------------------------------------------------
// 2. INTEGRITY — sha256 re-derived from tracked bytes + total byte count
// ---------------------------------------------------------------------------

describe('liberation — integrity', () => {
    const raw = JSON.parse(readFileSync(PROVENANCE_PATH, 'utf8'));
    const tree = raw.trees.find((/** @type {{id: string}} */ t) => t.id === 'liberation');
    const fileRecords = tree.files.filter((/** @type {{path: string}} */ f) => f.path.startsWith('liberation/'));

    it('PROVENANCE.json carries a per-file record for all 12 faces', () => {
        expect(fileRecords.length).toBe(12);
    });

    for (const name of EXPECTED_NAMES) {
        it(`${name} sha256 re-derived from tracked bytes matches PROVENANCE.json`, () => {
            const record = fileRecords.find((/** @type {{path: string}} */ f) => f.path === `liberation/${name}`);
            expect(record).toBeDefined();
            const measured = sha256File(join(LIBERATION, name));
            expect(measured).toBe(record.sha256);
        });
    }

    it('the 12 measured byte sizes sum to 4359164 (not "about 3 MB")', () => {
        let total = 0;
        for (const name of EXPECTED_NAMES) {
            total += readFileSync(join(LIBERATION, name)).length;
        }
        // Computed sum from this run, quoted in the task report: 4359164.
        expect(total).toBe(EXPECTED_TOTAL_BYTES);
        expect(tree.payloadBytes).toBe(EXPECTED_TOTAL_BYTES);
    });

    it('each face byte size matches its PROVENANCE.json record', () => {
        for (const record of fileRecords) {
            const measured = readFileSync(join(VENDOR, record.path)).length;
            expect(measured).toBe(record.bytes);
        }
    });
});

// ---------------------------------------------------------------------------
// 3. FLAVOUR — TrueType sfnt (00 01 00 00), never CFF/OpenType
// ---------------------------------------------------------------------------

describe('liberation — flavour', () => {
    for (const name of EXPECTED_NAMES) {
        it(`${name} first 4 bytes are the TrueType sfnt tag 00 01 00 00`, () => {
            const fd = readFileSync(join(LIBERATION, name));
            const first4 = fd.subarray(0, 4);
            expect(Array.from(first4)).toEqual([0x00, 0x01, 0x00, 0x00]);
        });
    }
});

// ---------------------------------------------------------------------------
// 4. PROVENANCE RECORD — license/ref/modifications pin (RFN clause, plan D3)
// ---------------------------------------------------------------------------

describe('PROVENANCE.json — liberation tree record', () => {
    const raw = JSON.parse(readFileSync(PROVENANCE_PATH, 'utf8'));
    const tree = raw.trees.find((/** @type {{id: string}} */ t) => t.id === 'liberation');

    it('trees[] has a "liberation" entry', () => {
        expect(tree).toBeDefined();
    });

    it('license is OFL-1.1', () => {
        expect(tree.license).toBe('OFL-1.1');
    });

    it('ref is 2.1.5', () => {
        expect(tree.ref).toBe('2.1.5');
    });

    it('upstream.modifications states none (RFN clause — a modified face cannot keep the name)', () => {
        expect(typeof tree.upstream.modifications).toBe('string');
        expect(tree.upstream.modifications).toMatch(/^none\b/i);
    });
});

// ---------------------------------------------------------------------------
// 5. NOTICES — OFL.txt and NOTICE-liberation present and non-empty
// ---------------------------------------------------------------------------

describe('liberation — licence notices', () => {
    it('vendor/OFL.txt exists and is non-empty', () => {
        expect(existsSync(OFL_PATH)).toBe(true);
        expect(readFileSync(OFL_PATH, 'utf8').length).toBeGreaterThan(0);
    });

    it('vendor/OFL.txt contains the SIL Open Font License 1.1 header', () => {
        const content = readFileSync(OFL_PATH, 'utf8');
        expect(content).toContain('SIL OPEN FONT LICENSE Version 1.1');
    });

    it('vendor/NOTICE-liberation exists and is non-empty', () => {
        expect(existsSync(NOTICE_PATH)).toBe(true);
        expect(readFileSync(NOTICE_PATH, 'utf8').length).toBeGreaterThan(0);
    });
});

// ---------------------------------------------------------------------------
// 6. FALSIFICATION — a flipped byte on a temp COPY must fail the hash check
// ---------------------------------------------------------------------------

describe('liberation — falsification (never touches a tracked file)', () => {
    it('flipping one byte of a temp copy makes the sha256 check fail', () => {
        const original = readFileSync(join(LIBERATION, 'LiberationSans-Regular.ttf'));
        const goodSha = sha256File(join(LIBERATION, 'LiberationSans-Regular.ttf'));

        const tamperedDir = mkdtempSync(join(tmpdir(), 'oconv-fonts-provenance-'));
        const tamperedPath = join(tamperedDir, 'LiberationSans-Regular.ttf');
        const tampered = Buffer.from(original);
        tampered[100] = tampered[100] ^ 0xff; // flip one byte, well inside the file
        writeFileSync(tamperedPath, tampered);

        const badSha = sha256File(tamperedPath);

        expect(badSha).not.toBe(goodSha);
        // Red assertion this falsification is meant to fail (kept as `.toBe`
        // to document the tripwire — do NOT weaken to `.not.toBe` above):
        expect(() => expect(badSha).toBe(goodSha)).toThrow();
    });
});

// ---------------------------------------------------------------------------
// 7. THE METRIC TWINS OF CALIBRI AND CAMBRIA — Carlito (OFL-1.1) and
//    Caladea (Apache-2.0): the same file-set, integrity, flavour, record and
//    notice checks, per tree, against the tracked bytes
// ---------------------------------------------------------------------------

const TWINS = [
    {
        id: 'carlito',
        family: 'Carlito',
        license: 'OFL-1.1',
        ref: '20130920',
        payloadBytes: 2766644,
        licenceFile: 'OFL-carlito.txt',
        licenceHeader: 'SIL OPEN FONT LICENSE Version 1.1',
        noticeFile: 'NOTICE-carlito',
        noticeNames: ['Carlito', 'tyPoland Lukasz Dziedzic', 'Reserved Font Name']
    },
    {
        id: 'caladea',
        family: 'Caladea',
        license: 'Apache-2.0',
        ref: '20130214',
        payloadBytes: 241544,
        licenceFile: 'LICENSE-apache-2.0.txt',
        licenceHeader: 'Apache License\n                           Version 2.0, January 2004',
        noticeFile: 'NOTICE-caladea',
        noticeNames: ['Caladea', 'Huerta Tipografia', 'Apache License, Version 2.0']
    }
];

const STYLES = ['Regular', 'Bold', 'Italic', 'BoldItalic'];

for (const twin of TWINS) {
    const dir = join(VENDOR, twin.id);
    const names = STYLES.map((s) => `${twin.family}-${s}.ttf`).sort();

    describe(`${twin.id} — file set, integrity, flavour`, () => {
        const raw = JSON.parse(readFileSync(PROVENANCE_PATH, 'utf8'));
        const tree = raw.trees.find((/** @type {{id: string}} */ t) => t.id === twin.id);

        it(`vendor/${twin.id}/ contains exactly the four ${twin.family} TrueType faces`, () => {
            expect(existsSync(dir)).toBe(true);
            expect(readdirSync(dir).sort()).toEqual(names);
        });

        it('PROVENANCE.json carries one record per face, whose sha256 and bytes are re-derived from the tracked bytes', () => {
            expect(tree).toBeDefined();
            const faces = tree.files.filter((/** @type {{path: string}} */ f) => f.path.endsWith('.ttf'));
            expect(faces.map((/** @type {{path: string}} */ f) => f.path).sort()).toEqual(names.map((n) => `${twin.id}/${n}`));
            for (const record of faces) {
                const bytes = readFileSync(join(VENDOR, record.path));
                expect(sha256File(join(VENDOR, record.path))).toBe(record.sha256);
                expect(bytes.length).toBe(record.bytes);
            }
        });

        it(`the four faces sum to ${twin.payloadBytes} bytes, the tree's payloadBytes`, () => {
            let total = 0;
            for (const name of names) total += readFileSync(join(dir, name)).length;
            expect(total).toBe(twin.payloadBytes);
            expect(tree.payloadBytes).toBe(twin.payloadBytes);
        });

        it('every face is a TrueType sfnt (00 01 00 00)', () => {
            for (const name of names) {
                expect(Array.from(readFileSync(join(dir, name)).subarray(0, 4))).toEqual([0x00, 0x01, 0x00, 0x00]);
            }
        });

        it(`the record: licence ${twin.license}, ref ${twin.ref}, unmodified, the licence and notice files listed with their sha256`, () => {
            expect(tree.license).toBe(twin.license);
            expect(tree.ref).toBe(twin.ref);
            expect(tree.upstream.modifications).toMatch(/^none\b/i);
            for (const file of [twin.licenceFile, twin.noticeFile]) {
                const record = tree.files.find((/** @type {{path: string}} */ f) => f.path === file);
                expect(record).toBeDefined();
                expect(sha256File(join(VENDOR, file))).toBe(record.sha256);
            }
        });
    });

    describe(`${twin.id} — licence notices`, () => {
        it(`vendor/${twin.licenceFile} holds the licence text`, () => {
            expect(readFileSync(join(VENDOR, twin.licenceFile), 'utf8')).toContain(twin.licenceHeader);
        });

        it(`vendor/${twin.noticeFile} names the holder, the font and the licence`, () => {
            const text = readFileSync(join(VENDOR, twin.noticeFile), 'utf8');
            for (const n of twin.noticeNames) expect(text).toContain(n);
        });
    });
}

describe('PROVENANCE.json — the three trees', () => {
    it('trees[] is liberation, carlito, caladea, in that order', () => {
        const raw = JSON.parse(readFileSync(PROVENANCE_PATH, 'utf8'));
        expect(raw.trees.map((/** @type {{id: string}} */ t) => t.id)).toEqual(['liberation', 'carlito', 'caladea']);
    });
});
