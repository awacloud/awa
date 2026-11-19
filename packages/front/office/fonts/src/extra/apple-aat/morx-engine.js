// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview The `morx` engine (opt-in extra `aatMorxEngine`): a parsed
 * `morx` table (`aatMorx.parseMorx`) applied to a glyph run, as
 * HarfBuzz's AAT layout applies it.
 *
 * `applyMorx(morx, glyphs, opts?)` takes `[{ glyph, cluster }]` in logical
 * order and returns `{ glyphs, truncated }`:
 *
 *  - **Flags.** Each chain starts from its default flags; each requested
 *    feature `{ type, setting }` (`opts.features`) applies
 *    `(flags & disableFlags) | enableFlags` of every feature entry of the
 *    chain with that type and setting, in the entries' order.
 *  - **Subtables.** A decoded subtable runs when its `subFeatureFlags`
 *    meet the flags and it applies to horizontal text (the vertical bit
 *    clear, or the both-orientations bit set). The run is reversed for the
 *    subtable, and restored after, as HarfBuzz reads the coverage bits:
 *    with the logical-order bit, when the descending bit is set; without
 *    it (layout order), when the descending bit differs from the text
 *    running right to left (`opts.direction: 'rtl'`).
 *  - **The driver** starts in state 0, reads each glyph's class (end of
 *    text past the last glyph), takes the entry, runs its action, then
 *    moves to the next glyph unless the entry's don't-advance flag is set.
 *  - **Type 0, rearrangement**: mark first and mark last, and the 16 verbs
 *    (Ax ⇒ xA to ABxCD ⇒ DCxBA) on a range of at most 64 glyphs.
 *  - **Type 1, contextual**: the marked glyph and the current glyph
 *    through their substitution lookups (none at the end of text before a
 *    mark is set).
 *  - **Type 2, ligature** (through an output buffer): set-component pushes
 *    the current output position on a stack of 64; perform-action (not at
 *    the end of text) pops components, adds `component(glyph + offset)` to
 *    the ligature index, and on store or last writes `ligature(index)` in
 *    place of the component, the later components becoming deleted glyphs.
 *  - **Type 4, noncontextual**: every glyph through the lookup.
 *  - **Type 5, insertion** (through an output buffer): the marked and the
 *    current insertions, before or after their glyph; after a current
 *    insertion the cursor sits on the last glyph inserted, or, with
 *    don't-advance, on the current glyph again.
 *  - After the last chain the deleted glyphs (`0xFFFF`) are removed.
 *
 * A subtable that did not decode is skipped. Clusters are merged over
 * a rearranged range and a ligature. A step that does not advance spends
 * one unit of `opts.state.budget` (default 1,000,000), and so does each
 * glyph inserted; past it the driver advances anyway, an insertion is
 * not made, and `truncated` is `true`.
 *
 * Strict factory-only fw descriptor, capture-free, worker-safe.
 *
 * @module fonts/extra/apple-aat/morx-engine
 */

export const aatMorxEngine = {
    name: 'aatMorxEngine',
    dependencies: [],
    deps: [],
    factory() {
        const DELETED_GLYPH = 0xFFFF;
        const CLASS_END_OF_TEXT = 0;
        const DONT_ADVANCE = 0x4000;
        const MAX_CONTEXT = 64;
        const BUDGET_MAX = 1000000;

        /** Rearrangement verbs: the high nibble is the left run (3: two, reversed), the low one the right run. */
        const VERBS = [0x00, 0x10, 0x01, 0x11, 0x20, 0x30, 0x02, 0x03, 0x12, 0x13, 0x21, 0x31, 0x22, 0x32, 0x23, 0x33];

        /** A chain's flags under the requested features. */
        function chainFlags(chain, features) {
            let flags = chain.defaultFlags >>> 0;
            for (const f of chain.features) {
                if (features.some((r) => r.type === f.featureType && r.setting === f.featureSetting))
                    flags = ((flags & f.disableFlags) | f.enableFlags) >>> 0;
            }
            return flags;
        }

        /** Every glyph of `info[start, end)` takes the smallest cluster among them. */
        function mergeClusters(info, start, end) {
            if (end - start < 2) return;
            let c = Infinity;
            for (let i = start; i < end; i++) c = Math.min(c, info[i].cluster);
            for (let i = start; i < end; i++) if (info[i].cluster !== c) info[i] = { ...info[i], cluster: c };
        }

        /**
         * Run a state table over `info`: `transition(buf, entry)` acts on
         * `buf.info` at `buf.idx`; the driver advances `buf.idx`. With
         * `output`, the glyphs passed are written to `buf.out` (HarfBuzz's
         * output buffer) and the result is `out` then the rest of `info`.
         */
        function drive(table, info, transition, state, output) {
            const buf = { info, idx: 0, out: output ? [] : null };
            let s = 0;
            const next = () => { if (buf.out) buf.out.push(buf.info[buf.idx]); buf.idx++; };
            for (;;) {
                const klass = buf.idx < buf.info.length ? table.classOf(buf.info[buf.idx].glyph) : CLASS_END_OF_TEXT;
                const entry = table.entry(s, klass);
                transition(buf, entry);
                s = entry.newState;
                if (buf.idx >= buf.info.length) break;
                if (!(entry.flags & DONT_ADVANCE)) next();
                else if (state.budget > 0) state.budget--;
                else { state.truncated = true; next(); }
            }
            return buf.out ? buf.out.concat(buf.info.slice(buf.idx)) : buf.info;
        }

        // ---- The output buffer's moves (HarfBuzz's hb_buffer_t, for types 2 and 5).

        /** Put the cursor on output position `i`: write input glyphs out, or take output glyphs back; false past the run. */
        function moveTo(buf, i) {
            const outLen = buf.out.length;
            if (i > outLen + (buf.info.length - buf.idx) || i < 0) return false;
            if (outLen < i) {
                const count = i - outLen;
                for (let k = 0; k < count; k++) buf.out.push(buf.info[buf.idx + k]);
                buf.idx += count;
            } else if (outLen > i) {
                const back = buf.out.splice(i);
                if (buf.idx >= back.length) {
                    buf.idx -= back.length;
                    for (let k = 0; k < back.length; k++) buf.info[buf.idx + k] = back[k];
                } else {
                    buf.info.splice(0, buf.idx, ...back);
                    buf.idx = 0;
                }
            }
            return true;
        }
        /** Write the current glyph out as `glyph` and move past it. */
        function replaceGlyph(buf, glyph) {
            buf.out.push({ ...buf.info[buf.idx], glyph });
            buf.idx++;
        }
        /** Write `glyphs` out before the current glyph, each a copy of it (else of the last glyph written). */
        function insertGlyphs(buf, glyphs) {
            const orig = buf.idx < buf.info.length ? buf.info[buf.idx] : buf.out[buf.out.length - 1];
            for (const g of glyphs) buf.out.push({ ...orig, glyph: g });
        }

        function rearrangement(sub, info, state) {
            let start = 0, end = 0;
            return drive(sub.stateTable, info, (buf, entry) => {
                const flags = entry.flags;
                const len = buf.info.length;
                if (flags & 0x8000) start = buf.idx;
                if (flags & 0x2000) end = Math.min(buf.idx + 1, len);
                const verb = flags & 0x000F;
                if (!verb || start >= end) return;
                const m = VERBS[verb];
                const l = Math.min(2, m >> 4), r = Math.min(2, m & 0x0F);
                if (end - start < l + r || end - start > MAX_CONTEXT) return;
                const a = buf.info;
                mergeClusters(a, start, Math.min(buf.idx + 1, len));
                mergeClusters(a, start, end);
                const left = a.slice(start, start + l);
                const right = a.slice(end - r, end);
                const out = [...right, ...a.slice(start + l, end - r), ...left];
                if ((m >> 4) === 3) [out[out.length - 1], out[out.length - 2]] = [out[out.length - 2], out[out.length - 1]];
                if ((m & 0x0F) === 3) [out[0], out[1]] = [out[1], out[0]];
                a.splice(start, end - start, ...out);
            }, state);
        }

        function contextual(sub, info, state) {
            let mark = 0, markSet = false;
            const subs = sub.substitutions;
            const substitute = (a, i, index) => {
                if (index === 0xFFFF || i < 0 || i >= a.length || !subs[index]) return;
                const g = subs[index].get(a[i].glyph);
                if (g !== null) a[i] = { ...a[i], glyph: g };
            };
            return drive(sub.stateTable, info, (buf, entry) => {
                const a = buf.info;
                if (buf.idx === a.length && !markSet) return;
                const [markIndex, currentIndex] = entry.data;
                substitute(a, mark, markIndex);
                substitute(a, Math.min(buf.idx, a.length - 1), currentIndex);
                if (entry.flags & 0x8000) { markSet = true; mark = buf.idx; }
            }, state);
        }

        function ligature(sub, info, state) {
            const STACK = 64;
            const stack = new Array(STACK).fill(0);
            let length = 0;
            return drive(sub.stateTable, info, (buf, entry) => {
                if (entry.flags & 0x8000) {
                    if (length && stack[(length - 1) % STACK] === buf.out.length) length--;
                    stack[length++ % STACK] = buf.out.length;
                }
                if (!(entry.flags & 0x2000) || !length || buf.idx >= buf.info.length) return;
                const end = buf.out.length;
                let cursor = length;
                let actionIndex = entry.data[0];
                let ligatureIndex = 0;
                let action;
                do {
                    if (!cursor) { length = 0; break; }
                    if (!moveTo(buf, stack[--cursor % STACK])) return;
                    action = sub.action(actionIndex);
                    if (action === null) break;
                    let offset = action & 0x3FFFFFFF;
                    if (offset & 0x20000000) offset |= 0xC0000000;
                    const component = sub.component(buf.info[buf.idx].glyph + (offset | 0));
                    if (component === null) break;
                    ligatureIndex += component;
                    if (action & 0xC0000000) {
                        const lig = sub.ligature(ligatureIndex);
                        if (lig === null) break;
                        replaceGlyph(buf, lig);
                        const ligEnd = stack[(length - 1) % STACK] + 1;
                        while (length - 1 > cursor) {
                            if (!moveTo(buf, stack[--length % STACK])) return;
                            replaceGlyph(buf, DELETED_GLYPH);
                        }
                        if (!moveTo(buf, ligEnd)) return;
                        mergeClusters(buf.out, stack[cursor % STACK], buf.out.length);
                    }
                    actionIndex++;
                } while (!(action & 0x80000000));
                moveTo(buf, end);
            }, state, true);
        }

        function insertion(sub, info, state) {
            let mark = 0;
            /** `count` glyphs from `index`, spending the budget; null when the budget is spent. */
            const take = (index, count) => {
                if (state.budget < count) { state.truncated = true; return null; }
                state.budget -= count;
                const glyphs = [];
                for (let k = 0; k < count; k++) {
                    const g = sub.insertion(index + k);
                    if (g === null) return [];
                    glyphs.push(g);
                }
                return glyphs;
            };
            return drive(sub.stateTable, info, (buf, entry) => {
                const flags = entry.flags;
                const [currentIndex, markedIndex] = entry.data;
                const markLoc = buf.out.length;
                if (markedIndex !== 0xFFFF) {
                    const glyphs = take(markedIndex, flags & 0x001F);
                    if (glyphs === null) return;
                    const before = flags & 0x0400;
                    const end = buf.out.length;
                    if (!moveTo(buf, mark)) return;
                    const after = buf.idx < buf.info.length && !before;
                    if (after) buf.out.push(buf.info[buf.idx]);
                    insertGlyphs(buf, glyphs);
                    if (after) buf.idx++;
                    if (!moveTo(buf, end + glyphs.length)) return;
                }
                if (flags & 0x8000) mark = markLoc;
                if (currentIndex !== 0xFFFF) {
                    const glyphs = take(currentIndex, (flags & 0x03E0) >> 5);
                    if (glyphs === null) return;
                    const before = flags & 0x0800;
                    const end = buf.out.length;
                    const after = buf.idx < buf.info.length && !before;
                    if (after) buf.out.push(buf.info[buf.idx]);
                    insertGlyphs(buf, glyphs);
                    if (after) buf.idx++;
                    moveTo(buf, (flags & DONT_ADVANCE) ? end : end + glyphs.length);
                }
            }, state, true);
        }

        function noncontextual(sub, info) {
            return info.map((g) => {
                const v = sub.lookup.get(g.glyph);
                return v === null ? g : { ...g, glyph: v };
            });
        }

        const RUN = { 0: rearrangement, 1: contextual, 2: ligature, 4: noncontextual, 5: insertion };

        /**
         * Apply a parsed `morx` to a glyph run (module header).
         *
         * @param {{chains: object[]}} morx A `parseMorx` result.
         * @param {{glyph: number, cluster: number}[]} glyphs In logical order.
         * @param {{features?: {type: number, setting: number}[], direction?: 'ltr'|'rtl', state?: {budget: number, truncated: boolean}}} [opts]
         * @returns {{glyphs: {glyph: number, cluster: number}[], truncated: boolean}}
         */
        function applyMorx(morx, glyphs, opts) {
            const o = opts || {};
            const features = o.features || [];
            const state = o.state || { budget: BUDGET_MAX, truncated: false };
            const backward = o.direction === 'rtl';
            let info = glyphs.map((g) => ({ glyph: g.glyph, cluster: g.cluster }));
            for (const chain of morx.chains) {
                const flags = chainFlags(chain, features);
                for (const sub of chain.subtables) {
                    const run = RUN[sub.type];
                    if (!sub.parsed || !run || !((sub.subFeatureFlags & flags) >>> 0)) continue;
                    if (sub.vertical && !sub.bothOrientations) continue;
                    const reverse = sub.logicalOrder ? sub.descending : sub.descending !== backward;
                    if (reverse) info.reverse();
                    info = run(sub, info, state);
                    if (reverse) info.reverse();
                }
            }
            return { glyphs: info.filter((g) => g.glyph !== DELETED_GLYPH), truncated: state.truncated };
        }

        return { applyMorx, chainFlags };
    }
};
