// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview GSUB lookup types 5, 6, 7 and 8 :
 *  - Type 5 : Contextual Substitution
 *  - Type 6 : Chaining Contextual Substitution
 *  - Type 7 : Extension Substitution
 *  - Type 8 : Reverse Chaining Contextual Single Substitution
 *
 * The file name predates type 8, which lives here with the other
 * contextual decoders.
 *
 * Package-private helpers for {@link ../gsub.js}. The extension parser
 * delegates back to the orchestrator via the `parseGsubSubtable`
 * function passed in.
 *
 * @module fonts/table/gsub/types-5-7
 */

import { fontErrors } from '../../errors.js';
import { fontReader } from '../../primitives/reader.js';
import { layoutClassDefinitions } from '../../layout/classDefinitions.js';

export const tableGsubTypes57 = {
    name: 'tableGsubTypes57',
    dependencies: ['fontErrors', 'fontReader', 'layoutClassDefinitions'],
    deps: [fontErrors, fontReader, layoutClassDefinitions],
    factory(errors, reader, classDefs) {
        const { ParseError } = errors;
        const { BinaryReader } = reader;
        const { parseCoverage, parseClassDef } = classDefs;

        function subBytes(bytes, offset) {
            return new Uint8Array(bytes.buffer, bytes.byteOffset + offset, bytes.length - offset);
        }

        function readSubstLookupRecords(r, count) {
            const records = new Array(count);
            for (let i = 0; i < count; i++) {
                records[i] = {
                    sequenceIndex: r.readUint16(),
                    lookupListIndex: r.readUint16()
                };
            }
            return records;
        }

        function parseSequenceRuleSet(bytes, offset) {
            const r = new BinaryReader(bytes, offset, bytes.length - offset);
            const ruleCount = r.readUint16();
            const ruleOffsets = new Array(ruleCount);
            for (let i = 0; i < ruleCount; i++) ruleOffsets[i] = r.readUint16();
            return ruleOffsets.map(off => {
                const ruleStart = offset + off;
                const rr = new BinaryReader(bytes, ruleStart, bytes.length - ruleStart);
                const glyphCount = rr.readUint16();
                const substCount = rr.readUint16();
                const input = new Array(glyphCount - 1);
                for (let i = 0; i < glyphCount - 1; i++) input[i] = rr.readUint16();
                const substLookupRecords = readSubstLookupRecords(rr, substCount);
                return { input, substLookupRecords };
            });
        }

        function parseChainRuleSet(bytes, offset) {
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
                const substCount = rr.readUint16();
                const substLookupRecords = readSubstLookupRecords(rr, substCount);
                return { backtrack, input, lookahead, substLookupRecords };
            });
        }

        function parseContextSubst(bytes) {
            const r = new BinaryReader(bytes);
            const format = r.readUint16();
            if (format === 1) {
                const coverageOffset = r.readUint16();
                const seqRuleSetCount = r.readUint16();
                const setOffsets = new Array(seqRuleSetCount);
                for (let i = 0; i < seqRuleSetCount; i++) setOffsets[i] = r.readUint16();
                const cov = parseCoverage(subBytes(bytes, coverageOffset));
                const ruleSets = setOffsets.map(off => off === 0 ? null : parseSequenceRuleSet(bytes, off));
                return { type: 5, format, coverage: cov, ruleSets };
            }
            if (format === 2) {
                const coverageOffset = r.readUint16();
                const classDefOffset = r.readUint16();
                const classSeqRuleSetCount = r.readUint16();
                const setOffsets = new Array(classSeqRuleSetCount);
                for (let i = 0; i < classSeqRuleSetCount; i++) setOffsets[i] = r.readUint16();
                const cov = parseCoverage(subBytes(bytes, coverageOffset));
                const classDef = parseClassDef(subBytes(bytes, classDefOffset));
                const classSets = setOffsets.map(off => off === 0 ? null : parseSequenceRuleSet(bytes, off));
                return { type: 5, format, coverage: cov, classDef, classSets };
            }
            if (format === 3) {
                const glyphCount = r.readUint16();
                const substCount = r.readUint16();
                const coverageOffsets = new Array(glyphCount);
                for (let i = 0; i < glyphCount; i++) coverageOffsets[i] = r.readUint16();
                const substLookupRecords = readSubstLookupRecords(r, substCount);
                const coverages = coverageOffsets.map(off => parseCoverage(subBytes(bytes, off)));
                return { type: 5, format, coverages, substLookupRecords };
            }
            throw new ParseError('fonts/gsub-context-format', `unsupported GSUB type 5 format ${format}`);
        }

        function parseChainContextSubst(bytes) {
            const r = new BinaryReader(bytes);
            const format = r.readUint16();
            if (format === 1) {
                const coverageOffset = r.readUint16();
                const chainSetCount = r.readUint16();
                const setOffsets = new Array(chainSetCount);
                for (let i = 0; i < chainSetCount; i++) setOffsets[i] = r.readUint16();
                const cov = parseCoverage(subBytes(bytes, coverageOffset));
                const ruleSets = setOffsets.map(off => off === 0 ? null : parseChainRuleSet(bytes, off));
                return { type: 6, format, coverage: cov, ruleSets };
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
                const classSets = setOffsets.map(off => off === 0 ? null : parseChainRuleSet(bytes, off));
                return {
                    type: 6, format, coverage: cov,
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
                const substCount = r.readUint16();
                const substLookupRecords = readSubstLookupRecords(r, substCount);
                return {
                    type: 6, format,
                    backtrackCoverages: backtrackOffsets.map(o => parseCoverage(subBytes(bytes, o))),
                    inputCoverages: inputOffsets.map(o => parseCoverage(subBytes(bytes, o))),
                    lookaheadCoverages: lookaheadOffsets.map(o => parseCoverage(subBytes(bytes, o))),
                    substLookupRecords
                };
            }
            throw new ParseError('fonts/gsub-chain-format', `unsupported GSUB type 6 format ${format}`);
        }

        function parseExtensionSubst(bytes, parseGsubSubtable) {
            const r = new BinaryReader(bytes);
            const format = r.readUint16();
            if (format !== 1)
                throw new ParseError('fonts/gsub-ext-format', `unsupported GSUB type 7 format ${format}`);
            const extensionLookupType = r.readUint16();
            const extensionOffset = r.readUint32();
            const inner = parseGsubSubtable(extensionLookupType, subBytes(bytes, extensionOffset));
            return {
                type: 7, format, extensionLookupType, extensionOffset,
                subtable: inner
            };
        }

        function parseReverseChainSubst(bytes) {
            const r = new BinaryReader(bytes);
            const format = r.readUint16();
            if (format !== 1)
                throw new ParseError('fonts/gsub-reverse-format', `unsupported GSUB type 8 format ${format}`);
            const coverageOffset = r.readUint16();
            const backtrackCount = r.readUint16();
            const backtrackOffsets = new Array(backtrackCount);
            for (let i = 0; i < backtrackCount; i++) backtrackOffsets[i] = r.readUint16();
            const lookaheadCount = r.readUint16();
            const lookaheadOffsets = new Array(lookaheadCount);
            for (let i = 0; i < lookaheadCount; i++) lookaheadOffsets[i] = r.readUint16();
            const glyphCount = r.readUint16();
            const substitutes = new Array(glyphCount);
            for (let i = 0; i < glyphCount; i++) substitutes[i] = r.readUint16();
            return {
                type: 8, format,
                coverage: parseCoverage(subBytes(bytes, coverageOffset)),
                backtrackCoverages: backtrackOffsets.map(o => parseCoverage(subBytes(bytes, o))),
                lookaheadCoverages: lookaheadOffsets.map(o => parseCoverage(subBytes(bytes, o))),
                substitutes
            };
        }

        return { parseContextSubst, parseChainContextSubst, parseExtensionSubst, parseReverseChainSubst };
    }
};

