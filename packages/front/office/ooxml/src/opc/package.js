// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Open Packaging Conventions (OPC) container — read/write.
 *
 * An OPC package is a ZIP archive (ECMA-376 part 2 §10) containing :
 *
 * - `[Content_Types].xml` — root, declares the MIME type of every part
 * - `_rels/.rels` — package-level relationships (entry point of the document)
 * - one or more parts (XML or binary) addressed by absolute part name
 * - `<dir>/_rels/<file>.rels` — relationships for each part that has any
 *
 * This module wraps the fw `zip` module to read / write the ZIP layer,
 * decodes the XML parts via {@link ./contentTypes.js} and
 * {@link ./relationships.js}, and exposes a structured `Package` object :
 *
 * ```js
 * {
 *     contentTypes: { defaults, overrides },     // [Content_Types].xml
 *     parts: { '/word/document.xml': Uint8Array, ... },
 *     rels:  { '/': [...], '/word/document.xml': [...] }
 * }
 * ```
 *
 * ## Security — ZIP bomb guards
 *
 * `read(bytes, opts?)` enforces three default bounds to prevent
 * decompression-bomb DoS :
 *
 * | Option            | Default       | Meaning                                |
 * |-------------------|---------------|----------------------------------------|
 * | `maxParts`        | `1024`        | max number of entries in the archive   |
 * | `maxUncompressed` | `256 * 1MiB`  | max total uncompressed bytes           |
 * | `maxRatio`        | `200`         | max uncompressed/compressed ratio      |
 *
 * Exceeding any limit raises `ParseError('opc/zip-bomb', ...)` with
 * `context.limit` set to the breached bound. Pass `0` to disable a
 * given check.
 *
 * @module ooxml/opc/package
 */

import { ooxmlErrors } from '../errors.js';
import { zip } from '@awacloud/fw/io/compress/zip.js';
import { opcContentTypes } from './contentTypes.js';
import { opcRelationships } from './relationships.js';
import { ooxmlShared } from '../_shared/index.js';

export const opcPackage = {
    name: 'opcPackage',
    dependencies: ['ooxmlErrors', 'zip', 'opcContentTypes', 'opcRelationships', 'ooxmlShared'],
    deps: [ooxmlErrors, zip, opcContentTypes, opcRelationships, ooxmlShared],

    factory(errors, zipMod, contentTypesMod, relsMod, shared) {
        const { ParseError, RenderError, ContractError } = errors;

        const DEFAULT_LIMITS = Object.freeze({
            maxParts: 1024,
            maxUncompressed: 256 * 1024 * 1024,
            maxRatio: 200
        });

        // Factory-scoped RegExps — hoisted from hot paths so V8
        // caches the compiled pattern once per factory instantiation instead
        // of re-evaluating on every part name normalization.
        const LEADING_SLASH_RE = /^\//;

        const { encodeText, decodeText } = shared;

        function bytesToString(u8) { return decodeText(u8); }
        function stringToBytes(s) { return encodeText(s); }

        /**
         * Read an OPC package from a `Uint8Array` (the ZIP bytes).
         *
         * @param {Uint8Array} bytes
         * @param {object} [opts]
         * @param {number} [opts.maxParts=1024] max entries; `0` disables.
         * @param {number} [opts.maxUncompressed=268435456] max total
         *        uncompressed bytes (256 MiB); `0` disables.
         * @param {number} [opts.maxRatio=200] max uncompressed/compressed
         *        ratio per entry; `0` disables.
         * @returns {{contentTypes, parts, rels}}
         */
        function read(bytes, opts) {
            if (!(bytes instanceof Uint8Array)) {
                throw new ContractError('opc/invalid-input',
                    'OPC read: bytes must be a Uint8Array',
                    { context: { received: bytes === null ? 'null' : typeof bytes } });
            }
            const maxParts = opts && opts.maxParts !== undefined
                ? opts.maxParts : DEFAULT_LIMITS.maxParts;
            const maxUncompressed = opts && opts.maxUncompressed !== undefined
                ? opts.maxUncompressed : DEFAULT_LIMITS.maxUncompressed;
            const maxRatio = opts && opts.maxRatio !== undefined
                ? opts.maxRatio : DEFAULT_LIMITS.maxRatio;

            // Pre-scan with a filter callback : we tally counts and aborts
            // via thrown ParseError; the filter is called once per entry,
            // before any inflation work is committed by the outer caller.
            let partCount = 0;
            let uncompressedTotal = 0;
            const seen = [];
            try {
                zipMod.unzipSync(bytes, {
                    filter(entry) {
                        partCount++;
                        if (maxParts && partCount > maxParts) {
                            throw new ParseError('opc/zip-bomb',
                                'OPC: too many parts in archive',
                                { context: { limit: 'maxParts', max: maxParts } });
                        }
                        if (entry && typeof entry.originalSize === 'number') {
                            uncompressedTotal += entry.originalSize;
                            if (maxUncompressed && uncompressedTotal > maxUncompressed) {
                                throw new ParseError('opc/zip-bomb',
                                    'OPC: uncompressed payload exceeds limit',
                                    { context: { limit: 'maxUncompressed',
                                        max: maxUncompressed,
                                        actual: uncompressedTotal } });
                            }
                            if (maxRatio && entry.size > 0
                                && entry.originalSize / entry.size > maxRatio) {
                                throw new ParseError('opc/zip-bomb',
                                    'OPC: per-entry compression ratio exceeds limit',
                                    { context: { limit: 'maxRatio',
                                        max: maxRatio,
                                        name: entry.name,
                                        ratio: entry.originalSize / entry.size } });
                            }
                        }
                        seen.push(entry && entry.name);
                        return true;
                    }
                });
            } catch (e) {
                // Re-throw our typed errors verbatim; wrap anything else.
                if (e && e.code && typeof e.code === 'string'
                    && e.code.startsWith('opc/')) throw e;
                throw new ParseError('opc/invalid-zip',
                    'OPC: failed to unzip archive: ' + (e && e.message),
                    { cause: e });
            }

            // Actual extraction (filter returns truthy so we re-scan; the
            // bounds checks above already ran exactly once).
            let files;
            try {
                files = zipMod.unzipSync(bytes);
            } catch (e) {
                throw new ParseError('opc/invalid-zip',
                    'OPC: failed to unzip archive: ' + (e && e.message),
                    { cause: e });
            }

            const ctRaw = files['[Content_Types].xml'];
            if (!ctRaw) {
                throw new ParseError('opc/missing-content-types',
                    'OPC: missing [Content_Types].xml',
                    { context: { partName: '[Content_Types].xml' } });
            }
            let contentTypes;
            try {
                contentTypes = contentTypesMod.parse(bytesToString(ctRaw));
            } catch (e) {
                if (e && e.code && typeof e.code === 'string'
                    && e.code.startsWith('opc/')) throw e;
                throw new ParseError('opc/invalid-content-types',
                    'OPC: failed to parse [Content_Types].xml',
                    { context: { partName: '[Content_Types].xml' }, cause: e });
            }

            const parts = {};
            const rels = {};

            for (const path of Object.keys(files)) {
                if (path === '[Content_Types].xml') continue;
                if (path.endsWith('/')) continue; // directory entry
                const absolute = '/' + path;
                if (isRelsPath(path)) {
                    const owner = ownerPartFromRels(path);
                    try {
                        rels[owner] = relsMod.parse(bytesToString(files[path]));
                    } catch (e) {
                        throw new ParseError('opc/invalid-rels',
                            'OPC: failed to parse rels',
                            { context: { partName: path, owner }, cause: e });
                    }
                } else {
                    parts[absolute] = files[path];
                }
            }

            return { contentTypes, parts, rels };
        }

        /**
         * Write an OPC package to a `Uint8Array` (ZIP bytes).
         *
         * Every ZIP entry is stamped with `opts.mtime`, which defaults to
         * 1980-01-01 00:00:00 (the MS-DOS epoch, the timestamp Office
         * applications write), so two writes of the same package are
         * byte-identical. A value outside 1980-2099 is rejected by the ZIP
         * writer and surfaces as `opc/zip-failed`.
         *
         * @param {{contentTypes, parts, rels}} pkg
         * @param {{ mtime?: number|Date }} [opts]
         * @returns {Uint8Array}
         */
        function write(pkg, opts) {
            if (!pkg || typeof pkg !== 'object') {
                throw new ContractError('opc/invalid-input',
                    'OPC write: pkg must be an object',
                    { context: { received: pkg === null ? 'null' : typeof pkg } });
            }
            const files = {};
            try {
                files['[Content_Types].xml'] = stringToBytes(
                    contentTypesMod.serialize(pkg.contentTypes));
            } catch (e) {
                throw new RenderError('opc/render-content-types',
                    'OPC: failed to serialize [Content_Types].xml',
                    { cause: e });
            }

            for (const owner of Object.keys(pkg.rels || {})) {
                const rels = pkg.rels[owner];
                if (!rels || !rels.length) continue;
                const path = relsMod.relsPathFor(owner === '/' ? '' : owner);
                try {
                    files[path] = stringToBytes(relsMod.serialize(rels));
                } catch (e) {
                    throw new RenderError('opc/render-rels',
                        'OPC: failed to serialize rels',
                        { context: { owner, path }, cause: e });
                }
            }

            for (const partName of Object.keys(pkg.parts || {})) {
                const data = pkg.parts[partName];
                files[partName.replace(LEADING_SLASH_RE, '')] = data;
            }

            // Local-time constructor, at call time: the ZIP writer encodes
            // with local-time getters, so a UTC epoch number would fall
            // before 1980 west of Greenwich.
            const mtime = opts && opts.mtime !== undefined
                ? opts.mtime
                : new Date(1980, 0, 1, 0, 0, 0);

            try {
                return zipMod.zipSync(files, { mtime });
            } catch (e) {
                throw new RenderError('opc/zip-failed',
                    'OPC: failed to zip package',
                    { cause: e });
            }
        }

        /**
         * Build an empty package skeleton with just `[Content_Types].xml`
         * and an empty package relationships document.
         *
         * @returns {{contentTypes, parts, rels}}
         */
        function empty() {
            return {
                contentTypes: {
                    defaults: {
                        rels: 'application/vnd.openxmlformats-package.relationships+xml',
                        xml: 'application/xml'
                    },
                    overrides: {}
                },
                parts: {},
                rels: { '/': [] }
            };
        }

        // --- helpers ---

        function isRelsPath(zipPath) {
            // Either '_rels/.rels' (package root) or '<dir>/_rels/<file>.rels'.
            if (zipPath === '_rels/.rels') return true;
            const slash = zipPath.lastIndexOf('/');
            if (slash < 0) return false;
            const dir = zipPath.slice(0, slash);
            return zipPath.endsWith('.rels') && dir.endsWith('/_rels');
        }

        function ownerPartFromRels(zipPath) {
            if (zipPath === '_rels/.rels') return '/';
            // strip trailing `.rels`, drop the `_rels/` segment.
            const noExt = zipPath.slice(0, -'.rels'.length);
            const idx = noExt.lastIndexOf('/_rels/');
            const baseDir = noExt.slice(0, idx);
            const fileName = noExt.slice(idx + '/_rels/'.length);
            return '/' + (baseDir ? baseDir + '/' : '') + fileName;
        }

        /**
         * Add or replace a part in the package (registers content type via
         * override) and returns the package for chaining.
         *
         * @param {object} pkg
         * @param {string} partName absolute part name (`/word/document.xml`)
         * @param {Uint8Array} data
         * @param {string} contentType
         */
        function setPart(pkg, partName, data, contentType) {
            pkg.parts[partName] = data;
            if (contentType) pkg.contentTypes.overrides[partName] = contentType;
            return pkg;
        }

        /**
         * Set the relationships of a given source part (use `'/'` for
         * package-level relationships).
         *
         * @param {object} pkg
         * @param {string} sourcePart `/` for package, else absolute part name
         * @param {Array} rels
         */
        function setRels(pkg, sourcePart, rels) {
            pkg.rels[sourcePart] = rels;
            return pkg;
        }

        return { read, write, empty, setPart, setRels,
                 bytesToString, stringToBytes,
                 isRelsPath, ownerPartFromRels,
                 defaultLimits: DEFAULT_LIMITS };
    }
};
