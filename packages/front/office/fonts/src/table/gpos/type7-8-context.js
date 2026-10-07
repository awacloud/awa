// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview GPOS Types 7 & 8 — Contextual / Chaining Contextual
 * Positioning.
 *
 * Package-private helper for {@link ../gpos.js}.
 *
 * @module fonts/table/gpos/type7-8-context
 */

import { fontErrors } from '../../errors.js';
import { fontReader } from '../../primitives/reader.js';
import { layoutClassDefinitions } from '../../layout/classDefinitions.js';
import { tableGposValueRecord } from './value-record.js';

export const tableGposType78 = {
    name: 'tableGposType78',
    dependencies: ['fontErrors', 'fontReader', 'layoutClassDefinitions', 'tableGposValueRecord'],
    deps: [fontErrors, fontReader, layoutClassDefinitions, tableGposValueRecord],
    factory(errors, reader, classDefs, valueRec) {
        const { ParseError } = errors;
        const { BinaryReader } = reader;
        const { parseCoverage, parseClassDef } = classDefs;
        const { subBytes, readGposSubstLookupRecords } = valueRec;

        function parsePosSequenceRuleSet(bytes, offset) {
            const r = new BinaryReader(bytes, offset, bytes.length - offset);
            const ruleCount = r.readUint16();
            const ruleOffsets = new Array(ruleCount);
            for (let i = 0; i < ruleCount; i++) ruleOffsets[i] = r.readUint16();
            return ruleOffsets.map(off => {
                const ruleStart = offset + off;
                const rr = new BinaryReader(bytes, ruleStart, bytes.length - ruleStart);
                const glyphCount = rr.readUint16();
                const posCount = rr.readUint16();
                const input = new Array(glyphCount - 1);
                for (let i = 0; i < glyphCount - 1; i++) input[i] = rr.readUint16();
                const posLookupRecords = readGposSubstLookupRecords(rr, posCount);
                return { input, posLookupRecords };
            });
        }

        function parsePosChainRuleSet(bytes, offset) {
            const r = new BinaryReader(bytes, offset, bytes.length - offset);
            const ruleCount = r.readUint16();
            const ruleOffsets = new Array(ruleCount);
            for (let i = 0; i < ruleCount; i++) ruleOffsets[i] = r.readUint16();
            return ruleOffsets.map(off => {
                const ruleStart = offset + off;
                const rr = new BinaryReader(bytes, ruleStart, bytes.length - ruleStart);
                const backtrackGlyphCount = rr.readUint16();
                const backtrack = new Array(backtrackGlyphCount);
                for (let i = 0; i < backtrackGlyphCount; i++) backtrack[i] = rr.readUint16();
                const inputGlyphCount = rr.readUint16();
                const input = new Array(inputGlyphCount - 1);
                for (let i = 0; i < inputGlyphCount - 1; i++) input[i] = rr.readUint16();
                const lookaheadGlyphCount = rr.readUint16();
                const lookahead = new Array(lookaheadGlyphCount);
                for (let i = 0; i < lookaheadGlyphCount; i++) lookahead[i] = rr.readUint16();
                const posCount = rr.readUint16();
                const posLookupRecords = readGposSubstLookupRecords(rr, posCount);
                return { backtrack, input, lookahead, posLookupRecords };
            });
        }

        function parseContextPos(bytes) {
            const r = new BinaryReader(bytes);
            const format = r.readUint16();
            if (format === 1) {
                const coverageOffset = r.readUint16();
                const seqRuleSetCount = r.readUint16();
                const setOffsets = new Array(seqRuleSetCount);
                for (let i = 0; i < seqRuleSetCount; i++) setOffsets[i] = r.readUint16();
                const cov = parseCoverage(subBytes(bytes, coverageOffset));
                const ruleSets = setOffsets.map(off => off === 0 ? null : parsePosSequenceRuleSet(bytes, off));
                return { type: 7, format, coverage: cov, ruleSets };
            }
            if (format === 2) {
                const coverageOffset = r.readUint16();
                const classDefOffset = r.readUint16();
                const classSeqRuleSetCount = r.readUint16();
                const setOffsets = new Array(classSeqRuleSetCount);
                for (let i = 0; i < classSeqRuleSetCount; i++) setOffsets[i] = r.readUint16();
                const cov = parseCoverage(subBytes(bytes, coverageOffset));
                const classDef = parseClassDef(subBytes(bytes, classDefOffset));
                const classSets = setOffsets.map(off => off === 0 ? null : parsePosSequenceRuleSet(bytes, off));
                return { type: 7, format, coverage: cov, classDef, classSets };
            }
            if (format === 3) {
                const glyphCount = r.readUint16();
                const posCount = r.readUint16();
                const coverageOffsets = new Array(glyphCount);
                for (let i = 0; i < glyphCount; i++) coverageOffsets[i] = r.readUint16();
                const posLookupRecords = readGposSubstLookupRecords(r, posCount);
                const coverages = coverageOffsets.map(off => parseCoverage(subBytes(bytes, off)));
                return { type: 7, format, coverages, posLookupRecords };
            }
            throw new ParseError('fonts/gpos-context-format', `unsupported GPOS type 7 format ${format}`);
        }

        function parseChainContextPos(bytes) {
            const r = new BinaryReader(bytes);
            const format = r.readUint16();
            if (format === 1) {
                const coverageOffset = r.readUint16();
                const chainSetCount = r.readUint16();
                const setOffsets = new Array(chainSetCount);
                for (let i = 0; i < chainSetCount; i++) setOffsets[i] = r.readUint16();
                const cov = parseCoverage(subBytes(bytes, coverageOffset));
                const ruleSets = setOffsets.map(off => off === 0 ? null : parsePosChainRuleSet(bytes, off));
                return { type: 8, format, coverage: cov, ruleSets };
            }
            if (format === 2) {
                const coverageOffset = r.readUint16();
                const backtrackClassDefOffset = r.readUint16();
                const inputClassDefOffset = r.readUint16();
                const lookaheadClassDefOffset = r.readUint16();
                const chainClassSetCount = r.readUint16();
                const setOffsets = new Array(chainClassSetCount);
                for (let i = 0; i < chainClassSetCount; i++) setOffsets[i] = r.readUint16();
                const cov = parseCoverage(subBytes(bytes, coverageOffset));
                const backtrackClassDef = parseClassDef(subBytes(bytes, backtrackClassDefOffset));
                const inputClassDef = parseClassDef(subBytes(bytes, inputClassDefOffset));
                const lookaheadClassDef = parseClassDef(subBytes(bytes, lookaheadClassDefOffset));
                const classSets = setOffsets.map(off => off === 0 ? null : parsePosChainRuleSet(bytes, off));
                return {
                    type: 8, format, coverage: cov,
                    backtrackClassDef, inputClassDef, lookaheadClassDef, classSets
                };
            }
            if (format === 3) {
                const backtrackCount = r.readUint16();
                const backtrackOffsets = new Array(backtrackCount);
                for (let i = 0; i < backtrackCount; i++) backtrackOffsets[i] = r.readUint16();
                const inputCount = r.readUint16();
                const inputOffsets = new Array(inputCount);
                for (let i = 0; i < inputCount; i++) inputOffsets[i] = r.readUint16();
                const lookaheadCount = r.readUint16();
                const lookaheadOffsets = new Array(lookaheadCount);
                for (let i = 0; i < lookaheadCount; i++) lookaheadOffsets[i] = r.readUint16();
                const posCount = r.readUint16();
                const posLookupRecords = readGposSubstLookupRecords(r, posCount);
                return {
                    type: 8, format,
                    backtrackCoverages: backtrackOffsets.map(o => parseCoverage(subBytes(bytes, o))),
                    inputCoverages:     inputOffsets.map(o => parseCoverage(subBytes(bytes, o))),
                    lookaheadCoverages: lookaheadOffsets.map(o => parseCoverage(subBytes(bytes, o))),
                    posLookupRecords
                };
            }
            throw new ParseError('fonts/gpos-chain-format', `unsupported GPOS type 8 format ${format}`);
        }

        return { parseContextPos, parseChainContextPos };
    }
};

