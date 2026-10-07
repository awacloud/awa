// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { tableGpos } from './gpos.js';
import { testRuntime } from './_test-runtime.js';
const { parseGpos, parseGposSubtable, buildKerningTable, VALUE_FORMAT } = testRuntime.resolve('tableGpos');
const { BinaryWriter } = testRuntime.resolve('fontWriter');
const { ParseError } = testRuntime.resolve('fontErrors');

/**
 * Build a minimal GPOS containing one type-1 Single Adjustment :
 *   covered : gid 7 â†’ xAdvance += 50.
 */
function buildGposType1() {
    const w = new BinaryWriter();
    w.writeUint16(1).writeUint16(0);
    w.writeUint16(10).writeUint16(0).writeUint16(0);   // scriptList=10, featureList, lookupList placeholders
    w.writeUint16(0);                                   // ScriptList: 0 scripts
    w.writeUint16(0);                                   // FeatureList: 0
    w.writeUint16(1).writeUint16(4);                    // LookupList: 1 lookup, offset 4
    // Lookup at +4
    w.writeUint16(1).writeUint16(0).writeUint16(1).writeUint16(8);
    // Subtable at +8
    w.writeUint16(1);                                   // format 1
    w.writeUint16(8);                                   // coverage offset (from subtable start) = 8
    w.writeUint16(VALUE_FORMAT.X_ADVANCE);              // valueFormat
    w.writeInt16(50);                                    // value.xAdvance
    // Coverage at +8 inside subtable: format 1, 1 glyph [7]
    w.writeUint16(1).writeUint16(1).writeUint16(7);
    const bytes = w.finalize();
    bytes[4] = 0; bytes[5] = 10;
    bytes[6] = 0; bytes[7] = 12;
    bytes[8] = 0; bytes[9] = 14;
    return bytes;
}

describe('tableGpos', () => {
    test('module metadata', () => { expect(tableGpos.name).toBe('tableGpos'); });

    test('parses single adjustment', () => {
        const g = parseGpos(buildGposType1());
        expect(g.lookups[0].type).toBe(1);
        const v = g.lookups[0].subtables[0].adjust(7);
        expect(v.xAdvance).toBe(50);
        expect(g.lookups[0].subtables[0].adjust(99)).toBeNull();
    });

    test('rejects short header', () => {
        expect(() => parseGpos(new Uint8Array(8))).toThrow(ParseError);
    });

    test('rejects unknown major version', () => {
        const w = new BinaryWriter();
        w.writeUint16(2).writeUint16(0).writeUint16(0).writeUint16(0).writeUint16(0);
        expect(() => parseGpos(w.finalize())).toThrow(ParseError);
    });

    /* --- Type 3 : Cursive ----------------------------------- */
    test('parses type 3 Cursive Adjustment', () => {
        const w = new BinaryWriter();
        // header: format(2)+covOff(2)+count(2)+1 record(4) = 10
        w.writeUint16(1);
        w.writeUint16(10);          // coverageOff
        w.writeUint16(1);            // entryExitCount
        w.writeUint16(16);          // entryAnchorOff
        w.writeUint16(22);          // exitAnchorOff
        // Coverage @10: fmt1, count1, gid 9
        w.writeUint16(1).writeUint16(1).writeUint16(9);
        // Anchor entry @16: fmt1, x=10, y=20
        w.writeUint16(1).writeInt16(10).writeInt16(20);
        // Anchor exit @22: fmt1, x=30, y=40
        w.writeUint16(1).writeInt16(30).writeInt16(40);
        const sub = parseGposSubtable(3, w.finalize());
        expect(sub.type).toBe(3);
        const r = sub.anchorsFor(9);
        expect(r.entryAnchor.xCoordinate).toBe(10);
        expect(r.exitAnchor.yCoordinate).toBe(40);
        expect(sub.anchorsFor(0)).toBeNull();
    });

    /* --- Type 4 : Mark-to-Base ------------------------------ */
    test('parses type 4 Mark-to-Base Attachment', () => {
        const w = new BinaryWriter();
        // header: fmt(2)+markCovOff(2)+baseCovOff(2)+markClassCount(2)+markArrOff(2)+baseArrOff(2) = 12
        w.writeUint16(1);
        w.writeUint16(12);    // markCovOff
        w.writeUint16(18);    // baseCovOff
        w.writeUint16(1);     // markClassCount
        w.writeUint16(24);    // markArrayOff
        w.writeUint16(34);    // baseArrayOff
        // Mark coverage @12: fmt1 count1 gid 100
        w.writeUint16(1).writeUint16(1).writeUint16(100);
        // Base coverage @18: fmt1 count1 gid 50
        w.writeUint16(1).writeUint16(1).writeUint16(50);
        // MarkArray @24: count1, record (class=0, anchorOff=6) -> 6 bytes header, anchor @24+6=30
        w.writeUint16(1).writeUint16(0).writeUint16(6);
        // Mark anchor @30: fmt1 x=1 y=2 (6 bytes -> ends @36 but baseArray expected @34)
        // wait â€” MarkArray starts at 24, anchorOff 6 â†’ anchor @30. anchor is 6 bytes â†’ ends @36.
        // baseArrayOff was 34 â†’ overlap! Recompute: baseArrayOff should be 36.
        // Easier: rebuild cleanly
        const w2 = new BinaryWriter();
        w2.writeUint16(1);            // format
        w2.writeUint16(12);           // markCovOff @12
        w2.writeUint16(18);           // baseCovOff @18
        w2.writeUint16(1);            // markClassCount
        w2.writeUint16(24);           // markArrayOff @24
        w2.writeUint16(36);           // baseArrayOff @36
        // Mark coverage @12
        w2.writeUint16(1).writeUint16(1).writeUint16(100);
        // Base coverage @18
        w2.writeUint16(1).writeUint16(1).writeUint16(50);
        // MarkArray @24: count(2)+record(4) = 6 bytes; anchor @24+6=30 (6 bytes -> ends @36)
        w2.writeUint16(1);                            // markCount
        w2.writeUint16(0).writeUint16(6);             // markClass=0, anchorOff=6
        w2.writeUint16(1).writeInt16(1).writeInt16(2); // anchor fmt1 x=1 y=2 @30
        // BaseArray @36: baseCount(2) + 1*1 anchorOff(2) = 4 bytes; anchor @36+4=40
        w2.writeUint16(1);                            // baseCount
        w2.writeUint16(4);                            // anchorOff=4 from BaseArray start
        w2.writeUint16(1).writeInt16(3).writeInt16(4); // anchor fmt1 x=3 y=4 @40
        const sub = parseGposSubtable(4, w2.finalize());
        expect(sub.type).toBe(4);
        expect(sub.markArray[0].markClass).toBe(0);
        expect(sub.markArray[0].anchor.xCoordinate).toBe(1);
        expect(sub.baseArray[0][0].xCoordinate).toBe(3);
        expect(sub.markCoverage.lookup(100)).toBe(0);
        expect(sub.baseCoverage.lookup(50)).toBe(0);
    });

    /* --- Type 5 : Mark-to-Ligature -------------------------- */
    test('parses type 5 Mark-to-Ligature', () => {
        const w = new BinaryWriter();
        // header: fmt(2)+markCov(2)+ligCov(2)+markClassCount(2)+markArr(2)+ligArr(2) = 12
        w.writeUint16(1);
        w.writeUint16(12);    // markCovOff
        w.writeUint16(18);    // ligCovOff
        w.writeUint16(1);     // markClassCount
        w.writeUint16(24);    // markArrOff
        w.writeUint16(36);    // ligArrOff
        // markCov @12
        w.writeUint16(1).writeUint16(1).writeUint16(200);
        // ligCov @18
        w.writeUint16(1).writeUint16(1).writeUint16(150);
        // MarkArray @24 : count(2)+rec(4)=6 ; anchor @30 (6B) -> @36
        w.writeUint16(1).writeUint16(0).writeUint16(6);
        w.writeUint16(1).writeInt16(7).writeInt16(8);
        // LigatureArray @36: ligCount(2) + 1*ligAttachOff(2) = 4 bytes; attach @36+4=40
        w.writeUint16(1);
        w.writeUint16(4);
        // LigatureAttach @40: componentCount(2)+1*1 anchorOff(2)=4 ; anchor @40+4=44
        w.writeUint16(1);
        w.writeUint16(4);
        // anchor @44
        w.writeUint16(1).writeInt16(9).writeInt16(10);
        const sub = parseGposSubtable(5, w.finalize());
        expect(sub.type).toBe(5);
        expect(sub.ligatureArray[0][0][0].xCoordinate).toBe(9);
        expect(sub.markArray[0].anchor.yCoordinate).toBe(8);
    });

    /* --- Type 6 : Mark-to-Mark ------------------------------ */
    test('parses type 6 Mark-to-Mark', () => {
        const w = new BinaryWriter();
        // identical layout to MarkBase
        w.writeUint16(1);
        w.writeUint16(12);    // mark1CovOff
        w.writeUint16(18);    // mark2CovOff
        w.writeUint16(1);     // markClassCount
        w.writeUint16(24);    // mark1ArrOff
        w.writeUint16(36);    // mark2ArrOff
        w.writeUint16(1).writeUint16(1).writeUint16(300);
        w.writeUint16(1).writeUint16(1).writeUint16(301);
        // Mark1Array @24
        w.writeUint16(1).writeUint16(0).writeUint16(6);
        w.writeUint16(1).writeInt16(11).writeInt16(12);
        // Mark2Array @36
        w.writeUint16(1).writeUint16(4);
        w.writeUint16(1).writeInt16(13).writeInt16(14);
        const sub = parseGposSubtable(6, w.finalize());
        expect(sub.type).toBe(6);
        expect(sub.mark1Array[0].anchor.xCoordinate).toBe(11);
        expect(sub.mark2Array[0][0].yCoordinate).toBe(14);
    });

    /* --- Type 7 : Contextual Positioning (format 3) --------- */
    test('parses type 7 Contextual Positioning format 3', () => {
        const w = new BinaryWriter();
        w.writeUint16(3);
        w.writeUint16(1);     // glyphCount
        w.writeUint16(1);     // posCount
        w.writeUint16(12);    // covOff[0]
        w.writeUint16(0).writeUint16(5);   // record
        w.writeUint16(1).writeUint16(1).writeUint16(77);  // cov @12
        const sub = parseGposSubtable(7, w.finalize());
        expect(sub.type).toBe(7);
        expect(sub.format).toBe(3);
        expect(sub.coverages[0].lookup(77)).toBe(0);
        expect(sub.posLookupRecords[0].lookupListIndex).toBe(5);
    });

    /* --- Type 8 : Chaining Contextual Positioning (fmt 3) --- */
    test('parses type 8 Chaining Contextual Positioning format 3', () => {
        const w = new BinaryWriter();
        // 2 + 2+2 + 2+2 + 2+2 + 2 + 4 = 20
        w.writeUint16(3);
        w.writeUint16(1).writeUint16(20);
        w.writeUint16(1).writeUint16(26);
        w.writeUint16(1).writeUint16(32);
        w.writeUint16(1);
        w.writeUint16(0).writeUint16(9);
        w.writeUint16(1).writeUint16(1).writeUint16(80);   // backtrack @20
        w.writeUint16(1).writeUint16(1).writeUint16(90);   // input @26
        w.writeUint16(1).writeUint16(1).writeUint16(100);  // lookahead @32
        const sub = parseGposSubtable(8, w.finalize());
        expect(sub.type).toBe(8);
        expect(sub.format).toBe(3);
        expect(sub.backtrackCoverages[0].lookup(80)).toBe(0);
        expect(sub.inputCoverages[0].lookup(90)).toBe(0);
        expect(sub.lookaheadCoverages[0].lookup(100)).toBe(0);
        expect(sub.posLookupRecords[0].lookupListIndex).toBe(9);
    });

    /* --- Type 8 : Chaining Contextual Positioning (fmt 1, coverage-based, OT v1.9 §5.7.2) --- */
    test('parses type 8 Chaining Contextual Positioning format 1', () => {
        const w = new BinaryWriter();
        w.writeUint16(1);    // format @0
        w.writeUint16(8);    // coverageOffset @2 -> 8
        w.writeUint16(1);    // chainSetCount @4
        w.writeUint16(14);   // setOffsets[0] @6 -> 14 (ChainPosRuleSet)
        // Coverage format 1 @8: 1 glyph (77)
        w.writeUint16(1).writeUint16(1).writeUint16(77);
        // ChainPosRuleSet @14
        w.writeUint16(1);    // ruleCount @14
        w.writeUint16(4);    // ruleOffsets[0] @16, relative to 14 -> rule @18
        // ChainPosRule @18
        w.writeUint16(1).writeUint16(80);          // backtrackGlyphCount=1, backtrack[0]=80
        w.writeUint16(2).writeUint16(90);          // inputGlyphCount=2, input[0]=90
        w.writeUint16(1).writeUint16(100);         // lookaheadGlyphCount=1, lookahead[0]=100
        w.writeUint16(1);                          // posCount=1
        w.writeUint16(0).writeUint16(9);           // posLookupRecord: sequenceIndex=0, lookupListIndex=9
        const sub = parseGposSubtable(8, w.finalize());
        expect(sub.type).toBe(8);
        expect(sub.format).toBe(1);
        expect(sub.coverage.lookup(77)).toBe(0);
        expect(sub.ruleSets.length).toBe(1);
        expect(sub.ruleSets[0].length).toBe(1);
        expect(sub.ruleSets[0][0].backtrack).toEqual([80]);
        expect(sub.ruleSets[0][0].input).toEqual([90]);
        expect(sub.ruleSets[0][0].lookahead).toEqual([100]);
        expect(sub.ruleSets[0][0].posLookupRecords[0].lookupListIndex).toBe(9);
    });

    /* --- Type 8 : Chaining Contextual Positioning (fmt 2, class-based, OT v1.9 §5.7.3) --- */
    test('parses type 8 Chaining Contextual Positioning format 2', () => {
        const w = new BinaryWriter();
        w.writeUint16(2);    // format @0
        w.writeUint16(14);   // coverageOffset @2 -> 14
        w.writeUint16(20);   // backtrackClassDefOffset @4 -> 20
        w.writeUint16(28);   // inputClassDefOffset @6 -> 28
        w.writeUint16(36);   // lookaheadClassDefOffset @8 -> 36
        w.writeUint16(1);    // chainClassSetCount @10
        w.writeUint16(44);   // setOffsets[0] @12 -> 44
        // Coverage format 1 @14: glyph 50
        w.writeUint16(1).writeUint16(1).writeUint16(50);
        // backtrackClassDef format 1 @20: startGlyphID=80, classes=[1]
        w.writeUint16(1).writeUint16(80).writeUint16(1).writeUint16(1);
        // inputClassDef format 1 @28: startGlyphID=90, classes=[2]
        w.writeUint16(1).writeUint16(90).writeUint16(1).writeUint16(2);
        // lookaheadClassDef format 1 @36: startGlyphID=100, classes=[3]
        w.writeUint16(1).writeUint16(100).writeUint16(1).writeUint16(3);
        // ChainPosClassSet (reuses ChainPosRuleSet layout) @44
        w.writeUint16(1);    // ruleCount @44
        w.writeUint16(4);    // ruleOffsets[0] @46, relative to 44 -> rule @48
        // ChainPosClassRule @48 (class numbers instead of gids)
        w.writeUint16(1).writeUint16(1);           // backtrackGlyphCount=1, backtrack[0]=class 1
        w.writeUint16(2).writeUint16(2);           // inputGlyphCount=2, input[0]=class 2
        w.writeUint16(1).writeUint16(3);           // lookaheadGlyphCount=1, lookahead[0]=class 3
        w.writeUint16(1);                          // posCount=1
        w.writeUint16(0).writeUint16(11);          // posLookupRecord: sequenceIndex=0, lookupListIndex=11
        const sub = parseGposSubtable(8, w.finalize());
        expect(sub.type).toBe(8);
        expect(sub.format).toBe(2);
        expect(sub.coverage.lookup(50)).toBe(0);
        expect(sub.backtrackClassDef.lookup(80)).toBe(1);
        expect(sub.inputClassDef.lookup(90)).toBe(2);
        expect(sub.lookaheadClassDef.lookup(100)).toBe(3);
        expect(sub.classSets.length).toBe(1);
        expect(sub.classSets[0][0].backtrack).toEqual([1]);
        expect(sub.classSets[0][0].input).toEqual([2]);
        expect(sub.classSets[0][0].lookahead).toEqual([3]);
        expect(sub.classSets[0][0].posLookupRecords[0].lookupListIndex).toBe(11);
    });

    /* --- Type 9 : Extension Positioning --------------------- */
    test('parses type 9 Extension Positioning (wraps type 1)', () => {
        const w = new BinaryWriter();
        w.writeUint16(1);
        w.writeUint16(1);    // wrap type 1
        w.writeUint32(8);    // ext offset
        // Inner SingleAdj @8: fmt1, covOff=8, valueFormat=X_ADVANCE, value 50
        w.writeUint16(1);
        w.writeUint16(8);
        w.writeUint16(VALUE_FORMAT.X_ADVANCE);
        w.writeInt16(50);
        // Coverage @ inner+8 = 16: fmt1 count1 gid 7
        w.writeUint16(1).writeUint16(1).writeUint16(7);
        const sub = parseGposSubtable(9, w.finalize());
        expect(sub.type).toBe(9);
        expect(sub.extensionLookupType).toBe(1);
        expect(sub.subtable.type).toBe(1);
        expect(sub.subtable.adjust(7).xAdvance).toBe(50);
    });

    test('buildKerningTable handles missing/empty gpos', () => {
        expect(buildKerningTable(null).size).toBe(0);
        expect(buildKerningTable({}).size).toBe(0);
        expect(buildKerningTable({ lookups: [] }).size).toBe(0);
    });
});
