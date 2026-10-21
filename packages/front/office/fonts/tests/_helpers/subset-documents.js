// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview The fonts an external sanitizer judges: the
 * `subsetForPdf` output of every `glyf` face the repository vendors with a
 * provenance record, over two code-point sets per face.
 *
 * - **Sources** — the twelve Liberation 2.1.5 faces of
 *   `oconv-fonts/vendor` (reused by path, each checked against that
 *   package's `PROVENANCE.json`) and the faces of the OFL fixture
 *   (`_fixtures/ofl-faces/MANIFEST.json`, checked by `loadFaces`), a face
 *   listed in both taken once.
 * - **Sets** — `text`: the code points of {@link SAMPLE_TEXT} the face
 *   maps; `full`: every code point the face maps.
 * - **Refusals** — a face `subsetForPdf` refuses with a typed error
 *   (a CFF or CFF2 face: `fonts/subset-bad-font`, a documented limit) is
 *   listed in `skipped` with the code; any other throw propagates.
 *
 * One module for both users: the package test
 * (`tests/subset-documents.integration.test.js`) and the `ots` suite of
 * `tools/office-scorecard`. Never shipped (the package `files` exclude
 * `tests/`).
 *
 * @module fonts/tests/_helpers/subset-documents
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { fontsRuntime } from './fonttools.js';
import { loadFaces } from './ofl-faces.js';

/** The `oconv-fonts` vendor directory (`PROVENANCE.json`, `liberation/`). */
export const LIBERATION_DIR = fileURLToPath(new URL('../../../oconv-fonts/vendor/', import.meta.url));

/** The sentence whose code points make the `text` set: Latin, accents, digits, typographic punctuation. */
export const SAMPLE_TEXT = 'The quick brown fox jumps over the lazy dog. 0123456789 Àà Éé Îî Õõ Üü Çç Ææ Œœ ß € “quoted” ‘single’ – — … ½';

const sha256 = (b) => createHash('sha256').update(b).digest('hex');

/** `LiberationSans-BoldItalic` → `liberation-sans-bold-italic`. */
const kebab = (name) => name.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();

/**
 * The source faces, each checked against its provenance record (any
 * mismatch throws), sorted by id.
 * @returns {{ id: string, bytes: Uint8Array }[]}
 */
export function subsetSources() {
    const prov = JSON.parse(readFileSync(`${LIBERATION_DIR}PROVENANCE.json`, 'utf8'));
    const out = [];
    const seen = new Set();
    for (const tree of prov.trees) {
        for (const f of tree.files) {
            if (!f.path.endsWith('.ttf')) continue;
            const bytes = new Uint8Array(readFileSync(`${LIBERATION_DIR}${f.path}`));
            const sum = sha256(bytes);
            if (bytes.length !== f.bytes || sum !== f.sha256) throw new Error(`${f.path} differs from oconv-fonts PROVENANCE.json`);
            out.push({ id: kebab(f.path.slice(f.path.lastIndexOf('/') + 1, -'.ttf'.length)), bytes });
            seen.add(sum);
        }
    }
    for (const face of loadFaces().faces) {
        if (seen.has(sha256(face.bytes))) continue;
        out.push({ id: face.id, bytes: face.bytes });
    }
    return out.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/**
 * The two code-point sets of a read face.
 * @param {{ unicodeMap: Map<number, number> }} font
 * @returns {{ text: number[], full: number[] }}
 */
export function codePointSets(font) {
    const text = [...new Set([...SAMPLE_TEXT].map((c) => /** @type {number} */ (c.codePointAt(0))))].filter((cp) => font.unicodeMap.has(cp)).sort((a, b) => a - b);
    const full = [...font.unicodeMap.keys()].sort((a, b) => a - b);
    return { text, full };
}

/**
 * The subset documents: one per source face and code-point set, the face's
 * own bytes as `source`.
 * @param {{ resolve(name: string): any }} [rt]
 * @returns {{ docs: { id: string, ext: 'ttf', bytes: Uint8Array, source: Uint8Array, codePoints: number[] }[], skipped: { case: string, reason: string }[] }}
 */
export function subsetDocuments(rt = fontsRuntime()) {
    const api = rt.resolve('fonts');
    const { subsetForPdf } = rt.resolve('embedSubsetForPdf');
    const out = { docs: [], skipped: [] };
    for (const face of subsetSources()) {
        const font = api.read(face.bytes);
        const sets = codePointSets(font);
        for (const name of /** @type {const} */ (['text', 'full'])) {
            const id = `${face.id}/${name}`;
            try {
                const bytes = subsetForPdf(font, new Set(sets[name])).subsetBytes;
                out.docs.push({ id, ext: 'ttf', bytes, source: face.bytes, codePoints: sets[name] });
            } catch (e) {
                const code = /** @type {{ code?: unknown }} */ (e).code;
                if (typeof code !== 'string' || !code.startsWith('fonts/')) throw e;
                out.skipped.push({ case: `${id}.ttf`, reason: `subsetForPdf refuses the face with the typed ${code} (a documented limit: glyf outlines only)` });
            }
        }
    }
    return out;
}
