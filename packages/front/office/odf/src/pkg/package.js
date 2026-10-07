// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview ODF package container — ZIP + mimetype + manifest.xml.
 *
 * An ODF package is a ZIP archive with two structural constraints:
 *
 * - The `mimetype` file MUST be the **first** ZIP entry, **STORED**
 *   (compression method 0, no extra field).
 * - `META-INF/manifest.xml` declares every file entry with media-type.
 *
 * Other parts (`content.xml`, `styles.xml`, `meta.xml`, `settings.xml`,
 * embedded media in `Pictures/`, etc.) live anywhere in the ZIP.
 *
 * Parts are keyed by ZIP path **without** a leading slash (e.g.
 * `'content.xml'`, `'Pictures/image1.png'`) — the same convention as
 * the manifest's `manifest:full-path` for non-root entries.
 *
 * ```js
 * {
 *   mimetype: 'application/vnd.oasis.opendocument.text',
 *   manifest: { version, entries: [...] },
 *   parts: { 'content.xml': Uint8Array, ... }
 * }
 * ```
 *
 * ## Security — ZIP bomb guards
 *
 * `read(bytes, opts?)` enforces three default bounds to prevent
 * decompression-bomb DoS. They are checked per entry, before that entry
 * is inflated:
 *
 * | Option            | Default       | Meaning                                |
 * |-------------------|---------------|----------------------------------------|
 * | `maxParts`        | `4096`        | max number of entries in the archive   |
 * | `maxUncompressed` | `256 * 1MiB`  | max total uncompressed bytes           |
 * | `maxRatio`        | `200`         | max uncompressed/compressed ratio      |
 *
 * The entry cap counts directory entries: a LibreOffice document with many
 * embedded objects carries a directory entry and several parts per object,
 * so formula-heavy texts reach well over a thousand entries (the reference
 * case has 1606).
 *
 * Exceeding any limit raises `ParseError('odf/parse-error/zip-bomb', ...)`
 * with `context.limit` set to the breached bound. Pass `0` to disable a
 * given check. The defaults are exposed, frozen, as `DEFAULT_LIMITS`.
 *
 * @module odf/pkg/package
 */

import { odfErrors } from '../errors.js';
import { odfShared } from '../_shared/index.js';
import { zip } from '@awacloud/fw/io/compress/zip.js';
import { pkgMimetype } from './mimetype.js';
import { pkgManifest } from './manifest.js';

export const pkgPackage = {
    name: 'pkgPackage',
    dependencies: ['odfErrors', 'odfShared', 'zip', 'pkgMimetype', 'pkgManifest'],
    deps: [odfErrors, odfShared, zip, pkgMimetype, pkgManifest],

    factory(errors, shared, zipMod, mimetypeMod, manifestMod) {
        const { ParseError, ContractError } = errors;
        const { encodeText, decodeText } = shared;

        const MIMETYPE_PATH = 'mimetype';
        const MANIFEST_PATH = 'META-INF/manifest.xml';

        const DEFAULT_LIMITS = Object.freeze({
            maxParts: 4096,
            maxUncompressed: 256 * 1024 * 1024,   // 268435456
            maxRatio: 200
        });

        /** Resolve one cap: caller value if given (validated), else the default. */
        function limitOf(opts, key) {
            const v = opts && opts[key] !== undefined ? opts[key] : DEFAULT_LIMITS[key];
            if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) {
                throw new ContractError('odf/contract-error/pkg',
                    `pkg: ${key} must be a finite number >= 0 (0 disables)`,
                    { context: { module: 'pkg', argument: key, received: v } });
            }
            return v;
        }

        function zipBomb(message, context) {
            return new ParseError('odf/parse-error/zip-bomb', 'pkg: ' + message,
                { context: { module: 'pkg', ...context } });
        }

        /**
         * Read an ODF package from ZIP bytes.
         *
         * The three ZIP bomb caps are checked per entry, before that entry
         * is inflated. Breaching one throws
         * `ParseError('odf/parse-error/zip-bomb')` with `context.limit`
         * naming the breached option.
         *
         * @param {Uint8Array} bytes
         * @param {object} [opts]
         * @param {number} [opts.maxParts=4096] max entries in the archive
         *        (directory entries included); `0` disables.
         * @param {number} [opts.maxUncompressed=268435456] max total
         *        uncompressed bytes (256 MiB); `0` disables.
         * @param {number} [opts.maxRatio=200] max uncompressed/compressed
         *        ratio per entry; `0` disables.
         * @returns {{ mimetype, manifest, parts }}
         * @throws {ParseError} `odf/parse-error/zip-bomb` on a breached cap,
         *         `odf/parse-error/pkg` on an invalid ZIP or a missing part.
         * @throws {ContractError} `odf/contract-error/pkg` when an option is
         *         not a finite number >= 0.
         */
        function read(bytes, opts) {
            const maxParts = limitOf(opts, 'maxParts');
            const maxUncompressed = limitOf(opts, 'maxUncompressed');
            const maxRatio = limitOf(opts, 'maxRatio');
            let files;
            let count = 0;
            let total = 0;
            try {
                files = zipMod.unzipSync(bytes, {
                    filter(entry) {
                        count++;
                        if (maxParts && count > maxParts) {
                            throw zipBomb('too many entries in archive', { limit: 'maxParts', max: maxParts, actual: count });
                        }
                        const u = typeof entry.originalSize === 'number' ? entry.originalSize : 0;
                        total += u;
                        if (maxUncompressed && total > maxUncompressed) {
                            throw zipBomb('uncompressed payload exceeds limit', { limit: 'maxUncompressed', max: maxUncompressed, actual: total, name: entry.name });
                        }
                        if (maxRatio && entry.size > 0 && u / entry.size > maxRatio) {
                            throw zipBomb('per-entry compression ratio exceeds limit', { limit: 'maxRatio', max: maxRatio, name: entry.name, ratio: u / entry.size });
                        }
                        return true;
                    }
                });
            } catch (e) {
                if (e && e.code === 'odf/parse-error/zip-bomb') throw e;
                throw new ParseError('odf/parse-error/pkg', 'pkg: not a valid ZIP archive',
                    { cause: e, context: { module: 'pkg' } });
            }

            const mimetypeBytes = files[MIMETYPE_PATH];
            if (!mimetypeBytes) {
                throw new ParseError('odf/parse-error/pkg',
                    'pkg: missing mimetype',
                    { context: { module: 'pkg', part: 'mimetype' } });
            }
            const mimetype = mimetypeMod.parse(mimetypeBytes);

            const manifestBytes = files[MANIFEST_PATH];
            if (!manifestBytes) {
                throw new ParseError('odf/parse-error/pkg',
                    'pkg: missing META-INF/manifest.xml',
                    { context: { module: 'pkg', part: 'META-INF/manifest.xml' } });
            }
            const manifest = manifestMod.parse(decodeText(manifestBytes));

            const parts = {};
            for (const path of Object.keys(files)) {
                if (path === MIMETYPE_PATH) continue;
                if (path === MANIFEST_PATH) continue;
                if (path.endsWith('/')) continue; // directory entry
                parts[path] = files[path];
            }

            return { mimetype, manifest, parts };
        }

        /**
         * Write an ODF package to ZIP bytes.
         *
         * The `mimetype` entry is forced to be the first key in the file
         * map and stored uncompressed (`level: 0`).
         *
         * @param {{ mimetype, manifest, parts }} pkg
         * @returns {Uint8Array}
         */
        function write(pkg) {
            if (!pkg || !pkg.mimetype) {
                throw new ContractError('odf/contract-error/pkg',
                    'pkg: package needs a mimetype',
                    { context: { module: 'pkg', argument: 'pkg' } });
            }
            const files = {};
            // mimetype FIRST, STORED (level 0).
            files[MIMETYPE_PATH] = [mimetypeMod.render(pkg.mimetype), { level: 0 }];

            // Then user parts, ordered for stability.
            for (const path of Object.keys(pkg.parts || {})) {
                if (path === MIMETYPE_PATH) continue;
                if (path === MANIFEST_PATH) continue;
                files[path] = pkg.parts[path];
            }

            // Manifest last (location doesn't matter, but consistent).
            files[MANIFEST_PATH] = encodeText(manifestMod.serialize(pkg.manifest));

            return zipMod.zipSync(files);
        }

        /**
         * Build an empty package skeleton — mimetype + minimal manifest.
         *
         * @param {string} mimetype — `pkgMimetype.CT_ODT` etc.
         * @returns {{ mimetype, manifest, parts }}
         */
        function empty(mimetype) {
            return {
                mimetype,
                manifest: manifestMod.empty(mimetype),
                parts: {}
            };
        }

        /**
         * Add or replace a part and the matching manifest entry.
         *
         * @param {object} pkg
         * @param {string} path ZIP path (no leading slash)
         * @param {Uint8Array} bytes
         * @param {string} [mediaType] manifest media-type (`'text/xml'` default)
         */
        function setPart(pkg, path, bytes, mediaType) {
            pkg.parts[path] = bytes;
            manifestMod.setEntry(pkg.manifest, path, mediaType || 'application/octet-stream');
            return pkg;
        }

        function getPart(pkg, path) {
            return pkg.parts[path];
        }

        function getPartText(pkg, path) {
            const b = pkg.parts[path];
            return b ? decodeText(b) : null;
        }

        return {
            read, write, empty, setPart, getPart, getPartText,
            MIMETYPE_PATH, MANIFEST_PATH, DEFAULT_LIMITS
        };
    }
};
