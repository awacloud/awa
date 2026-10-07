// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview `GDEF` — Glyph Definition (OT §7.5).
 *
 * Header (v1.0) :
 *  - version Fixed (= 0x00010000 or 0x00010002 or 0x00010003)
 *  - glyphClassDefOffset uint16
 *  - attachListOffset uint16
 *  - ligCaretListOffset uint16
 *  - markAttachClassDefOffset uint16
 *  - [v1.2] markGlyphSetsDefOffset uint16
 *  - [v1.3] itemVarStoreOffset uint32
 *
 * `glyphClassDef` maps each glyph to one of :
 *   1 = Base, 2 = Ligature, 3 = Mark, 4 = Component
 *
 * @module fonts/table/gdef
 */

import { fontErrors } from '../errors.js';
import { fontReader } from '../primitives/reader.js';
import { layoutClassDefinitions } from '../layout/classDefinitions.js';

export const tableGdef = {
    name: 'tableGdef',
    dependencies: ['fontErrors', 'fontReader', 'layoutClassDefinitions'],
    deps: [fontErrors, fontReader, layoutClassDefinitions],
    factory(errors, reader, classDefs) {
        const { ParseError } = errors;
        const { BinaryReader } = reader;
        const { parseClassDef } = classDefs;

        const GDEF_CLASS = Object.freeze({
            BASE: 1, LIGATURE: 2, MARK: 3, COMPONENT: 4
        });

        function parseGdef(bytes) {
            if (bytes.length < 12)
                throw new ParseError('fonts/gdef-short', 'GDEF header truncated');
            const r = new BinaryReader(bytes);
            const major = r.readUint16();
            const minor = r.readUint16();
            if (major !== 1)
                throw new ParseError('fonts/gdef-version',
                    `unsupported GDEF major version ${major}`,
                    { context: { major, minor } });
            const glyphClassDefOffset       = r.readUint16();
            const attachListOffset          = r.readUint16();
            const ligCaretListOffset        = r.readUint16();
            const markAttachClassDefOffset  = r.readUint16();
            const markGlyphSetsDefOffset    = minor >= 2 ? r.readUint16() : 0;
            const itemVarStoreOffset        = minor >= 3 ? r.readUint32() : 0;

            let glyphClassDef = null;
            if (glyphClassDefOffset) {
                const sub = new Uint8Array(bytes.buffer, bytes.byteOffset + glyphClassDefOffset, bytes.length - glyphClassDefOffset);
                glyphClassDef = parseClassDef(sub);
            }
            let markAttachClassDef = null;
            if (markAttachClassDefOffset) {
                const sub = new Uint8Array(bytes.buffer, bytes.byteOffset + markAttachClassDefOffset, bytes.length - markAttachClassDefOffset);
                markAttachClassDef = parseClassDef(sub);
            }

            return {
                majorVersion: major, minorVersion: minor,
                glyphClassDef, markAttachClassDef,
                attachListOffset, ligCaretListOffset,
                markGlyphSetsDefOffset, itemVarStoreOffset
            };
        }

        return { parseGdef, GDEF_CLASS };
    }
};

