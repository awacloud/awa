// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview JSTF — OpenType Justification table.
 *
 * Strict factory body.
 *
 * @module fonts/extra/jstf
 */

import { fontErrors } from '../errors.js';
import { fontReader } from '../primitives/reader.js';
import { fontTag } from '../primitives/tag.js';

export const extraJstf = {
    name: 'extraJstf',
    dependencies: ['fontErrors', 'fontReader', 'fontTag'],
    deps: [fontErrors, fontReader, fontTag],
    factory(errors, reader, tag) {
        const { ParseError } = errors;
        const { BinaryReader } = reader;
        const { untag } = tag;

        /**
         * Parse a JSTF table.
         *
         * @param {Uint8Array} bytes
         */
        function parseJstf(bytes) {
            if (!(bytes instanceof Uint8Array))
                throw new ParseError('fonts/jstf-input',
                    'parseJstf expects a Uint8Array', { context: { actual: typeof bytes } });
            if (bytes.length < 6)
                throw new ParseError('fonts/jstf-short',
                    'JSTF header truncated', { context: { length: bytes.length } });

            const r = new BinaryReader(bytes);
            const majorVersion = r.readUint16();
            const minorVersion = r.readUint16();
            if (majorVersion !== 1)
                throw new ParseError('fonts/jstf-version',
                    `unsupported JSTF version ${majorVersion}.${minorVersion}`,
                    { context: { majorVersion, minorVersion } });
            const scriptCount = r.readUint16();

            if (6 + scriptCount * 6 > bytes.length)
                throw new ParseError('fonts/jstf-records-truncated',
                    'JSTF script records run past end of table',
                    { context: { scriptCount, tableLength: bytes.length } });

            const scriptRecords = new Array(scriptCount);
            for (let i = 0; i < scriptCount; i++) {
                const tagU32 = r.readUint32();
                const offset = r.readUint16();
                scriptRecords[i] = { tag: tagU32, tagStr: untag(tagU32), offset };
            }

            const scripts = new Array(scriptCount);
            for (let i = 0; i < scriptCount; i++) {
                const rec = scriptRecords[i];
                scripts[i] = {
                    tag: rec.tag,
                    tagStr: rec.tagStr,
                    offset: rec.offset,
                    ...readJstfScript(bytes, rec.offset)
                };
            }

            return { majorVersion, minorVersion, scriptCount, scriptRecords, scripts };
        }

        function readJstfScript(bytes, offset) {
            if (offset + 6 > bytes.length)
                throw new ParseError('fonts/jstf-script-truncated',
                    'JstfScript sub-table truncated',
                    { context: { offset, length: bytes.length } });
            const r = new BinaryReader(bytes, offset, bytes.length - offset);
            const extenderGlyphOffset = r.readUint16();
            const defaultLangSysOffset = r.readUint16();
            const langSysCount = r.readUint16();

            if (6 + langSysCount * 6 > r.length)
                throw new ParseError('fonts/jstf-langsys-records-truncated',
                    'JstfScript langSys records exceed sub-table',
                    { context: { offset, langSysCount } });

            const langSysRecords = new Array(langSysCount);
            for (let i = 0; i < langSysCount; i++) {
                const tagU32 = r.readUint32();
                const langSysOffset = r.readUint16();
                langSysRecords[i] = {
                    tag: tagU32,
                    tagStr: untag(tagU32),
                    offset: langSysOffset,
                    bytes: langSysOffset < r.length
                        ? new Uint8Array(bytes.buffer, bytes.byteOffset + offset + langSysOffset, r.length - langSysOffset)
                        : new Uint8Array(0)
                };
            }

            return {
                extenderGlyphOffset,
                defaultLangSysOffset,
                langSysCount,
                langSysRecords
            };
        }

        return { parseJstf };
    }
};

