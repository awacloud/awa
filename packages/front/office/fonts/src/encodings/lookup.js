// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Dispatcher — `lookupEncoding(name)` returns the 256-entry
 * table corresponding to a named encoding (WinAnsiEncoding,
 * MacRomanEncoding, MacExpertEncoding, StandardEncoding, Symbol,
 * ZapfDingbats).
 *
 * Used by `@awacloud/pdf` and any consumer that needs to translate a
 * single-byte font's byte stream into a glyph name (or via the cmap,
 * into a Unicode code point).
 *
 * @module fonts/encodings/lookup
 */

// Strict factory-only — no top-level imports beyond the
// descriptor, which receives the named-encoding tables via DI.
import { fontErrors } from '../errors.js';
import { encodingWinAnsi } from './winAnsi.js';
import { encodingMacRoman } from './macRoman.js';
import { encodingMacExpert } from './macExpert.js';
import { encodingStandard } from './standard.js';
import { encodingSymbol } from './symbol.js';
import { encodingZapfDingbats } from './zapfDingbats.js';

export const encodingLookup = {
    name: 'encodingLookup',
    dependencies: [
        'fontErrors',
        'encodingWinAnsi', 'encodingMacRoman', 'encodingMacExpert',
        'encodingStandard', 'encodingSymbol', 'encodingZapfDingbats'
    ],
    deps: [fontErrors, encodingWinAnsi, encodingMacRoman, encodingMacExpert, encodingStandard, encodingSymbol, encodingZapfDingbats],
    factory(errors, winAnsi, macRoman, macExpert, standard, symbol, zapfDingbats) {
        const { ContractError } = errors;
        const TABLES = Object.freeze({
            'WinAnsiEncoding':   winAnsi.WIN_ANSI,
            'MacRomanEncoding':  macRoman.MAC_ROMAN,
            'MacExpertEncoding': macExpert.MAC_EXPERT,
            'StandardEncoding':  standard.STANDARD,
            'SymbolEncoding':    symbol.SYMBOL,
            'ZapfDingbatsEncoding': zapfDingbats.ZAPF_DINGBATS,
            'Symbol':            symbol.SYMBOL,
            'ZapfDingbats':      zapfDingbats.ZAPF_DINGBATS
        });
        const KNOWN_ENCODINGS = Object.freeze(Object.keys(TABLES));
        function lookupEncoding(name) {
            const t = TABLES[name];
            if (!t)
                throw new ContractError('fonts/unknown-encoding',
                    `unknown encoding '${name}' — expected one of: ${KNOWN_ENCODINGS.join(', ')}`,
                    { context: { name } });
            return t;
        }
        function findCode(encodingName, glyphName) {
            const t = lookupEncoding(encodingName);
            for (let i = 0; i < 256; i++) if (t[i] === glyphName) return i;
            return null;
        }
        return { lookupEncoding, findCode, KNOWN_ENCODINGS };
    }
};
