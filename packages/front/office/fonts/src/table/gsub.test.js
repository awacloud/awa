// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { tableGsub } from './gsub.js';
import { testRuntime } from './_test-runtime.js';
const { parseGsub, parseGsubSubtable } = testRuntime.resolve('tableGsub');
const { BinaryWriter } = testRuntime.resolve('fontWriter');
const { ParseError } = testRuntime.resolve('fontErrors');

/**
 * Build a minimal GSUB containing a single Lookup Type 1 Single Substitution :
 *   covered glyphs : [10] -> substituted by +5 (gid 15)
 */
function buildGsubType1Format1() {
    const w = new BinaryWriter();
    // Header (10 bytes)
    w.writeUint16(1).writeUint16(0);        // version 1.0
    w.writeUint16(10).writeUint16(0).writeUint16(0);  // scriptList, featureList, lookupList offsets (placeholders)
    // ScriptList (offset 10): count=0
    w.writeUint16(0);
    // FeatureList (offset 12)
    w.writeUint16(0);
    // LookupList (offset 14)
    w.writeUint16(1);                        // 1 lookup
    w.writeUint16(4);                        // lookup[0] offset (from lookupList start) = 4
    // Lookup at offset 14+4 = 18
    w.writeUint16(1);                        // lookup type 1
    w.writeUint16(0);                        // flag
    w.writeUint16(1);                        // 1 subtable
    w.writeUint16(8);                        // subtable offset from lookup = 8
    // Subtable at offset 18+8 = 26: format 1, coverage offset = 6, delta = +5
    w.writeUint16(1);                        // format
    w.writeUint16(6);                        // coverage offset = 6 (from subtable start)
    w.writeInt16(5);                         // deltaGlyphID
    // Coverage at offset 26+6 = 32: format 1, 1 glyph [10]
    w.writeUint16(1).writeUint16(1).writeUint16(10);
    const bytes = w.finalize();
    // Patch top-header offsets
    bytes[4] = 0; bytes[5] = 10;     // scriptListOffset = 10
    bytes[6] = 0; bytes[7] = 12;     // featureListOffset = 12
    bytes[8] = 0; bytes[9] = 14;     // lookupListOffset = 14
    return bytes;
}

/**
 * Build a GSUB 8 ReverseChainSingleSubstFormat1 subtable.
 * Every coverage is a format-1 coverage of a single glyph (6 bytes).
 */
function buildReverseChain({ coverageGid, backtrack, lookahead, substitutes, format = 1, glyphCount = substitutes.length }) {
    const headerSize = 2 + 2 + 2 + 2 * backtrack.length + 2 + 2 * lookahead.length + 2 + 2 * substitutes.length;
    const w = new BinaryWriter();
    let next = headerSize;
    const covOffset = next; next += 6;
    const btOffsets = backtrack.map(() => { const o = next; next += 6; return o; });
    const laOffsets = lookahead.map(() => { const o = next; next += 6; return o; });
    w.writeUint16(format);
    w.writeUint16(covOffset);
    w.writeUint16(backtrack.length);
    for (const o of btOffsets) w.writeUint16(o);
    w.writeUint16(lookahead.length);
    for (const o of laOffsets) w.writeUint16(o);
    w.writeUint16(glyphCount);
    for (const g of substitutes) w.writeUint16(g);
    for (const g of [coverageGid, ...backtrack, ...lookahead])
        w.writeUint16(1).writeUint16(1).writeUint16(g);
    return w.finalize();
}

/** Wrap one subtable in a GSUB with a single lookup of the given type. */
function buildGsubWithLookup(type, subtableBytes) {
    const w = new BinaryWriter();
    w.writeUint16(1).writeUint16(0);
    w.writeUint16(10).writeUint16(12).writeUint16(14);
    w.writeUint16(0);                        // ScriptList @10
    w.writeUint16(0);                        // FeatureList @12
    w.writeUint16(1).writeUint16(4);         // LookupList @14
    w.writeUint16(type).writeUint16(0).writeUint16(1).writeUint16(8);   // Lookup @18
    for (const byte of subtableBytes) w.writeUint8(byte);               // subtable @26
    return w.finalize();
}

describe('tableGsub', () => {
    test('module metadata', () => { expect(tableGsub.name).toBe('tableGsub'); });

    test('parses type 1 format 1 substitution', () => {
        const g = parseGsub(buildGsubType1Format1());
        expect(g.lookups.length).toBe(1);
        const lk = g.lookups[0];
        expect(lk.type).toBe(1);
        expect(lk.subtables.length).toBe(1);
        expect(lk.subtables[0].substitute(10)).toBe(15);
        expect(lk.subtables[0].substitute(11)).toBeNull();
    });

    test('rejects short header', () => {
        expect(() => parseGsub(new Uint8Array(8))).toThrow(ParseError);
    });

    test('rejects unknown major version', () => {
        const w = new BinaryWriter();
        w.writeUint16(9).writeUint16(0).writeUint16(0).writeUint16(0).writeUint16(0);
        expect(() => parseGsub(w.finalize())).toThrow(ParseError);
    });

    /* --- Type 2 : Multiple ---------------------------------- */
    test('parses type 2 Multiple Substitution', () => {
        const w = new BinaryWriter();
        // Subtable header
        w.writeUint16(1);    // format
        w.writeUint16(10);   // coverageOffset
        w.writeUint16(1);    // sequenceCount
        w.writeUint16(16);   // seq[0] offset
        // pad to 10
        w.writeUint16(0);    // dummy
        w.writeUint16(0);    // dummy
        // (We need coverage at offset 10) -- actually offset 10 means we've already written 10 bytes.
        // Let's restart with explicit offsets.
        const w2 = new BinaryWriter();
        // header: format=1 (2B), coverageOffset (2B), seqCount (2B), seqOffsets[1] (2B) -> 8 bytes
        w2.writeUint16(1);
        w2.writeUint16(8);      // coverage at offset 8
        w2.writeUint16(1);
        w2.writeUint16(14);     // sequence at offset 14
        // Coverage @ 8 : format 1, count 1, glyph 42
        w2.writeUint16(1).writeUint16(1).writeUint16(42);
        // Sequence @ 14 : glyphCount 3, glyph[3]
        w2.writeUint16(3).writeUint16(100).writeUint16(101).writeUint16(102);
        const sub = parseGsubSubtable(2, w2.finalize());
        expect(sub.type).toBe(2);
        expect(sub.format).toBe(1);
        expect(sub.sequences[0]).toEqual([100, 101, 102]);
        const r = sub.applyAt([42, 99], 0);
        expect(r.gids).toEqual([100, 101, 102]);
        expect(r.consumed).toBe(1);
        expect(sub.applyAt([7], 0)).toBeNull();
    });

    /* --- Type 3 : Alternate --------------------------------- */
    test('parses type 3 Alternate Substitution', () => {
        const w = new BinaryWriter();
        // format=1, coverageOff, altSetCount=1, setOff[0]
        w.writeUint16(1).writeUint16(8).writeUint16(1).writeUint16(14);
        // Coverage @8: fmt1, count1, glyph 5
        w.writeUint16(1).writeUint16(1).writeUint16(5);
        // AlternateSet @14: count 2, glyph[200, 201]
        w.writeUint16(2).writeUint16(200).writeUint16(201);
        const sub = parseGsubSubtable(3, w.finalize());
        expect(sub.type).toBe(3);
        expect(sub.alternate(5, 0)).toBe(200);
        expect(sub.alternate(5, 1)).toBe(201);
        expect(sub.alternate(5, 2)).toBeNull();
        expect(sub.alternate(99)).toBeNull();
    });

    /* --- Type 5 : Contextual (format 3) --------------------- */
    test('parses type 5 Contextual Substitution format 3', () => {
        const w = new BinaryWriter();
        // format=3, glyphCount=2, substCount=1, covOff[0], covOff[1], substLookupRec
        // header: 2+2+2 = 6, +2*2 = 10, +4 = 14
        w.writeUint16(3);
        w.writeUint16(2);          // glyphCount
        w.writeUint16(1);          // substCount
        w.writeUint16(14);         // covOff[0] -> covA
        w.writeUint16(20);         // covOff[1] -> covB
        w.writeUint16(0);          // substLookupRec.sequenceIndex
        w.writeUint16(7);          // substLookupRec.lookupListIndex
        // Coverage A @14: fmt1, count1, gid 11
        w.writeUint16(1).writeUint16(1).writeUint16(11);
        // Coverage B @20: fmt1, count1, gid 22
        w.writeUint16(1).writeUint16(1).writeUint16(22);
        const sub = parseGsubSubtable(5, w.finalize());
        expect(sub.type).toBe(5);
        expect(sub.format).toBe(3);
        expect(sub.coverages.length).toBe(2);
        expect(sub.coverages[0].lookup(11)).toBe(0);
        expect(sub.coverages[1].lookup(22)).toBe(0);
        expect(sub.substLookupRecords).toEqual([{ sequenceIndex: 0, lookupListIndex: 7 }]);
    });

    /* --- Type 6 : Chaining Contextual (format 3) ------------ */
    test('parses type 6 Chaining Contextual Substitution format 3', () => {
        const w = new BinaryWriter();
        // header: 2 (format) + 2 (backtrackCount=1) + 2 (backtrackOff) +
        //         2 (inputCount=1) + 2 (inputOff) + 2 (lookaheadCount=1) +
        //         2 (lookaheadOff) + 2 (substCount=1) + 4 (record) = 20 bytes
        w.writeUint16(3);
        w.writeUint16(1).writeUint16(20);          // backtrack
        w.writeUint16(1).writeUint16(26);          // input
        w.writeUint16(1).writeUint16(32);          // lookahead
        w.writeUint16(1);                          // substCount
        w.writeUint16(0).writeUint16(3);           // record
        // Coverages: each fmt1, count1, gid X (6 bytes)
        w.writeUint16(1).writeUint16(1).writeUint16(50);   // backtrack @20
        w.writeUint16(1).writeUint16(1).writeUint16(60);   // input @26
        w.writeUint16(1).writeUint16(1).writeUint16(70);   // lookahead @32
        const sub = parseGsubSubtable(6, w.finalize());
        expect(sub.type).toBe(6);
        expect(sub.format).toBe(3);
        expect(sub.backtrackCoverages[0].lookup(50)).toBe(0);
        expect(sub.inputCoverages[0].lookup(60)).toBe(0);
        expect(sub.lookaheadCoverages[0].lookup(70)).toBe(0);
        expect(sub.substLookupRecords[0].lookupListIndex).toBe(3);
    });

    /* --- Type 7 : Extension --------------------------------- */
    test('parses type 7 Extension Substitution (wraps type 1)', () => {
        const w = new BinaryWriter();
        // Extension header: format(2) + extType(2) + extOffset(4) = 8 bytes
        w.writeUint16(1);
        w.writeUint16(1);           // wrap type 1
        w.writeUint32(8);           // offset to inner subtable
        // Inner Single Subst @8: format 1, coverageOff=6, delta=5
        w.writeUint16(1);
        w.writeUint16(6);
        w.writeInt16(5);
        // Coverage @ inner+6 = 14: fmt1, count1, gid 10
        w.writeUint16(1).writeUint16(1).writeUint16(10);
        const sub = parseGsubSubtable(7, w.finalize());
        expect(sub.type).toBe(7);
        expect(sub.extensionLookupType).toBe(1);
        expect(sub.subtable.type).toBe(1);
        expect(sub.subtable.substitute(10)).toBe(15);
    });

    /* --- Type 8 : Reverse Chaining Contextual Single -------- */
    test('parses type 8 Reverse Chaining Contextual Single Substitution', () => {
        const sub = parseGsubSubtable(8, buildReverseChain({
            coverageGid: 30, backtrack: [31], lookahead: [32], substitutes: [100, 101]
        }));
        expect(sub.type).toBe(8);
        expect(sub.format).toBe(1);
        expect(sub.coverage.lookup(30)).toBe(0);
        expect(sub.coverage.lookup(31)).toBeNull();
        expect(sub.backtrackCoverages.length).toBe(1);
        expect(sub.backtrackCoverages[0].lookup(31)).toBe(0);
        expect(sub.lookaheadCoverages.length).toBe(1);
        expect(sub.lookaheadCoverages[0].lookup(32)).toBe(0);
        expect(sub.substitutes).toEqual([100, 101]);
    });

    test('type 8 with no backtrack and no lookahead yields empty arrays', () => {
        const sub = parseGsubSubtable(8, buildReverseChain({
            coverageGid: 7, backtrack: [], lookahead: [], substitutes: [9]
        }));
        expect(sub.backtrackCoverages).toEqual([]);
        expect(sub.lookaheadCoverages).toEqual([]);
        expect(sub.substitutes).toEqual([9]);
        expect(sub.coverage.lookup(7)).toBe(0);
    });

    test('type 8 rejects an unsupported format', () => {
        const bytes = buildReverseChain({ coverageGid: 7, backtrack: [], lookahead: [], substitutes: [9], format: 2 });
        let err;
        try { parseGsubSubtable(8, bytes); } catch (e) { err = e; }
        expect(err).toBeInstanceOf(ParseError);
        expect(err.code).toBe('fonts/gsub-reverse-format');
    });

    test('type 8 truncated subtable throws a reader error', () => {
        const bytes = buildReverseChain({
            coverageGid: 7, backtrack: [], lookahead: [], substitutes: [9, 10], glyphCount: 2
        });
        // glyphCount (at offset 8) claims far more substitutes than the bytes hold
        bytes[8] = 0x7f; bytes[9] = 0xff;
        let err;
        try { parseGsubSubtable(8, bytes); } catch (e) { err = e; }
        expect(err).toBeInstanceOf(ParseError);
        expect(err.code.startsWith('fonts/reader-')).toBe(true);
    });

    test('type 7 Extension wrapping type 8 decodes the inner subtable', () => {
        const inner = buildReverseChain({ coverageGid: 5, backtrack: [6], lookahead: [], substitutes: [50] });
        const w = new BinaryWriter();
        w.writeUint16(1).writeUint16(8).writeUint32(8);
        for (const byte of inner) w.writeUint8(byte);
        const sub = parseGsubSubtable(7, w.finalize());
        expect(sub.type).toBe(7);
        expect(sub.extensionLookupType).toBe(8);
        expect(sub.subtable.type).toBe(8);
        expect(sub.subtable.substitutes).toEqual([50]);
        expect(sub.subtable.backtrackCoverages[0].lookup(6)).toBe(0);
    });

    test('parseGsub decodes a type 8 lookup with no undecoded subtable', () => {
        const inner = buildReverseChain({ coverageGid: 5, backtrack: [6], lookahead: [7], substitutes: [50] });
        const g = parseGsub(buildGsubWithLookup(8, inner));
        expect(g.lookups.length).toBe(1);
        expect(g.lookups[0].type).toBe(8);
        const st = g.lookups[0].subtables[0];
        expect(st.type).toBe(8);
        expect(st.substitutes).toEqual([50]);
        expect(JSON.stringify(g)).not.toContain('"parsed":false');
    });
});
