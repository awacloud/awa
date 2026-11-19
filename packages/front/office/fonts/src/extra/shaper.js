// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview A generic OpenType layout engine (opt-in extra
 * `fontShaper`): text to positioned glyphs through the font's `GSUB` and
 * `GPOS` lookups.
 *
 * `shape(font, text, opts?)` takes a `fonts.read` result and a string:
 *
 *  1. **Characters to glyphs** through the cmap: a variation sequence
 *     (a base and a selector) maps through the format 14 subtable's
 *     non-default UVS, else to the base character's glyph; a lone selector
 *     maps to nothing. Each glyph's `cluster` is the index of the code
 *     point it comes from.
 *  2. **One script and one language system**: `opts.script` (an OpenType
 *     tag), else the script of the first character that has one in
 *     `SCRIPT_RANGES` (Latin, Greek, Cyrillic, Armenian, Georgian,
 *     Ethiopic, Cherokee); then `DFLT`, then `latn` when the font lacks
 *     it. The language system is `opts.language`'s, else the script's
 *     default one.
 *  3. **The features**: the language system's required feature and
 *     `rvrn`, `ccmp`, `locl`, `rlig`, `liga`, `clig`, `calt`; `opts.features`
 *     (`{ tag: boolean }`) turns one off or adds one.
 *  4. **The GSUB lookups of those features**, each once, in lookup-list
 *     order, each run over the whole glyph run (types 1 to 8: single,
 *     multiple, alternate — the first alternate — ligature, context and
 *     chaining context in their three formats with their nested lookups,
 *     extension, reverse chaining), honouring the lookup flags (ignore
 *     base glyphs, ligatures, marks; the mark attachment class; the mark
 *     filtering set) with GDEF's glyph and mark attachment classes and
 *     mark glyph sets.
 *  5. **Advances** from `hmtx`, then **the GPOS lookups** of `kern`,
 *     `mark`, `mkmk`, `curs`, `dist` and the required feature (its own
 *     script and language system, selected as for GSUB; `opts.features`
 *     acts on these too), in lookup-list order, types 1 to 9: single and
 *     pair adjustment (formats 1 and 2), cursive attachment, mark to base
 *     (the preceding glyph that is not a mark), mark to ligature (its last
 *     component), mark to mark (the preceding mark), context and chaining
 *     context positioning, extension — with the same lookup flags. Value
 *     records give x and y placements and advances; device tables and
 *     variations are not applied. A GDEF mark then takes no advance, and an
 *     attached glyph's offset is its anchor difference plus its base's
 *     offset, minus the advances from the base to it. `gpos` reads
 *     `'applied'`, or `'none'` when the font has no usable GPOS table.
 *
 * **AAT.** A font with a `morx` table that parses with a chain, and no
 * GSUB table (or with `opts.aat: true`), runs its chains instead of step 4
 * (`aatMorxEngine`: the default flags, then the AAT feature settings that
 * `opts.features` maps to through `AAT_FEATURES`), and `morx` reads
 * `'applied'`.
 *
 * **Positioning**, chosen as HarfBuzz chooses it: `kerx`
 * (`aatKerxEngine`) when the font has one that parses, unless GSUB ran and
 * the font has GPOS (or with `opts.aat: true`); else GPOS (step 5). Then,
 * when `kerx` was not applied and either GPOS was not or has no `kern`
 * feature: `kerx` if the font has it, else the `kern` table's horizontal
 * format 0 subtables. `kerx` and `kern` read `'applied'` or `'none'`;
 * `opts.features.kern === false` turns off their pair and state-machine
 * kerning. `opts.aat: false` never runs `morx` or `kerx`.
 *
 * **Variations.** `opts.coords` (user coordinates `{ tag: value }`, through
 * `varGlyph.normalise`) picks the GSUB and GPOS FeatureVariations record
 * whose conditions hold (its alternate feature tables replace theirs),
 * takes each glyph's advance at the coordinates from `varGlyph` (a `glyf`
 * or CFF2 font; else `hmtx`'s), and adds to a format 3 anchor the deltas
 * of its VariationIndex devices from GDEF's item variation store
 * (rounded). Value-record devices and ppem device tables are not applied.
 * Without `opts.coords` the default instance is shaped.
 *
 * **Direction.** `opts.direction` (`'ltr'` or `'rtl'`), else `'rtl'` when
 * the first character that is in `RTL_RANGES` (Hebrew, Arabic, Syriac,
 * Thaana, N'Ko) or `SCRIPT_RANGES` is in the former. It orders the morx
 * subtables' processing; the glyphs stay in logical order.
 *
 * Returns `{ glyphs, script, language, direction, features, gpos, morx, kerx, kern, truncated }`;
 * `glyphs` is `[{ glyph, cluster, xAdvance, yAdvance, xOffset, yOffset }]`
 * in font units, in logical order.
 *
 * Two guards keep a call finite: nested lookups stop 16 deep, and a call
 * runs at most `opts.budget` subtable applications (default 1,000,000).
 * Past either, no further lookup is applied and `truncated` is `true`. A
 * `GSUB` or `GDEF` table that does not parse is not applied (no
 * substitution), so a font the read accepts never makes the call throw.
 *
 * Strict factory-only fw descriptor, capture-free, worker-safe.
 *
 * @module fonts/extra/shaper
 */

import { fontErrors } from '../errors.js';
import { tableGsub } from '../table/gsub.js';
import { tableGpos } from '../table/gpos.js';
import { tableGdef } from '../table/gdef.js';
import { layoutClassDefinitions } from '../layout/classDefinitions.js';
import { aatMorx } from './apple-aat/morx.js';
import { aatMorxEngine } from './apple-aat/morx-engine.js';
import { aatKerx } from './apple-aat/kerx.js';
import { aatAnkr } from './apple-aat/ankr.js';
import { aatKerxEngine } from './apple-aat/kerx-engine.js';
import { tableKern } from '../table/kern.js';
import { varGlyph } from '../variable/glyph.js';
import { varItemStore } from '../variable/itemVariationStore.js';

export const fontShaper = {
    name: 'fontShaper',
    dependencies: ['fontErrors', 'tableGsub', 'tableGpos', 'tableGdef', 'layoutClassDefinitions', 'aatMorx', 'aatMorxEngine',
        'aatKerx', 'aatAnkr', 'aatKerxEngine', 'tableKern', 'varGlyph', 'varItemStore'],
    deps: [fontErrors, tableGsub, tableGpos, tableGdef, layoutClassDefinitions, aatMorx, aatMorxEngine,
        aatKerx, aatAnkr, aatKerxEngine, tableKern, varGlyph, varItemStore],

    factory(errors, gsubMod, gposMod, gdefMod, classDefs, morxMod, morxEngine, kerxMod, ankrMod, kerxEngine, kernMod, varGlyphMod, ivsMod) {
        const { ContractError } = errors;

        /** The default GSUB features, applied in lookup-list order with the required one. */
        const DEFAULT_FEATURES = ['rvrn', 'ccmp', 'locl', 'rlig', 'liga', 'clig', 'calt'];
        /** The default GPOS features. */
        const DEFAULT_POSITION_FEATURES = ['kern', 'mark', 'mkmk', 'curs', 'dist'];
        /** Deepest nesting of a context lookup's nested lookups. */
        const NESTING_MAX = 16;
        /** Default subtable applications per call (`opts.budget`). */
        const BUDGET_MAX = 1000000;

        /** Code-point ranges to OpenType script tags, for the scripts the generic engine shapes. */
        const SCRIPT_RANGES = [
            [0x0041, 0x005A, 'latn'], [0x0061, 0x007A, 'latn'], [0x00C0, 0x024F, 'latn'], [0x1E00, 0x1EFF, 'latn'],
            [0x2C60, 0x2C7F, 'latn'], [0xA720, 0xA7FF, 'latn'], [0xAB30, 0xAB6F, 'latn'], [0xFB00, 0xFB06, 'latn'],
            [0x0370, 0x03FF, 'grek'], [0x1F00, 0x1FFF, 'grek'],
            [0x0400, 0x052F, 'cyrl'], [0x1C80, 0x1C8F, 'cyrl'], [0x2DE0, 0x2DFF, 'cyrl'], [0xA640, 0xA69F, 'cyrl'],
            [0x0531, 0x058F, 'armn'], [0xFB13, 0xFB17, 'armn'],
            [0x10A0, 0x10FF, 'geor'], [0x1C90, 0x1CBF, 'geor'], [0x2D00, 0x2D2F, 'geor'],
            [0x1200, 0x139F, 'ethi'], [0x2D80, 0x2DDF, 'ethi'], [0xAB00, 0xAB2F, 'ethi'],
            [0x13A0, 0x13FF, 'cher'], [0xAB70, 0xABBF, 'cher']
        ];

        /**
         * OpenType feature tags to AAT feature settings (Apple's feature
         * registry): `[type, on, off]`, `off` null where the type has no
         * off setting of its own.
         */
        const AAT_FEATURES = Object.freeze({
            liga: [1, 2, 3], dlig: [1, 4, 5], hlig: [1, 20, 21], clig: [1, 18, 19],
            calt: [36, 0, 1], cswh: [36, 4, 5],
            case: [33, 0, 1], cpsp: [33, 2, 3],
            frac: [11, 2, 0], sups: [10, 1, 0], subs: [10, 2, 0],
            smcp: [37, 1, 0], c2sc: [38, 1, 0],
            zero: [14, 4, 5],
            onum: [21, 0, null], lnum: [21, 1, null], pnum: [6, 1, null], tnum: [6, 0, null]
        });
        /** The AAT feature types whose settings exclude each other. */
        const EXCLUSIVE_TYPES = new Set([6, 10, 11, 21, 37, 38]);

        /** `opts.features` as AAT `{ type, setting }` requests; an exclusive type keeps its last setting. */
        function aatFeatures(features) {
            const out = [];
            for (const [tag, on] of Object.entries(features || {})) {
                const m = AAT_FEATURES[tag];
                const setting = m ? (on ? m[1] : m[2]) : null;
                if (setting === null) continue;
                if (EXCLUSIVE_TYPES.has(m[0])) {
                    const k = out.findIndex((r) => r.type === m[0]);
                    if (k >= 0) out.splice(k, 1);
                }
                out.push({ type: m[0], setting });
            }
            return out;
        }

        /** Code-point ranges of the right-to-left scripts, for the text's direction. */
        const RTL_RANGES = [
            [0x0590, 0x05FF], [0xFB1D, 0xFB4F],
            [0x0600, 0x06FF], [0x0750, 0x077F], [0x0870, 0x08FF], [0xFB50, 0xFDFF], [0xFE70, 0xFEFF],
            [0x0700, 0x074F], [0x0780, 0x07BF], [0x07C0, 0x07FF]
        ];

        /** `'rtl'` when the first character with a known direction is right to left, else `'ltr'`. */
        function directionOf(cps) {
            for (const cp of cps) {
                if (RTL_RANGES.some(([lo, hi]) => cp >= lo && cp <= hi)) return 'rtl';
                if (SCRIPT_RANGES.some(([lo, hi]) => cp >= lo && cp <= hi)) return 'ltr';
            }
            return 'ltr';
        }

        /** GDEF glyph classes. */
        const BASE = 1, LIGATURE = 2, MARK = 3;

        const isVariationSelector = (cp) => (cp >= 0xFE00 && cp <= 0xFE0F) || (cp >= 0xE0100 && cp <= 0xE01EF);

        /** The script tag of the first code point `SCRIPT_RANGES` knows, else null. */
        function scriptOf(cps) {
            for (const cp of cps) {
                for (const [lo, hi, tag] of SCRIPT_RANGES) if (cp >= lo && cp <= hi) return tag;
            }
            return null;
        }

        const u16 = (b, o) => (o + 2 <= b.length ? (b[o] << 8) | b[o + 1] : 0);
        const u32 = (b, o) => (o + 4 <= b.length ? ((b[o] << 24) >>> 0) + ((b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) : 0);
        const tagAt = (b, o) => String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3]);

        /** A LangSys table: `{ required, featureIndices }` (`required` null when 0xFFFF). */
        function langSysAt(b, o) {
            const required = u16(b, o + 2);
            const count = u16(b, o + 4);
            const featureIndices = [];
            for (let i = 0; i < count; i++) featureIndices.push(u16(b, o + 6 + 2 * i));
            return { required: required === 0xFFFF ? null : required, featureIndices };
        }

        /** The raw ScriptList of a GSUB/GPOS table: `Map(tag → { defaultLangSys, langSys: Map(tag → langSys) })`. */
        function scriptList(b) {
            const out = new Map();
            const listOff = u16(b, 4);
            if (!listOff) return out;
            const count = u16(b, listOff);
            for (let i = 0; i < count; i++) {
                const rec = listOff + 2 + 6 * i;
                const tag = tagAt(b, rec);
                const sOff = listOff + u16(b, rec + 4);
                const defOff = u16(b, sOff);
                const langCount = u16(b, sOff + 2);
                const langSys = new Map();
                for (let k = 0; k < langCount; k++) {
                    const lr = sOff + 4 + 6 * k;
                    langSys.set(tagAt(b, lr), langSysAt(b, sOff + u16(b, lr + 4)));
                }
                out.set(tag, { defaultLangSys: defOff ? langSysAt(b, sOff + defOff) : null, langSys });
            }
            return out;
        }

        /** Each lookup's flag and mark filtering set, from the raw LookupList (the decoded one keeps neither of the latter). */
        function lookupHeaders(b) {
            const listOff = u16(b, 8);
            const out = [];
            if (!listOff) return out;
            const count = u16(b, listOff);
            for (let i = 0; i < count; i++) {
                const lo = listOff + u16(b, listOff + 2 + 2 * i);
                const flag = u16(b, lo + 2);
                const subCount = u16(b, lo + 4);
                out.push({ flag, markFilteringSet: (flag & 0x10) ? u16(b, lo + 6 + 2 * subCount) : null });
            }
            return out;
        }

        /** GDEF's mark glyph sets (MarkGlyphSetsDef format 1): an array of coverages. */
        function markGlyphSets(gdefBytes, gdef) {
            const off = gdef && gdef.markGlyphSetsDefOffset;
            if (!off || u16(gdefBytes, off) !== 1) return [];
            const count = u16(gdefBytes, off + 2);
            const sets = [];
            for (let i = 0; i < count; i++) {
                const cOff = off + u32(gdefBytes, off + 4 + 4 * i);
                try {
                    sets.push(classDefs.parseCoverage(gdefBytes.subarray(cOff)));
                } catch {
                    sets.push(null);
                }
            }
            return sets;
        }

        /** The glyphs of `cps` through the cmap, with their clusters (variation sequences as the module header says). */
        function mapCodePoints(font, cps) {
            const uvs = ((font.cmap && font.cmap.encodings) || []).map((r) => r.subtable).find((t) => t && t.format === 14);
            const out = [];
            for (let k = 0; k < cps.length; k++) {
                const cp = cps[k];
                const next = cps[k + 1];
                if (next !== undefined && isVariationSelector(next)) {
                    const rec = uvs && uvs.records && uvs.records.find((r) => r.varSelector === next);
                    const m = rec && rec.nonDefaultUVS && rec.nonDefaultUVS.find((x) => x.unicodeValue === cp);
                    out.push({ glyph: m ? m.glyphID : font.glyphIndexForCodePoint(cp), cluster: k });
                    k++;
                    continue;
                }
                if (isVariationSelector(cp)) continue;
                out.push({ glyph: font.glyphIndexForCodePoint(cp), cluster: k });
            }
            return out;
        }

        /** The typed options; a bad one throws `fonts/shaper-bad-option`. */
        function checkOpts(opts) {
            const o = opts || {};
            const bad = (key) => { throw new ContractError('fonts/shaper-bad-option', `shape: bad option ${key}`); };
            if (o.script !== undefined && !(typeof o.script === 'string' && /^[\x20-\x7E]{4}$/.test(o.script))) bad('script');
            if (o.language !== undefined && !(typeof o.language === 'string' && /^[\x20-\x7E]{4}$/.test(o.language))) bad('language');
            if (o.features !== undefined && (o.features === null || typeof o.features !== 'object' || Array.isArray(o.features)
                    || !Object.entries(o.features).every(([k, v]) => /^[\x20-\x7E]{4}$/.test(k) && typeof v === 'boolean'))) bad('features');
            if (o.budget !== undefined && !(Number.isSafeInteger(o.budget) && o.budget >= 1)) bad('budget');
            if (o.aat !== undefined && typeof o.aat !== 'boolean') bad('aat');
            if (o.direction !== undefined && o.direction !== 'ltr' && o.direction !== 'rtl') bad('direction');
            if (o.coords !== undefined && (o.coords === null || typeof o.coords !== 'object' || Array.isArray(o.coords)
                    || !Object.values(o.coords).every((v) => typeof v === 'number' && Number.isFinite(v)))) bad('coords');
            return o;
        }

        /**
         * Shape `text` with `font` (module header).
         *
         * @param {object} font A `fonts.read` result.
         * @param {string} text
         * @param {{script?: string, language?: string, features?: Object<string, boolean>, budget?: number, aat?: boolean, direction?: 'ltr'|'rtl', coords?: Object<string, number>}} [opts]
         * @returns {{glyphs: {glyph: number, cluster: number, xAdvance: number, yAdvance: number, xOffset: number, yOffset: number}[],
         *   script: string|null, language: string|null, direction: 'ltr'|'rtl', features: string[], gpos: 'applied'|'none', morx: 'applied'|'none',
         *   kerx: 'applied'|'none', kern: 'applied'|'none', truncated: boolean}}
         * @throws {ContractError} `fonts/shaper-bad-text` (not a string), `fonts/shaper-bad-option`.
         */
        function shape(font, text, opts) {
            if (typeof text !== 'string') throw new ContractError('fonts/shaper-bad-text', 'shape: text must be a string');
            const o = checkOpts(opts);
            const cps = [...text].map((ch) => ch.codePointAt(0));
            let buf = mapCodePoints(font, cps);
            const direction = o.direction || directionOf(cps);
            const state = { budget: o.budget !== undefined ? o.budget : BUDGET_MAX, truncated: false };
            const tables = (font.rawSfnt && font.rawSfnt.tables) || {};
            const parse = (tag, fn) => {
                const bytes = tables[tag] && tables[tag].bytes;
                if (!bytes) return null;
                try { return { bytes, table: fn(bytes) }; } catch { return null; }
            };
            const morxT = o.aat === false ? null : parse('morx', (bytes) => morxMod.parseMorx(bytes, { numGlyphs: font.numGlyphs }));
            const useMorx = !!(morxT && morxT.table.chains.length > 0 && (o.aat === true || !tables.GSUB));
            const gsub = useMorx ? null : parse('GSUB', gsubMod.parseGsub);
            const gposT = parse('GPOS', gposMod.parseGpos);
            const gdefT = parse('GDEF', gdefMod.parseGdef);
            const gdef = gdefT ? gdefT.table : null;
            const markSets = gdefT ? markGlyphSets(gdefT.bytes, gdef) : [];
            const features = [];
            let script = null, language = null;
            // The variation coordinates: normalised for the FeatureVariations and the stores.
            const vars = o.coords ? varGlyphMod.variations(font) : null;
            const norm = vars ? vars.normalise(o.coords) : null;
            if (useMorx) buf = morxEngine.applyMorx(morxT.table, buf, { features: aatFeatures(o.features), direction, state }).glyphs;
            if (gsub) {
                const sel = select(gsub, cps, o, DEFAULT_FEATURES, norm);
                ({ script, language } = sel);
                features.push(...sel.features);
                const ctx = { kind: 'GSUB', lookups: gsub.table.lookups, headers: lookupHeaders(gsub.bytes), gdef, markSets, state };
                for (const li of sel.lookups) {
                    if (state.truncated) break;
                    applyLookup(ctx, li, buf, 0);
                }
            }
            const advanceAt = (glyph) => {
                if (!vars) return font.advanceWidth(glyph);
                try { return vars.glyphAt(glyph, o.coords).advanceWidth; } catch { return font.advanceWidth(glyph); }
            };
            for (const g of buf) {
                g.xAdvance = advanceAt(g.glyph);
                g.yAdvance = 0;
                g.xOffset = 0;
                g.yOffset = 0;
                g.attach = null;
            }
            // The positioning choice (module header).
            const kerxT = o.aat === false ? null : parse('kerx', (bytes) => kerxMod.parseKerx(bytes, { numGlyphs: font.numGlyphs }));
            const hasKerx = !!(kerxT && kerxT.table.tables.length > 0);
            let applyKerx = hasKerx && (o.aat === true || !(gsub && gposT));
            const gpos = applyKerx ? null : gposT;
            const gposKern = !!(gpos && gpos.table.features.some((f) => f.tag === 'kern'));
            let kernT = null;
            if (!applyKerx && (!gposKern || !gpos)) {
                if (hasKerx) applyKerx = true;
                else kernT = parse('kern', kernMod.parseKern);
            }
            // kerx runs only without GPOS; the kern table after it.
            const useKerx = applyKerx && !gpos;
            const useKern = !!(kernT && kernT.table.tables.length > 0);
            const isMark = (glyph) => !!(gdef && gdef.glyphClassDef && gdef.glyphClassDef.lookup(glyph) === MARK);
            const kernOn = !(o.features && o.features.kern === false);
            if (gpos) {
                const sel = select(gpos, cps, o, DEFAULT_POSITION_FEATURES, norm);
                if (script === null) ({ script, language } = sel);
                features.push(...sel.features);
                let store = null;
                if (norm && gdef && gdef.itemVarStoreOffset) {
                    try { store = ivsMod.parseItemVariationStore(gdefT.bytes, gdef.itemVarStoreOffset); } catch { store = null; }
                }
                const vary = store ? (v) => Math.floor(store.delta(v.outer, v.inner, norm) + 0.5) : null;
                const ctx = { kind: 'GPOS', lookups: gpos.table.lookups, headers: lookupHeaders(gpos.bytes), gdef, markSets, state, vary };
                for (const li of sel.lookups) {
                    if (state.truncated) break;
                    applyLookup(ctx, li, buf, 0);
                }
            }
            if (useKerx) {
                const ankrT = parse('ankr', (bytes) => ankrMod.parseAnkr(bytes, { numGlyphs: font.numGlyphs }));
                const outline = font.glyphTable || null;
                kerxEngine.applyKerx(kerxT.table, buf, {
                    direction, isMark, kern: kernOn, state,
                    anchors: (glyph) => (ankrT ? ankrT.table.anchors(glyph) : []),
                    point(glyph, i) {
                        const e = outline && outline[glyph];
                        const pt = e && e.points && e.points[i];
                        return pt ? { x: pt.x, y: pt.y } : null;
                    }
                });
            } else if (useKern) {
                kerxEngine.applyKern(kernT.table, buf, { direction, isMark, kern: kernOn });
            }
            finishPositions(gpos ? gdef : null, buf, direction);
            const glyphs = buf.map((g) => ({
                glyph: g.glyph, cluster: g.cluster, xAdvance: g.xAdvance, yAdvance: g.yAdvance, xOffset: g.xOffset, yOffset: g.yOffset
            }));
            return {
                glyphs, script, language, direction, features: [...new Set(features)],
                gpos: gpos ? 'applied' : 'none', morx: useMorx ? 'applied' : 'none',
                kerx: useKerx ? 'applied' : 'none', kern: useKern ? 'applied' : 'none', truncated: state.truncated
            };
        }

        /**
         * A table's script, language system, enabled features and their
         * lookups (each once, in lookup-list order): `opts.script`, else the
         * text's script, then `DFLT`, then `latn`; `opts.language`, else the
         * default; `defaults` plus `opts.features`, and the required feature.
         * At normalised coordinates `norm`, the first FeatureVariations
         * record whose conditions hold replaces the feature tables it names.
         */
        function select(t, cps, o, defaults, norm) {
            const scripts = scriptList(t.bytes);
            let script = null, language = null;
            for (const tag of [o.script || scriptOf(cps), 'DFLT', 'latn']) {
                if (tag && scripts.has(tag)) { script = tag; break; }
            }
            const sc = script ? scripts.get(script) : null;
            let ls = sc ? sc.defaultLangSys : null;
            if (sc && o.language && sc.langSys.has(o.language)) { ls = sc.langSys.get(o.language); language = o.language; }
            const enabled = new Set(defaults);
            for (const [k, v] of Object.entries(o.features || {})) { if (v) enabled.add(k); else enabled.delete(k); }
            const features = [];
            const lookups = new Set();
            const alternates = norm ? featureVariation(t.bytes, norm) : null;
            const lookupsOf = (fi) => (alternates && alternates.has(fi) ? alternates.get(fi) : (t.table.features[fi].lookupListIndices || []));
            if (ls) {
                for (const fi of ls.featureIndices) {
                    const f = t.table.features[fi];
                    if (f && enabled.has(f.tag)) { features.push(f.tag); for (const li of lookupsOf(fi)) lookups.add(li); }
                }
                const req = ls.required !== null ? t.table.features[ls.required] : null;
                if (req) { features.push(req.tag); for (const li of lookupsOf(ls.required)) lookups.add(li); }
            }
            return { script, language, features, lookups: [...lookups].sort((x, y) => x - y) };
        }

        /**
         * The alternate lookups of the first FeatureVariations record (GSUB /
         * GPOS 1.1) whose condition set holds at `norm`: `Map(featureIndex →
         * lookup indices)`, or null.
         */
        function featureVariation(b, norm) {
            if (u16(b, 0) !== 1 || u16(b, 2) < 1 || b.length < 14) return null;
            const fv = u32(b, 10);
            if (!fv || fv + 8 > b.length) return null;
            const count = u32(b, fv + 4);
            for (let r = 0; r < count; r++) {
                const rec = fv + 8 + 8 * r;
                if (rec + 8 > b.length) return null;
                const cs = u32(b, rec), sub = u32(b, rec + 4);
                let holds = true;
                if (cs) {
                    const at = fv + cs;
                    const n = u16(b, at);
                    for (let k = 0; k < n && holds; k++) {
                        const c = at + u32(b, at + 2 + 4 * k);
                        if (u16(b, c) !== 1) { holds = false; break; }
                        const axis = u16(b, c + 2);
                        const f2 = (o) => ((u16(b, o) << 16) >> 16) / 16384;
                        const v = norm[axis] || 0;
                        if (v < f2(c + 4) || v > f2(c + 6)) holds = false;
                    }
                }
                if (!holds) continue;
                const out = new Map();
                if (!sub) return out;
                const st = fv + sub;
                const n = u16(b, st + 4);
                for (let k = 0; k < n; k++) {
                    const fi = u16(b, st + 6 + 6 * k);
                    const ft = st + u32(b, st + 8 + 6 * k);
                    const m = u16(b, ft + 2);
                    const list = [];
                    for (let q = 0; q < m; q++) list.push(u16(b, ft + 4 + 2 * q));
                    out.set(fi, list);
                }
                return out;
            }
            return null;
        }

        /**
         * After the GPOS lookups: a GDEF mark takes no advance, then every
         * attached glyph's offset adds its base's offset and, for a mark,
         * loses the advances from the base to it (left to right), or gains
         * those of the glyphs after the base up to it (right to left, as
         * HarfBuzz places a mark in a backward run).
         */
        function finishPositions(gdef, buf, direction) {
            const cd = gdef && gdef.glyphClassDef;
            for (const g of buf) if (cd && cd.lookup(g.glyph) === MARK) { g.xAdvance = 0; g.yAdvance = 0; }
            for (let i = 0; i < buf.length; i++) {
                const a = buf[i].attach;
                if (!a || a.to < 0 || a.to >= i) continue;
                const base = buf[a.to];
                buf[i].yOffset += base.yOffset;
                if (a.kind === 'mark') {
                    buf[i].xOffset += base.xOffset;
                    if (direction === 'rtl') for (let k = a.to + 1; k <= i; k++) buf[i].xOffset += buf[k].xAdvance;
                    else for (let k = a.to; k < i; k++) buf[i].xOffset -= buf[k].xAdvance;
                }
            }
        }

        /** Whether `glyph` is skipped under lookup `flag` (and its mark filtering set). */
        function skipped(ctx, header, glyph) {
            const gd = ctx.gdef;
            const cls = gd && gd.glyphClassDef ? gd.glyphClassDef.lookup(glyph) : 0;
            const flag = header.flag;
            if ((flag & 0x02) && cls === BASE) return true;
            if ((flag & 0x04) && cls === LIGATURE) return true;
            if (cls === MARK) {
                if (flag & 0x08) return true;
                if (flag & 0x10) {
                    const set = ctx.markSets[header.markFilteringSet];
                    return !(set && set.lookup(glyph) != null);
                }
                const attach = (flag >> 8) & 0xFF;
                if (attach) {
                    const mc = gd && gd.markAttachClassDef ? gd.markAttachClassDef.lookup(glyph) : 0;
                    if (mc !== attach) return true;
                }
            }
            return false;
        }

        /** The index of the next glyph after `i` that `header` does not skip, else -1. */
        function nextIndex(ctx, header, buf, i) {
            for (let k = i + 1; k < buf.length; k++) if (!skipped(ctx, header, buf[k].glyph)) return k;
            return -1;
        }
        function prevIndex(ctx, header, buf, i) {
            for (let k = i - 1; k >= 0; k--) if (!skipped(ctx, header, buf[k].glyph)) return k;
            return -1;
        }

        /** Spend one subtable application; false once the budget is spent. */
        function spend(ctx) {
            if (ctx.state.budget <= 0) { ctx.state.truncated = true; return false; }
            ctx.state.budget--;
            return true;
        }

        /** Run lookup `li` over `buf` (forward; type 8 backward). */
        function applyLookup(ctx, li, buf, depth) {
            const lookup = ctx.lookups[li];
            const header = ctx.headers[li] || { flag: lookup ? lookup.flag || 0 : 0, markFilteringSet: null };
            if (!lookup) return;
            const reverse = ctx.kind === 'GSUB' && effectiveType(ctx, lookup) === 8;
            if (reverse) {
                for (let i = buf.length - 1; i >= 0 && !ctx.state.truncated; i--) {
                    if (skipped(ctx, header, buf[i].glyph)) continue;
                    applyAt(ctx, li, header, buf, i, depth);
                }
                return;
            }
            let i = 0;
            while (i < buf.length && !ctx.state.truncated) {
                if (skipped(ctx, header, buf[i].glyph)) { i++; continue; }
                const r = applyAt(ctx, li, header, buf, i, depth);
                i = r === null ? i + 1 : r;
            }
        }

        /** The type a lookup's subtables apply as (an extension's wrapped type). */
        function effectiveType(ctx, lookup) {
            const s = lookup.subtables && lookup.subtables[0];
            const ext = ctx.kind === 'GSUB' ? 7 : 9;
            return lookup.type === ext && s && s.subtable ? s.extensionLookupType : lookup.type;
        }

        /**
         * Apply lookup `li` at `buf[i]`: the first subtable that applies.
         * Returns the index to continue from, or null when none applied.
         */
        function applyAt(ctx, li, header, buf, i, depth) {
            const lookup = ctx.lookups[li];
            for (let sub of lookup.subtables || []) {
                if (!sub || sub.parsed === false) continue;
                if (sub.type === (ctx.kind === 'GSUB' ? 7 : 9)) sub = sub.subtable;
                if (!sub || sub.parsed === false) continue;
                if (!spend(ctx)) return null;
                const r = ctx.kind === 'GSUB' ? applySubtable(ctx, sub, header, buf, i, depth) : applyPosition(ctx, sub, header, buf, i, depth);
                if (r !== null) return r;
            }
            return null;
        }

        /** Replace `buf[i]`'s glyph, keeping its cluster. */
        function setGlyph(buf, i, glyph) { buf[i] = { ...buf[i], glyph }; }

        /** One subtable at `buf[i]`: the index to continue from, or null when it does not apply. */
        function applySubtable(ctx, sub, header, buf, i, depth) {
            const g = buf[i].glyph;
            switch (sub.type) {
                case 1: {
                    const s = sub.substitute(g);
                    if (s == null) return null;
                    setGlyph(buf, i, s);
                    return i + 1;
                }
                case 2: {
                    const ci = sub.coverage.lookup(g);
                    if (ci == null) return null;
                    const seq = sub.sequences[ci] || [];
                    const cluster = buf[i].cluster;
                    buf.splice(i, 1, ...seq.map((glyph) => ({ glyph, cluster })));
                    return i + seq.length;
                }
                case 3: {
                    const ci = sub.coverage.lookup(g);
                    if (ci == null) return null;
                    const set = sub.alternateSets[ci] || [];
                    if (!set.length) return null;
                    setGlyph(buf, i, set[0]);
                    return i + 1;
                }
                case 4: return applyLigature(ctx, sub, header, buf, i);
                case 5: case 6: return applyContext(ctx, sub, header, buf, i, depth);
                case 8: return applyReverse(ctx, sub, header, buf, i);
                default: return null;
            }
        }

        function applyLigature(ctx, sub, header, buf, i) {
            const ci = sub.coverage.lookup(buf[i].glyph);
            if (ci == null) return null;
            for (const lig of sub.ligatureSets[ci] || []) {
                const positions = [];
                let k = i;
                let ok = true;
                for (const comp of lig.components) {
                    k = nextIndex(ctx, header, buf, k);
                    if (k < 0 || buf[k].glyph !== comp) { ok = false; break; }
                    positions.push(k);
                }
                if (!ok) continue;
                setGlyph(buf, i, lig.ligatureGlyph);
                for (let p = positions.length - 1; p >= 0; p--) buf.splice(positions[p], 1);
                return i + 1;
            }
            return null;
        }

        /**
         * Match `n` glyphs forward from `start` (excluded) with `test(k, glyph)`,
         * skipping what `header` skips: their indices, or null.
         */
        function matchForward(ctx, header, buf, start, n, test) {
            const out = [];
            let k = start;
            for (let j = 0; j < n; j++) {
                k = nextIndex(ctx, header, buf, k);
                if (k < 0 || !test(j, buf[k].glyph)) return null;
                out.push(k);
            }
            return out;
        }
        function matchBackward(ctx, header, buf, start, n, test) {
            let k = start;
            for (let j = 0; j < n; j++) {
                k = prevIndex(ctx, header, buf, k);
                if (k < 0 || !test(j, buf[k].glyph)) return false;
            }
            return true;
        }

        /** Context (type 5) and chaining context (type 6) substitution, formats 1 to 3. */
        function applyContext(ctx, sub, header, buf, i, depth) {
            const g = buf[i].glyph;
            const rules = [];
            const chain = sub.type === (ctx.kind === 'GSUB' ? 6 : 8);
            const recordsOf = (x) => x.substLookupRecords || x.posLookupRecords || [];
            if (sub.format === 1 || sub.format === 2) {
                const ci = sub.coverage.lookup(g);
                if (ci == null) return null;
                if (sub.format === 1) {
                    for (const r of sub.ruleSets[ci] || []) {
                        rules.push({
                            back: r.backtrack || [], input: r.input, ahead: r.lookahead || [], records: recordsOf(r),
                            eqBack: (j, x) => x === r.backtrack[j], eqIn: (j, x) => x === r.input[j], eqAhead: (j, x) => x === r.lookahead[j]
                        });
                    }
                } else {
                    const inDef = chain ? sub.inputClassDef : sub.classDef;
                    const cls = (def, x) => (def ? def.lookup(x) || 0 : 0);
                    for (const r of sub.classSets[cls(inDef, g)] || []) {
                        rules.push({
                            back: r.backtrack || [], input: r.input, ahead: r.lookahead || [], records: recordsOf(r),
                            eqBack: (j, x) => cls(sub.backtrackClassDef, x) === r.backtrack[j],
                            eqIn: (j, x) => cls(inDef, x) === r.input[j],
                            eqAhead: (j, x) => cls(sub.lookaheadClassDef, x) === r.lookahead[j]
                        });
                    }
                }
            } else if (sub.format === 3) {
                const inCovs = chain ? sub.inputCoverages : sub.coverages;
                if (!inCovs.length || inCovs[0].lookup(g) == null) return null;
                const back = chain ? sub.backtrackCoverages : [];
                const ahead = chain ? sub.lookaheadCoverages : [];
                rules.push({
                    back, input: inCovs.slice(1), ahead, records: recordsOf(sub),
                    eqBack: (j, x) => back[j].lookup(x) != null, eqIn: (j, x) => inCovs[j + 1].lookup(x) != null,
                    eqAhead: (j, x) => ahead[j].lookup(x) != null
                });
            } else return null;
            for (const r of rules) {
                const rest = matchForward(ctx, header, buf, i, r.input.length, r.eqIn);
                if (!rest) continue;
                const last = rest.length ? rest[rest.length - 1] : i;
                if (!matchForward(ctx, header, buf, last, r.ahead.length, r.eqAhead)) continue;
                if (!matchBackward(ctx, header, buf, i, r.back.length, r.eqBack)) continue;
                const positions = [i, ...rest];
                let end = last + 1;
                if (depth + 1 > NESTING_MAX) { ctx.state.truncated = true; return end; }
                for (const rec of r.records || []) {
                    const at = positions[rec.sequenceIndex];
                    if (at === undefined || at >= buf.length) continue;
                    const before = buf.length;
                    const nested = ctx.lookups[rec.lookupListIndex];
                    if (!nested) continue;
                    const nh = ctx.headers[rec.lookupListIndex] || { flag: 0, markFilteringSet: null };
                    applyAt(ctx, rec.lookupListIndex, nh, buf, at, depth + 1);
                    const delta = buf.length - before;
                    if (delta) {
                        for (let p = 0; p < positions.length; p++) if (positions[p] > at) positions[p] += delta;
                        end += delta;
                    }
                    if (ctx.state.truncated) break;
                }
                return Math.max(end, i + 1);
            }
            return null;
        }

        /** Add a GPOS value record to `g`: placements to its offsets, advances to its advances. */
        function addValue(g, v) {
            if (!v) return;
            g.xOffset += v.xPlacement || 0;
            g.yOffset += v.yPlacement || 0;
            g.xAdvance += v.xAdvance || 0;
            g.yAdvance += v.yAdvance || 0;
        }

        /** Whether `buf[k]` is a GDEF mark. */
        function isMark(ctx, glyph) {
            const cd = ctx.gdef && ctx.gdef.glyphClassDef;
            return !!(cd && cd.lookup(glyph) === MARK);
        }

        /** Attach `buf[i]` to `buf[to]` by an anchor difference (its offset finished by `finishPositions`). */
        /** An anchor's x and y, with its VariationIndex deltas at the coordinates (`ctx.vary`). */
        const ax = (ctx, a) => a.xCoordinate + (ctx.vary && a.xVariation ? ctx.vary(a.xVariation) : 0);
        const ay = (ctx, a) => a.yCoordinate + (ctx.vary && a.yVariation ? ctx.vary(a.yVariation) : 0);

        function attach(buf, i, to, dx, dy) {
            buf[i].xOffset = dx;
            buf[i].yOffset = dy;
            buf[i].attach = { to, kind: 'mark' };
        }

        /** One GPOS subtable at `buf[i]`: the index to continue from, or null when it does not apply. */
        function applyPosition(ctx, sub, header, buf, i, depth) {
            const g = buf[i].glyph;
            switch (sub.type) {
                case 1: {
                    const v = sub.adjust(g);
                    if (v === null || v === undefined) return null;
                    addValue(buf[i], v);
                    return i + 1;
                }
                case 2: {
                    if (sub.coverage.lookup(g) == null) return null;
                    const j = nextIndex(ctx, header, buf, i);
                    if (j < 0) return null;
                    const pair = sub.kern(g, buf[j].glyph);
                    if (!pair) return null;
                    addValue(buf[i], pair.value1);
                    addValue(buf[j], pair.value2);
                    return pair.value2 ? j + 1 : j;
                }
                case 3: {
                    const rec = sub.anchorsFor(g);
                    if (!rec || !rec.exitAnchor) return null;
                    const j = nextIndex(ctx, header, buf, i);
                    if (j < 0) return null;
                    const next = sub.anchorsFor(buf[j].glyph);
                    if (!next || !next.entryAnchor) return null;
                    const exit = rec.exitAnchor, entry = next.entryAnchor;
                    buf[i].xAdvance = ax(ctx, exit) + buf[i].xOffset;
                    const d = ax(ctx, entry) + buf[j].xOffset;
                    buf[j].xAdvance -= d;
                    buf[j].xOffset -= d;
                    buf[j].yOffset = ay(ctx, exit) - ay(ctx, entry);
                    buf[j].attach = { to: i, kind: 'cursive' };
                    return j;
                }
                case 4: case 5: {
                    const mci = sub.markCoverage.lookup(g);
                    if (mci == null) return null;
                    let k = i - 1;
                    while (k >= 0 && isMark(ctx, buf[k].glyph)) k--;
                    if (k < 0) return null;
                    const mark = sub.markArray[mci];
                    let anchor;
                    if (sub.type === 4) {
                        const bci = sub.baseCoverage.lookup(buf[k].glyph);
                        if (bci == null) return null;
                        anchor = (sub.baseArray[bci] || [])[mark.markClass] || null;
                    } else {
                        const lci = sub.ligatureCoverage.lookup(buf[k].glyph);
                        if (lci == null) return null;
                        const comps = sub.ligatureArray[lci] || [];
                        anchor = comps.length ? (comps[comps.length - 1][mark.markClass] || null) : null;
                    }
                    if (!anchor || !mark.anchor) return null;
                    attach(buf, i, k, ax(ctx, anchor) - ax(ctx, mark.anchor), ay(ctx, anchor) - ay(ctx, mark.anchor));
                    return i + 1;
                }
                case 6: {
                    const mci = sub.mark1Coverage.lookup(g);
                    if (mci == null) return null;
                    const k = prevIndex(ctx, header, buf, i);
                    if (k < 0 || !isMark(ctx, buf[k].glyph)) return null;
                    const m2 = sub.mark2Coverage.lookup(buf[k].glyph);
                    if (m2 == null) return null;
                    const mark = sub.mark1Array[mci];
                    const anchor = (sub.mark2Array[m2] || [])[mark.markClass] || null;
                    if (!anchor || !mark.anchor) return null;
                    attach(buf, i, k, ax(ctx, anchor) - ax(ctx, mark.anchor), ay(ctx, anchor) - ay(ctx, mark.anchor));
                    return i + 1;
                }
                case 7: case 8: return applyContext(ctx, sub, header, buf, i, depth);
                default: return null;
            }
        }

        /** Reverse chaining contextual single substitution (type 8), at `buf[i]`. */
        function applyReverse(ctx, sub, header, buf, i) {
            const ci = sub.coverage.lookup(buf[i].glyph);
            if (ci == null) return null;
            if (!matchBackward(ctx, header, buf, i, sub.backtrackCoverages.length, (j, x) => sub.backtrackCoverages[j].lookup(x) != null)) return null;
            if (!matchForward(ctx, header, buf, i, sub.lookaheadCoverages.length, (j, x) => sub.lookaheadCoverages[j].lookup(x) != null)) return null;
            if (sub.substitutes[ci] === undefined) return null;
            setGlyph(buf, i, sub.substitutes[ci]);
            return i - 1;
        }

        return { shape, DEFAULT_FEATURES, DEFAULT_POSITION_FEATURES, AAT_FEATURES, NESTING_MAX, BUDGET_MAX, SCRIPT_RANGES, RTL_RANGES };
    }
};
