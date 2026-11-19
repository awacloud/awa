// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview `opts.pdf.pdfA` — md → pdf and docx → pdf claiming PDF/A-4
 * or PDF/A-2b: the document is built with `pdfBuilder`'s `pdfA` (XMP,
 * output intent, the profile's version) and every font embedded, which
 * needs a face for every style class drawn (the registered default faces
 * here, `@awacloud/oconv-fonts` by relative path as the other default-face
 * tests read it); without faces the request is refused before writing.
 */
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { fw_require, modules } from '../src/main.js';
import { registerDefaultFaces } from '../../oconv-fonts/src/main.js';

const latin1 = new TextDecoder('latin1');
const MD = '# PDF/A\n\nSome *emphasis*, **strong** text and `code`.\n\n- one\n- two\n';

async function oconvWith(faces) {
    const rt = new ModuleRuntime();
    rt.registerAll(fw_require);
    if (faces) await registerDefaultFaces(rt);
    rt.registerAll(modules);
    return rt.resolve('oconv');
}

/** What a PDF/A claim leaves in the bytes: header, XMP pdfaid, output intent, font programs. */
function claimOf(bytes) {
    const text = latin1.decode(bytes);
    return {
        header: text.slice(0, 8),
        part: (text.match(/<pdfaid:part>(\d)<\/pdfaid:part>/) || [])[1],
        intent: text.includes('/S /GTS_PDFA1'),
        fonts: (text.match(/\/Type \/Font\b/g) || []).length,
        programs: (text.match(/\/FontFile2\b/g) || []).length,
        standard14: /\/BaseFont \/(Helvetica|Times|Courier)/.test(text)
    };
}

describe('oconv opts.pdf.pdfA', () => {
    test('fromMd claims PDF/A-4 or PDF/A-2b with every font embedded', async () => {
        const oconv = await oconvWith(true);
        for (const [pdfA, header, part] of [['4', '%PDF-2.0', '4'], ['2b', '%PDF-1.7', '2']]) {
            const { bytes } = await oconv.fromMd({ markdown: MD, target: 'pdf', opts: { pdf: { pdfA } } });
            const c = claimOf(bytes);
            expect([c.header, c.part, c.intent, c.standard14]).toEqual([header, part, true, false]);
            expect(c.programs).toBeGreaterThan(0);
        }
    });

    test('convert docx -> pdf claims the profile too', async () => {
        const oconv = await oconvWith(true);
        const bytes = new Uint8Array(readFileSync(new URL('./_fixtures/corpus/docx/docx-smoke.docx', import.meta.url)));
        const out = await oconv.convert({ name: 'x.docx', bytes, target: 'pdf', opts: { pdf: { pdfA: '4' } } });
        const c = claimOf(out.bytes);
        expect([c.header, c.part, c.intent, c.standard14]).toEqual(['%PDF-2.0', '4', true, false]);
    });

    test('without embedded faces the request is refused before writing', async () => {
        const oconv = await oconvWith(false);
        await expect(oconv.fromMd({ markdown: MD, target: 'pdf', opts: { pdf: { pdfA: '4' } } }))
            .rejects.toThrow(/^oconv: pdf\/A needs embedded faces \(regular/);
        const plain = await oconv.fromMd({ markdown: MD, target: 'pdf' });
        expect(claimOf(plain.bytes).standard14).toBe(true);
    });

    test('another pdfA value is a bad pdf option', async () => {
        const oconv = await oconvWith(true);
        for (const bad of ['1b', 4, true]) {
            await expect(oconv.fromMd({ markdown: MD, target: 'pdf', opts: { pdf: { pdfA: bad } } }))
                .rejects.toThrow('oconv: bad pdf option pdfA');
        }
    });
});
