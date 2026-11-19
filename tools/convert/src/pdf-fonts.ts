// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * tools/convert/src/pdf-fonts.ts — the faces a pdf target embeds, read from
 * a directory for the CLI's `--pdf-fonts` and the MCP server's `pdfFonts`
 * (kept out of `core.ts`, which reads no file).
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { CoreError, PdfFonts } from './core.ts';

/** The style classes `readPdfFonts` looks for, each as `<class>.ttf`. */
export const PDF_FONT_CLASSES = ['regular', 'bold', 'italic', 'boldItalic', 'mono'] as const;

/**
 * The faces of `dir`: each of `regular.ttf`, `bold.ttf`, `italic.ttf`,
 * `boldItalic.ttf`, `mono.ttf` present. None found, or `dir` unreadable, is
 * a usage error (`pdfFonts`).
 */
export function readPdfFonts(dir: string): CoreError | { error: null; fonts: PdfFonts } {
    const fonts: PdfFonts = {};
    for (const cls of PDF_FONT_CLASSES) {
        const file = join(dir, `${cls}.ttf`);
        if (existsSync(file)) fonts[cls] = new Uint8Array(readFileSync(file));
    }
    if (Object.keys(fonts).length === 0) {
        return { error: `pdfFonts: no face in ${dir} (expected ${PDF_FONT_CLASSES.map((c) => `${c}.ttf`).join(', ')})`, usage: true };
    }
    return { error: null, fonts };
}

/** The error of a pdf target that must embed fonts, given none, with the optional package absent. */
export const MISSING_FACES_MESSAGE =
    'no embeddable face: regular.ttf, bold.ttf, italic.ttf, boldItalic.ttf and mono.ttf are needed. '
    + 'Install the optional package (npm i @awacloud/oconv-fonts) for the Liberation faces, '
    + 'or pass --pdf-fonts <dir> (pdfFonts) with your own.';

/** What `loadPackagedPdfFonts` imports; the default is the real dynamic import (a test seam). */
export interface PackagedFontsOptions {
    importer?: () => Promise<{ loadDefaultFaces: () => Promise<Record<string, Uint8Array>> }>;
}

/** True for the failure of a dynamic import whose module is not installed. */
function isModuleNotFound(e: unknown): boolean {
    const code = (e as { code?: unknown } | null)?.code;
    if (code === 'ERR_MODULE_NOT_FOUND' || code === 'MODULE_NOT_FOUND') return true;
    // Deno words a bare specifier it cannot resolve without a code.
    const message = e instanceof Error ? e.message : '';
    return code === undefined && /^(Cannot find (module|package)|Module not found|Relative import path)/.test(message)
        && message.includes('@awacloud/oconv-fonts');
}

/**
 * The Liberation faces of the optional package `@awacloud/oconv-fonts`, under
 * the five class names of `PDF_FONT_CLASSES`. The package is imported on
 * demand (nothing at module load). Absent, the result is the usage error
 * `MISSING_FACES_MESSAGE`; any other failure is an error naming it.
 */
export async function loadPackagedPdfFonts(opts: PackagedFontsOptions = {}): Promise<CoreError | { error: null; fonts: PdfFonts }> {
    try {
        const importer = opts.importer ?? (() => import('@awacloud/oconv-fonts/loader.js') as unknown as ReturnType<NonNullable<PackagedFontsOptions['importer']>>);
        const loader = await importer();
        const faces = await loader.loadDefaultFaces();
        const fonts: PdfFonts = {};
        for (const cls of PDF_FONT_CLASSES) fonts[cls] = faces[cls];
        return { error: null, fonts };
    } catch (e) {
        if (isModuleNotFound(e)) return { error: MISSING_FACES_MESSAGE, usage: true };
        const message = e instanceof Error ? e.message : String(e);
        return { error: `cannot load the packaged faces of @awacloud/oconv-fonts: ${message}`, usage: false };
    }
}
