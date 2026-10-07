// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Red-first fixture for BL-1546 (office/BATCH_41 task 01):
 * a PDF whose text runs are drawn through a font resource `oconvPdfTextExtract`
 * cannot resolve converts fast but loses ALL its text — every run comes
 * back `text/font-unresolved` + `text/undecodable`.
 *
 * Measured 2026-09-22 on anssi-guide-selection_crypto-1.0.pdf: converts in
 * 105 ms but yields 4 438 `text/font-unresolved` + 4 438 `text/undecodable`
 * runs — the Markdown is unusable. The real document is never read here
 * (third-party, not committed — see `pdf/tests/_fixtures/real-shapes/
 * README.md`); this fixture reproduces the SHAPE, not the scale, and
 * asserts on the loss ledger's structure ("N runs in, N undecodable out"),
 * never on a string.
 *
 * Task 01 delivered NO fix; task 05 (same batch) delivered it — see the
 * legs at the end of this file, which pin the measured cause (an indirect
 * /ExtGState resource category) and the real document's before/after
 * counts. `oconv.toMd`'s public facade is exercised
 * end to end (not `extractPage` directly) because the measured failure is
 * a whole-document conversion result, not a unit of the reader.
 *
 * @module oconv/tests/pdf-text-quality.integration
 */

import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { fw_require, modules } from '../src/main.js';
import { getAnssiCorpus } from '../../pdf/tests/_helpers/anssi-corpus.js';

const FIXED_AT = '2026-07-20T00:00:00Z';

const runtime = new ModuleRuntime();
runtime.registerAll(fw_require);
runtime.registerAll(modules);
const oconv = runtime.resolve('oconv');
const pdfApi = runtime.resolve('pdf');
const obj = runtime.resolve('pdfParser').obj;

const CATALOG = 1, PAGES = 2, PAGE = 3, CONTENT = 4;

/**
 * A minimal single-page PDF whose content stream draws `runCount` separate
 * `Tj` runs through `/F1`, but whose `/Resources` carries NO `/Font`
 * sub-dict at all — `oconvPdfTextExtract.decoderFor` then finds no entry
 * for `/F1` and every run falls into the `curDecoder === null` branch.
 *
 * @param {string[]} runs one string per `Tj` show operator
 * @returns {Uint8Array}
 */
function buildUnresolvedFontDoc(runs) {
    const te = new TextEncoder();
    const body = 'BT /F1 12 Tf\n'
        + runs.map(s => `(${s}) Tj\n`).join('')
        + 'ET\n';
    const bytes = te.encode(body);
    const contentDict = obj.dict({ Length: obj.int(bytes.length) });
    const indirects = [
        { num: CATALOG, gen: 0, value: obj.dict({ Type: obj.name('Catalog'), Pages: obj.ref(PAGES, 0) }) },
        { num: PAGES, gen: 0, value: obj.dict({ Type: obj.name('Pages'), Kids: obj.array([obj.ref(PAGE, 0)]), Count: obj.int(1) }) },
        { num: PAGE, gen: 0, value: obj.dict({
            Type: obj.name('Page'), Parent: obj.ref(PAGES, 0),
            MediaBox: obj.array([obj.int(0), obj.int(0), obj.int(612), obj.int(792)]),
            Contents: obj.ref(CONTENT, 0),
            // Deliberately empty — no /Font sub-dict, so /F1 cannot resolve.
            Resources: obj.dict({})
        }) },
        { num: CONTENT, gen: 0, value: obj.stream(contentDict, bytes) }
    ];
    return pdfApi.write({ indirects, root: { num: CATALOG, gen: 0 }, version: '1.7' });
}

describe('oconv.toMd — BL-1546: unresolvable-font text runs are ALL lost', () => {
    test('red: N runs in, N text/font-unresolved losses out (and N/undecodable co-occurring)', async () => {
        const runs = ['Alpha', 'Beta', 'Gamma', 'Delta'];
        const bytes = buildUnresolvedFontDoc(runs);

        const result = await oconv.toMd({ name: 'unresolved-font.pdf', bytes, convertedAt: FIXED_AT });

        expect(result.lossy).toBe(true);

        // "N runs in, N undecodable out" — never a string assertion. Each
        // of the four Tj runs independently hits the curDecoder===null
        // branch (font-decoder.js caches by name, but the branch fires per
        // SHOW, not per Tf), so the ledger carries exactly one
        // `text/font-unresolved` entry per run.
        const fontUnresolved = result.losses.filter(l => l.code === 'text/font-unresolved');
        expect(fontUnresolved.length).toBe(runs.length);

        // No text item survives — the whole page is unusable prose, which
        // is the measured "Markdown is unusable" symptom at real-document
        // scale (4 438 / 4 438 on anssi-guide-selection_crypto-1.0.pdf).
        expect(result.markdown).not.toContain('Alpha');
        expect(result.markdown).not.toContain('Beta');
        expect(result.markdown).not.toContain('Gamma');
        expect(result.markdown).not.toContain('Delta');
    });

    test('non-vacuity: the SAME shape with a resolvable font records neither loss code', async () => {
        // Build the exact same doc but with a Font resource /F1 → the
        // fixture must NOT be accidentally red for an unrelated reason.
        const te = new TextEncoder();
        const uMap = new Map();
        for (let c = 0x20; c <= 0x7e; c++) uMap.set(c, String.fromCharCode(c));
        const cmapApi = runtime.resolve('cmapToUnicode');
        const toUni = cmapApi.buildToUnicode(uMap);
        const FONT = 10, TOUNI = 11;
        const body = 'BT /F1 12 Tf (Alpha) Tj ET\n';
        const bytes = te.encode(body);
        const contentDict = obj.dict({ Length: obj.int(bytes.length) });
        const indirects = [
            { num: CATALOG, gen: 0, value: obj.dict({ Type: obj.name('Catalog'), Pages: obj.ref(PAGES, 0) }) },
            { num: PAGES, gen: 0, value: obj.dict({ Type: obj.name('Pages'), Kids: obj.array([obj.ref(PAGE, 0)]), Count: obj.int(1) }) },
            { num: PAGE, gen: 0, value: obj.dict({
                Type: obj.name('Page'), Parent: obj.ref(PAGES, 0),
                MediaBox: obj.array([obj.int(0), obj.int(0), obj.int(612), obj.int(792)]),
                Contents: obj.ref(CONTENT, 0),
                Resources: obj.dict({ Font: obj.dict({ F1: obj.ref(FONT, 0) }) })
            }) },
            { num: CONTENT, gen: 0, value: obj.stream(contentDict, bytes) },
            { num: FONT, gen: 0, value: obj.dict({
                Type: obj.name('Font'), Subtype: obj.name('Type1'),
                BaseFont: obj.name('Helvetica'), ToUnicode: obj.ref(TOUNI, 0)
            }) },
            { num: TOUNI, gen: 0, value: obj.stream(obj.dict({ Length: obj.int(toUni.length) }), te.encode(toUni)) }
        ];
        const docBytes = pdfApi.write({ indirects, root: { num: CATALOG, gen: 0 }, version: '1.7' });

        const result = await oconv.toMd({ name: 'resolved-font.pdf', bytes: docBytes, convertedAt: FIXED_AT });
        expect(result.losses.map(l => l.code)).not.toContain('text/font-unresolved');
        expect(result.losses.map(l => l.code)).not.toContain('text/undecodable');
        expect(result.markdown).toContain('Alpha');
    });
});

// ---------------------------------------------------------------------------
// BATCH_41 task 05 — the fix. The fixture above (no /Font sub-dict at all)
// is the HONEST-LOSS boundary: a font that is genuinely absent must stay
// ledgered, so its assertions are unchanged and green. The measured CAUSE of
// the 4 438 / 4 438 on the real document was a different shape — every
// page's /Resources carried /ExtGState as an indirect reference, which
// `pdfResources.typeResources` rejected, dropping the page's whole resource
// map (fonts included). The legs below pin that shape and the real document.
// ---------------------------------------------------------------------------

describe('oconv.toMd — BL-1546 fix: an indirect resource category no longer hides the fonts', () => {
    test('measured shape (indirect /ExtGState, Type0 + ToUnicode) converts with neither loss code', async () => {
        const te = new TextEncoder();
        const cmapApi = runtime.resolve('cmapToUnicode');
        const toUni = cmapApi.buildToUnicode(new Map([[1, 'S'], [2, 'û'], [3, 'r']]));
        const RES = 20, GS = 21, FONT = 22, CID = 23, TOUNI = 24;
        const runs = ['<000100020003>', '<0003>'];
        const body = 'BT /F1 12 Tf\n' + runs.map(s => `${s} Tj\n`).join('') + 'ET\n';
        const bytes = te.encode(body);
        const indirects = [
            { num: CATALOG, gen: 0, value: obj.dict({ Type: obj.name('Catalog'), Pages: obj.ref(PAGES, 0) }) },
            { num: PAGES, gen: 0, value: obj.dict({ Type: obj.name('Pages'), Kids: obj.array([obj.ref(PAGE, 0)]), Count: obj.int(1) }) },
            { num: PAGE, gen: 0, value: obj.dict({
                Type: obj.name('Page'), Parent: obj.ref(PAGES, 0),
                MediaBox: obj.array([obj.int(0), obj.int(0), obj.int(612), obj.int(792)]),
                Contents: obj.ref(CONTENT, 0),
                Resources: obj.ref(RES, 0)
            }) },
            { num: CONTENT, gen: 0, value: obj.stream(obj.dict({ Length: obj.int(bytes.length) }), bytes) },
            { num: RES, gen: 0, value: obj.dict({
                Font: obj.dict({ F1: obj.ref(FONT, 0) }),
                ExtGState: obj.ref(GS, 0)
            }) },
            { num: GS, gen: 0, value: obj.dict({ GS1: obj.dict({ Type: obj.name('ExtGState') }) }) },
            { num: FONT, gen: 0, value: obj.dict({
                Type: obj.name('Font'), Subtype: obj.name('Type0'),
                BaseFont: obj.name('ABCDEF+Sub-Identity-H'), Encoding: obj.name('Identity-H'),
                DescendantFonts: obj.array([obj.ref(CID, 0)]), ToUnicode: obj.ref(TOUNI, 0)
            }) },
            { num: CID, gen: 0, value: obj.dict({
                Type: obj.name('Font'), Subtype: obj.name('CIDFontType0'), BaseFont: obj.name('ABCDEF+Sub'),
                CIDSystemInfo: obj.dict({
                    Registry: obj.string(te.encode('Adobe')), Ordering: obj.string(te.encode('Identity')),
                    Supplement: obj.int(0)
                })
            }) },
            { num: TOUNI, gen: 0, value: obj.stream(obj.dict({ Length: obj.int(toUni.length) }), te.encode(toUni)) }
        ];
        const docBytes = pdfApi.write({ indirects, root: { num: CATALOG, gen: 0 }, version: '1.7' });

        const result = await oconv.toMd({ name: 'indirect-extgstate.pdf', bytes: docBytes, convertedAt: FIXED_AT });
        const codes = result.losses.map(l => l.code);
        expect(codes).not.toContain('text/font-unresolved');
        expect(codes).not.toContain('text/undecodable');
        expect(result.markdown).toContain('Sûr');
    });
});

describe('oconv.toMd — BL-1546 opt-in real document (references/ANSSI/)', () => {
    const corpus = getAnssiCorpus();

    // Measured 2026-09-23 on top of task 04 (/DecodeParms marshalling):
    // BEFORE the fix 4 438 text/font-unresolved + 4 438 text/undecodable
    // (unchanged by task 04); AFTER 0 + 60. The 60 are honest losses — codes
    // of six embedded Computer Modern Type1 math fonts (CMSY10, CMMI10,
    // CMR10, CMSY8, CMSY5, CMMI8) that neither the font's ToUnicode nor its
    // /Encoding maps to Unicode.
    test.skipIf(!corpus.present)(
        'anssi-guide-selection_crypto-1.0.pdf: font-unresolved 4438 → 0, undecodable 4438 → 60, readable French',
        async () => {
            const bytes = new Uint8Array(readFileSync(corpus.docs.selectionCrypto));
            const result = await oconv.toMd({ name: 'anssi-guide-selection_crypto-1.0.pdf', bytes, convertedAt: FIXED_AT });
            const count = (code) => result.losses.filter(l => l.code === code).length;
            expect(count('text/font-unresolved')).toBe(0);
            expect(count('text/undecodable')).toBe(60);
            // Spot check: readable French prose from the licence notice.
            expect(result.markdown).toContain('Il est par conséquent');
            expect(result.markdown).toContain('GUIDE DE SÉLECTION');
        }
    );
});
