// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview The `kerx` and `kern` engine (opt-in extra
 * `aatKerxEngine`): a parsed `kerx` (`aatKerx.parseKerx`) or `kern`
 * (`tableKern.parseKern`) table applied to a positioned glyph run, as
 * HarfBuzz applies them.
 *
 * `applyKerx(kerx, glyphs, opts?)` and `applyKern(kern, glyphs, opts?)` take
 * `[{ glyph, xAdvance, yAdvance, xOffset, yOffset, attach }]` in logical
 * order and change the positions in place; they return `{ truncated }`.
 *
 *  - **Subtables** run in order; a vertical one (or one that did not
 *    decode) is skipped. The run is reversed for a subtable, and restored
 *    after, when its backwards bit (`kerx` `0x10000000`; `kern` has none)
 *    differs from right-to-left text (`opts.direction: 'rtl'`).
 *  - **Cross-stream**: at the first cross-stream subtable every glyph is
 *    chained to the one before it, so that y offsets add up along the run
 *    (`attach: { to, kind: 'cursive' }`).
 *  - **The pair machine** (`kern` format 0, `kerx` formats 0, 2 and 6): from
 *    each glyph to the next one that is not a mark (`opts.isMark`), the
 *    pair's value is added to the first glyph's advance; a cross-stream
 *    subtable sets the second glyph's y offset instead.
 *  - **`kerx` format 1**: push (`0x8000`) the current glyph on a stack of 8
 *    (a full stack is cleared), reset (`0x2000`) the stack; an action (an
 *    index other than `0xFFFF`) pops glyphs, each taking the next value
 *    (one per tuple) on its advance and x offset (cross-stream: on its y
 *    offset when it is chained; `-0x8000` unchains it), an odd value ending
 *    the list.
 *  - **`kerx` format 4**: mark (`0x8000`) records the current glyph; an
 *    action at a later glyph sets its offset to the mark's point minus its
 *    own and attaches it to the mark (`attach: { to, kind: 'mark' }`): the
 *    control points `opts.point(glyph, index)`, the anchors
 *    `opts.anchors(glyph)[index]` (`{ x: 0, y: 0 }` when absent), or the
 *    coordinates in the action.
 *  - `opts.kern === false` turns off the pair machine and format 1, not
 *    format 4.
 *
 * Attachments point at glyph indices of the returned run; the caller adds
 * the base's offset and the advances in between (as after GPOS). A step
 * of a state table that does not advance spends one unit of
 * `opts.state.budget` (default 1,000,000); past it the driver advances
 * anyway and `truncated` is `true`.
 *
 * Strict factory-only fw descriptor, capture-free, worker-safe.
 *
 * @module fonts/extra/apple-aat/kerx-engine
 */

export const aatKerxEngine = {
    name: 'aatKerxEngine',
    dependencies: [],
    deps: [],
    factory() {
        const CLASS_END_OF_TEXT = 0;
        const DONT_ADVANCE = 0x4000;
        const STACK = 8;
        const BUDGET_MAX = 1000000;
        const KERX_VERTICAL = 0x80000000, KERX_CROSS = 0x40000000, KERX_BACKWARDS = 0x10000000;

        /** Run a state table over `buf`: `transition(idx, entry)`. */
        function drive(table, buf, transition, state) {
            let s = 0, idx = 0;
            for (;;) {
                const klass = idx < buf.length ? table.classOf(buf[idx].glyph) : CLASS_END_OF_TEXT;
                const entry = table.entry(s, klass);
                transition(idx, entry);
                s = entry.newState;
                if (idx >= buf.length) break;
                if (!(entry.flags & DONT_ADVANCE)) idx++;
                else if (state.budget > 0) state.budget--;
                else { state.truncated = true; idx++; }
            }
        }

        /** The pair machine over `buf` with `kern(left, right)`. */
        function pairs(buf, kern, crossStream, o) {
            const isMark = o.isMark || (() => false);
            let idx = 0;
            while (idx < buf.length) {
                let j = idx + 1;
                while (j < buf.length && isMark(buf[j].glyph)) j++;
                if (j >= buf.length) { idx++; continue; }
                const v = kern(buf[idx].glyph, buf[j].glyph);
                if (v) {
                    if (crossStream) buf[j].yOffset = v;
                    else buf[idx].xAdvance += v;
                }
                idx = j;
            }
        }

        function stateKerning(sub, buf, crossStream, o, state) {
            const stack = [];
            const tuple = Math.max(1, sub.tupleCount || 0);
            drive(sub.stateTable, buf, (idx, entry) => {
                if (entry.flags & 0x2000) stack.length = 0;
                if (entry.flags & 0x8000) {
                    if (stack.length < STACK) stack.push(idx);
                    else stack.length = 0;
                }
                const at = entry.data[0];
                if (at === 0xFFFF || !stack.length) return;
                if (sub.action(at + stack.length * tuple - 1) === null) { stack.length = 0; return; }
                let a = at, last = false;
                while (!last && stack.length) {
                    const i = stack.pop();
                    let v = sub.action(a);
                    a += tuple;
                    if (i >= buf.length) continue;
                    last = !!(v & 1);
                    v &= ~1;
                    const g = buf[i];
                    if (crossStream) {
                        if (v === -0x8000) { g.attach = null; g.yOffset = 0; }
                        else if (g.attach) g.yOffset += v;
                    } else if (o.kern !== false) {
                        g.xAdvance += v;
                        g.xOffset += v;
                    }
                }
            }, state);
        }

        function attachment(sub, buf, o, state) {
            let mark = 0, markSet = false;
            const point = (glyph, i) => (o.point ? o.point(glyph, i) : null);
            const anchor = (glyph, i) => ((o.anchors && o.anchors(glyph)) || [])[i] || { x: 0, y: 0 };
            drive(sub.stateTable, buf, (idx, entry) => {
                const k = entry.data[0];
                if (markSet && k !== 0xFFFF && idx < buf.length) {
                    const m = buf[mark], g = buf[idx];
                    let d = null;
                    if (sub.actionType === 2) {
                        const v = [0, 1, 2, 3].map((n) => sub.data(4 * k + n));
                        if (!v.includes(null)) {
                            const s = v.map((x) => (x << 16) >> 16);
                            d = [s[0] - s[2], s[1] - s[3]];
                        }
                    } else {
                        const mi = sub.data(2 * k), ci = sub.data(2 * k + 1);
                        if (mi !== null && ci !== null) {
                            const mp = sub.actionType === 0 ? point(m.glyph, mi) : anchor(m.glyph, mi);
                            const cp = sub.actionType === 0 ? point(g.glyph, ci) : anchor(g.glyph, ci);
                            if (mp && cp) d = [mp.x - cp.x, mp.y - cp.y];
                        }
                    }
                    if (d) {
                        g.xOffset = d[0];
                        g.yOffset = d[1];
                        g.attach = { to: m, kind: 'mark' };
                    }
                }
                if (entry.flags & 0x8000) { markSet = true; mark = idx; }
            }, state);
        }

        /** Run `subtables` (each with `vertical`, `crossStream`, `backwards`, `run(buf)`); then attachments to indices. */
        function runAll(subtables, glyphs, o) {
            const backward = o.direction === 'rtl';
            let seenCross = false;
            for (const st of subtables) {
                if (st.vertical || !st.run) continue;
                if (st.crossStream && !seenCross) {
                    seenCross = true;
                    for (let i = 1; i < glyphs.length; i++) glyphs[i].attach = { to: glyphs[i - 1], kind: 'cursive' };
                }
                const reverse = st.backwards !== backward;
                if (reverse) glyphs.reverse();
                st.run(glyphs);
                if (reverse) glyphs.reverse();
            }
            for (const g of glyphs) {
                if (g.attach && typeof g.attach.to === 'object') {
                    const to = glyphs.indexOf(g.attach.to);
                    g.attach = to < 0 ? null : { to, kind: g.attach.kind };
                }
            }
        }

        /**
         * Apply a parsed `kerx` table to a positioned run (module header).
         *
         * @param {{tables: object[]}} kerx A `parseKerx` result.
         * @param {object[]} glyphs `[{ glyph, xAdvance, yAdvance, xOffset, yOffset, attach }]`, changed in place.
         * @param {{direction?: 'ltr'|'rtl', kern?: boolean, isMark?: (glyph: number) => boolean,
         *   point?: (glyph: number, index: number) => ({x: number, y: number}|null),
         *   anchors?: (glyph: number) => {x: number, y: number}[], state?: {budget: number, truncated: boolean}}} [opts]
         * @returns {{truncated: boolean}}
         */
        function applyKerx(kerx, glyphs, opts) {
            const o = opts || {};
            const state = o.state || { budget: BUDGET_MAX, truncated: false };
            runAll(kerx.tables.map((t) => {
                const crossStream = !!(t.coverage & KERX_CROSS);
                let run = null;
                if (t.parsed && (t.format === 0 || t.format === 2 || t.format === 6)) {
                    if (o.kern !== false) run = (buf) => pairs(buf, t.kern, crossStream, o);
                } else if (t.parsed && t.format === 1) run = (buf) => stateKerning(t, buf, crossStream, o, state);
                else if (t.parsed && t.format === 4) run = (buf) => attachment(t, buf, o, state);
                return { vertical: !!(t.coverage & KERX_VERTICAL), crossStream, backwards: !!(t.coverage & KERX_BACKWARDS), run };
            }), glyphs, o);
            return { truncated: state.truncated };
        }

        /**
         * Apply a parsed `kern` table's format 0 subtables to a positioned run (module header).
         *
         * @param {{tables: object[]}} kern A `parseKern` result.
         * @param {object[]} glyphs As for `applyKerx`.
         * @param {{direction?: 'ltr'|'rtl', kern?: boolean, isMark?: (glyph: number) => boolean}} [opts]
         * @returns {{truncated: boolean}}
         */
        function applyKern(kern, glyphs, opts) {
            const o = opts || {};
            runAll(kern.tables.map((t) => ({
                vertical: !t.horizontal,
                crossStream: !!t.crossStream,
                backwards: false,
                run: t.format === 0 && t.kern && o.kern !== false ? (buf) => pairs(buf, t.kern, !!t.crossStream, o) : null
            })), glyphs, o);
            return { truncated: false };
        }

        return { applyKerx, applyKern };
    }
};
