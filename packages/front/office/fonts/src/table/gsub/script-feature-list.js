// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview GSUB / GPOS-style ScriptList, FeatureList, LookupList
 * parsers. The lookup-subtable function is injected so the same shape
 * is reused across GSUB and GPOS.
 *
 * Package-private helpers for {@link ../gsub.js}. Re-exported by the
 * orchestrator.
 *
 * @module fonts/table/gsub/script-feature-list
 */

import { fontErrors } from '../../errors.js';
import { fontReader } from '../../primitives/reader.js';
import { fontTag } from '../../primitives/tag.js';

export const tableGsubScriptFeatureList = {
    name: 'tableGsubScriptFeatureList',
    dependencies: ['fontErrors', 'fontReader', 'fontTag'],
    deps: [fontErrors, fontReader, fontTag],
    factory(errors, reader, tagMod) {
        const { ParseError } = errors;
        const { BinaryReader } = reader;
        const { untag } = tagMod;

        /**
         * Caps for GSUB/GPOS top-level lists. Real fonts have a few dozen each.
         */
        const SCRIPT_COUNT_MAX  = 1024;
        const FEATURE_COUNT_MAX = 4096;
        const LOOKUP_COUNT_MAX  = 4096;

        function parseScriptList(bytes, offset) {
            if (!offset) return [];
            const r = new BinaryReader(bytes, offset, bytes.length - offset);
            const count = r.readUint16();
            if (count > SCRIPT_COUNT_MAX)
                throw new ParseError('fonts/gsub-script-count-cap',
                    `ScriptList declares ${count} scripts (cap ${SCRIPT_COUNT_MAX})`,
                    { context: { count, cap: SCRIPT_COUNT_MAX } });
            const out = new Array(count);
            for (let i = 0; i < count; i++) {
                const tagU = r.readUint32();
                const scriptOffset = r.readUint16();
                out[i] = { tag: untag(tagU), scriptOffset };
            }
            return out;
        }

        function parseFeatureList(bytes, offset) {
            if (!offset) return [];
            const r = new BinaryReader(bytes, offset, bytes.length - offset);
            const count = r.readUint16();
            if (count > FEATURE_COUNT_MAX)
                throw new ParseError('fonts/gsub-feature-count-cap',
                    `FeatureList declares ${count} features (cap ${FEATURE_COUNT_MAX})`,
                    { context: { count, cap: FEATURE_COUNT_MAX } });
            const records = new Array(count);
            for (let i = 0; i < count; i++) {
                const tagU = r.readUint32();
                const featureOffset = r.readUint16();
                records[i] = { tag: untag(tagU), featureOffset };
            }
            // Resolve each Feature record: lookupListIndices[]
            for (const rec of records) {
                const fr = new BinaryReader(bytes, offset + rec.featureOffset, bytes.length - offset - rec.featureOffset);
                fr.readUint16();  // featureParamsOffset (ignored)
                const ll = fr.readUint16();
                const indices = new Array(ll);
                for (let i = 0; i < ll; i++) indices[i] = fr.readUint16();
                rec.lookupListIndices = indices;
            }
            return records;
        }

        function parseLookupList(bytes, offset, parseSubtableFn) {
            if (!offset) return [];
            const r = new BinaryReader(bytes, offset, bytes.length - offset);
            const count = r.readUint16();
            if (count > LOOKUP_COUNT_MAX)
                throw new ParseError('fonts/gsub-lookup-count-cap',
                    `LookupList declares ${count} lookups (cap ${LOOKUP_COUNT_MAX})`,
                    { context: { count, cap: LOOKUP_COUNT_MAX } });
            const lookupOffsets = new Array(count);
            for (let i = 0; i < count; i++) lookupOffsets[i] = r.readUint16();
            const out = new Array(count);
            for (let i = 0; i < count; i++) {
                const lookupStart = offset + lookupOffsets[i];
                const lr = new BinaryReader(bytes, lookupStart, bytes.length - lookupStart);
                const lookupType = lr.readUint16();
                const lookupFlag = lr.readUint16();
                const subTableCount = lr.readUint16();
                const subTableOffsets = new Array(subTableCount);
                for (let k = 0; k < subTableCount; k++) subTableOffsets[k] = lr.readUint16();
                const subtables = subTableOffsets.map(off => {
                    const start = lookupStart + off;
                    const sub = new Uint8Array(bytes.buffer, bytes.byteOffset + start, bytes.length - start);
                    // ParseError is propagated (typed font error → caller decides).
                    // Only soft-degrade unknown / non-ParseError exceptions so a
                    // single unsupported sub-format does not poison the whole
                    // GSUB/GPOS table. Preserve the cause chain for observability.
                    try { return parseSubtableFn(lookupType, sub); }
                    catch (e) {
                        if (e instanceof ParseError) throw e;
                        return {
                            type: lookupType,
                            parsed: false,
                            error: (e && e.code) || 'parse-failure',
                            cause: e
                        };
                    }
                });
                out[i] = { type: lookupType, flag: lookupFlag, subtables };
            }
            return out;
        }

        return { SCRIPT_COUNT_MAX, FEATURE_COUNT_MAX, LOOKUP_COUNT_MAX, parseScriptList, parseFeatureList, parseLookupList };
    }
};

