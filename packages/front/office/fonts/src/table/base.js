// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview `BASE` — Baseline Metadata (OT §6.9).
 *
 * Specifies baseline metrics for scripts (`latn`, `cyrl`, `hani`, ...).
 *
 * Header v1.0 :
 *  - majorVersion uint16 (= 1)
 *  - minorVersion uint16
 *  - horizAxisOffset uint16
 *  - vertAxisOffset uint16
 *  - [v1.1] itemVarStoreOffset uint32
 *
 * Each axis :
 *  - baseTagListOffset uint16
 *  - baseScriptListOffset uint16
 *
 * @module fonts/table/base
 */


import { fontErrors } from '../errors.js';
import { fontReader } from '../primitives/reader.js';
import { fontTag } from '../primitives/tag.js';

export const tableBase = {
    name: 'tableBase',
    dependencies: ['fontErrors', 'fontReader', 'fontTag'],
    deps: [fontErrors, fontReader, fontTag],
    factory(errors, reader, tagMod) {
        const { ParseError } = errors;
        const { BinaryReader } = reader;
        const { untag } = tagMod;

        function parseAxis(bytes, axisOffset) {
            const r = new BinaryReader(bytes, axisOffset, bytes.length - axisOffset);
            const baseTagListOffset    = r.readUint16();
            const baseScriptListOffset = r.readUint16();
            let baselineTags = [];
            if (baseTagListOffset) {
                const tr = new BinaryReader(bytes, axisOffset + baseTagListOffset,
                                            bytes.length - axisOffset - baseTagListOffset);
                const baseTagCount = tr.readUint16();
                baselineTags = new Array(baseTagCount);
                for (let i = 0; i < baseTagCount; i++) baselineTags[i] = untag(tr.readUint32());
            }
            let scripts = [];
            if (baseScriptListOffset) {
                const sr = new BinaryReader(bytes, axisOffset + baseScriptListOffset,
                                            bytes.length - axisOffset - baseScriptListOffset);
                const baseScriptCount = sr.readUint16();
                scripts = new Array(baseScriptCount);
                for (let i = 0; i < baseScriptCount; i++) {
                    scripts[i] = {
                        baseScriptTag: untag(sr.readUint32()),
                        baseScriptOffset: sr.readUint16()
                    };
                }
            }
            return { baselineTags, scripts };
        }

        function parseBase(bytes) {
            if (bytes.length < 8)
                throw new ParseError('fonts/base-short', 'BASE header truncated');
            const r = new BinaryReader(bytes);
            const major = r.readUint16();
            const minor = r.readUint16();
            if (major !== 1)
                throw new ParseError('fonts/base-version', `unsupported BASE major ${major}`,
                    { context: { major, minor } });
            const horizAxisOffset = r.readUint16();
            const vertAxisOffset  = r.readUint16();
            const itemVarStoreOffset = minor >= 1 ? r.readUint32() : 0;
            const horizAxis = horizAxisOffset ? parseAxis(bytes, horizAxisOffset) : null;
            const vertAxis  = vertAxisOffset  ? parseAxis(bytes, vertAxisOffset)  : null;
            return {
                majorVersion: major, minorVersion: minor,
                horizAxis, vertAxis, itemVarStoreOffset
            };
        }

        return { parseBase };
    }
};
