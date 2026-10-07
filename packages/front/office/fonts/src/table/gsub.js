// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview `GSUB` — Glyph Substitution (OT §6.5.7).
 *
 * Top-level structure :
 *
 * ```
 *   Header     : majorVersion, minorVersion, scriptListOffset, featureListOffset, lookupListOffset
 *   ScriptList : array of (scriptTag, scriptOffset)
 *   FeatureList: array of (featureTag, featureOffset)
 *   LookupList : array of LookupTable offsets
 *   Lookup     : type + flags + N subtables
 * ```
 *
 * Each Lookup has one of 8 types ; every one is decoded:
 *
 *  - **Type 1** : Single Substitution (formats 1 & 2)
 *  - **Type 2** : Multiple Substitution
 *  - **Type 3** : Alternate Substitution
 *  - **Type 4** : Ligature Substitution
 *  - **Type 5** : Contextual Substitution (formats 1, 2 & 3)
 *  - **Type 6** : Chaining Contextual Substitution (formats 1, 2 & 3)
 *  - **Type 7** : Extension Substitution (the wrapped subtable is decoded too)
 *  - **Type 8** : Reverse Chaining Contextual Single Substitution
 *
 * Any other lookup type returns `{ type, parsed: false }`. Substitutions
 * are decoded, not applied : there is no shaping engine here.
 *
 * Logic is split across sibling sub-modules :
 *  - `./gsub/script-feature-list.js` — Script / Feature / Lookup lists
 *  - `./gsub/types-1-4.js`           — Single / Multiple / Alternate / Ligature (types 1-4)
 *  - `./gsub/types-5-7.js`           — Context / Chaining / Extension / Reverse Chaining (types 5-8)
 *
 * @module fonts/table/gsub
 */

import { fontErrors } from '../errors.js';
import { fontReader } from '../primitives/reader.js';
import { tableGsubScriptFeatureList } from './gsub/script-feature-list.js';
import { tableGsubTypes14 } from './gsub/types-1-4.js';
import { tableGsubTypes57 } from './gsub/types-5-7.js';

export const tableGsub = {
    name: 'tableGsub',
    dependencies: ['fontErrors', 'fontReader', 'tableGsubScriptFeatureList', 'tableGsubTypes14', 'tableGsubTypes57'],
    deps: [fontErrors, fontReader, tableGsubScriptFeatureList, tableGsubTypes14, tableGsubTypes57],
    factory(errors, reader, scriptFeatureList, types14, types57) {
        const { ParseError } = errors;
        const { BinaryReader } = reader;
        const { parseScriptList, parseFeatureList, parseLookupList } = scriptFeatureList;
        const { parseSingleSubst, parseMultipleSubst, parseAlternateSubst, parseLigatureSubst } = types14;
        const { parseContextSubst, parseChainContextSubst, parseExtensionSubst, parseReverseChainSubst } = types57;

        function parseGsub(bytes) {
            if (bytes.length < 10)
                throw new ParseError('fonts/gsub-short', 'GSUB header truncated');
            const r = new BinaryReader(bytes);
            const major = r.readUint16();
            const minor = r.readUint16();
            if (major !== 1)
                throw new ParseError('fonts/gsub-version',
                    `unsupported GSUB major version ${major}`,
                    { context: { major, minor } });
            const scriptListOffset  = r.readUint16();
            const featureListOffset = r.readUint16();
            const lookupListOffset  = r.readUint16();

            const scripts  = parseScriptList(bytes, scriptListOffset);
            const features = parseFeatureList(bytes, featureListOffset);
            const lookups  = parseLookupList(bytes, lookupListOffset, parseGsubSubtable);

            return {
                majorVersion: major, minorVersion: minor,
                scripts, features, lookups
            };
        }

        function parseGsubSubtable(type, bytes) {
            switch (type) {
                case 1: return parseSingleSubst(bytes);
                case 2: return parseMultipleSubst(bytes);
                case 3: return parseAlternateSubst(bytes);
                case 4: return parseLigatureSubst(bytes);
                case 5: return parseContextSubst(bytes);
                case 6: return parseChainContextSubst(bytes);
                case 7: return parseExtensionSubst(bytes, parseGsubSubtable);
                case 8: return parseReverseChainSubst(bytes);
                default: return { type, parsed: false };
            }
        }

        return { parseGsub, parseGsubSubtable, parseScriptList, parseFeatureList, parseLookupList };
    }
};

