// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * `loadPackagedPdfFonts`: the Liberation faces of the optional package
 * `@awacloud/oconv-fonts` under the five class names, and the missing-package
 * path through the `importer` seam (the workspace link is never removed).
 */

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { MISSING_FACES_MESSAGE, PDF_FONT_CLASSES, loadPackagedPdfFonts } from './pdf-fonts.ts';

const VENDOR = join(import.meta.dir, '..', '..', '..', 'packages', 'front', 'office', 'oconv-fonts', 'vendor', 'liberation');
const FILES: Record<string, string> = {
    regular: 'LiberationSans-Regular.ttf',
    bold: 'LiberationSans-Bold.ttf',
    italic: 'LiberationSans-Italic.ttf',
    boldItalic: 'LiberationSans-BoldItalic.ttf',
    mono: 'LiberationMono-Regular.ttf',
};

describe('loadPackagedPdfFonts', () => {
    test('with the package linked: five non-empty faces, byte-equal to the vendored files', async () => {
        const r = await loadPackagedPdfFonts();
        if (r.error !== null) throw new Error(r.error);
        expect(Object.keys(r.fonts).sort()).toEqual([...PDF_FONT_CLASSES].sort());
        for (const cls of PDF_FONT_CLASSES) {
            const face = r.fonts[cls]!;
            expect(face).toBeInstanceOf(Uint8Array);
            expect(face.length).toBeGreaterThan(0);
            expect(Buffer.from(face).equals(readFileSync(join(VENDOR, FILES[cls]!)))).toBe(true);
        }
    });

    test('a module-not-found failure is the exact usage error naming the faces and the install command', async () => {
        const importer = async () => {
            throw Object.assign(new Error("Cannot find package '@awacloud/oconv-fonts'"), { code: 'ERR_MODULE_NOT_FOUND' });
        };
        const r = await loadPackagedPdfFonts({ importer });
        expect(r).toEqual({ error: MISSING_FACES_MESSAGE, usage: true });
        expect(MISSING_FACES_MESSAGE).toBe(
            'no embeddable face: regular.ttf, bold.ttf, italic.ttf, boldItalic.ttf and mono.ttf are needed. '
            + 'Install the optional package (npm i @awacloud/oconv-fonts) for the Liberation faces, '
            + 'or pass --pdf-fonts <dir> (pdfFonts) with your own.',
        );
    });

    test('any other failure is not reported as a missing package', async () => {
        const importer = async () => { throw new Error('disk on fire'); };
        const r = await loadPackagedPdfFonts({ importer });
        expect(r.error).not.toBeNull();
        expect(r.error).not.toBe(MISSING_FACES_MESSAGE);
        expect(r.error).toContain('disk on fire');
        const failing = {
            loadDefaultFaces: async () => { throw new Error('face unreadable'); },
        };
        const r2 = await loadPackagedPdfFonts({ importer: async () => failing });
        expect(r2.error).toContain('face unreadable');
    });
});
