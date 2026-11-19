// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Test-only byte builders for the AAT tables (T15, D38):
 * lookup tables, extended state tables, `morx` chains. Used by the
 * `apple-aat` tests and `shaper.test.js`.
 *
 * NOT part of the public surface.
 */

export const be16 = (v) => [(v >> 8) & 0xFF, v & 0xFF];
export const be32 = (v) => [(v >>> 24) & 0xFF, (v >>> 16) & 0xFF, (v >>> 8) & 0xFF, v & 0xFF];

const bsHeader = (unitSize, nUnits) => [...be16(unitSize), ...be16(nUnits), ...be16(0), ...be16(0), ...be16(0)];

/** Format 0: one value per glyph from 0. */
export const lookup0 = (values) => [...be16(0), ...values.flatMap(be16)];

/** Format 2: segments `[first, last, value]`, with the 0xFFFF terminator unless `terminator` is false. */
export function lookup2(segs, terminator = true) {
    const units = [...segs].sort((a, b) => a[1] - b[1]).map(([f, l, v]) => [...be16(l), ...be16(f), ...be16(v)]);
    if (terminator) units.push([...be16(0xFFFF), ...be16(0xFFFF), ...be16(0)]);
    return [...be16(2), ...bsHeader(6, units.length), ...units.flat()];
}

/** Format 4: segments `[first, last, values[]]`, each value array after the units. */
export function lookup4(segs) {
    const sorted = [...segs].sort((a, b) => a[1] - b[1]);
    const n = sorted.length + 1;
    let at = 12 + 6 * n;
    const units = [];
    const arrays = [];
    for (const [f, l, vals] of sorted) {
        units.push(...be16(l), ...be16(f), ...be16(at));
        arrays.push(...vals.flatMap(be16));
        at += 2 * vals.length;
    }
    units.push(...be16(0xFFFF), ...be16(0xFFFF), ...be16(0));
    return [...be16(4), ...bsHeader(6, n), ...units, ...arrays];
}

/** Format 6: `{ glyph: value }`, with the 0xFFFF terminator. */
export function lookup6(map) {
    const units = Object.entries(map).map(([g, v]) => [Number(g), v]).sort((a, b) => a[0] - b[0]).map(([g, v]) => [...be16(g), ...be16(v)]);
    units.push([...be16(0xFFFF), ...be16(0)]);
    return [...be16(6), ...bsHeader(4, units.length), ...units.flat()];
}

/** Format 8: `values` from `first`. */
export const lookup8 = (first, values) => [...be16(8), ...be16(first), ...be16(values.length), ...values.flatMap(be16)];

/** Format 10: `values` of `unitSize` bytes from `first`. */
export function lookup10(unitSize, first, values) {
    const v = (x) => (unitSize === 1 ? [x & 0xFF] : unitSize === 2 ? be16(x) : be32(x));
    return [...be16(10), ...be16(unitSize), ...be16(first), ...be16(values.length), ...values.flatMap(v)];
}

/**
 * An extended state table: the header (`nClasses` and the offsets of the
 * class lookup, the state array, the entry table, then one per `extras`
 * blob), followed by those parts in that order.
 */
export function stx({ nClasses, classes, states, entries, extras = [] }) {
    const head = 16 + 4 * extras.length;
    const stateBytes = states.flat().flatMap(be16);
    const entryBytes = entries.flatMap((e) => [...be16(e.newState), ...be16(e.flags), ...(e.data || []).flatMap(be16)]);
    const parts = [classes, stateBytes, entryBytes, ...extras];
    const offs = [];
    let at = head;
    for (const p of parts) { offs.push(at); at += p.length; }
    return [...be32(nClasses), ...offs.flatMap(be32), ...parts.flat()];
}

/** A contextual subtable's substitution list: offsets from the list start, then the lookups. */
export function substitutionList(lookups) {
    let at = 4 * lookups.length;
    const offs = [];
    for (const l of lookups) { offs.push(at); at += l.length; }
    return [...offs.flatMap(be32), ...lookups.flat()];
}

/**
 * A `morx` table (version 2): chains of `{ defaultFlags, features:
 * [{ type, setting, enable, disable }], subtables: [{ type, coverage
 * (the high bits), flags (subFeatureFlags), body }] }`.
 */
export function morx(chains) {
    const out = [...be16(2), ...be16(0), ...be32(chains.length)];
    for (const c of chains) {
        const feats = (c.features || []).flatMap((f) => [...be16(f.type), ...be16(f.setting), ...be32(f.enable >>> 0), ...be32(f.disable >>> 0)]);
        const subs = c.subtables.flatMap((s) => [...be32(12 + s.body.length), ...be32(((s.coverage || 0) | s.type) >>> 0), ...be32((s.flags ?? 1) >>> 0), ...s.body]);
        const len = 16 + feats.length + subs.length;
        out.push(...be32((c.defaultFlags ?? 1) >>> 0), ...be32(len), ...be32((c.features || []).length), ...be32(c.subtables.length), ...feats, ...subs);
    }
    return new Uint8Array(out);
}

/** A `kerx` table (version 2): subtables `{ format, coverage (the high bits), tupleCount, body }`, `body` after the 12-byte header. */
export function kerx(subs) {
    const out = [...be16(2), ...be16(0), ...be32(subs.length)];
    for (const s of subs) out.push(...be32(12 + s.body.length), ...be32(((s.coverage || 0) | s.format) >>> 0), ...be32(s.tupleCount || 0), ...s.body);
    return new Uint8Array(out);
}

/** 32-bit header words, then `parts`; a `{ part: k }` word becomes the offset of part k from `base` before the body (12: the subtable's start). */
export function offsetBody(head, parts, base = 12) {
    const offs = [];
    let at = base + 4 * head.length;
    for (const p of parts) { offs.push(at); at += p.length; }
    return [...head.flatMap((w) => be32(typeof w === 'object' ? offs[w.part] : w)), ...parts.flat()];
}
