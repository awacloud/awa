// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Symbol font encoding — PDF 32000-1:2008 Annex D.5.
 *
 * Built-in encoding of the Symbol font (Greek + math symbols + dingbats).
 *
 * Strict factory-only.
 *
 * @module fonts/encodings/symbol
 */

export const encodingSymbol = {
    name: 'encodingSymbol',
    dependencies: [],
    factory() {
        const a = new Array(256).fill('.notdef');
        const map = {
            0x20: 'space', 0x21: 'exclam', 0x22: 'universal', 0x23: 'numbersign',
            0x24: 'existential', 0x25: 'percent', 0x26: 'ampersand', 0x27: 'suchthat',
            0x28: 'parenleft', 0x29: 'parenright', 0x2A: 'asteriskmath', 0x2B: 'plus',
            0x2C: 'comma', 0x2D: 'minus', 0x2E: 'period', 0x2F: 'slash',
            0x30: 'zero', 0x31: 'one', 0x32: 'two', 0x33: 'three', 0x34: 'four',
            0x35: 'five', 0x36: 'six', 0x37: 'seven', 0x38: 'eight', 0x39: 'nine',
            0x3A: 'colon', 0x3B: 'semicolon', 0x3C: 'less', 0x3D: 'equal',
            0x3E: 'greater', 0x3F: 'question',
            0x40: 'congruent',
            0x41: 'Alpha', 0x42: 'Beta', 0x43: 'Chi', 0x44: 'Delta', 0x45: 'Epsilon',
            0x46: 'Phi', 0x47: 'Gamma', 0x48: 'Eta', 0x49: 'Iota', 0x4A: 'theta1',
            0x4B: 'Kappa', 0x4C: 'Lambda', 0x4D: 'Mu', 0x4E: 'Nu', 0x4F: 'Omicron',
            0x50: 'Pi', 0x51: 'Theta', 0x52: 'Rho', 0x53: 'Sigma', 0x54: 'Tau',
            0x55: 'Upsilon', 0x56: 'sigma1', 0x57: 'Omega', 0x58: 'Xi', 0x59: 'Psi', 0x5A: 'Zeta',
            0x5B: 'bracketleft', 0x5C: 'therefore', 0x5D: 'bracketright',
            0x5E: 'perpendicular', 0x5F: 'underscore', 0x60: 'radicalex',
            0x61: 'alpha', 0x62: 'beta', 0x63: 'chi', 0x64: 'delta', 0x65: 'epsilon',
            0x66: 'phi', 0x67: 'gamma', 0x68: 'eta', 0x69: 'iota', 0x6A: 'phi1',
            0x6B: 'kappa', 0x6C: 'lambda', 0x6D: 'mu', 0x6E: 'nu', 0x6F: 'omicron',
            0x70: 'pi', 0x71: 'theta', 0x72: 'rho', 0x73: 'sigma', 0x74: 'tau',
            0x75: 'upsilon', 0x76: 'omega1', 0x77: 'omega', 0x78: 'xi', 0x79: 'psi', 0x7A: 'zeta',
            0x7B: 'braceleft', 0x7C: 'bar', 0x7D: 'braceright', 0x7E: 'similar',
            0xA0: 'Euro', 0xA1: 'Upsilon1', 0xA2: 'minute', 0xA3: 'lessequal',
            0xA4: 'fraction', 0xA5: 'infinity', 0xA6: 'florin', 0xA7: 'club',
            0xA8: 'diamond', 0xA9: 'heart', 0xAA: 'spade', 0xAB: 'arrowboth',
            0xAC: 'arrowleft', 0xAD: 'arrowup', 0xAE: 'arrowright', 0xAF: 'arrowdown',
            0xB0: 'degree', 0xB1: 'plusminus', 0xB2: 'second', 0xB3: 'greaterequal',
            0xB4: 'multiply', 0xB5: 'proportional', 0xB6: 'partialdiff', 0xB7: 'bullet',
            0xB8: 'divide', 0xB9: 'notequal', 0xBA: 'equivalence', 0xBB: 'approxequal',
            0xBC: 'ellipsis', 0xBD: 'arrowvertex', 0xBE: 'arrowhorizex', 0xBF: 'carriagereturn',
            0xC0: 'aleph', 0xC1: 'Ifraktur', 0xC2: 'Rfraktur', 0xC3: 'weierstrass',
            0xC4: 'circlemultiply', 0xC5: 'circleplus', 0xC6: 'emptyset', 0xC7: 'intersection',
            0xC8: 'union', 0xC9: 'propersuperset', 0xCA: 'reflexsuperset', 0xCB: 'notsubset',
            0xCC: 'propersubset', 0xCD: 'reflexsubset', 0xCE: 'element', 0xCF: 'notelement',
            0xD0: 'angle', 0xD1: 'gradient', 0xD2: 'registerserif', 0xD3: 'copyrightserif',
            0xD4: 'trademarkserif', 0xD5: 'product', 0xD6: 'radical', 0xD7: 'dotmath',
            0xD8: 'logicalnot', 0xD9: 'logicaland', 0xDA: 'logicalor',
            0xDB: 'arrowdblboth', 0xDC: 'arrowdblleft', 0xDD: 'arrowdblup',
            0xDE: 'arrowdblright', 0xDF: 'arrowdbldown',
            0xE0: 'lozenge', 0xE1: 'angleleft', 0xE2: 'registersans', 0xE3: 'copyrightsans',
            0xE4: 'trademarksans', 0xE5: 'summation',
            0xE6: 'parenlefttp', 0xE7: 'parenleftex', 0xE8: 'parenleftbt',
            0xE9: 'bracketlefttp', 0xEA: 'bracketleftex', 0xEB: 'bracketleftbt',
            0xEC: 'bracelefttp', 0xED: 'braceleftmid', 0xEE: 'braceleftbt', 0xEF: 'braceex',
            0xF1: 'angleright', 0xF2: 'integral', 0xF3: 'integraltp', 0xF4: 'integralex',
            0xF5: 'integralbt', 0xF6: 'parenrighttp', 0xF7: 'parenrightex', 0xF8: 'parenrightbt',
            0xF9: 'bracketrighttp', 0xFA: 'bracketrightex', 0xFB: 'bracketrightbt',
            0xFC: 'bracerighttp', 0xFD: 'bracerightmid', 0xFE: 'bracerightbt'
        };
        for (const k in map) a[k | 0] = map[k];
        const SYMBOL = Object.freeze(a);
        function lookup(byte) { return SYMBOL[byte & 0xFF]; }
        return { SYMBOL, lookup };
    }
};
