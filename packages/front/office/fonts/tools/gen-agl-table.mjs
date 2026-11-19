#!/usr/bin/env node
// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * Generate `src/encodings/aglTable.js` from a vendored `glyphlist.txt`
 * (Adobe Glyph List, `adobe-type-tools/agl-aglfn`).
 *
 * **NOT YET RUNNABLE END-TO-END** — `glyphlist.txt` is not vendored in
 * this tree. The licence-gated vendoring step is BLOCKED (see
 * `src/encodings/AGL-PROVENANCE.md`). This script is committed ahead of
 * the data so a human who authorizes and completes the vendoring only
 * has to: (1) place the confirmed-licence `glyphlist.txt` at
 * `src/encodings/glyphlist.txt`, (2) record its pinned commit SHA below
 * (`PINNED_SHA`) and in `AGL-PROVENANCE.md`, (3) run this script,
 * (4) run the fonts suite.
 *
 * Input format (one non-comment line per entry):
 *   `<glyphName>;<hex4-6> [<hex4-6> ...]`
 * e.g. `Agrave;00C0` or `ffi;0066 0066 0069` (a ligature → sequence).
 * Lines starting with `#` are comments and are skipped, per the AGL
 * file's own documented format.
 *
 * Output: overwrites `src/encodings/aglTable.js` with a
 * `/* GENERATED from glyphlist.txt (<PINNED_SHA>) — do not edit *\/`
 * header and a frozen `AGL_TABLE` object literal (glyph name → array of
 * code points), sorted by key for a byte-idempotent, diff-stable output.
 *
 * The same run writes `src/encodings/zapfDingbatsGlyphs.js` from the
 * vendored `zapfdingbats.txt` (the ITC Zapf Dingbats Glyph List, same
 * repository, commit and format): the `a1` to `a206` names of the Zapf
 * Dingbats font, which the AGL does not list.
 *
 * Re-run: `bun tools/gen-agl-table.mjs` from the package root.
 *
 * @module fonts/tools/gen-agl-table
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = join(HERE, '..');
const SRC_TXT = join(PKG_ROOT, 'src', 'encodings', 'glyphlist.txt');
const OUT_JS = join(PKG_ROOT, 'src', 'encodings', 'aglTable.js');
const ZAPF_TXT = join(PKG_ROOT, 'src', 'encodings', 'zapfdingbats.txt');
const ZAPF_JS = join(PKG_ROOT, 'src', 'encodings', 'zapfDingbatsGlyphs.js');

// Fill in once the vendoring gate (AGL-PROVENANCE.md) is confirmed —
// the pinned commit SHA of adobe-type-tools/agl-aglfn the vendored
// glyphlist.txt was fetched from.
const PINNED_SHA = '4036a9ca80a62f64f9de4f7321a9a045ad0ecfd6';

function parseGlyphList(text) {
    /** @type {Record<string, number[]>} */
    const table = {};
    const lines = text.split(/\r?\n/);
    for (const rawLine of lines) {
        const line = rawLine.trim();
        if (line.length === 0 || line.startsWith('#')) continue;
        const sep = line.indexOf(';');
        if (sep < 0) continue;
        const name = line.slice(0, sep).trim();
        const hexes = line.slice(sep + 1).trim().split(/\s+/).filter(Boolean);
        if (name.length === 0 || hexes.length === 0) continue;
        const codePoints = hexes.map((h) => parseInt(h, 16));
        if (codePoints.some((cp) => Number.isNaN(cp))) continue;
        table[name] = codePoints;
    }
    return table;
}

function renderModule(table, pinnedSha) {
    const keys = Object.keys(table).sort();
    const entries = keys
        .map((k) => `        ${JSON.stringify(k)}: ${JSON.stringify(table[k])}`)
        .join(',\n');
    return `/**
 * @fileoverview AGL (Adobe Glyph List) name -> Unicode table.
 *
 * /* GENERATED from glyphlist.txt (${pinnedSha}) -- do not edit *\\/
 * Regenerate with \`bun tools/gen-agl-table.mjs\` from the package root
 * after re-vendoring \`glyphlist.txt\` -- see AGL-PROVENANCE.md.
 *
 * Strict factory-only: no top-level imports, no top-level
 * exports beyond the descriptor.
 *
 * @module fonts/encodings/aglTable
 */

export const encodingAglTable = {
    name: 'encodingAglTable',
    dependencies: [],
    factory() {
        const AGL_TABLE = Object.freeze({
${entries}
        });
        function lookup(name) {
            return Object.prototype.hasOwnProperty.call(AGL_TABLE, name) ? AGL_TABLE[name] : undefined;
        }
        return { AGL_TABLE, lookup };
    }
};
`;
}

function renderZapfModule(table, pinnedSha) {
    const keys = Object.keys(table).sort();
    const entries = keys
        .map((k) => `        ${JSON.stringify(k)}: ${JSON.stringify(table[k])}`)
        .join(',\n');
    return `/**
 * @fileoverview ITC Zapf Dingbats glyph name -> Unicode table.
 *
 * /* GENERATED from zapfdingbats.txt (${pinnedSha}) -- do not edit *\\/
 * Regenerate with \`bun tools/gen-agl-table.mjs\` from the package root
 * after re-vendoring \`zapfdingbats.txt\` -- see AGL-PROVENANCE.md.
 *
 * The names of the Zapf Dingbats font (\`a1\` to \`a206\`), which the AGL
 * does not list. A name here means its Unicode only in a Zapf Dingbats
 * font: other fonts use names of that form for unrelated glyphs.
 *
 * Strict factory-only: no top-level imports, no top-level
 * exports beyond the descriptor.
 *
 * @module fonts/encodings/zapfDingbatsGlyphs
 */

export const encodingZapfDingbatsGlyphs = {
    name: 'encodingZapfDingbatsGlyphs',
    dependencies: [],
    factory() {
        const ZAPF_DINGBATS_GLYPHS = Object.freeze({
${entries}
        });
        function lookup(name) {
            return Object.prototype.hasOwnProperty.call(ZAPF_DINGBATS_GLYPHS, name) ? ZAPF_DINGBATS_GLYPHS[name] : undefined;
        }
        return { ZAPF_DINGBATS_GLYPHS, lookup };
    }
};
`;
}

function main() {
    if (!existsSync(SRC_TXT)) {
        console.error(`gen-agl-table: ${SRC_TXT} not found.`);
        console.error('Vendoring is blocked — see src/encodings/AGL-PROVENANCE.md.');
        console.error('Place a licence-confirmed glyphlist.txt there, set PINNED_SHA in this');
        console.error('script, then re-run.');
        process.exitCode = 1;
        return;
    }
    if (PINNED_SHA === '<to-fill-on-vendoring>') {
        console.error('gen-agl-table: PINNED_SHA is still a placeholder — fill it in first.');
        process.exitCode = 1;
        return;
    }
    const text = readFileSync(SRC_TXT, 'utf8');
    const table = parseGlyphList(text);
    if (Object.keys(table).length === 0) {
        console.error('gen-agl-table: parsed zero entries from glyphlist.txt — aborting, not overwriting output.');
        process.exitCode = 1;
        return;
    }
    const out = renderModule(table, PINNED_SHA);
    writeFileSync(OUT_JS, out, 'utf8');
    console.log(`gen-agl-table: wrote ${Object.keys(table).length} entries to ${OUT_JS}`);
    if (!existsSync(ZAPF_TXT)) {
        console.error(`gen-agl-table: ${ZAPF_TXT} not found — see src/encodings/AGL-PROVENANCE.md.`);
        process.exitCode = 1;
        return;
    }
    const zapf = parseGlyphList(readFileSync(ZAPF_TXT, 'utf8'));
    if (Object.keys(zapf).length === 0) {
        console.error('gen-agl-table: parsed zero entries from zapfdingbats.txt — aborting, not overwriting output.');
        process.exitCode = 1;
        return;
    }
    writeFileSync(ZAPF_JS, renderZapfModule(zapf, PINNED_SHA), 'utf8');
    console.log(`gen-agl-table: wrote ${Object.keys(zapf).length} entries to ${ZAPF_JS}`);
}

main();
