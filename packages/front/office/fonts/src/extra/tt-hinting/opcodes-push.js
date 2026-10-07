// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview TT hinting VM — PUSH family handlers.
 *
 * Strict factory-only module.
 *
 * Handles PUSHB[0..7] (0xB0..0xB7), PUSHW[0..7] (0xB8..0xBF),
 * NPUSHB (0x40), NPUSHW (0x41).
 *
 * @module fonts/extra/tt-hinting/opcodes-push
 */

export const ttHintingOpPush = {
    name: 'ttHintingOpPush',
    dependencies: [],
    factory() {
        function handlePushOp(op, vm) {
            const { push, reader } = vm;
            if (op >= 0xB0 && op <= 0xB7) {
                const n = op - 0xB0 + 1;
                for (let i = 0; i < n; i++) push(reader.readUint8());
                return true;
            }
            if (op >= 0xB8 && op <= 0xBF) {
                const n = op - 0xB8 + 1;
                for (let i = 0; i < n; i++) push(reader.readInt16());
                return true;
            }
            if (op === 0x40) {           // NPUSHB
                const n = reader.readUint8();
                for (let i = 0; i < n; i++) push(reader.readUint8());
                return true;
            }
            if (op === 0x41) {           // NPUSHW
                const n = reader.readUint8();
                for (let i = 0; i < n; i++) push(reader.readInt16());
                return true;
            }
            return false;
        }

        return { handlePushOp };
    }
};
