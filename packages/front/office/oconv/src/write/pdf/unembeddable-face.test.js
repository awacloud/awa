// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * A caller face the pdf writer cannot embed — a CFF OpenType face, which
 * `fonts` `subsetForPdf` refuses — falls back to its Standard 14 face with
 * `layout/font-fallback` (its reason in the detail) instead of making the
 * conversion throw. The faces are the fonts package's vendored OFL test
 * faces (`tests/_fixtures/ofl-faces`, read-only).
 */
import { describe, test, expect, beforeAll } from 'bun:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { fw_require, modules } from '../../main.js';

const OFL = fileURLToPath(new URL('../../../../fonts/tests/_fixtures/ofl-faces/vendor/', import.meta.url));
const CFF = new Uint8Array(readFileSync(`${OFL}source-sans/SourceSans3-Regular.otf`));
const TTF = new Uint8Array(readFileSync(`${OFL}kalnia-glaze/KalniaGlaze[wdth,wght].ttf`));
const MD = '# Title\n\nSome **bold** text.';
const REASON = { style: 'regular', baseFont: 'Helvetica', reason: 'no TrueType outlines' };

let oconvApi;
let docxApi;

beforeAll(() => {
    const rt = new ModuleRuntime();
    rt.registerAll(fw_require);
    rt.registerAll(modules);
    oconvApi = rt.resolve('oconv');
    docxApi = rt.resolve('docx');
});

const latin1 = (bytes) => new TextDecoder('latin1').decode(bytes);

describe('a caller face with no TrueType outlines', () => {
    test('as a default face: no throw, the Standard 14 face, the loss with its reason', async () => {
        const r = await oconvApi.fromMd({ markdown: MD, target: 'pdf', defaultFaces: { regular: CFF } });
        expect(r.losses.filter((l) => l.code === 'layout/font-fallback')).toEqual([{ code: 'layout/font-fallback', detail: REASON }]);
        expect(latin1(r.bytes)).toContain('/BaseFont /Helvetica');
        expect(latin1(r.bytes)).not.toContain('/FontFile3');
    });

    test('as an explicit face: the same', async () => {
        const r = await oconvApi.fromMd({ markdown: MD, target: 'pdf', opts: { pdf: { fonts: { regular: CFF } } } });
        expect(r.losses.filter((l) => l.code === 'layout/font-fallback')).toEqual([{ code: 'layout/font-fallback', detail: REASON }]);
    });

    test('beside an embeddable face: the TrueType one embedded, the CFF one falling back', async () => {
        const r = await oconvApi.fromMd({ markdown: MD, target: 'pdf', opts: { pdf: { fonts: { regular: CFF, bold: TTF } } } });
        const fallbacks = r.losses.filter((l) => l.code === 'layout/font-fallback').map((l) => l.detail);
        expect(fallbacks).toContainEqual(REASON);
        expect(fallbacks.some((d) => d.style === 'bold')).toBe(false);
        expect(latin1(r.bytes)).toContain('/FontFile2');
        // The classes left to Standard 14 without a face asked keep the old detail.
        expect(fallbacks.filter((d) => d.style !== 'regular').every((d) => d.reason === undefined)).toBe(true);
    });

    test('convert docx -> pdf alike', async () => {
        const bytes = docxApi.write({ body: [docxApi.paragraph('Hello from docx.')] });
        const r = await oconvApi.convert({ bytes, format: 'docx', target: 'pdf', defaultFaces: { regular: CFF } });
        expect(r.losses.filter((l) => l.code === 'layout/font-fallback')).toEqual([{ code: 'layout/font-fallback', detail: REASON }]);
    });
});
