// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview A name-keyed CFF font program subset to a glyph set, for
 * `subsetForPdf`'s `{ cff: true }` (Adobe TN 5176, the Compact Font
 * Format).
 *
 * - `encodeDict(entries, fixed?)` writes a DICT: integers in their
 *   shortest form, reals as nibbles; the operators of `fixed` get 5-byte
 *   integers (operator 29), so an offset can be filled in after layout.
 * - `writeIndex(items)` writes an INDEX with the smallest offset size.
 * - `cffClosure(parsed, gids)` adds to `gids` the base and accent glyphs
 *   of every `seac` among them (by their Standard Encoding names, through
 *   the charset's glyph names).
 * - `subsetCff(parsed, keptGids)` writes the subset:
 *   - the header, the Name INDEX, the String INDEX and the Global Subr
 *     INDEX are kept;
 *   - the Top DICT is kept but for `charset`, `Encoding` (dropped: the
 *     font's `cmap` maps), `CharStrings` and `Private`;
 *   - a format 0 charset of the kept glyphs' SIDs;
 *   - the kept CharStrings byte for byte;
 *   - the Private DICT with its `Subrs` offset rewritten, and the Local
 *     Subr INDEX, kept whole.
 *
 *   The subroutines are not subset, so a kept charstring runs unchanged.
 *   `keptGids[i]` becomes glyph `i`.
 *
 * Package-private helper for {@link ../subsetForPdf.js}.
 *
 * @module fonts/embed-pdf/subsetForPdf/cff-subset
 */

import { fontErrors } from '../../errors.js';
import { tableCff } from '../../table/cff.js';
import { encodingStandard } from '../../encodings/standard.js';

export const embedCffSubset = {
    name: 'embedCffSubset',
    dependencies: ['fontErrors', 'tableCff', 'encodingStandard'],
    deps: [fontErrors, tableCff, encodingStandard],
    factory(errors, cffMod, standard) {
        const { ContractError } = errors;
        const { decodeCharstring, privateForGlyph } = cffMod;
        const STANDARD = standard.STANDARD;

        // DICT operators (TN 5176 Tables 9, 10 and 23).
        const OP_CHARSET = 15;
        const OP_ENCODING = 16;
        const OP_CHARSTRINGS = 17;
        const OP_PRIVATE = 18;
        const OP_SUBRS = 19;
        const OP_DEFAULT_WIDTH = 20;
        const OP_NOMINAL_WIDTH = 21;

        /** The bytes of one DICT integer, `fixed` the 5-byte form. */
        function intBytes(v, fixed) {
            if (!fixed) {
                if (v >= -107 && v <= 107) return [v + 139];
                if (v >= 108 && v <= 1131) { const w = v - 108; return [(w >> 8) + 247, w & 0xFF]; }
                if (v >= -1131 && v <= -108) { const w = -v - 108; return [(w >> 8) + 251, w & 0xFF]; }
                if (v >= -32768 && v <= 32767) return [28, (v >> 8) & 0xFF, v & 0xFF];
            }
            return [29, (v >>> 24) & 0xFF, (v >>> 16) & 0xFF, (v >>> 8) & 0xFF, v & 0xFF];
        }

        /** The bytes of one DICT real: its decimal nibbles, `0xF` ending. */
        function realBytes(v) {
            let s = String(v).toUpperCase();
            const nib = [];
            for (let i = 0; i < s.length; i++) {
                const c = s[i];
                if (c >= '0' && c <= '9') nib.push(c.charCodeAt(0) - 48);
                else if (c === '.') nib.push(0xA);
                else if (c === '-') nib.push(0xE);
                else if (c === 'E') {
                    if (s[i + 1] === '-') { nib.push(0xC); i++; } else { nib.push(0xB); if (s[i + 1] === '+') i++; }
                }
            }
            nib.push(0xF);
            if (nib.length % 2) nib.push(0xF);
            const out = [30];
            for (let i = 0; i < nib.length; i += 2) out.push((nib[i] << 4) | nib[i + 1]);
            return out;
        }

        /**
         * Write a DICT from `entries` (`[operator, operands]` pairs, or a
         * `Map`, in order); the operands of an operator in `fixed` are
         * 5-byte integers.
         * @param {Iterable<[number, number[]]>} entries
         * @param {Set<number>} [fixed]
         * @returns {Uint8Array}
         */
        function encodeDict(entries, fixed) {
            const out = [];
            for (const [op, operands] of entries) {
                const f = !!(fixed && fixed.has(op));
                for (const v of operands) {
                    if (Number.isInteger(v) && (f || (v >= -2147483648 && v <= 2147483647))) out.push(...intBytes(v, f));
                    else if (Number.isFinite(v) && !f) out.push(...realBytes(v));
                    else throw new ContractError('fonts/cff-dict-bad-operand', 'a CFF DICT operand must be a finite number (an integer for a fixed one)', { context: { op, value: v } });
                }
                if (op >= 0x0C00) out.push(12, op & 0xFF); else out.push(op);
            }
            return Uint8Array.from(out);
        }

        /**
         * Write an INDEX of `items` (count, offset size, offsets, data).
         * @param {Uint8Array[]} items
         * @returns {Uint8Array}
         */
        function writeIndex(items) {
            if (items.length === 0) return new Uint8Array([0, 0]);
            const dataLength = items.reduce((n, it) => n + it.length, 0);
            const last = dataLength + 1;
            const offSize = last < 0x100 ? 1 : last < 0x10000 ? 2 : last < 0x1000000 ? 3 : 4;
            const out = new Uint8Array(3 + (items.length + 1) * offSize + dataLength);
            out[0] = items.length >> 8; out[1] = items.length & 0xFF; out[2] = offSize;
            let p = 3;
            let off = 1;
            const putOff = (v) => { for (let k = offSize - 1; k >= 0; k--) out[p++] = (v >>> (8 * k)) & 0xFF; };
            putOff(off);
            for (const it of items) { off += it.length; putOff(off); }
            for (const it of items) { out.set(it, p); p += it.length; }
            return out;
        }

        /** The charstring decode context of glyph `gid` of `font`. */
        function csContext(parsed, font, gid) {
            const { privateDict, localSubrIndex } = privateForGlyph(font, gid);
            const num = (op, d) => { const v = privateDict && privateDict.get(op); return v && v.length ? v[0] : d; };
            return {
                globalSubrs: parsed.globalSubrIndex ? parsed.globalSubrIndex.items : [],
                localSubrs: localSubrIndex ? localSubrIndex.items : [],
                nominalWidthX: num(OP_NOMINAL_WIDTH, 0), defaultWidthX: num(OP_DEFAULT_WIDTH, 0)
            };
        }

        /**
         * `gids` with the base and accent glyphs of every `seac` glyph
         * among them, found by their Standard Encoding names in the glyph
         * names. A charstring that does not decode adds nothing.
         * @param {object} parsed `tableCff.parseCff` of the font program
         * @param {Set<number>} gids
         * @returns {Set<number>}
         */
        function cffClosure(parsed, gids) {
            const font = parsed.fonts[0];
            const out = new Set(gids);
            const byName = new Map((font.glyphNames || []).map((n, g) => [n, g]));
            for (const gid of gids) {
                const cs = font.charStringsIndex.items[gid];
                if (!cs) continue;
                let seac;
                try { seac = decodeCharstring(cs, csContext(parsed, font, gid)).seac; } catch (_e) { seac = undefined; }
                if (!seac) continue;
                for (const code of [seac.bchar, seac.achar]) {
                    const g = byName.get(STANDARD[code & 0xFF]);
                    if (g !== undefined) out.add(g);
                }
            }
            return out;
        }

        /** True for a font program `subsetCff` takes: one name-keyed font (no ROS), its CharStrings and charset read. */
        function isNameKeyed(parsed) {
            if (!parsed || parsed.fonts.length !== 1) return false;
            const f = parsed.fonts[0];
            return !f.topDict.has(0x0C1E) && !!f.charStringsIndex && !!f.charset;
        }

        /**
         * The subset CFF of `parsed`'s font: `keptGids[i]` becomes glyph `i`
         * (`keptGids[0]` must be 0, `.notdef`).
         * @param {object} parsed `tableCff.parseCff` of the font program
         * @param {Uint8Array} bytes the font program
         * @param {number[]} keptGids
         * @returns {Uint8Array}
         */
        function subsetCff(parsed, bytes, keptGids) {
            if (!isNameKeyed(parsed) || keptGids[0] !== 0) {
                throw new ContractError('fonts/subset-bad-font', 'subsetCff takes one name-keyed CFF font, .notdef first', {});
            }
            const font = parsed.fonts[0];
            // Header: the source's version, a 4-byte header, 4-byte offsets.
            const header = new Uint8Array([bytes[0], bytes[1], 4, 4]);
            const nameIndex = writeIndex(parsed.nameIndex.items);
            const stringIndex = writeIndex(parsed.stringIndex.items);
            const gsubrIndex = writeIndex(parsed.globalSubrIndex.items);

            // charset format 0: the SIDs of glyphs 1..n-1.
            const charset = new Uint8Array(1 + 2 * (keptGids.length - 1));
            for (let i = 1; i < keptGids.length; i++) {
                const sid = font.charset[keptGids[i]];
                charset[2 * i - 1] = sid >> 8; charset[2 * i] = sid & 0xFF;
            }
            const charStrings = writeIndex(keptGids.map((g) => font.charStringsIndex.items[g]));

            // The Private DICT, its Subrs right after it, then the Local Subr INDEX.
            let privateBytes = new Uint8Array(0);
            let localSubrs = new Uint8Array(0);
            if (font.privateDict) {
                const entries = [...font.privateDict].filter(([op]) => op !== OP_SUBRS);
                if (font.localSubrIndex && font.localSubrIndex.count > 0) {
                    localSubrs = writeIndex(font.localSubrIndex.items);
                    const size = encodeDict([...entries, [OP_SUBRS, [0]]], new Set([OP_SUBRS])).length;
                    entries.push([OP_SUBRS, [size]]);
                }
                privateBytes = encodeDict(entries, new Set([OP_SUBRS]));
            }

            // Top DICT: its own entries, then the four offsets (5-byte, filled after layout).
            const kept = [...font.topDict].filter(([op]) => op !== OP_CHARSET && op !== OP_ENCODING
                && op !== OP_CHARSTRINGS && op !== OP_PRIVATE);
            const FIXED = new Set([OP_CHARSET, OP_CHARSTRINGS, OP_PRIVATE]);
            const top = (charsetAt, csAt, privAt) => encodeDict([...kept,
                [OP_CHARSET, [charsetAt]], [OP_CHARSTRINGS, [csAt]],
                ...(font.privateDict ? [[OP_PRIVATE, [privateBytes.length, privAt]]] : [])], FIXED);
            const topIndexLength = writeIndex([top(0, 0, 0)]).length;
            const charsetAt = header.length + nameIndex.length + topIndexLength + stringIndex.length + gsubrIndex.length;
            const csAt = charsetAt + charset.length;
            const privAt = csAt + charStrings.length;
            const topIndex = writeIndex([top(charsetAt, csAt, privAt)]);

            const parts = [header, nameIndex, topIndex, stringIndex, gsubrIndex, charset, charStrings, privateBytes, localSubrs];
            const out = new Uint8Array(parts.reduce((n, x) => n + x.length, 0));
            let at = 0;
            for (const x of parts) { out.set(x, at); at += x.length; }
            return out;
        }

        // CID-keyed CFF (TN 5176 §18) and CFF2 → CFF (a static default instance).
        const OP_ROS = 0x0C1E;
        const OP_CIDCOUNT = 0x0C22;
        const OP_FONTMATRIX = 0x0C07;
        const OP_FONTBBOX = 5;
        const OP_FDARRAY = 0x0C24;
        const OP_FDSELECT = 0x0C25;
        const OP_VSINDEX_DICT = 22;
        const OP_BLEND_DICT = 23;
        // The Type 2 argument stack (TN 5177 Appendix B).
        const MAX_ARGS = 48;

        /** True for a font program `subsetCidCff` takes: one CID-keyed font, its FDArray, FDSelect, CharStrings and charset read. */
        function isCidKeyed(parsed) {
            if (!parsed || parsed.fonts.length !== 1) return false;
            const f = parsed.fonts[0];
            return f.topDict.has(OP_ROS) && !!f.charStringsIndex && !!f.charset && !!f.fdArray && !!f.fdSelect;
        }

        /** One DICT or charstring number at `i`: `[value, next]` (`real` reads DICT reals, else 255 is 16.16 fixed). */
        function numberAt(bytes, i, real) {
            const b0 = bytes[i];
            if (b0 >= 32 && b0 <= 246) return [b0 - 139, i + 1];
            if (b0 >= 247 && b0 <= 250) return [(b0 - 247) * 256 + bytes[i + 1] + 108, i + 2];
            if (b0 >= 251 && b0 <= 254) return [-((b0 - 251) * 256 + bytes[i + 1] + 108), i + 2];
            if (b0 === 28) return [((bytes[i + 1] << 24) >> 16) | bytes[i + 2], i + 3];
            if (b0 === 29 && real) return [((bytes[i + 1] << 24) | (bytes[i + 2] << 16) | (bytes[i + 3] << 8) | bytes[i + 4]) | 0, i + 5];
            if (b0 === 255 && !real) return [(((bytes[i + 1] << 24) | (bytes[i + 2] << 16) | (bytes[i + 3] << 8) | bytes[i + 4]) | 0) / 65536, i + 5];
            if (b0 === 30 && real) {
                let s = '';
                let j = i + 1;
                for (;;) {
                    const byte = bytes[j++];
                    const hi = byte >>> 4;
                    const lo = byte & 0xF;
                    let end = false;
                    for (const nb of [hi, lo]) {
                        if (nb === 0xF) { end = true; break; }
                        s += nb <= 9 ? String(nb) : nb === 0xA ? '.' : nb === 0xB ? 'E' : nb === 0xC ? 'E-' : nb === 0xE ? '-' : '';
                    }
                    if (end || j >= bytes.length) break;
                }
                return [parseFloat(s), j];
            }
            throw new ContractError('fonts/cff2-bad-number', `unexpected number byte ${b0} at ${i}`, { context: { at: i, byte: b0 } });
        }

        /**
         * A CFF2 DICT's entries at the default instance: each `blend` (23)
         * keeps its n default operands and drops their n × k deltas (k the
         * region count of the current `vsindex`, 22, itself dropped);
         * `Subrs` (19) is dropped (a converted charstring calls no
         * subroutine).
         * @param {Uint8Array} bytes
         * @param {number[]} regionCounts
         * @returns {[number, number[]][]}
         */
        function evalCff2Dict(bytes, regionCounts) {
            const out = [];
            let stack = [];
            let k = regionCounts[0] ?? 0;
            let i = 0;
            while (i < bytes.length) {
                const b0 = bytes[i];
                if (b0 <= 24) {
                    const op = b0 === 12 ? 0x0C00 | bytes[i + 1] : b0;
                    i += b0 === 12 ? 2 : 1;
                    if (op === OP_VSINDEX_DICT) { k = regionCounts[stack.pop()] ?? 0; stack = []; continue; }
                    if (op === OP_BLEND_DICT) { const nb = stack.pop(); stack.length -= nb * k; continue; }
                    if (op !== OP_SUBRS) out.push([op, stack]);
                    stack = [];
                    continue;
                }
                const [v, next] = numberAt(bytes, i, true);
                stack.push(v);
                i = next;
            }
            return out;
        }

        /** The bytes of one charstring number: an integer in its shortest form, else 16.16 fixed. */
        function csNumber(v) {
            if (Number.isInteger(v) && v >= -32768 && v <= 32767) {
                if (v >= -107 && v <= 107) return [v + 139];
                if (v >= 108 && v <= 1131) { const w = v - 108; return [(w >> 8) + 247, w & 0xFF]; }
                if (v >= -1131 && v <= -108) { const w = -v - 108; return [(w >> 8) + 251, w & 0xFF]; }
                return [28, (v >> 8) & 0xFF, v & 0xFF];
            }
            const f = Math.round(v * 65536) | 0;
            return [255, (f >>> 24) & 0xFF, (f >>> 16) & 0xFF, (f >>> 8) & 0xFF, f & 0xFF];
        }

        // Operators a width may precede (the first stack-clearing one).
        const WIDTH_OPS = new Set([1, 3, 18, 23, 19, 20, 21, 22, 4, 14]);
        const HINT_OPS = new Set([1, 3, 18, 23]);

        /**
         * `op` with `args` as one or more operators of the same meaning,
         * none over `limit` operands (`first` the limit of the first one,
         * which may carry the width): `[op, args][]`.
         */
        function splitOp(op, args, first) {
            if (args.length <= first) return [[op, args]];
            // An operator's operand groups: [group size, a leading odd one, a trailing extra one].
            const take = (unit, lead, trail) => {
                const out = [];
                let rest = args.slice();
                let limit = first;
                let leading = lead && rest.length % unit === 1 ? 1 : 0;
                while (rest.length > limit) {
                    let n = Math.floor((limit - leading) / unit) * unit + leading;
                    // Never leave a lone trailing operand to an operator of its own.
                    if (trail && rest.length - n < unit) n -= unit;
                    out.push([op, rest.slice(0, n)]);
                    rest = rest.slice(n);
                    limit = MAX_ARGS;
                    leading = 0;
                }
                out.push([op, rest]);
                return out;
            };
            switch (op) {
                case 5: return take(2, false, false);                 // rlineto
                case 8: return take(6, false, false);                 // rrcurveto
                case 6: case 7: return take(2, false, false);         // hlineto / vlineto: pairs keep the alternation
                case 30: case 31: return take(8, false, true);        // vhcurveto / hvcurveto: two groups keep it
                case 26: case 27: return take(4, true, false);        // vvcurveto / hhcurveto: the odd one leads
                case 24: {                                            // rcurveline: curves, then a line
                    return [...splitOp(8, args.slice(0, -2), first), [5, args.slice(-2)]];
                }
                case 25: {                                            // rlinecurve: lines, then a curve
                    return [...splitOp(5, args.slice(0, -6), first), [8, args.slice(-6)]];
                }
                default:
                    throw new ContractError('fonts/cff2-cs-long-operator',
                        `a converted charstring operator ${op} has ${args.length} operands, over the Type 2 limit`, { context: { op, operands: args.length } });
            }
        }

        /**
         * A CFF2 charstring as a CFF (Type 2) one at the default instance:
         * its subroutines inlined, `blend` evaluated (the default operands
         * kept), `vsindex` dropped, `width` before the first stack-clearing
         * operator, `endchar` at the end, and an operator over the Type 2
         * operand limit split into operators of the same meaning.
         * @param {Uint8Array} bytes
         * @param {{ globalSubrs: Uint8Array[], localSubrs: Uint8Array[], regionCounts: number[], vsindex?: number, width: number }} ctx
         * @returns {Uint8Array}
         */
        function convertCff2Charstring(bytes, ctx) {
            const gBias = cffMod.subrBias(ctx.globalSubrs.length);
            const lBias = cffMod.subrBias(ctx.localSubrs.length);
            const out = [];
            const stack = [];
            let k = ctx.regionCounts[ctx.vsindex || 0] ?? 0;
            let hintCount = 0;
            let widthDone = false;
            let ended = false;
            const emit = (op, args) => {
                let first = MAX_ARGS;
                let a = args;
                if (!widthDone && WIDTH_OPS.has(op)) { first = MAX_ARGS - 1; }
                if ((HINT_OPS.has(op) || op === 19 || op === 20) && a.length > first) {
                    // Stem hints are not split (their edges run on across one operator).
                    throw new ContractError('fonts/cff2-cs-long-stems',
                        `a converted charstring declares ${a.length >> 1} stems in one operator, over the Type 2 limit`, { context: { op, operands: a.length } });
                }
                const parts = HINT_OPS.has(op) || op === 19 || op === 20 ? [[op, a]] : splitOp(op, a, first);
                parts.forEach(([o, p], idx) => {
                    if (idx === 0 && !widthDone && WIDTH_OPS.has(op)) { p = [ctx.width, ...p]; widthDone = true; }
                    for (const v of p) out.push(...csNumber(v));
                    if (o >= 0x0C00) out.push(12, o & 0xFF); else out.push(o);
                });
            };
            const run = (stream, depth) => {
                if (depth > 10) throw new ContractError('fonts/cff2-cs-depth', 'CFF2 charstring subroutines nest too deep', { context: { depth } });
                let i = 0;
                while (i < stream.length && !ended) {
                    const b0 = stream[i];
                    if (b0 >= 32 || b0 === 28 || b0 === 255) {
                        const [v, next] = numberAt(stream, i, false);
                        stack.push(v);
                        i = next;
                        continue;
                    }
                    i++;
                    const op = b0 === 12 ? 0x0C00 | stream[i++] : b0;
                    if (op === 10 || op === 29) {
                        const subrs = op === 10 ? ctx.localSubrs : ctx.globalSubrs;
                        const sub = subrs[stack.pop() + (op === 10 ? lBias : gBias)];
                        if (!sub) throw new ContractError('fonts/cff2-cs-bad-subr', 'a CFF2 charstring calls a missing subroutine', {});
                        run(sub, depth + 1);
                        continue;
                    }
                    if (op === 11) return;
                    if (op === 15) { k = ctx.regionCounts[stack.pop()] ?? 0; stack.length = 0; continue; }
                    if (op === 16) { const nb = stack.pop(); stack.length -= nb * k; continue; }
                    if (op === 14) { ended = true; return; }
                    if (HINT_OPS.has(op)) hintCount += stack.length >> 1;
                    if (op === 19 || op === 20) {
                        hintCount += stack.length >> 1;
                        emit(op, stack.splice(0));
                        const maskBytes = Math.ceil(hintCount / 8);
                        for (let m = 0; m < maskBytes; m++) out.push(stream[i + m]);
                        i += maskBytes;
                        continue;
                    }
                    emit(op, stack.splice(0));
                }
            };
            run(bytes, 0);
            if (!widthDone) out.push(...csNumber(ctx.width));
            out.push(14);
            return Uint8Array.from(out);
        }

        /**
         * A CID-keyed CFF program: `spec.top` (ROS first) and the offsets of
         * the charset, CharStrings, FDArray and FDSelect; the String INDEX
         * `spec.strings`; the Global Subr INDEX `spec.gsubrs`; a format 0
         * charset of `spec.cids`; a format 3 FDSelect of `spec.fdOf`; the
         * CharStrings; the FDArray of `spec.fds` (each Font DICT naming its
         * Private DICT, each Private DICT followed by its local Subr INDEX).
         */
        function writeCidCff(spec) {
            const header = new Uint8Array([1, 0, 4, 4]);
            const nameIndex = writeIndex([spec.name]);
            const stringIndex = writeIndex(spec.strings);
            const gsubrIndex = writeIndex(spec.gsubrs);
            const n = spec.cids.length;
            const charset = new Uint8Array(1 + 2 * (n - 1));
            for (let i = 1; i < n; i++) { charset[2 * i - 1] = spec.cids[i] >> 8; charset[2 * i] = spec.cids[i] & 0xFF; }
            const ranges = [];
            for (let i = 0; i < n; i++) if (i === 0 || spec.fdOf[i] !== spec.fdOf[i - 1]) ranges.push([i, spec.fdOf[i]]);
            const fdSelect = new Uint8Array(1 + 2 + 3 * ranges.length + 2);
            fdSelect[0] = 3; fdSelect[1] = ranges.length >> 8; fdSelect[2] = ranges.length & 0xFF;
            ranges.forEach(([g, fd], r) => { fdSelect[3 + 3 * r] = g >> 8; fdSelect[4 + 3 * r] = g & 0xFF; fdSelect[5 + 3 * r] = fd; });
            fdSelect[fdSelect.length - 2] = n >> 8; fdSelect[fdSelect.length - 1] = n & 0xFF;
            const charStrings = writeIndex(spec.charStrings);
            // Each FD's Private DICT (Subrs right after it) and local subroutines.
            const privs = spec.fds.map((fd) => {
                const entries = fd.privateEntries.filter(([op]) => op !== OP_SUBRS);
                let subrs = new Uint8Array(0);
                if (fd.localSubrs && fd.localSubrs.length) {
                    subrs = writeIndex(fd.localSubrs);
                    entries.push([OP_SUBRS, [encodeDict([...entries, [OP_SUBRS, [0]]], new Set([OP_SUBRS])).length]]);
                }
                return { bytes: encodeDict(entries, new Set([OP_SUBRS])), subrs };
            });
            const FIXED = new Set([OP_CHARSET, OP_CHARSTRINGS, OP_FDARRAY, OP_FDSELECT, OP_PRIVATE]);
            const fontDicts = (at) => spec.fds.map((fd, i) => encodeDict([...fd.fontDictEntries.filter(([op]) => op !== OP_PRIVATE),
                [OP_PRIVATE, [privs[i].bytes.length, at[i]]]], FIXED));
            const top = (o) => encodeDict([...spec.top, [OP_CHARSET, [o.charset]], [OP_CHARSTRINGS, [o.cs]],
                [OP_FDARRAY, [o.fd]], [OP_FDSELECT, [o.sel]]], FIXED);
            const zero = { charset: 0, cs: 0, fd: 0, sel: 0 };
            const o = { charset: header.length + nameIndex.length + writeIndex([top(zero)]).length + stringIndex.length + gsubrIndex.length };
            o.sel = o.charset + charset.length;
            o.cs = o.sel + fdSelect.length;
            o.fd = o.cs + charStrings.length;
            let at = o.fd + writeIndex(fontDicts(spec.fds.map(() => 0))).length;
            const privAt = privs.map((p) => { const here = at; at += p.bytes.length + p.subrs.length; return here; });
            const parts = [header, nameIndex, writeIndex([top(o)]), stringIndex, gsubrIndex, charset, fdSelect, charStrings,
                writeIndex(fontDicts(privAt)), ...privs.flatMap((p) => [p.bytes, p.subrs])];
            const out = new Uint8Array(parts.reduce((s, x) => s + x.length, 0));
            let p = 0;
            for (const x of parts) { out.set(x, p); p += x.length; }
            return out;
        }

        /**
         * The subset CID-keyed CFF of `parsed`'s font: `keptGids[i]` becomes
         * glyph `i`, keeping its CID, its FD and its charstring byte for
         * byte; every FD is kept (its Private DICT and local subroutines
         * whole), and so are the String INDEX and the global subroutines.
         * @param {object} parsed `tableCff.parseCff` of the font program
         * @param {Uint8Array} _bytes the font program
         * @param {number[]} keptGids `.notdef` first
         * @returns {Uint8Array}
         */
        function subsetCidCff(parsed, _bytes, keptGids) {
            if (!isCidKeyed(parsed) || keptGids[0] !== 0) {
                throw new ContractError('fonts/subset-bad-font', 'subsetCidCff takes one CID-keyed CFF font, .notdef first', {});
            }
            const font = parsed.fonts[0];
            const skip = new Set([OP_CHARSET, OP_ENCODING, OP_CHARSTRINGS, OP_PRIVATE, OP_FDARRAY, OP_FDSELECT, OP_ROS]);
            return writeCidCff({
                name: parsed.nameIndex.items[0],
                top: [[OP_ROS, font.topDict.get(OP_ROS)], ...[...font.topDict].filter(([op]) => !skip.has(op))],
                strings: parsed.stringIndex.items,
                gsubrs: parsed.globalSubrIndex.items,
                cids: keptGids.map((g) => font.charset[g]),
                fdOf: keptGids.map((g) => font.fdSelect[g]),
                charStrings: keptGids.map((g) => font.charStringsIndex.items[g]),
                fds: font.fdArray.map((fd) => ({
                    fontDictEntries: [...fd.fontDict],
                    privateEntries: fd.privateDict ? [...fd.privateDict] : [],
                    localSubrs: fd.localSubrIndex ? fd.localSubrIndex.items : null
                }))
            });
        }

        /**
         * A CFF2 font program's default instance as a static CID-keyed CFF
         * one: `ROS Adobe-Identity-0`, CID = the new glyph id, each
         * kept charstring converted (`convertCff2Charstring`, its width from
         * `widths`), the Private DICT at the default (`evalCff2Dict`), no
         * subroutines. One FD only.
         * @param {object} parsed `tableCff2.parseCff2` of the font program
         * @param {number[]} regionCounts the variation store's (`tableCff2.regionCounts`)
         * @param {number[]} keptGids `.notdef` first
         * @param {number[]} widths each kept glyph's advance
         * @param {{ name: string, bbox: number[] }} info the font's PostScript name and `head` box
         * @returns {Uint8Array}
         */
        function cff2ToCidCff(parsed, regionCounts, keptGids, widths, info) {
            if (!parsed || !parsed.charStringsIndex || !parsed.fdArray || parsed.fdArray.length !== 1 || !parsed.fdArray[0].private || keptGids[0] !== 0) {
                throw new ContractError('fonts/subset-bad-font', 'a CFF2 font program is subset with one FD and its Private DICT, .notdef first', {});
            }
            const priv = parsed.fdArray[0].private;
            const ctx = {
                globalSubrs: parsed.globalSubrIndex ? parsed.globalSubrIndex.items : [],
                localSubrs: priv.localSubrIndex ? priv.localSubrIndex.items : [],
                regionCounts, vsindex: priv.vsindex || 0
            };
            const enc = new TextEncoder();
            const matrix = parsed.topDict.get(OP_FONTMATRIX);
            return writeCidCff({
                name: enc.encode(info.name),
                top: [[OP_ROS, [391, 392, 0]], ...(matrix ? [[OP_FONTMATRIX, matrix]] : []),
                    [OP_FONTBBOX, info.bbox], [OP_CIDCOUNT, [keptGids.length]]],
                strings: [enc.encode('Adobe'), enc.encode('Identity')],
                gsubrs: [],
                cids: keptGids.map((_, i) => i),
                fdOf: keptGids.map(() => 0),
                charStrings: keptGids.map((g, i) => convertCff2Charstring(parsed.charStringsIndex.items[g], { ...ctx, width: widths[i] })),
                fds: [{ fontDictEntries: [], privateEntries: evalCff2Dict(priv.bytes, regionCounts), localSubrs: null }]
            });
        }

        return { encodeDict, writeIndex, cffClosure, isNameKeyed, isCidKeyed, subsetCff, subsetCidCff,
            evalCff2Dict, convertCff2Charstring, cff2ToCidCff };
    }
};
