// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview `OS/2` — OS/2 and Windows Metrics (OT §6.4.7).
 *
 * Versions:
 *  - v0 :  78 bytes
 *  - v1 :  86 bytes (+ ulCodePageRange1/2)
 *  - v2 :  96 bytes (+ sxHeight, sCapHeight, usDefaultChar, usBreakChar, usMaxContext)
 *  - v3 :  96 bytes (same fields as v2 — v3 only changes interpretation)
 *  - v4 :  96 bytes (same layout, new fsSelection bits)
 *  - v5 : 100 bytes (+ usLowerOpticalPointSize, usUpperOpticalPointSize)
 *
 * @module fonts/table/os2
 */


import { fontErrors } from '../errors.js';
import { fontReader } from '../primitives/reader.js';
import { fontWriter } from '../primitives/writer.js';

export const tableOs2 = {
    name: 'tableOs2',
    dependencies: ['fontErrors', 'fontReader', 'fontWriter'],
    deps: [fontErrors, fontReader, fontWriter],
    factory(errors, reader, writer) {
        const { ParseError } = errors;
        const { BinaryReader } = reader;
        const { BinaryWriter } = writer;

        /**
         * @returns {object}  parsed OS/2 fields (only those defined for the
         *                    detected version are present).
         */
        function parseOs2(bytes) {
            if (bytes.length < 78)
                throw new ParseError('fonts/os2-short', 'OS/2 table must be ≥ 78 bytes',
                    { context: { actual: bytes.length } });
            const r = new BinaryReader(bytes);
            const version = r.readUint16();
            const out = {
                version,
                xAvgCharWidth:     r.readInt16(),
                usWeightClass:     r.readUint16(),
                usWidthClass:      r.readUint16(),
                fsType:            r.readUint16(),
                ySubscriptXSize:   r.readInt16(),
                ySubscriptYSize:   r.readInt16(),
                ySubscriptXOffset: r.readInt16(),
                ySubscriptYOffset: r.readInt16(),
                ySuperscriptXSize: r.readInt16(),
                ySuperscriptYSize: r.readInt16(),
                ySuperscriptXOffset: r.readInt16(),
                ySuperscriptYOffset: r.readInt16(),
                yStrikeoutSize:    r.readInt16(),
                yStrikeoutPosition: r.readInt16(),
                sFamilyClass:      r.readInt16(),
                panose:            Array.from(r.readBytesCopy(10)),
                ulUnicodeRange1:   r.readUint32(),
                ulUnicodeRange2:   r.readUint32(),
                ulUnicodeRange3:   r.readUint32(),
                ulUnicodeRange4:   r.readUint32(),
                achVendID:         String.fromCharCode(...r.readBytesCopy(4)),
                fsSelection:       r.readUint16(),
                usFirstCharIndex:  r.readUint16(),
                usLastCharIndex:   r.readUint16(),
                sTypoAscender:     r.readInt16(),
                sTypoDescender:    r.readInt16(),
                sTypoLineGap:      r.readInt16(),
                usWinAscent:       r.readUint16(),
                usWinDescent:      r.readUint16()
            };
            if (version >= 1 && bytes.length >= 86) {
                out.ulCodePageRange1 = r.readUint32();
                out.ulCodePageRange2 = r.readUint32();
            }
            if (version >= 2 && bytes.length >= 96) {
                out.sxHeight       = r.readInt16();
                out.sCapHeight     = r.readInt16();
                out.usDefaultChar  = r.readUint16();
                out.usBreakChar    = r.readUint16();
                out.usMaxContext   = r.readUint16();
            }
            if (version >= 5 && bytes.length >= 100) {
                out.usLowerOpticalPointSize = r.readUint16();
                out.usUpperOpticalPointSize = r.readUint16();
            }
            return out;
        }

        /** Encode OS/2 — version is taken from `os2.version`. */
        function encodeOs2(os2) {
            const w = new BinaryWriter();
            w.writeUint16(os2.version);
            w.writeInt16(os2.xAvgCharWidth ?? 0);
            w.writeUint16(os2.usWeightClass ?? 400);
            w.writeUint16(os2.usWidthClass ?? 5);
            w.writeUint16(os2.fsType ?? 0);
            w.writeInt16(os2.ySubscriptXSize ?? 0);
            w.writeInt16(os2.ySubscriptYSize ?? 0);
            w.writeInt16(os2.ySubscriptXOffset ?? 0);
            w.writeInt16(os2.ySubscriptYOffset ?? 0);
            w.writeInt16(os2.ySuperscriptXSize ?? 0);
            w.writeInt16(os2.ySuperscriptYSize ?? 0);
            w.writeInt16(os2.ySuperscriptXOffset ?? 0);
            w.writeInt16(os2.ySuperscriptYOffset ?? 0);
            w.writeInt16(os2.yStrikeoutSize ?? 0);
            w.writeInt16(os2.yStrikeoutPosition ?? 0);
            w.writeInt16(os2.sFamilyClass ?? 0);
            const panose = os2.panose || new Array(10).fill(0);
            for (let i = 0; i < 10; i++) w.writeUint8(panose[i] | 0);
            w.writeUint32(os2.ulUnicodeRange1 ?? 0);
            w.writeUint32(os2.ulUnicodeRange2 ?? 0);
            w.writeUint32(os2.ulUnicodeRange3 ?? 0);
            w.writeUint32(os2.ulUnicodeRange4 ?? 0);
            const vend = (os2.achVendID || '    ').padEnd(4).slice(0, 4);
            for (let i = 0; i < 4; i++) w.writeUint8(vend.charCodeAt(i) & 0xFF);
            w.writeUint16(os2.fsSelection ?? 0);
            w.writeUint16(os2.usFirstCharIndex ?? 0);
            w.writeUint16(os2.usLastCharIndex ?? 0xFFFF);
            w.writeInt16(os2.sTypoAscender ?? 0);
            w.writeInt16(os2.sTypoDescender ?? 0);
            w.writeInt16(os2.sTypoLineGap ?? 0);
            w.writeUint16(os2.usWinAscent ?? 0);
            w.writeUint16(os2.usWinDescent ?? 0);
            if (os2.version >= 1) {
                w.writeUint32(os2.ulCodePageRange1 ?? 0);
                w.writeUint32(os2.ulCodePageRange2 ?? 0);
            }
            if (os2.version >= 2) {
                w.writeInt16(os2.sxHeight ?? 0);
                w.writeInt16(os2.sCapHeight ?? 0);
                w.writeUint16(os2.usDefaultChar ?? 0);
                w.writeUint16(os2.usBreakChar ?? 32);
                w.writeUint16(os2.usMaxContext ?? 0);
            }
            if (os2.version >= 5) {
                w.writeUint16(os2.usLowerOpticalPointSize ?? 0);
                w.writeUint16(os2.usUpperOpticalPointSize ?? 0xFFFF);
            }
            return w.finalize();
        }

        return { parseOs2, encodeOs2 };
    }
};
