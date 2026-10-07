// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Catalogue exhaustif des opérateurs de content stream
 * PDF per ISO 32000-2:2020 §8.2 / §9.4.
 *
 * Chaque entrée décrit :
 * - `op`        — le mnémonique exact (string).
 * - `category`  — `'gstate'|'path'|'clip'|'paint'|'color'|'text'|'shading'|'xobject'|'marked'|'image'`.
 * - `arity`     — nombre d'opérandes attendus, ou `'var'` pour TJ.
 * - `desc`      — courte description (anglais, mots-clés OK).
 *
 * @module pdf/content/ops
 */

/**
 * Module factory — worker-safe, self-contained.
 */
export const pdfContentOps = {
    name: 'pdfContentOps',
    dependencies: [],
    factory() {
        const OPS = Object.freeze({
            // --- Graphics state (§8.4) ---
            q:    { op: 'q',    category: 'gstate',  arity: 0,  desc: 'push graphics state' },
            Q:    { op: 'Q',    category: 'gstate',  arity: 0,  desc: 'pop graphics state' },
            cm:   { op: 'cm',   category: 'gstate',  arity: 6,  desc: 'concatenate CTM (a b c d e f)' },
            w:    { op: 'w',    category: 'gstate',  arity: 1,  desc: 'set line width' },
            J:    { op: 'J',    category: 'gstate',  arity: 1,  desc: 'set line cap style' },
            j:    { op: 'j',    category: 'gstate',  arity: 1,  desc: 'set line join style' },
            M:    { op: 'M',    category: 'gstate',  arity: 1,  desc: 'set miter limit' },
            d:    { op: 'd',    category: 'gstate',  arity: 2,  desc: 'set dash pattern' },
            ri:   { op: 'ri',   category: 'gstate',  arity: 1,  desc: 'set rendering intent' },
            i:    { op: 'i',    category: 'gstate',  arity: 1,  desc: 'set flatness tolerance' },
            gs:   { op: 'gs',   category: 'gstate',  arity: 1,  desc: 'set parameters from /ExtGState' },

            // --- Path construction (§8.5.2) ---
            m:    { op: 'm',    category: 'path',    arity: 2,  desc: 'moveto' },
            l:    { op: 'l',    category: 'path',    arity: 2,  desc: 'lineto' },
            c:    { op: 'c',    category: 'path',    arity: 6,  desc: 'cubic Bézier (x1 y1 x2 y2 x3 y3)' },
            v:    { op: 'v',    category: 'path',    arity: 4,  desc: 'cubic Bézier (current to x2 y2 x3 y3)' },
            y:    { op: 'y',    category: 'path',    arity: 4,  desc: 'cubic Bézier (x1 y1 to x3 y3)' },
            h:    { op: 'h',    category: 'path',    arity: 0,  desc: 'close subpath' },
            re:   { op: 're',   category: 'path',    arity: 4,  desc: 'append rectangle' },

            // --- Path painting (§8.5.3) ---
            S:    { op: 'S',    category: 'paint',   arity: 0,  desc: 'stroke' },
            s:    { op: 's',    category: 'paint',   arity: 0,  desc: 'close + stroke' },
            f:    { op: 'f',    category: 'paint',   arity: 0,  desc: 'fill (non-zero)' },
            F:    { op: 'F',    category: 'paint',   arity: 0,  desc: 'fill (non-zero, deprecated alias)' },
            'f*': { op: 'f*',   category: 'paint',   arity: 0,  desc: 'fill (even-odd)' },
            B:    { op: 'B',    category: 'paint',   arity: 0,  desc: 'fill + stroke (non-zero)' },
            'B*': { op: 'B*',   category: 'paint',   arity: 0,  desc: 'fill + stroke (even-odd)' },
            b:    { op: 'b',    category: 'paint',   arity: 0,  desc: 'close + fill + stroke (non-zero)' },
            'b*': { op: 'b*',   category: 'paint',   arity: 0,  desc: 'close + fill + stroke (even-odd)' },
            n:    { op: 'n',    category: 'paint',   arity: 0,  desc: 'end path (no paint, no clip)' },

            // --- Clipping paths (§8.5.4) ---
            W:    { op: 'W',    category: 'clip',    arity: 0,  desc: 'modify clipping (non-zero)' },
            'W*': { op: 'W*',   category: 'clip',    arity: 0,  desc: 'modify clipping (even-odd)' },

            // --- Color (§8.6) ---
            CS:   { op: 'CS',   category: 'color',   arity: 1,  desc: 'set stroking color space' },
            cs:   { op: 'cs',   category: 'color',   arity: 1,  desc: 'set non-stroking color space' },
            SC:   { op: 'SC',   category: 'color',   arity: 'var', desc: 'set stroking color (no name)' },
            sc:   { op: 'sc',   category: 'color',   arity: 'var', desc: 'set non-stroking color (no name)' },
            SCN:  { op: 'SCN',  category: 'color',   arity: 'var', desc: 'set stroking color (with name for pattern/separation)' },
            scn:  { op: 'scn',  category: 'color',   arity: 'var', desc: 'set non-stroking color (with name)' },
            G:    { op: 'G',    category: 'color',   arity: 1,  desc: 'set stroking DeviceGray' },
            g:    { op: 'g',    category: 'color',   arity: 1,  desc: 'set non-stroking DeviceGray' },
            RG:   { op: 'RG',   category: 'color',   arity: 3,  desc: 'set stroking DeviceRGB' },
            rg:   { op: 'rg',   category: 'color',   arity: 3,  desc: 'set non-stroking DeviceRGB' },
            K:    { op: 'K',    category: 'color',   arity: 4,  desc: 'set stroking DeviceCMYK' },
            k:    { op: 'k',    category: 'color',   arity: 4,  desc: 'set non-stroking DeviceCMYK' },

            // --- Shading (§8.7) ---
            sh:   { op: 'sh',   category: 'shading', arity: 1,  desc: 'paint shading pattern' },

            // --- Inline images (§8.9.7) ---
            BI:   { op: 'BI',   category: 'image',   arity: 0,  desc: 'begin inline image' },
            ID:   { op: 'ID',   category: 'image',   arity: 0,  desc: 'inline image data marker' },
            EI:   { op: 'EI',   category: 'image',   arity: 0,  desc: 'end inline image' },

            // --- XObject (§8.10) ---
            Do:   { op: 'Do',   category: 'xobject', arity: 1,  desc: 'invoke XObject' },

            // --- Marked content (§14.6) ---
            MP:   { op: 'MP',   category: 'marked',  arity: 1,  desc: 'marked content point' },
            DP:   { op: 'DP',   category: 'marked',  arity: 2,  desc: 'marked content point with property list' },
            BMC:  { op: 'BMC',  category: 'marked',  arity: 1,  desc: 'begin marked content' },
            BDC:  { op: 'BDC',  category: 'marked',  arity: 2,  desc: 'begin marked content with property list' },
            EMC:  { op: 'EMC',  category: 'marked',  arity: 0,  desc: 'end marked content' },

            // --- Text objects + state (§9.3 / §9.4) ---
            BT:   { op: 'BT',   category: 'text',    arity: 0,  desc: 'begin text object' },
            ET:   { op: 'ET',   category: 'text',    arity: 0,  desc: 'end text object' },
            Tc:   { op: 'Tc',   category: 'text',    arity: 1,  desc: 'set character spacing' },
            Tw:   { op: 'Tw',   category: 'text',    arity: 1,  desc: 'set word spacing' },
            Tz:   { op: 'Tz',   category: 'text',    arity: 1,  desc: 'set horizontal scaling (percent)' },
            TL:   { op: 'TL',   category: 'text',    arity: 1,  desc: 'set leading' },
            Tf:   { op: 'Tf',   category: 'text',    arity: 2,  desc: 'set text font + size' },
            Tr:   { op: 'Tr',   category: 'text',    arity: 1,  desc: 'set text rendering mode' },
            Ts:   { op: 'Ts',   category: 'text',    arity: 1,  desc: 'set text rise' },

            // --- Text positioning ---
            Td:   { op: 'Td',   category: 'text',    arity: 2,  desc: 'move text position' },
            TD:   { op: 'TD',   category: 'text',    arity: 2,  desc: 'move + set leading' },
            Tm:   { op: 'Tm',   category: 'text',    arity: 6,  desc: 'set text matrix' },
            'T*': { op: 'T*',   category: 'text',    arity: 0,  desc: 'move to next line' },

            // --- Text showing ---
            Tj:   { op: 'Tj',   category: 'text',    arity: 1,  desc: 'show text' },
            "'":  { op: "'",    category: 'text',    arity: 1,  desc: 'next-line + show' },
            '"':  { op: '"',    category: 'text',    arity: 3,  desc: 'aw ac string : set spacing + next line + show' },
            TJ:   { op: 'TJ',   category: 'text',    arity: 1,  desc: 'show text with positioning array' },

            // --- Type3 font glyph metrics ---
            d0:   { op: 'd0',   category: 'gstate',  arity: 2,  desc: 'Type3: set glyph width (no bbox)' },
            d1:   { op: 'd1',   category: 'gstate',  arity: 6,  desc: 'Type3: set glyph width + bbox' }
        });

        const OP_NAMES = Object.freeze(Object.keys(OPS).sort());

        function lookupOp(mnemonic) {
            return OPS[mnemonic];
        }

        function isOp(mnemonic) {
            return Object.prototype.hasOwnProperty.call(OPS, mnemonic);
        }

        return { OPS, OP_NAMES, lookupOp, isOp };
    }
};
