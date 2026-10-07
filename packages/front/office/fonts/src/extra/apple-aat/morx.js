// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview `morx` — Extended Glyph Metamorphosis (Apple TT RM06).
 *
 * Strict factory body.
 *
 * @module fonts/extra/apple-aat/morx
 */

import { fontErrors } from '../../errors.js';
import { fontReader } from '../../primitives/reader.js';

export const aatMorx = {
    name: 'aatMorx',
    dependencies: ['fontErrors', 'fontReader'],
    deps: [fontErrors, fontReader],
    factory(errors, reader) {
        const HEADER_MIN     = 8;
        const CHAIN_HDR_SIZE = 16;
        const FEATURE_SIZE   = 12;
        const SUB_HDR_SIZE   = 12;
        const { ParseError } = errors;
        const { BinaryReader } = reader;

        function parseMorx(bytes) {
            if (!(bytes instanceof Uint8Array))
                throw new ParseError('fonts/morx-input', 'parseMorx expects Uint8Array',
                    { context: { actual: typeof bytes } });
            if (bytes.length < HEADER_MIN)
                throw new ParseError('fonts/morx-short', 'morx table too short',
                    { context: { actual: bytes.length, needed: HEADER_MIN } });

            const r = new BinaryReader(bytes);
            const version = r.readUint32();
            if (version !== 0x00020000 && version !== 0x00030000)
                throw new ParseError('fonts/morx-version', `unsupported morx version 0x${version.toString(16)}`,
                    { context: { version } });
            const nChains = r.readUint32();
            if (nChains > 0xFFFF)
                throw new ParseError('fonts/morx-chains', `implausible chain count ${nChains}`,
                    { context: { nChains } });

            const chains = new Array(nChains);
            for (let i = 0; i < nChains; i++) chains[i] = parseChain(r, i);

            return { version, nChains, chains };
        }

        function parseChain(r, index) {
            const chainStart = r.pos;
            if (r.length - chainStart < CHAIN_HDR_SIZE)
                throw new ParseError('fonts/morx-chain-short', `chain ${index} header truncated`,
                    { context: { index, remaining: r.length - chainStart } });

            const defaultFlags = r.readUint32();
            const chainLength  = r.readUint32();
            const nFeatures    = r.readUint32();
            const nSubtables   = r.readUint32();

            if (chainLength < CHAIN_HDR_SIZE
                || chainStart + chainLength > r.length)
                throw new ParseError('fonts/morx-chain-length', `chain ${index} length invalid`,
                    { context: { index, chainLength, available: r.length - chainStart } });

            const features = new Array(nFeatures);
            for (let i = 0; i < nFeatures; i++) {
                if (r.pos + FEATURE_SIZE > chainStart + chainLength)
                    throw new ParseError('fonts/morx-feature-overflow',
                        `chain ${index} feature ${i} overflows chain`,
                        { context: { index, feature: i } });
                features[i] = {
                    featureType:    r.readUint16(),
                    featureSetting: r.readUint16(),
                    enableFlags:    r.readUint32(),
                    disableFlags:   r.readUint32()
                };
            }

            const subtables = new Array(nSubtables);
            for (let i = 0; i < nSubtables; i++) subtables[i] = parseSubtable(r, chainStart + chainLength, index, i);

            r.seek(chainStart + chainLength);
            return { defaultFlags, chainLength, features, subtables };
        }

        function parseSubtable(r, chainEnd, chainIdx, subIdx) {
            const subStart = r.pos;
            if (subStart + SUB_HDR_SIZE > chainEnd)
                throw new ParseError('fonts/morx-sub-short',
                    `chain ${chainIdx} subtable ${subIdx} header truncated`,
                    { context: { chain: chainIdx, sub: subIdx } });

            const length          = r.readUint32();
            const coverage        = r.readUint32();
            const subFeatureFlags = r.readUint32();

            if (length < SUB_HDR_SIZE || subStart + length > chainEnd)
                throw new ParseError('fonts/morx-sub-length',
                    `chain ${chainIdx} subtable ${subIdx} length invalid`,
                    { context: { chain: chainIdx, sub: subIdx, length } });

            const bodyLen = length - SUB_HDR_SIZE;
            const body = r.readBytes(bodyLen);

            const type             = coverage & 0xFF;
            const vertical         = !!(coverage & 0x80000000);
            const descending       = !!(coverage & 0x40000000);
            const bothOrientations = !!(coverage & 0x20000000);
            const logicalOrder     = !!(coverage & 0x10000000);

            return {
                length,
                coverage: coverage >>> 0,
                type,
                vertical,
                descending,
                bothOrientations,
                logicalOrder,
                subFeatureFlags: subFeatureFlags >>> 0,
                body,
                parsed: false
            };
        }

        return { parseMorx };
    }
};

