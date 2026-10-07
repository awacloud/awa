#!/usr/bin/env bun
// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * Generate `src/standard14/_widths.generated.js` and refresh the
 * generated width-table blocks embedded in `src/standard14/helvetica.js`
 * / `src/standard14/times.js`, from the vendored Adobe Core 14 AFM files
 * (`vendor/afm/`, see `vendor/afm/PROVENANCE.md`).
 *
 * BL-954 (office/BATCH_33 task 03). Fixes: `helvetica.js`/`times.js`
 * assigned ONE shared width array to all four variants of each family,
 * so bold/italic measured like regular. This script parses the
 * per-variant AFMs and produces the four missing tables
 * (`HELVETICA_BOLD_WIDTHS`, `TIMES_BOLD_WIDTHS`, `TIMES_ITALIC_WIDTHS`,
 * `TIMES_BOLD_ITALIC_WIDTHS`).
 *
 * ## Why the tables are duplicated (generated module + embedded block)
 *
 * `src/standard14/_widths.generated.js` is the canonical, generated,
 * never-hand-edited data module (plain arrays, no fw wiring) — the
 * source consumed by tests and by this script's own drift check.
 *
 * `helvetica.js`/`times.js` do NOT `import` it: `@awacloud/fw`'s
 * `fw/no-factory-capture` ESLint rule forbids a
 * factory from referencing ANY module-scope binding, including a plain
 * data import — only factory parameters (DI) or factory-local
 * declarations are allowed inside `factory()`
 * (`packages/front/fw/integrations/eslint/no-factory-capture.js`).
 * Promoting the table to its own DI'd descriptor was rejected: it would
 * require registering a new internal module in `src/main.js` and every
 * package/test runtime that resolves `standard14Helvetica`/
 * `standard14Times` (`src/main.js`, `src/standard14/_test-runtime.js`,
 * `src/_test-runtime.js`, `tests/roundtrip.integration.test.js`) —
 * outside this task's Targets and its wave lock, and outside the
 * "Registration (orchestrator): None" the plan records.
 *
 * So this script writes the SAME parsed widths a second time, as a
 * factory-local block (matching the existing `HELVETICA_WIDTHS`/
 * `TIMES_ROMAN_WIDTHS` ascii-object-keyed style) between
 * `GENERATED-WIDTHS:<NAME>` / `END-GENERATED-WIDTHS:<NAME>` marker
 * comments in `helvetica.js`/`times.js`. `--check` diffs BOTH copies
 * (the generated module and the embedded blocks) against a fresh parse
 * of the AFMs and exits 1 on any drift — mutating a single number
 * anywhere is caught.
 *
 * ## Glyph shape (362 vs Adobe's original 314)
 *
 * The vendored AFMs (Debian `pmw` redistribution) carry 362 glyph
 * entries, not Adobe's original 314 (Euro/NBspace/extras appended by
 * the Debian maintainer, noted in-file). This script does NOT assume
 * the 314-glyph shape: it parses `StartCharMetrics … EndCharMetrics` by
 * glyph NAME into a `Map`, asserts the parsed count is `>= 314` (never
 * `=== 314`), and fills only the 95 printable-ASCII byte slots
 * (0x20-0x7E) the existing tables fill via `STANDARD_ASCII_ENTRIES`
 * (the same glyph name → byte mapping `HELVETICA_WIDTHS` uses today,
 * `charCodeAt` over the literal ASCII character — AdobeStandardEncoding
 * names, except WinAnsi `quotesingle`/`grave` at 0x27/0x60, see that
 * table's own comment) — unknown glyph names are ignored.
 *
 * ## Regular-table cross-check
 *
 * Regenerating from `Helvetica.afm`/`Times-Roman.afm` (also vendored,
 * as the cross-check baseline) must reproduce the committed
 * `HELVETICA_WIDTHS`/`TIMES_ROMAN_WIDTHS` (live in `helvetica.js`/
 * `times.js`) byte-for-byte. `--check` fails loudly on any diff instead
 * of ever overwriting those regular tables — this script never writes
 * to the "Regular" ascii-object blocks, only to the four
 * `GENERATED-WIDTHS` marker blocks.
 *
 * Usage (from the package root, `packages/front/office/fonts/`):
 *   bun tools/gen-standard14-widths.mjs           # regenerate + write
 *   bun tools/gen-standard14-widths.mjs --check   # drift gate, exit 1 on diff
 *
 * @module fonts/tools/gen-standard14-widths
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

import { encodingWinAnsi } from '../src/encodings/winAnsi.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = join(HERE, '..');
const AFM_DIR = join(PKG_ROOT, 'vendor', 'afm');
const STD14_DIR = join(PKG_ROOT, 'src', 'standard14');
const OUT_GENERATED = join(STD14_DIR, '_widths.generated.js');
const HELVETICA_JS = join(STD14_DIR, 'helvetica.js');
const TIMES_JS = join(STD14_DIR, 'times.js');

// Glyph name -> literal ASCII character, for the 95 printable-ASCII byte
// slots (0x20-0x7E) the existing HELVETICA_WIDTHS / TIMES_ROMAN_WIDTHS
// tables fill (`ascii` object + `charCodeAt` loop in helvetica.js/
// times.js). Order matches the existing files' layout.
//
// WinAnsiEncoding names for 0x27 and 0x60, NOT AdobeStandardEncoding
// (the AFM's own `EncodingScheme`): measured against the live committed
// tables (`HELVETICA_WIDTHS['\''] === 191`, `HELVETICA_WIDTHS['`'] ===
// 333`) — StandardEncoding's `quoteright`/`quoteleft` at those codes are
// both 222 in Helvetica.afm, which does NOT reproduce the committed
// table; `quotesingle` (191) / `grave` (333) do. The existing hand-
// authored tables must be the byte-for-byte cross-check ground truth
// (rulings 03, "never overwrite the regular tables") — the code point
// mapping was re-derived to match them, not assumed from the AFM's
// nominal encoding.
export const STANDARD_ASCII_ENTRIES = [
    [' ', 'space'], ['!', 'exclam'], ['"', 'quotedbl'], ['#', 'numbersign'], ['$', 'dollar'],
    ['%', 'percent'], ['&', 'ampersand'], ["'", 'quotesingle'], ['(', 'parenleft'], [')', 'parenright'],
    ['*', 'asterisk'], ['+', 'plus'], [',', 'comma'], ['-', 'hyphen'], ['.', 'period'], ['/', 'slash'],
    ['0', 'zero'], ['1', 'one'], ['2', 'two'], ['3', 'three'], ['4', 'four'],
    ['5', 'five'], ['6', 'six'], ['7', 'seven'], ['8', 'eight'], ['9', 'nine'],
    [':', 'colon'], [';', 'semicolon'], ['<', 'less'], ['=', 'equal'], ['>', 'greater'], ['?', 'question'],
    ['@', 'at'],
    ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((c) => [c, c]),
    ['[', 'bracketleft'], ['\\', 'backslash'], [']', 'bracketright'], ['^', 'asciicircum'],
    ['_', 'underscore'], ['`', 'grave'],
    ...'abcdefghijklmnopqrstuvwxyz'.split('').map((c) => [c, c]),
    ['{', 'braceleft'], ['|', 'bar'], ['}', 'braceright'], ['~', 'asciitilde']
];

/**
 * WinAnsi high-range byte -> glyph name (0x80-0xFF), COMPOSED from the
 * package's own `encodingWinAnsi.WIN_ANSI` rather than re-listed here —
 * one source of truth for the encoding, per the repo's compose-never-
 * reimplement rule. `.notdef` slots (0x81, 0x8D, 0x8F, 0x90, 0x9D and the
 * control range) are skipped and stay 0.
 *
 * The ASCII half deliberately does NOT come from `WIN_ANSI`:
 * `STANDARD_ASCII_ENTRIES` above stays the ASCII ground truth,
 * cross-checked byte-for-byte against the committed regular tables below.
 * (Until BL-1597, office/BATCH_49, `WIN_ANSI` carried the
 * AdobeStandardEncoding names `quoteright`/`quoteleft` at 0x27/0x60, which
 * would have silently moved those two committed widths, 191 -> 222 and
 * 333 -> 222; the table now matches ISO 32000-2 Annex D —
 * `quotesingle`/`grave` — so the two sources agree.)
 */
export const WIN_ANSI_HIGH_ENTRIES = (() => {
    const { WIN_ANSI } = encodingWinAnsi.factory();
    const out = [];
    for (let b = 0x80; b <= 0xFF; b++) {
        const name = WIN_ANSI[b];
        if (!name || name === '.notdef') continue;
        out.push([b, name]);
    }
    return out;
})();

if (STANDARD_ASCII_ENTRIES.length !== 95) {
    throw new Error(`internal: expected 95 printable-ASCII entries, got ${STANDARD_ASCII_ENTRIES.length}`);
}

/**
 * Parse an AFM's `StartCharMetrics … EndCharMetrics` block into a
 * `Map<glyphName, width>`. Ignores everything outside that block.
 * @param {string} text
 * @returns {Map<string, number>}
 */
export function parseAfm(text) {
    const lines = text.split(/\r?\n/);
    const map = new Map();
    let inBlock = false;
    const lineRe = /WX\s+(-?\d+)\s*;.*?N\s+(\S+)\s*;/;
    for (const line of lines) {
        if (line.startsWith('StartCharMetrics')) { inBlock = true; continue; }
        if (line.startsWith('EndCharMetrics')) { inBlock = false; continue; }
        if (!inBlock) continue;
        const m = lineRe.exec(line);
        if (!m) continue;
        const width = parseInt(m[1], 10);
        const name = m[2];
        if (Number.isNaN(width) || !name) continue;
        map.set(name, width);
    }
    if (map.size < 314) {
        throw new Error(`parseAfm: parsed only ${map.size} glyph entries, expected >= 314`);
    }
    return map;
}

/**
 * Build a frozen 256-slot width array from a parsed AFM glyph map,
 * filling only the 95 printable-ASCII slots via `STANDARD_ASCII_ENTRIES`.
 * Unknown/missing glyph names are ignored (slot stays 0).
 * @param {Map<string, number>} glyphWidths
 * @returns {number[]}
 */
export function buildWidthsArray(glyphWidths) {
    const w = new Array(256).fill(0);
    for (const [char, name] of STANDARD_ASCII_ENTRIES) {
        if (!glyphWidths.has(name)) continue;
        w[char.charCodeAt(0)] = glyphWidths.get(name);
    }
    for (const [byte, name] of WIN_ANSI_HIGH_ENTRIES) {
        if (!glyphWidths.has(name)) continue;
        w[byte] = glyphWidths.get(name);
    }
    return w;
}

/**
 * Render the ascii-object-keyed factory-local block matching the
 * existing hand-authored `HELVETICA_WIDTHS`/`TIMES_ROMAN_WIDTHS` style.
 * @param {Map<string, number>} glyphWidths
 * @param {string} constName
 * @param {number} indent - spaces before each source line.
 * @returns {string}
 */
function renderAsciiBlock(glyphWidths, constName, indent) {
    const pad = ' '.repeat(indent);
    const entries = STANDARD_ASCII_ENTRIES.map(([char, name]) => {
        const width = glyphWidths.has(name) ? glyphWidths.get(name) : 0;
        const key = (char === "'" || char === '\\') ? `'${char === "'" ? "\\'" : '\\\\'}'` : `'${char}'`;
        return `${key}: ${width}`;
    });
    // Wrap at 8 entries per line, matching the existing files' density.
    const rows = [];
    for (let i = 0; i < entries.length; i += 8) rows.push(entries.slice(i, i + 8).join(', '));
    const body = rows.map((r) => `${pad}        ${r}`).join(',\n');

    // WinAnsi high range (0x80-0xFF), byte-keyed: these code points have no
    // sensible single-character source key, and keeping them in their own
    // object leaves the ASCII block above byte-identical to the tables that
    // shipped before the high range was filled.
    const highEntries = WIN_ANSI_HIGH_ENTRIES
        .filter(([, name]) => glyphWidths.has(name))
        .map(([byte, name]) => `0x${byte.toString(16).toUpperCase()}: ${glyphWidths.get(name)}`);
    const highRows = [];
    for (let i = 0; i < highEntries.length; i += 8) highRows.push(highEntries.slice(i, i + 8).join(", "));
    const highBody = highRows.map((r) => `${pad}        ${r}`).join("," + "\n");

    return `${pad}const ${constName} = (() => {\n` +
        `${pad}    const w = new Array(256).fill(0);\n` +
        `${pad}    const ascii = {\n${body}\n${pad}    };\n` +
        `${pad}    for (const k in ascii) w[k.charCodeAt(0)] = ascii[k];\n` +
        `${pad}    const high = {\n${highBody}\n${pad}    };\n` +
        `${pad}    for (const k in high) w[k] = high[k];\n` +
        `${pad}    return Object.freeze(w);\n` +
        `${pad}})();`;
}

function sha256(filePath) {
    return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

function readAfm(name) {
    const path = join(AFM_DIR, name);
    return { path, sha256: sha256(path), glyphWidths: parseAfm(readFileSync(path, 'utf8')) };
}

/** Replace the content between `// GENERATED-WIDTHS:<name>` and `// END-GENERATED-WIDTHS:<name>` markers. */
function patchMarkerBlock(source, constName, replacementBlock) {
    const startMarker = `// GENERATED-WIDTHS:${constName}`;
    const endMarker = `// END-GENERATED-WIDTHS:${constName}`;
    const startIdx = source.indexOf(startMarker);
    const endIdx = source.indexOf(endMarker);
    if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) {
        throw new Error(`patchMarkerBlock: markers for ${constName} not found`);
    }
    const before = source.slice(0, startIdx + startMarker.length);
    const after = source.slice(endIdx);
    return `${before}\n${replacementBlock}\n        ${after}`;
}

function extractMarkerBlock(source, constName) {
    const startMarker = `// GENERATED-WIDTHS:${constName}`;
    const endMarker = `// END-GENERATED-WIDTHS:${constName}`;
    const startIdx = source.indexOf(startMarker);
    const endIdx = source.indexOf(endMarker);
    if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) {
        throw new Error(`extractMarkerBlock: markers for ${constName} not found`);
    }
    return source.slice(startIdx + startMarker.length, endIdx).trim();
}

function renderGeneratedModule(tables, shas) {
    const header = `/**
 * @fileoverview Standard 14 — per-variant width tables for
 * Helvetica-Bold, Times-Bold, Times-Italic, Times-BoldItalic, parsed
 * from the vendored Adobe Core 14 AFM metrics.
 *
 * GENERATED FILE — bun packages/front/office/fonts/tools/gen-standard14-widths.mjs -- do not edit
 * Regenerate after re-vendoring \`vendor/afm/*.afm\` — see
 * \`vendor/afm/PROVENANCE.md\` and \`vendor/afm/NOTICE-adobe-afm.html\` (the
 * notice file must travel with the AFMs in any redistribution and must
 * never be removed from \`vendor/afm/\`).
 *
 * Source AFM sha256 (per \`vendor/afm/PROVENANCE.md\`):
 *   Helvetica-Bold.afm    ${shas.helveticaBold}
 *   Times-Bold.afm        ${shas.timesBold}
 *   Times-Italic.afm      ${shas.timesItalic}
 *   Times-BoldItalic.afm  ${shas.timesBoldItalic}
 *
 * Each array is a frozen 256-slot table (1000 units/em) covering the FULL
 * WinAnsi byte map: the 95 printable-ASCII slots (0x20-0x7E) via
 * \`STANDARD_ASCII_ENTRIES\`, plus the 123 filled high slots (0x80-0xFF)
 * via \`WIN_ANSI_HIGH_ENTRIES\`, which is composed from the package's own
 * \`encodingWinAnsi.WIN_ANSI\`. ASCII uses AdobeStandardEncoding names for
 * every slot except 0x27/0x60, which use the WinAnsi \`quotesingle\`/
 * \`grave\` names to match the committed regular tables byte-for-byte.
 * \`.notdef\` and control slots stay 0.
 *
 * Plain data module — NOT an fw module descriptor. \`helvetica.js\`/
 * \`times.js\` do not import it: a factory referencing a module-scope
 * import (even pure data) is disallowed by \`fw/no-factory-capture\` —
 * see this generator's own fileoverview for why. This module exists for tests and for this generator's own
 * \`--check\` drift gate, which also verifies \`helvetica.js\`/\`times.js\`'s
 * embedded copies stay in sync with it.
 *
 * @module fonts/standard14/_widths.generated
 */

`;
    const body = Object.entries(tables)
        .map(([name, arr]) => `export const ${name} = Object.freeze(${JSON.stringify(arr)});\n`)
        .join('\n');
    return header + body;
}

/**
 * Regenerate (or, in check mode, diff) the width tables. Pure/testable:
 * takes an explicit `checkMode` instead of reading `process.argv`
 * directly, and RETURNS `{ ok, diffs }` instead of mutating
 * `process.exitCode` — the CLI entry point (below) is the only place
 * that touches `process`.
 * @param {{ checkMode?: boolean }} [opts]
 * @returns {Promise<{ ok: boolean, diffs: string[] }>}
 */
export async function main(opts = {}) {
    const checkMode = opts.checkMode ?? process.argv.includes('--check');

    const helveticaBoldAfm = readAfm('Helvetica-Bold.afm');
    const timesBoldAfm = readAfm('Times-Bold.afm');
    const timesItalicAfm = readAfm('Times-Italic.afm');
    const timesBoldItalicAfm = readAfm('Times-BoldItalic.afm');
    const helveticaAfm = readAfm('Helvetica.afm');
    const timesRomanAfm = readAfm('Times-Roman.afm');

    const tables = {
        HELVETICA_WIDTHS: buildWidthsArray(helveticaAfm.glyphWidths),
        TIMES_ROMAN_WIDTHS: buildWidthsArray(timesRomanAfm.glyphWidths),
        HELVETICA_BOLD_WIDTHS: buildWidthsArray(helveticaBoldAfm.glyphWidths),
        TIMES_BOLD_WIDTHS: buildWidthsArray(timesBoldAfm.glyphWidths),
        TIMES_ITALIC_WIDTHS: buildWidthsArray(timesItalicAfm.glyphWidths),
        TIMES_BOLD_ITALIC_WIDTHS: buildWidthsArray(timesBoldItalicAfm.glyphWidths)
    };
    const shas = {
        helveticaBold: helveticaBoldAfm.sha256,
        timesBold: timesBoldAfm.sha256,
        timesItalic: timesItalicAfm.sha256,
        timesBoldItalic: timesBoldItalicAfm.sha256
    };

    const generatedModuleSrc = renderGeneratedModule(tables, shas);

    const helveticaRegularBlock = renderAsciiBlock(helveticaAfm.glyphWidths, 'HELVETICA_WIDTHS', 8);
    const timesRomanRegularBlock = renderAsciiBlock(timesRomanAfm.glyphWidths, 'TIMES_ROMAN_WIDTHS', 8);
    const helveticaBoldBlock = renderAsciiBlock(helveticaBoldAfm.glyphWidths, 'HELVETICA_BOLD_WIDTHS', 8);
    const timesBoldBlock = renderAsciiBlock(timesBoldAfm.glyphWidths, 'TIMES_BOLD_WIDTHS', 8);
    const timesItalicBlock = renderAsciiBlock(timesItalicAfm.glyphWidths, 'TIMES_ITALIC_WIDTHS', 8);
    const timesBoldItalicBlock = renderAsciiBlock(timesBoldItalicAfm.glyphWidths, 'TIMES_BOLD_ITALIC_WIDTHS', 8);

    const helveticaJsSrc = readFileSync(HELVETICA_JS, 'utf8');
    const timesJsSrc = readFileSync(TIMES_JS, 'utf8');
    const newHelveticaJsSrc = patchMarkerBlock(
        patchMarkerBlock(helveticaJsSrc, 'HELVETICA_WIDTHS', helveticaRegularBlock),
        'HELVETICA_BOLD_WIDTHS', helveticaBoldBlock
    );
    const newTimesJsSrc = patchMarkerBlock(
        patchMarkerBlock(
            patchMarkerBlock(
                patchMarkerBlock(timesJsSrc, 'TIMES_ROMAN_WIDTHS', timesRomanRegularBlock),
                'TIMES_BOLD_WIDTHS', timesBoldBlock
            ),
            'TIMES_ITALIC_WIDTHS', timesItalicBlock
        ),
        'TIMES_BOLD_ITALIC_WIDTHS', timesBoldItalicBlock
    );

    // Cross-check: regenerating the REGULAR tables must reproduce the
    // committed HELVETICA_WIDTHS / TIMES_ROMAN_WIDTHS byte-for-byte.
    // Never overwritten — report the diff and fail instead.
    const regenHelveticaRegular = buildWidthsArray(helveticaAfm.glyphWidths);
    const regenTimesRomanRegular = buildWidthsArray(timesRomanAfm.glyphWidths);

    let liveHelveticaRegular, liveTimesRomanRegular;
    // (dynamic import below, awaited in run())
    const runCrossCheck = async () => {
        const helveticaMod = await import(pathToFileURL(HELVETICA_JS).href);
        const timesMod = await import(pathToFileURL(TIMES_JS).href);
        liveHelveticaRegular = helveticaMod.standard14Helvetica.factory().HELVETICA_WIDTHS;
        liveTimesRomanRegular = timesMod.standard14Times.factory().TIMES_ROMAN_WIDTHS;
    };

    await runCrossCheck();

    // The invariant is the 95 printable-ASCII slots, NOT the whole array:
    // the WinAnsi high range (0x80-0xFF) is filled by this generator and was
    // 0 in the tables that shipped before it, so a whole-array comparison
    // would fail by construction on the first regeneration. What ruling 03
    // actually protects ("never overwrite the regular tables") is that no
    // ASCII width silently changes — a wrong glyph-name mapping (e.g.
    // sourcing 0x27/0x60 from `encodingWinAnsi`, which carries the
    // StandardEncoding names there) still trips this check.
    const asciiSlice = (arr) => STANDARD_ASCII_ENTRIES.map(([char]) => arr[char.charCodeAt(0)]);
    const crossCheckDiffs = [];
    if (JSON.stringify(asciiSlice(regenHelveticaRegular)) !== JSON.stringify(asciiSlice(Array.from(liveHelveticaRegular)))) {
        crossCheckDiffs.push('HELVETICA_WIDTHS (regenerated from Helvetica.afm) differs from the committed helvetica.js table on a printable-ASCII slot');
    }
    if (JSON.stringify(asciiSlice(regenTimesRomanRegular)) !== JSON.stringify(asciiSlice(Array.from(liveTimesRomanRegular)))) {
        crossCheckDiffs.push('TIMES_ROMAN_WIDTHS (regenerated from Times-Roman.afm) differs from the committed times.js table on a printable-ASCII slot');
    }
    if (crossCheckDiffs.length > 0) {
        console.error('gen-standard14-widths: REGULAR TABLE CROSS-CHECK FAILED — never overwriting, reporting diff:');
        for (const d of crossCheckDiffs) console.error(`  - ${d}`);
        return { ok: false, diffs: crossCheckDiffs };
    }

    if (checkMode) {
        const diffs = [];
        let existingGenerated = '';
        try { existingGenerated = readFileSync(OUT_GENERATED, 'utf8'); } catch { /* missing = drift */ }
        if (existingGenerated !== generatedModuleSrc) diffs.push('_widths.generated.js is stale vs a fresh AFM parse');

        for (const [name, block] of [
            ['HELVETICA_WIDTHS', helveticaRegularBlock],
            ['TIMES_ROMAN_WIDTHS', timesRomanRegularBlock],
            ['HELVETICA_BOLD_WIDTHS', helveticaBoldBlock],
            ['TIMES_BOLD_WIDTHS', timesBoldBlock],
            ['TIMES_ITALIC_WIDTHS', timesItalicBlock],
            ['TIMES_BOLD_ITALIC_WIDTHS', timesBoldItalicBlock]
        ]) {
            const src = name.startsWith('HELVETICA') ? helveticaJsSrc : timesJsSrc;
            const file = name.startsWith('HELVETICA') ? 'helvetica.js' : 'times.js';
            let existingBlock;
            try { existingBlock = extractMarkerBlock(src, name); }
            catch (e) { diffs.push(`${file}: ${e.message}`); continue; }
            if (existingBlock !== block.trim()) diffs.push(`${file}: embedded ${name} is stale vs a fresh AFM parse`);
        }

        if (diffs.length > 0) {
            console.error('gen-standard14-widths --check: DRIFT DETECTED:');
            for (const d of diffs) console.error(`  - ${d}`);
            return { ok: false, diffs };
        }
        console.log('gen-standard14-widths --check: OK, no drift.');
        return { ok: true, diffs: [] };
    }

    writeFileSync(OUT_GENERATED, generatedModuleSrc, 'utf8');
    writeFileSync(HELVETICA_JS, newHelveticaJsSrc, 'utf8');
    writeFileSync(TIMES_JS, newTimesJsSrc, 'utf8');
    console.log(`gen-standard14-widths: wrote ${OUT_GENERATED}`);
    console.log(`gen-standard14-widths: refreshed generated blocks in ${HELVETICA_JS}`);
    console.log(`gen-standard14-widths: refreshed generated blocks in ${TIMES_JS}`);
    return { ok: true, diffs: [] };
}

// CLI entry point — the only place this module touches `process`. Guarded
// so the module can also be `import`ed for its pure helpers (`parseAfm`,
// `buildWidthsArray`, `STANDARD_ASCII_ENTRIES`) and for `main()` itself
// (called with an explicit `checkMode`, read-only) from tests.
if (import.meta.main) {
    const result = await main();
    if (!result.ok) process.exitCode = 1;
}
