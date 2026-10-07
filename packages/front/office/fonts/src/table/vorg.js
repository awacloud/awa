// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview `VORG` — Vertical Origin (OT §6.4.22).
 *
 * Sets the per-glyph y-coordinate of the vertical origin (the design
 * coordinate of the top of the em-box for vertical layout). Default
 * value applies to glyphs without an explicit entry.
 *
 * Layout :
 *  - majorVersion uint16 (= 1), minorVersion uint16 (= 0)
 *  - defaultVertOriginY int16
 *  - numVertOriginYMetrics uint16
 *  - vertOriginYMetrics[numVertOriginYMetrics] : { glyphIndex uint16, vertOriginY int16 }
 *
 * @module fonts/table/vorg
 */


import { fontErrors } from '../errors.js';
import { fontReader } from '../primitives/reader.js';
import { fontWriter } from '../primitives/writer.js';

export const tableVorg = {
    name: 'tableVorg',
    dependencies: ['fontErrors', 'fontReader', 'fontWriter'],
    deps: [fontErrors, fontReader, fontWriter],
    factory(errors, reader, writer) {
        const { ParseError } = errors;
        const { BinaryReader } = reader;
        const { BinaryWriter } = writer;

        function parseVorg(bytes) {
            if (bytes.length < 8)
                throw new ParseError('fonts/vorg-short', 'VORG header truncated');
            const r = new BinaryReader(bytes);
            const major = r.readUint16();
            const minor = r.readUint16();
            if (major !== 1)
                throw new ParseError('fonts/vorg-version', `unsupported VORG major ${major}`,
                    { context: { major, minor } });
            const defaultVertOriginY = r.readInt16();
            const numVertOriginYMetrics = r.readUint16();
            const metrics = new Array(numVertOriginYMetrics);
            const map = new Map();
            for (let i = 0; i < numVertOriginYMetrics; i++) {
                const glyphIndex = r.readUint16();
                const vertOriginY = r.readInt16();
                metrics[i] = { glyphIndex, vertOriginY };
                map.set(glyphIndex, vertOriginY);
            }
            return {
                majorVersion: major, minorVersion: minor,
                defaultVertOriginY, metrics, map,
                verticalOrigin(gid) { return map.has(gid) ? map.get(gid) : defaultVertOriginY; }
            };
        }

        function encodeVorg(vorg) {
            const w = new BinaryWriter(8 + (vorg.metrics?.length || 0) * 4);
            w.writeUint16(vorg.majorVersion ?? 1);
            w.writeUint16(vorg.minorVersion ?? 0);
            w.writeInt16(vorg.defaultVertOriginY ?? 0);
            const m = vorg.metrics || [];
            w.writeUint16(m.length);
            for (const e of m) {
                w.writeUint16(e.glyphIndex);
                w.writeInt16(e.vertOriginY);
            }
            return w.finalize();
        }

        return { parseVorg, encodeVorg };
    }
};
