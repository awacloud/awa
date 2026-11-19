// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Type 1 charstrings (Adobe Type 1 Font Format, ch. 6–8):
 * decryption and drawing, module `fontType1Charstring`.
 *
 *  - `decrypt(bytes, key, skip)` undoes the Type 1 encryption (key 55665
 *    for the eexec section, 4330 for a charstring) and drops the first
 *    `skip` plain bytes (4 for eexec, `lenIV` for a charstring).
 *  - `draw(charstring, { subrs, glyph })` runs a decrypted charstring and
 *    gives `{ advanceWidth, leftSideBearing, path }`, `path` the commands
 *    `M`, `L`, `C`, `Z` in character space:
 *    - `hsbw` / `sbw` set the side bearing point and the advance;
 *    - `rmoveto`, `hmoveto`, `vmoveto` start a subpath (`M`); a line or
 *      a curve with no open subpath starts one at the current point;
 *      `closepath` closes it (`Z`) and keeps the current point;
 *    - `callothersubr` hands its arguments to a PostScript operand stack
 *      that `pop` reads back: othersubrs 1, 2 and 0 are flex (the seven
 *      points the moves reach, drawn as two curves, the final point
 *      handed back for `setcurrentpoint`), 3 is hint replacement (its
 *      subroutine number handed back), any other number hands its
 *      arguments back in order;
 *    - `seac` draws the base and the accent, by `StandardEncoding`, through
 *      `glyph(name)` (the decrypted charstring of a glyph, or `null`), the
 *      accent moved by `adx − asb` plus the composite's side bearing;
 *    - `div` divides; the hints (`hstem`, `vstem`, `hstem3`, `vstem3`,
 *      `dotsection`) are read and ignored.
 *  - A charstring that nests subroutines past 10 levels, or runs past
 *    65,536 operators, throws `fonts/type1-charstring-budget`; a call to a
 *    subroutine the font lacks, `fonts/type1-missing-subr` (`ParseError`s).
 *
 * Strict factory body, capture-free, worker-safe.
 *
 * @module fonts/type1/charstring
 */

import { fontErrors } from '../errors.js';
import { encodingStandard } from '../encodings/standard.js';

export const fontType1Charstring = {
    name: 'fontType1Charstring',
    dependencies: ['fontErrors', 'encodingStandard'],
    deps: [fontErrors, encodingStandard],
    factory(errors, standard) {
        const { ParseError } = errors;
        const { STANDARD } = standard;
        const MAX_DEPTH = 10;
        const MAX_OPS = 65536;

        /**
         * The plain bytes of a Type 1 encrypted run, the first `skip` dropped.
         * @param {Uint8Array} bytes
         * @param {number} key 55665 (eexec) or 4330 (charstring)
         * @param {number} skip
         * @returns {Uint8Array}
         */
        function decrypt(bytes, key, skip) {
            const out = new Uint8Array(Math.max(0, bytes.length - skip));
            let r = key & 0xFFFF;
            for (let i = 0; i < bytes.length; i++) {
                const c = bytes[i];
                const p = c ^ (r >> 8);
                r = ((c + r) * 52845 + 22719) & 0xFFFF;
                if (i >= skip) out[i - skip] = p & 0xFF;
            }
            return out;
        }

        function budget(msg) {
            return new ParseError('fonts/type1-charstring-budget', msg);
        }

        /**
         * Run a decrypted charstring.
         * @param {Uint8Array} charstring
         * @param {{ subrs: (Uint8Array|null)[], glyph: (name: string) => (Uint8Array|null) }} env
         * @returns {{ advanceWidth: number, leftSideBearing: number, path: object[] }}
         */
        function draw(charstring, env) {
            return run(charstring, env, 0);
        }

        function run(charstring, env, seacDepth) {
            const path = [];
            const st = {
                stack: [], ps: [], x: 0, y: 0, open: false,
                width: 0, sbx: 0, sby: 0, flex: null, ops: 0, done: false, seac: null
            };
            const subrs = env.subrs || [];

            function moveTo(nx, ny) {
                st.x = nx; st.y = ny;
                path.push({ type: 'M', x: nx, y: ny });
                st.open = true;
            }
            function ensureOpen() {
                if (!st.open) { path.push({ type: 'M', x: st.x, y: st.y }); st.open = true; }
            }
            function lineTo(dx, dy) {
                ensureOpen();
                st.x += dx; st.y += dy;
                path.push({ type: 'L', x: st.x, y: st.y });
            }
            function curveTo(dx1, dy1, dx2, dy2, dx3, dy3) {
                ensureOpen();
                const x1 = st.x + dx1, y1 = st.y + dy1;
                const x2 = x1 + dx2, y2 = y1 + dy2;
                st.x = x2 + dx3; st.y = y2 + dy3;
                path.push({ type: 'C', x1, y1, x2, y2, x: st.x, y: st.y });
            }
            function rmove(dx, dy) {
                if (st.flex) { st.x += dx; st.y += dy; return; }
                moveTo(st.x + dx, st.y + dy);
            }
            function othersubr(n, args) {
                if (n === 1) { st.flex = []; st.ps = []; return; }
                if (n === 2) { if (st.flex) st.flex.push([st.x, st.y]); st.ps = []; return; }
                if (n === 0 && st.flex) {
                    const p = st.flex;
                    st.flex = null;
                    if (p.length >= 7) {
                        ensureOpen();
                        path.push({ type: 'C', x1: p[1][0], y1: p[1][1], x2: p[2][0], y2: p[2][1], x: p[3][0], y: p[3][1] });
                        path.push({ type: 'C', x1: p[4][0], y1: p[4][1], x2: p[5][0], y2: p[5][1], x: p[6][0], y: p[6][1] });
                        st.x = p[6][0]; st.y = p[6][1];
                    }
                    st.ps = args.length >= 3 ? [args[1], args[2]] : [st.x, st.y];
                    return;
                }
                st.ps = args.slice();
            }

            function exec(bytes, depth) {
                if (depth > MAX_DEPTH) throw budget(`subroutines nested past ${MAX_DEPTH} levels`);
                const s = st.stack;
                let i = 0;
                while (i < bytes.length && !st.done) {
                    const v = bytes[i++];
                    if (v >= 32) {
                        if (v <= 246) s.push(v - 139);
                        else if (v <= 250) s.push((v - 247) * 256 + bytes[i++] + 108);
                        else if (v <= 254) s.push(-(v - 251) * 256 - bytes[i++] - 108);
                        else {
                            s.push(((bytes[i] << 24) | (bytes[i + 1] << 16) | (bytes[i + 2] << 8) | bytes[i + 3]) >> 0);
                            i += 4;
                        }
                        continue;
                    }
                    if (++st.ops > MAX_OPS) throw budget(`a charstring past ${MAX_OPS} operators`);
                    let op = v;
                    if (op === 12) op = 1200 + (bytes[i++] ?? 0);
                    const a = (k) => s[s.length - k] ?? 0;
                    switch (op) {
                        case 13: { // hsbw sbx wx
                            const sbx = s[0] ?? 0, wx = s[1] ?? 0;
                            st.sbx = sbx; st.sby = 0; st.width = wx; st.x = sbx; st.y = 0;
                            s.length = 0; break;
                        }
                        case 1207: { // sbw sbx sby wx wy
                            const [sbx = 0, sby = 0, wx = 0] = s;
                            st.sbx = sbx; st.sby = sby; st.width = wx; st.x = sbx; st.y = sby;
                            s.length = 0; break;
                        }
                        case 21: rmove(a(2), a(1)); s.length = 0; break;
                        case 22: rmove(a(1), 0); s.length = 0; break;
                        case 4: rmove(0, a(1)); s.length = 0; break;
                        case 5: lineTo(a(2), a(1)); s.length = 0; break;
                        case 6: lineTo(a(1), 0); s.length = 0; break;
                        case 7: lineTo(0, a(1)); s.length = 0; break;
                        case 8: curveTo(a(6), a(5), a(4), a(3), a(2), a(1)); s.length = 0; break;
                        case 30: curveTo(0, a(4), a(3), a(2), a(1), 0); s.length = 0; break; // vhcurveto dy1 dx2 dy2 dx3
                        case 31: curveTo(a(4), 0, a(3), a(2), 0, a(1)); s.length = 0; break; // hvcurveto dx1 dx2 dy2 dy3
                        case 9: // closepath
                            if (st.open) path.push({ type: 'Z' });
                            st.open = false; s.length = 0; break;
                        case 10: { // callsubr
                            const n = s.pop();
                            const sub = Number.isInteger(n) && n >= 0 ? subrs[n] : undefined;
                            if (!sub) throw new ParseError('fonts/type1-missing-subr', `callsubr ${n}: the font has ${subrs.length} subroutines`, { context: { subr: n } });
                            exec(sub, depth + 1);
                            break;
                        }
                        case 11: return; // return
                        case 14: st.done = true; s.length = 0; break; // endchar
                        case 1206: { // seac asb adx ady bchar achar
                            const [asb = 0, adx = 0, ady = 0, bchar = 0, achar = 0] = s;
                            st.seac = { asb, adx, ady, base: STANDARD[bchar & 0xFF], accent: STANDARD[achar & 0xFF] };
                            st.done = true; s.length = 0; break;
                        }
                        case 1212: { // div
                            const d = s.pop(), n = s.pop();
                            s.push((n ?? 0) / (d || 1));
                            break;
                        }
                        case 1216: { // callothersubr arg1 … argn n othersubr#
                            const k = s.pop() ?? 0, n = Math.max(0, s.pop() ?? 0);
                            const args = s.splice(Math.max(0, s.length - n), n);
                            othersubr(k, args);
                            break;
                        }
                        case 1217: // pop
                            s.push(st.ps.length ? st.ps.shift() : 0);
                            break;
                        case 1233: { // setcurrentpoint x y
                            const y = s.pop() ?? 0, x = s.pop() ?? 0;
                            st.x = x; st.y = y;
                            break;
                        }
                        // hints: hstem, vstem, dotsection, vstem3, hstem3; and anything unknown
                        default: s.length = 0; break;
                    }
                }
            }

            exec(charstring, 0);
            if (st.seac) {
                if (seacDepth > 0) throw budget('a seac inside a seac');
                const { asb, adx, ady, base, accent } = st.seac;
                const b = base ? env.glyph(base) : null;
                const c = accent ? env.glyph(accent) : null;
                if (b) path.push(...run(b, env, seacDepth + 1).path);
                if (c) {
                    const dx = adx + st.sbx - asb, dy = ady;
                    for (const cmd of run(c, env, seacDepth + 1).path) path.push(shift(cmd, dx, dy));
                }
            }
            return { advanceWidth: st.width, leftSideBearing: st.sbx, path };
        }

        function shift(c, dx, dy) {
            if (c.type === 'Z') return c;
            if (c.type === 'C') return { type: 'C', x1: c.x1 + dx, y1: c.y1 + dy, x2: c.x2 + dx, y2: c.y2 + dy, x: c.x + dx, y: c.y + dy };
            return { type: c.type, x: c.x + dx, y: c.y + dy };
        }

        return { decrypt, draw };
    }
};
