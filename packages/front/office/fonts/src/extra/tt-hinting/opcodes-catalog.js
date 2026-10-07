// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview RM05 opcode catalogue + IMPLEMENTED set.
 *
 * Strict factory-only module — consumers resolve `ttHintingOpCatalog`.
 *
 * @module fonts/extra/tt-hinting/opcodes-catalog
 */

/**
 * @typedef {{code:number,name:string,args?:number,stackDelta?:number}} OpInfo
 */

export const ttHintingOpCatalog = {
    name: 'ttHintingOpCatalog',
    dependencies: [],
    factory() {
        /** Build the static catalogue, mostly machine-generated from RM05 §6. */
        function buildOpcodeTable() {
            /** @type {Record<number,OpInfo>} */
            const t = Object.create(null);
            const add = (c, name, extra) => { t[c] = Object.assign({ code: c, name }, extra || {}); };

            // 0x00–0x05 — set vectors to axis (deferred)
            add(0x00, 'SVTCA[0]'); add(0x01, 'SVTCA[1]');
            add(0x02, 'SPVTCA[0]'); add(0x03, 'SPVTCA[1]');
            add(0x04, 'SFVTCA[0]'); add(0x05, 'SFVTCA[1]');
            add(0x06, 'SPVTL[0]'); add(0x07, 'SPVTL[1]');
            add(0x08, 'SFVTL[0]'); add(0x09, 'SFVTL[1]');
            add(0x0A, 'SPVFS'); add(0x0B, 'SFVFS');
            add(0x0C, 'GPV'); add(0x0D, 'GFV');
            add(0x0E, 'SFVTPV'); add(0x0F, 'ISECT');
            add(0x10, 'SRP0'); add(0x11, 'SRP1'); add(0x12, 'SRP2');
            add(0x13, 'SZP0'); add(0x14, 'SZP1'); add(0x15, 'SZP2'); add(0x16, 'SZPS');
            add(0x17, 'SLOOP'); add(0x18, 'RTG'); add(0x19, 'RTHG'); add(0x1A, 'SMD');
            add(0x1B, 'ELSE');  add(0x1C, 'JMPR'); add(0x1D, 'SCVTCI');
            add(0x1E, 'SSWCI'); add(0x1F, 'SSW');
            add(0x20, 'DUP'); add(0x21, 'POP'); add(0x22, 'CLEAR');
            add(0x23, 'SWAP'); add(0x24, 'DEPTH');
            add(0x25, 'CINDEX'); add(0x26, 'MINDEX');
            add(0x27, 'ALIGNPTS'); add(0x29, 'UTP');
            add(0x2A, 'LOOPCALL'); add(0x2B, 'CALL');
            add(0x2C, 'FDEF'); add(0x2D, 'ENDF');
            add(0x2E, 'MDAP[0]'); add(0x2F, 'MDAP[1]');
            add(0x30, 'IUP[0]'); add(0x31, 'IUP[1]');
            add(0x32, 'SHP[0]'); add(0x33, 'SHP[1]');
            add(0x34, 'SHC[0]'); add(0x35, 'SHC[1]');
            add(0x36, 'SHZ[0]'); add(0x37, 'SHZ[1]');
            add(0x38, 'SHPIX'); add(0x39, 'IP');
            add(0x3A, 'MSIRP[0]'); add(0x3B, 'MSIRP[1]');
            add(0x3C, 'ALIGNRP'); add(0x3D, 'RTDG');
            add(0x3E, 'MIAP[0]'); add(0x3F, 'MIAP[1]');
            add(0x40, 'NPUSHB'); add(0x41, 'NPUSHW');
            add(0x42, 'WS'); add(0x43, 'RS');
            add(0x44, 'WCVTP'); add(0x45, 'RCVT');
            add(0x46, 'GC[0]'); add(0x47, 'GC[1]');
            add(0x48, 'SCFS'); add(0x49, 'MD[0]'); add(0x4A, 'MD[1]');
            add(0x4B, 'MPPEM'); add(0x4C, 'MPS');
            add(0x4D, 'FLIPON'); add(0x4E, 'FLIPOFF'); add(0x4F, 'DEBUG');
            add(0x50, 'LT'); add(0x51, 'LTEQ'); add(0x52, 'GT'); add(0x53, 'GTEQ');
            add(0x54, 'EQ'); add(0x55, 'NEQ');
            add(0x56, 'ODD'); add(0x57, 'EVEN');
            add(0x58, 'IF'); add(0x59, 'EIF');
            add(0x5A, 'AND'); add(0x5B, 'OR'); add(0x5C, 'NOT');
            add(0x5D, 'DELTAP1');
            add(0x5E, 'SDB'); add(0x5F, 'SDS');
            add(0x60, 'ADD'); add(0x61, 'SUB'); add(0x62, 'DIV'); add(0x63, 'MUL');
            add(0x64, 'ABS'); add(0x65, 'NEG');
            add(0x66, 'FLOOR'); add(0x67, 'CEILING');
            add(0x68, 'ROUND[00]'); add(0x69, 'ROUND[01]');
            add(0x6A, 'ROUND[10]'); add(0x6B, 'ROUND[11]');
            add(0x6C, 'NROUND[00]'); add(0x6D, 'NROUND[01]');
            add(0x6E, 'NROUND[10]'); add(0x6F, 'NROUND[11]');
            add(0x70, 'WCVTF');
            add(0x71, 'DELTAP2'); add(0x72, 'DELTAP3');
            add(0x73, 'DELTAC1'); add(0x74, 'DELTAC2'); add(0x75, 'DELTAC3');
            add(0x76, 'SROUND'); add(0x77, 'S45ROUND');
            add(0x78, 'JROT'); add(0x79, 'JROF');
            add(0x7A, 'ROFF');
            add(0x7C, 'RUTG'); add(0x7D, 'RDTG');
            add(0x7E, 'SANGW'); add(0x7F, 'AA');
            add(0x80, 'FLIPPT'); add(0x81, 'FLIPRGON'); add(0x82, 'FLIPRGOFF');
            add(0x85, 'SCANCTRL'); add(0x86, 'SDPVTL[0]'); add(0x87, 'SDPVTL[1]');
            add(0x88, 'GETINFO'); add(0x89, 'IDEF'); add(0x8A, 'ROLL');
            add(0x8B, 'MAX'); add(0x8C, 'MIN'); add(0x8D, 'SCANTYPE');
            add(0x8E, 'INSTCTRL');
            add(0x91, 'GETVARIATION');

            // Push families
            for (let i = 0; i < 8; i++) add(0xB0 + i, 'PUSHB[' + i + ']', { args: i + 1 });
            for (let i = 0; i < 8; i++) add(0xB8 + i, 'PUSHW[' + i + ']', { args: 2 * (i + 1) });

            // MDRP 0xC0..0xDF / MIRP 0xE0..0xFF
            for (let i = 0xC0; i <= 0xDF; i++) add(i, 'MDRP[' + (i & 0x1F).toString(16) + ']');
            for (let i = 0xE0; i <= 0xFF; i++) add(i, 'MIRP[' + (i & 0x1F).toString(16) + ']');

            return t;
        }

        /** Catalogue of every RM05 opcode (implemented or deferred). */
        const RM05_OPCODES = buildOpcodeTable();

        /** Set of opcodes the interpreter implements; everything else is deferred. */
        const IMPLEMENTED = new Set([
            0x1B, 0x1C, 0x20, 0x21, 0x22, 0x23, 0x24, 0x25, 0x26,
            0x40, 0x41, 0x42, 0x43, 0x44, 0x45, 0x46, 0x47,
            0x4B, 0x4C,
            0x50, 0x51, 0x52, 0x53, 0x54, 0x55,
            0x58, 0x59, 0x5A, 0x5B, 0x5C,
            0x60, 0x61, 0x62, 0x63, 0x64, 0x65, 0x66, 0x67,
            0x68, 0x69, 0x6A, 0x6B,
            0x70,
            0x78, 0x79,
            0x8A, 0x8B, 0x8C,
            0x0C, 0x0D,
            // vectors
            0x00, 0x01, 0x02, 0x03, 0x04, 0x05,
            0x06, 0x07, 0x08, 0x09,
            0x0A, 0x0B, 0x0E,
            // graphics state setters
            0x10, 0x11, 0x12, 0x13, 0x14, 0x15, 0x16,
            0x17, 0x18, 0x19, 0x1A,
            0x1D, 0x1E, 0x1F,
            0x3D, 0x4D, 0x4E,
            0x76, 0x77, 0x7A, 0x7C, 0x7D,
            0x85, 0x8D, 0x8E,
            // outline manipulation skeletons
            0x27, 0x2E, 0x2F,
            0x30, 0x31,
            0x32, 0x33, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39,
            0x3C, 0x3E, 0x3F,
            0x0F,
            // deltas (parse + ignore)
            0x5D, 0x71, 0x72, 0x73, 0x74, 0x75,
        ]);
        // Push family
        for (let i = 0xB0; i <= 0xBF; i++) IMPLEMENTED.add(i);
        // MDRP 0xC0..0xDF / MIRP 0xE0..0xFF
        for (let i = 0xC0; i <= 0xFF; i++) IMPLEMENTED.add(i);

        const RM05_DEFERRED_COUNT =
            Object.keys(RM05_OPCODES).length - IMPLEMENTED.size;

        return { RM05_OPCODES, RM05_DEFERRED_COUNT, IMPLEMENTED };
    }
};
