// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Parse outcome of the fonttools test fonts (the binary
 * files of fonttools' `Tests/` tree), per font file and per table.
 *
 * Every file is classified by its magic bytes (SFNT, TTC, WOFF, WOFF2, a
 * raw CFF table, anything else), then run through the package's public
 * wiring — `fw_require`, `modules` and `extras` in one `ModuleRuntime`,
 * the Brotli static dictionary loaded as fw documents it for Bun / Node:
 *
 * - **fonts**: one case per font file. It passes when the container
 *   decodes, `fonts.read` returns on every font it holds, every table
 *   the package has a parser for returns, every `glyf` glyph resolves
 *   and every CharString of a name-keyed `CFF ` font decodes. A WOFF2
 *   whose `glyf` is transformed is judged on its untransformed tables
 *   (the transform is not reversed, a documented limit).
 * - **tables**: one case per table instance (file, font, tag) the
 *   package has a parser for, raw table files included; it passes when
 *   the parser returns.
 *
 * One module for both users: the package test
 * (`tests/fonttools.integration.test.js`) and the `fonttools-fonts` /
 * `fonttools-tables` suites of `tools/office-scorecard`, so the two
 * cannot drift. Never shipped (the package `files` exclude `tests/`).
 *
 * @module fonts/tests/_helpers/fonttools
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { fw_require, modules, extras } from '../../src/main.js';

/** The Brotli static dictionary fw ships (RFC 7932 Appendix A). */
const BROTLI_DICT = new URL('../../../../fw/src/io/compress/brotli_dict.bin', import.meta.url);

/** Font file extensions: such a file is a case of the fonts suite. */
const FONT_FILE = /\.(otf|ttf|ttc|woff2?)$/i;
/** Formats the package does not claim. */
const NOT_CLAIMED = /\.(pfa|pfb|lwfn|dfont)$/i;
/** A raw table split into one file per table (`<stem>.<tag>.bin`). */
const TABLE_SET = /^(.*)\.(head|maxp|loca|glyf)\.bin$/;

/** The binary files of a fonttools checkout (`*.ttx.*` dumps are XML). */
const BINARY = /\.(otf|ttf|ttc|woff2?|dfont|pfa|pfb|lwfn|cff|bin)$/i;

/**
 * The binary test files under `<root>/Tests`, as sorted upstream paths
 * (`Tests/…`, POSIX) with their bytes.
 * @param {string} root a fonttools checkout (or a vendored copy of its paths)
 * @returns {{ path: string, bytes: Uint8Array }[]}
 */
export function listBinaryFiles(root) {
    const out = [];
    const walk = (d) => {
        for (const n of readdirSync(d)) {
            const p = join(d, n);
            if (statSync(p).isDirectory()) walk(p);
            else if (BINARY.test(n) && !n.includes('.ttx.')) {
                out.push({ path: relative(root, p).replace(/\\/g, '/'), bytes: new Uint8Array(readFileSync(p)) });
            }
        }
    };
    walk(join(root, 'Tests'));
    return out.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

/**
 * A runtime wired from the package manifest, with the Brotli dictionary
 * loaded.
 * @returns {ModuleRuntime}
 */
export function fontsRuntime() {
    const rt = new ModuleRuntime();
    for (const m of [...fw_require, ...modules, ...extras]) rt.register(m);
    rt.resolve('brotliDictWords').setBlob(new Uint8Array(readFileSync(BROTLI_DICT)));
    return rt;
}

/**
 * The container of a file, from its first bytes.
 * @param {Uint8Array} b
 * @returns {'sfnt'|'ttc'|'woff'|'woff2'|'cff'|'other'}
 */
export function classify(b) {
    if (b.length < 4) return 'other';
    const tag = String.fromCharCode(b[0], b[1], b[2], b[3]);
    if (tag === 'OTTO' || tag === 'true' || (b[0] === 0 && b[1] === 1 && b[2] === 0 && b[3] === 0)) return 'sfnt';
    if (tag === 'ttcf') return 'ttc';
    if (tag === 'wOFF') return 'woff';
    if (tag === 'wOF2') return 'woff2';
    if (b[0] === 1 && b[1] === 0) return 'cff';
    return 'other';
}

/**
 * The table parsers of the package (core and extras), each called with
 * the table bytes and a context giving `numGlyphs`, `head`, `hhea` and
 * the font's other tables.
 * @param {ModuleRuntime} rt
 * @returns {Record<string, (bytes: Uint8Array, ctx: TableContext) => unknown>}
 */
export function tableParsers(rt) {
    const R = (n) => rt.resolve(n);
    return {
        head: (b) => R('tableHead').parseHead(b),
        hhea: (b) => R('tableHhea').parseHhea(b),
        maxp: (b) => R('tableMaxp').parseMaxp(b),
        hmtx: (b, c) => R('tableHmtx').parseHmtx(b, c.hhea().numberOfHMetrics, c.numGlyphs()),
        cmap: (b) => R('tableCmap').parseCmap(b),
        name: (b) => R('tableName').parseName(b),
        'OS/2': (b) => R('tableOs2').parseOs2(b),
        post: (b, c) => R('tablePost').parsePost(b, c.numGlyphs()),
        loca: (b, c) => R('tableLoca').parseLoca(b, c.numGlyphs(), c.head().indexToLocFormat),
        glyf: (b, c) => R('tableGlyf').parseGlyf(b, R('tableLoca').parseLoca(c.table('loca'), c.numGlyphs(), c.head().indexToLocFormat)),
        'CFF ': (b) => R('tableCff').parseCff(b),
        CFF2: (b) => R('tableCff2').parseCff2(b),
        kern: (b) => R('tableKern').parseKern(b),
        gasp: (b) => R('tableGasp').parseGasp(b),
        hdmx: (b, c) => R('tableHdmx').parseHdmx(b, c.numGlyphs()),
        VDMX: (b) => R('tableVdmx').parseVdmx(b),
        LTSH: (b) => R('tableLtsh').parseLtsh(b),
        GDEF: (b) => R('tableGdef').parseGdef(b),
        GSUB: (b) => R('tableGsub').parseGsub(b),
        GPOS: (b) => R('tableGpos').parseGpos(b),
        fvar: (b) => R('tableFvar').parseFvar(b),
        avar: (b) => R('tableAvar').parseAvar(b),
        STAT: (b) => R('tableStat').parseStat(b),
        gvar: (b) => R('tableGvar').parseGvar(b),
        HVAR: (b) => R('tableHvar').parseHvar(b),
        MVAR: (b) => R('tableMvar').parseMvar(b),
        BASE: (b) => R('tableBase').parseBase(b),
        CPAL: (b) => R('tableCpal').parseCpal(b),
        COLR: (b) => R('tableColr').parseColr(b),
        sbix: (b, c) => R('tableSbix').parseSbix(b, c.numGlyphs()),
        'SVG ': (b) => R('tableSvg').parseSvg(b),
        CBDT: (b) => R('tableCbdt').parseCbdt(b),
        CBLC: (b) => R('tableCblc').parseCblc(b),
        vhea: (b) => R('tableVhea').parseVhea(b),
        vmtx: (b, c) => R('tableVmtx').parseVmtx(b, R('tableVhea').parseVhea(c.table('vhea')).numOfLongVerMetrics, c.numGlyphs()),
        VORG: (b) => R('tableVorg').parseVorg(b),
        EBDT: (b) => R('tableEbdt').parseEbdt(b),
        EBLC: (b) => R('tableEblc').parseEblc(b),
        EBSC: (b) => R('tableEbsc').parseEbsc(b),
        DSIG: (b) => R('extraDsig').parseDsig(b),
        MATH: (b) => R('extraMath').parseMath(b),
        JSTF: (b) => R('extraJstf').parseJstf(b),
        morx: (b) => R('aatMorx').parseMorx(b),
        kerx: (b) => R('aatKerx').parseKerx(b),
        ankr: (b) => R('aatAnkr').parseAnkr(b),
        prop: (b) => R('aatProp').parseProp(b),
        lcar: (b) => R('aatLcar').parseLcar(b),
        feat: (b) => R('aatFeat').parseFeat(b)
    };
}

/**
 * @typedef {object} TableContext
 * @property {(tag: string) => Uint8Array} table   another table's bytes
 * @property {() => number} numGlyphs                from `maxp`
 * @property {() => { indexToLocFormat: number }} head
 * @property {() => { numberOfHMetrics: number }} hhea
 */

/** A table another parser needs is absent or does not parse. */
class Prerequisite extends Error {}

/**
 * @param {ModuleRuntime} rt
 * @param {Record<string, Uint8Array>} tables
 * @returns {TableContext}
 */
function tableContext(rt, tables) {
    const need = (tag, fn) => {
        if (!tables[tag]) throw new Prerequisite(`needs the ${tag} table`);
        try { return fn(tables[tag]); } catch { throw new Prerequisite(`needs a ${tag} table that parses`); }
    };
    return {
        table: (tag) => need(tag, (b) => b),
        numGlyphs: () => need('maxp', (b) => rt.resolve('tableMaxp').parseMaxp(b).numGlyphs),
        head: () => need('head', (b) => rt.resolve('tableHead').parseHead(b)),
        hhea: () => need('hhea', (b) => rt.resolve('tableHhea').parseHhea(b))
    };
}

/**
 * The detail of a failure: the typed error's code, or the untyped error
 * named as such.
 * @param {unknown} e
 * @returns {string}
 */
export function errorDetail(e) {
    const code = e && /** @type {{ code?: unknown }} */ (e).code;
    if (typeof code === 'string' && code.startsWith('fonts/')) return code;
    const name = e && /** @type {Error} */ (e).name ? /** @type {Error} */ (e).name : typeof e;
    const extra = code !== undefined ? ` (code ${String(code)})` : '';
    return `untyped ${name}${extra}: ${String(e && /** @type {Error} */ (e).message).slice(0, 120)}`;
}

/**
 * @typedef {object} Case
 * @property {string} case
 * @property {boolean} ok
 * @property {string} [detail]
 */

/**
 * @typedef {object} Measure
 * @property {{ cases: Case[], skipped: { case: string, reason: string }[] }} fonts
 * @property {{ cases: Case[], skipped: { case: string, reason: string }[] }} tables
 */

/**
 * Run the measure over a list of files.
 * @param {{ path: string, bytes: Uint8Array }[]} files upstream paths (POSIX) and bytes
 * @param {ModuleRuntime} [rt]
 * @returns {Measure}
 */
export function measure(files, rt = fontsRuntime()) {
    const parsers = tableParsers(rt);
    const api = /** @type {{ read(b: Uint8Array): any }} */ (rt.resolve('fonts'));
    const { parseSfnt } = rt.resolve('fontSfnt');
    const { parseTtc, extractFont } = rt.resolve('fontTtc');
    const { parseCff, decodeCharstring } = rt.resolve('tableCff');
    const woff = rt.resolve('fontWoff');
    const woff2 = rt.resolve('fontWoff2');

    /** @type {Measure} */
    const out = { fonts: { cases: [], skipped: [] }, tables: { cases: [], skipped: [] } };
    /** @type {Map<string, number>} */
    const noParser = new Map();

    /**
     * Run every parser of one font's tables; returns the failures.
     * @param {string} label
     * @param {Record<string, Uint8Array>} tables
     * @param {Set<string>} [transformed] WOFF2-transformed tags
     */
    const runTables = (label, tables, transformed = new Set()) => {
        const ctx = tableContext(rt, tables);
        const fails = [];
        for (const tag of Object.keys(tables).sort()) {
            const parse = parsers[tag];
            const id = `${label} :: ${tag}`;
            if (!parse) { noParser.set(tag, (noParser.get(tag) || 0) + 1); continue; }
            if (transformed.has(tag)) {
                out.tables.skipped.push({ case: id, reason: 'WOFF2-transformed table: the transform is not reversed (documented limit)' });
                continue;
            }
            try {
                parse(tables[tag], ctx);
                out.tables.cases.push({ case: id, ok: true });
            } catch (e) {
                if (e instanceof Prerequisite) {
                    out.tables.skipped.push({ case: id, reason: `not run: ${e.message}` });
                    continue;
                }
                const detail = errorDetail(e);
                out.tables.cases.push({ case: id, ok: false, detail });
                fails.push(`${tag}: ${detail}`);
            }
        }
        return fails;
    };

    /** Read one SFNT, its tables, glyphs and CharStrings; returns the failures. */
    const runSfnt = (label, bytes, prefix) => {
        let sfnt;
        try { sfnt = parseSfnt(bytes); } catch (e) { return [`${prefix}sfnt: ${errorDetail(e)}`]; }
        const tables = Object.fromEntries(Object.entries(sfnt.tables).map(([t, v]) => [t, v.bytes]));
        const fails = runTables(label, tables).map((f) => prefix + f);
        let font = null;
        try { font = api.read(bytes); } catch (e) { fails.unshift(`${prefix}read: ${errorDetail(e)}`); }
        if (font && font.glyphTable) {
            for (let gid = 0; gid < font.numGlyphs; gid++) {
                try { font.getGlyphByIndex(gid); } catch (e) { fails.push(`${prefix}glyph ${gid}: ${errorDetail(e)}`); break; }
            }
        }
        if (tables['CFF ']) {
            try {
                const cff = parseCff(tables['CFF ']);
                const globalSubrs = cff.globalSubrIndex.items;
                for (const f of cff.fonts) {
                    if (f.topDict.get(1230) || !f.charStringsIndex) continue;   // CID-keyed (ROS): per-FD subroutines, not checked
                    const localSubrs = f.localSubrIndex ? f.localSubrIndex.items : [];
                    const items = f.charStringsIndex.items;
                    for (let gid = 0; gid < items.length; gid++) {
                        try { decodeCharstring(items[gid], { globalSubrs, localSubrs }); } catch (e) {
                            fails.push(`${prefix}charstring ${gid}: ${errorDetail(e)}`);
                            break;
                        }
                    }
                }
            } catch { /* the table failure is already recorded */ }
        }
        return fails;
    };

    /** @type {Map<string, Record<string, Uint8Array>>} */
    const tableSets = new Map();
    for (const { path, bytes } of files) {
        const set = TABLE_SET.exec(path);
        if (set) {
            const t = tableSets.get(set[1]) || {};
            t[set[2]] = bytes;
            tableSets.set(set[1], t);
            continue;
        }
        const kind = classify(bytes);
        const isFont = FONT_FILE.test(path) && kind !== 'other' && kind !== 'cff';
        if (!isFont) {
            if (NOT_CLAIMED.test(path)) {
                out.fonts.skipped.push({ case: path, reason: 'Type 1 or Mac resource-fork font: not a format the package claims' });
            } else {
                out.fonts.skipped.push({ case: path, reason: 'a raw table file, measured by fonttools-tables' });
                if (kind === 'cff') {
                    try { parseCff(bytes); out.tables.cases.push({ case: `${path} :: CFF `, ok: true }); }
                    catch (e) { out.tables.cases.push({ case: `${path} :: CFF `, ok: false, detail: errorDetail(e) }); }
                } else if (kind === 'sfnt') {
                    try {
                        const s = parseSfnt(bytes);
                        runTables(path, Object.fromEntries(Object.entries(s.tables).map(([t, v]) => [t, v.bytes])));
                    } catch (e) { out.tables.cases.push({ case: `${path} :: (directory)`, ok: false, detail: errorDetail(e) }); }
                }
            }
            continue;
        }
        let fails = [];
        try {
            if (kind === 'sfnt') {
                fails = runSfnt(path, bytes, '');
            } else if (kind === 'ttc') {
                const n = parseTtc(bytes).numFonts;
                for (let i = 0; i < n; i++) {
                    let sub;
                    try { sub = extractFont(bytes, i); } catch (e) { fails.push(`#${i} extract: ${errorDetail(e)}`); continue; }
                    fails.push(...runSfnt(`${path}#${i}`, sub, `#${i} `));
                }
            } else if (kind === 'woff') {
                fails = runSfnt(path, woff.decode(bytes), '');
            } else {
                // fonts.read is not applied: the package returns the
                // decoded tables, not an SFNT (transforms not reversed).
                const d = woff2.decode(bytes);
                const tables = Object.fromEntries(Object.entries(d.tables).map(([t, v]) => [t, v.bytes]));
                const transformed = new Set(Object.entries(d.tables).filter(([, v]) => v.transformed).map(([t]) => t));
                fails = runTables(path, tables, transformed);
            }
        } catch (e) {
            fails.push(`container: ${errorDetail(e)}`);
        }
        out.fonts.cases.push(fails.length ? { case: path, ok: false, detail: fails.join('; ') } : { case: path, ok: true });
    }
    for (const [stem, tables] of tableSets) runTables(`${stem}.{${Object.keys(tables).sort().join(',')}}.bin`, tables);
    for (const [tag, n] of [...noParser].sort(([a], [b]) => (a < b ? -1 : 1))) {
        out.tables.skipped.push({ case: `table ${JSON.stringify(tag)}`, reason: `no parser in the package (${n} instance${n === 1 ? '' : 's'})` });
    }
    return out;
}
