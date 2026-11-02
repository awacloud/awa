// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Opt-in: extended PDF Portfolio (/Collection) typing.
 *
 * Augments the L1 collection typing with deeper inspection of the
 * sub-dictionaries: /Schema field definitions, /Sort criteria,
 * /Navigator extension, the initial /D entry, the /View mode
 * ('D'|'T'|'H'|'C'), and the /CI (Collection Item) custom icon dict.
 *
 * @module pdf/extra/embedded-files-portfolio
 */

import { pdfErrors } from '../errors.js';

export const pdfEmbeddedFilesPortfolio = {
    name: 'pdfEmbeddedFilesPortfolio',
    dependencies: ['pdfErrors'],
    deps: [pdfErrors],

    factory(errors) {
        const { ParseError, ContractError } = errors;
        const VIEW_MODES = new Set(['D', 'T', 'H', 'C']);
        const SCHEMA_SUBTYPES = new Set([
            'S', 'D', 'N', 'F', 'Desc', 'ModDate', 'CreationDate', 'Size'
        ]);
        const KNOWN_COLLECTION = new Set([
            'Type', 'Schema', 'D', 'View', 'Sort', 'Navigator',
            'Folders', 'Colors', 'Split'
        ]);

        function isDict(v) { return v && v.type === 'dict'; }
        function isName(v) { return v && v.type === 'name'; }
        function isStr(v) { return v && v.type === 'string'; }
        function isArr(v) { return v && v.type === 'array'; }
        function isBool(v) { return v && v.type === 'bool'; }
        function isInt(v) { return v && v.type === 'int'; }

        function typeSchemaField(name, fieldDict) {
            if (!isDict(fieldDict)) {
                throw new ParseError('pdf/portfolio/bad-schema-field',
                    '/Schema field must be a dictionary',
                    { context: { field: name, type: fieldDict && fieldDict.type } });
            }
            const e = fieldDict.entries;
            const out = { name, raw: fieldDict, _extras: {} };
            if (e.Subtype) {
                if (!isName(e.Subtype) || !SCHEMA_SUBTYPES.has(e.Subtype.value)) {
                    throw new ParseError('pdf/portfolio/bad-schema-subtype',
                        '/Subtype on /Schema field must be one of S,D,N,F,Desc,ModDate,CreationDate,Size',
                        { context: { field: name, actual: e.Subtype.value } });
                }
                out.subtype = e.Subtype.value;
            }
            if (e.N) {
                if (!isStr(e.N)) {
                    throw new ParseError('pdf/portfolio/bad-schema-n',
                        '/N must be a string', { context: { field: name } });
                }
                out.displayName = e.N.value;
            }
            if (e.O != null) {
                if (!isInt(e.O)) {
                    throw new ParseError('pdf/portfolio/bad-schema-o',
                        '/O must be an integer', { context: { field: name } });
                }
                out.order = e.O.value;
            }
            if (e.V != null) {
                if (!isBool(e.V)) {
                    throw new ParseError('pdf/portfolio/bad-schema-v',
                        '/V must be boolean', { context: { field: name } });
                }
                out.visible = e.V.value;
            }
            if (e.E != null) {
                if (!isBool(e.E)) {
                    throw new ParseError('pdf/portfolio/bad-schema-e',
                        '/E must be boolean', { context: { field: name } });
                }
                out.editable = e.E.value;
            }
            if (e.Type) out.type = isName(e.Type) ? e.Type.value : null;
            const KNOWN = new Set(['Type', 'Subtype', 'N', 'O', 'V', 'E']);
            for (const k of Object.keys(e)) {
                if (!KNOWN.has(k)) out._extras[k] = e[k];
            }
            return out;
        }

        function typeSchema(schemaDict) {
            if (!isDict(schemaDict)) {
                throw new ParseError('pdf/portfolio/bad-schema',
                    '/Schema must be a dictionary',
                    { context: { type: schemaDict && schemaDict.type } });
            }
            const fields = {};
            for (const [k, v] of Object.entries(schemaDict.entries)) {
                // The optional /Type /CollectionSchema (ISO 32000-2 Table 155)
                // names the dictionary; it is not a field definition.
                if (k === 'Type' && isName(v)) continue;
                fields[k] = typeSchemaField(k, v);
            }
            return { fields, raw: schemaDict };
        }

        function typeSort(sortDict) {
            if (!isDict(sortDict)) {
                throw new ParseError('pdf/portfolio/bad-sort',
                    '/Sort must be a dictionary');
            }
            const e = sortDict.entries;
            const out = { raw: sortDict, _extras: {} };
            if (e.S) {
                if (isName(e.S)) out.keys = [e.S.value];
                else if (isArr(e.S)) {
                    const ks = [];
                    for (const it of e.S.items) {
                        if (!isName(it)) {
                            throw new ParseError('pdf/portfolio/bad-sort-s-item',
                                '/Sort /S array items must be names');
                        }
                        ks.push(it.value);
                    }
                    out.keys = ks;
                } else {
                    throw new ParseError('pdf/portfolio/bad-sort-s',
                        '/Sort /S must be a name or array of names');
                }
            }
            if (e.A != null) {
                if (isBool(e.A)) out.ascending = [e.A.value];
                else if (isArr(e.A)) {
                    const as = [];
                    for (const it of e.A.items) {
                        if (!isBool(it)) {
                            throw new ParseError('pdf/portfolio/bad-sort-a-item',
                                '/Sort /A array items must be booleans');
                        }
                        as.push(it.value);
                    }
                    out.ascending = as;
                } else {
                    throw new ParseError('pdf/portfolio/bad-sort-a',
                        '/Sort /A must be a bool or array of bools');
                }
            }
            if (e.Type) out.type = isName(e.Type) ? e.Type.value : null;
            for (const k of Object.keys(e)) {
                if (k !== 'Type' && k !== 'S' && k !== 'A') out._extras[k] = e[k];
            }
            return out;
        }

        // The other collection dictionaries: per kind, the keys and their
        // types (the Arlington PDF Model's), as `Key:type` pairs.
        const keyTypes = (text) => Object.freeze(Object.fromEntries(text.split(' ').map((p) => p.split(':'))));
        const COLLECTION_PART_TYPES = Object.freeze({
            folder: keyTypes('Type:name ID:int Name:string Parent:dict Child:dict Next:dict CI:dict Desc:string '
                + 'CreationDate:string ModDate:string Thumb:stream Free:array'),
            colors: keyTypes('Type:name Background:array CardBackground:array CardBorder:array PrimaryText:array SecondaryText:array'),
            split: keyTypes('Type:name Direction:name Position:num'),
            subitem: keyTypes('Type:name D:string|num P:string')
        });
        const COLLECTION_PART_KEYS = Object.freeze(Object.fromEntries(
            Object.entries(COLLECTION_PART_TYPES).map(([kind, types]) => [kind, Object.freeze(Object.keys(types))])));
        const KEY_READ = Object.freeze({
            name: (v) => (isName(v) ? v.value : undefined),
            string: (v) => (isStr(v) ? v.value : undefined),
            num: (v) => (v && (v.type === 'int' || v.type === 'real') ? v.value : undefined),
            int: (v) => (isInt(v) ? v.value : undefined),
            array: (v) => (isArr(v) ? v : undefined),
            dict: (v) => (isDict(v) ? v : undefined),
            stream: (v) => (v && v.type === 'stream' ? v : undefined)
        });
        function keyValue(type, v) {
            if (v && v.type === 'ref') return v;
            for (const t of type.split('|')) {
                const r = KEY_READ[t](v);
                if (r !== undefined) return r;
            }
            return null;
        }

        /**
         * Type a collection folder, colours, split or sub-item dictionary
         * (`kind` a key of `COLLECTION_PART_KEYS`): one field per key of
         * its list, named after the key in lower case, present only when
         * the key is; the other keys in `_extras`.
         */
        function typeCollectionPart(dict, kind) {
            if (typeof kind !== 'string' || !Object.prototype.hasOwnProperty.call(COLLECTION_PART_TYPES, kind)) {
                throw new ContractError('pdf/portfolio/part/kind',
                    `kind must be one of ${Object.keys(COLLECTION_PART_TYPES).join(', ')}`,
                    { context: { kind } });
            }
            if (!isDict(dict)) {
                throw new ParseError('pdf/portfolio/part/not-dict',
                    'a collection dictionary must be a dictionary',
                    { context: { type: dict && dict.type } });
            }
            const types = COLLECTION_PART_TYPES[kind];
            const out = { raw: dict, _extras: {} };
            for (const [k, v] of Object.entries(dict.entries)) {
                if (Object.prototype.hasOwnProperty.call(types, k)) out[k.toLowerCase()] = keyValue(types[k], v);
                else out._extras[k] = v;
            }
            return out;
        }

        // The parts of a file specification and the go-to-embedded
        // targets: per kind, the keys and their types.
        const FILE_PART_TYPES = Object.freeze({
            ef: keyTypes('F:stream UF:stream'),
            rf: keyTypes('F:array UF:array'),
            mac: keyTypes('Subtype:int Creator:int ResFork:stream'),
            target: keyTypes('R:name N:string P:int|string A:int|string T:dict')
        });
        const FILE_PART_KEYS = Object.freeze(Object.fromEntries(
            Object.entries(FILE_PART_TYPES).map(([kind, types]) => [kind, Object.freeze(Object.keys(types))])));

        /**
         * Type a file specification's `/EF` (`kind` `ef`) or `/RF` (`rf`),
         * a Mac OS file information dictionary (`mac`) or a go-to-embedded
         * target (`target`): one field per key of its list, named after the
         * key in lower case, present only when the key is; the other keys in
         * `_extras`.
         */
        function typeFilePart(dict, kind) {
            if (typeof kind !== 'string' || !Object.prototype.hasOwnProperty.call(FILE_PART_TYPES, kind)) {
                throw new ContractError('pdf/portfolio/file-part/kind',
                    `kind must be one of ${Object.keys(FILE_PART_TYPES).join(', ')}`,
                    { context: { kind } });
            }
            if (!isDict(dict)) {
                throw new ParseError('pdf/portfolio/file-part/not-dict',
                    'a file part must be a dictionary',
                    { context: { type: dict && dict.type } });
            }
            const types = FILE_PART_TYPES[kind];
            const out = { raw: dict, _extras: {} };
            for (const [k, v] of Object.entries(dict.entries)) {
                if (Object.prototype.hasOwnProperty.call(types, k)) out[k.toLowerCase()] = keyValue(types[k], v);
                else out._extras[k] = v;
            }
            return out;
        }

        function typeNavigator(nav) {
            if (nav && nav.type === 'ref') return { ref: { num: nav.num, gen: nav.gen }, raw: nav };
            if (!isDict(nav)) {
                throw new ParseError('pdf/portfolio/bad-navigator',
                    '/Navigator must be a dict or ref');
            }
            const out = { raw: nav, entries: nav.entries };
            const e = nav.entries;
            if (e.Type !== undefined) out.type = isName(e.Type) ? e.Type.value : null;
            if (e.Layout !== undefined) {
                out.layout = isName(e.Layout) ? e.Layout.value : (e.Layout && e.Layout.type === 'array' ? e.Layout : null);
            }
            return out;
        }

        function typeCustomIcon(ci) {
            if (!isDict(ci) && !(ci && ci.type === 'stream')) {
                throw new ParseError('pdf/portfolio/bad-ci',
                    '/CI custom icon must be dict or stream',
                    { context: { type: ci && ci.type } });
            }
            return { raw: ci };
        }

        function typePortfolio(collectionDict) {
            if (!isDict(collectionDict)) {
                throw new ParseError('pdf/portfolio/not-dict',
                    'Collection must be a dictionary',
                    { context: { type: collectionDict && collectionDict.type } });
            }
            const e = collectionDict.entries;
            if (e.Type && (!isName(e.Type) || e.Type.value !== 'Collection')) {
                throw new ParseError('pdf/portfolio/bad-type',
                    '/Type must be /Collection',
                    { context: { actual: e.Type && e.Type.value } });
            }
            const out = { raw: collectionDict, _extras: {} };
            if (e.Schema)    out.schema    = typeSchema(e.Schema);
            if (e.D) {
                if (!isStr(e.D)) {
                    throw new ParseError('pdf/portfolio/bad-d',
                        '/D must be a string');
                }
                out.initialDoc = e.D.value;
            }
            if (e.View) {
                if (!isName(e.View) || !VIEW_MODES.has(e.View.value)) {
                    throw new ParseError('pdf/portfolio/bad-view',
                        '/View must be one of D, T, H, C',
                        { context: { actual: e.View && e.View.value } });
                }
                out.view = e.View.value;
            }
            if (e.Sort)      out.sort      = typeSort(e.Sort);
            if (e.Navigator) out.navigator = typeNavigator(e.Navigator);
            for (const k of Object.keys(e)) {
                if (!KNOWN_COLLECTION.has(k)) out._extras[k] = e[k];
            }
            return out;
        }

        function typeCollectionItem(ciDict) {
            if (!isDict(ciDict)) {
                throw new ParseError('pdf/portfolio/ci-not-dict',
                    '/CI item must be a dict');
            }
            const out = { raw: ciDict, fields: {}, _extras: {} };
            const t = ciDict.entries.Type;
            if (t && t.type === 'name') out.type = t.value;
            for (const [k, v] of Object.entries(ciDict.entries)) {
                if (k === 'Type') continue;
                if (k === 'CI') out.customIcon = typeCustomIcon(v);
                else out.fields[k] = v;
            }
            return out;
        }

        return {
            typePortfolio,
            typeSchema,
            typeSchemaField,
            typeSort,
            typeNavigator,
            typeCustomIcon,
            typeCollectionItem,
            typeCollectionPart,
            COLLECTION_PART_KEYS,
            typeFilePart,
            FILE_PART_KEYS,
            VIEW_MODES,
            SCHEMA_SUBTYPES
        };
    }
};
