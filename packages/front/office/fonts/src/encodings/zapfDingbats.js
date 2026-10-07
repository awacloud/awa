// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview ZapfDingbats encoding — PDF 32000-1:2008 Annex D.6.
 *
 * Built-in encoding for the Zapf Dingbats symbol font.
 *
 * Strict factory-only.
 *
 * @module fonts/encodings/zapfDingbats
 */

export const encodingZapfDingbats = {
    name: 'encodingZapfDingbats',
    dependencies: [],
    factory() {
        const a = new Array(256).fill('.notdef');
        const map = {
            0x20: 'space',
            0x21: 'a1', 0x22: 'a2', 0x23: 'a202', 0x24: 'a3', 0x25: 'a4',
            0x26: 'a5', 0x27: 'a119', 0x28: 'a118', 0x29: 'a117',
            0x2A: 'a11', 0x2B: 'a12', 0x2C: 'a13', 0x2D: 'a14',
            0x2E: 'a15', 0x2F: 'a16',
            0x30: 'a105', 0x31: 'a17', 0x32: 'a18', 0x33: 'a19', 0x34: 'a20',
            0x35: 'a21', 0x36: 'a22', 0x37: 'a23', 0x38: 'a24', 0x39: 'a25',
            0x3A: 'a26', 0x3B: 'a27', 0x3C: 'a28', 0x3D: 'a6', 0x3E: 'a7',
            0x3F: 'a8',
            0x40: 'a9', 0x41: 'a10', 0x42: 'a29', 0x43: 'a30',
            0x44: 'a31', 0x45: 'a32', 0x46: 'a33', 0x47: 'a34', 0x48: 'a35',
            0x49: 'a36', 0x4A: 'a37', 0x4B: 'a38', 0x4C: 'a39', 0x4D: 'a40',
            0x4E: 'a41', 0x4F: 'a42',
            0x50: 'a43', 0x51: 'a44', 0x52: 'a45', 0x53: 'a46', 0x54: 'a47',
            0x55: 'a48', 0x56: 'a49', 0x57: 'a50', 0x58: 'a51', 0x59: 'a52',
            0x5A: 'a53', 0x5B: 'a54', 0x5C: 'a55', 0x5D: 'a56', 0x5E: 'a57',
            0x5F: 'a58',
            0x60: 'a59', 0x61: 'a60', 0x62: 'a61', 0x63: 'a62', 0x64: 'a63',
            0x65: 'a64', 0x66: 'a65', 0x67: 'a66', 0x68: 'a67', 0x69: 'a68',
            0x6A: 'a69', 0x6B: 'a70', 0x6C: 'a71', 0x6D: 'a72', 0x6E: 'a73',
            0x6F: 'a74',
            0x70: 'a203', 0x71: 'a75', 0x72: 'a204', 0x73: 'a76', 0x74: 'a77',
            0x75: 'a78', 0x76: 'a79', 0x77: 'a81', 0x78: 'a82', 0x79: 'a83',
            0x7A: 'a84', 0x7B: 'a97', 0x7C: 'a98', 0x7D: 'a99', 0x7E: 'a100',
            0xA1: 'a101', 0xA2: 'a102', 0xA3: 'a103', 0xA4: 'a104', 0xA5: 'a106',
            0xA6: 'a107', 0xA7: 'a108', 0xA8: 'a112', 0xA9: 'a111',
            0xAA: 'a110', 0xAB: 'a109',
            0xAC: 'a120', 0xAD: 'a121', 0xAE: 'a122', 0xAF: 'a123',
            0xB0: 'a124', 0xB1: 'a125', 0xB2: 'a126', 0xB3: 'a127', 0xB4: 'a128',
            0xB5: 'a129', 0xB6: 'a130', 0xB7: 'a131', 0xB8: 'a132', 0xB9: 'a133',
            0xBA: 'a134', 0xBB: 'a135', 0xBC: 'a136', 0xBD: 'a137', 0xBE: 'a138',
            0xBF: 'a139',
            0xC0: 'a140', 0xC1: 'a141', 0xC2: 'a142', 0xC3: 'a143', 0xC4: 'a144',
            0xC5: 'a145', 0xC6: 'a146', 0xC7: 'a147', 0xC8: 'a148', 0xC9: 'a149',
            0xCA: 'a150', 0xCB: 'a151', 0xCC: 'a152', 0xCD: 'a153', 0xCE: 'a154',
            0xCF: 'a155',
            0xD0: 'a156', 0xD1: 'a157', 0xD2: 'a158', 0xD3: 'a159', 0xD4: 'a160',
            0xD5: 'a161', 0xD6: 'a163', 0xD7: 'a164', 0xD8: 'a196', 0xD9: 'a165',
            0xDA: 'a192', 0xDB: 'a166', 0xDC: 'a167', 0xDD: 'a168', 0xDE: 'a169',
            0xDF: 'a170',
            0xE0: 'a171', 0xE1: 'a172', 0xE2: 'a173', 0xE3: 'a162', 0xE4: 'a174',
            0xE5: 'a175', 0xE6: 'a176', 0xE7: 'a177', 0xE8: 'a178', 0xE9: 'a179',
            0xEA: 'a193', 0xEB: 'a180', 0xEC: 'a199', 0xED: 'a181', 0xEE: 'a200',
            0xEF: 'a182',
            0xF1: 'a201', 0xF2: 'a183', 0xF3: 'a184', 0xF4: 'a197',
            0xF5: 'a185', 0xF6: 'a194', 0xF7: 'a198', 0xF8: 'a186', 0xF9: 'a195',
            0xFA: 'a187', 0xFB: 'a188', 0xFC: 'a189', 0xFD: 'a190', 0xFE: 'a191'
        };
        for (const k in map) a[k | 0] = map[k];
        const ZAPF_DINGBATS = Object.freeze(a);
        function lookup(byte) { return ZAPF_DINGBATS[byte & 0xFF]; }
        return { ZAPF_DINGBATS, lookup };
    }
};
