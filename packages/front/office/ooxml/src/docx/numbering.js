// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview WordprocessingML numbering part — `word/numbering.xml`.
 *
 * Lists in OOXML follow a two-tier indirection (ECMA-376 part 1 §17.9) :
 *
 * 1. **Abstract numbering** (`<w:abstractNum>`) — a reusable list
 *    template with one definition per indent level (`<w:lvl w:ilvl=…>`).
 * 2. **Concrete numbering instance** (`<w:num>`) — points at one
 *    `abstractNumId` and may override individual levels via
 *    `<w:lvlOverride>`.
 *
 * Paragraphs reference a list via `<w:pPr><w:numPr><w:numId/></w:numPr>`
 * (already covered in {@link ./properties.js}).
 *
 * Document model :
 *
 * ```js
 * {
 *   abstractNums: [{
 *     abstractNumId: number,
 *     name?: string,           // <w:name w:val=…/>
 *     multiLevelType?: string, // 'singleLevel' | 'multilevel' | 'hybridMultilevel'
 *     levels: [{
 *       ilvl: number,
 *       start?: number,
 *       numFmt?: string,       // 'decimal' | 'bullet' | 'lowerLetter' | …
 *       lvlText?: string,      // '%1.' for nested numbering
 *       lvlJc?: string,        // 'left' | 'center' | …
 *       pPr?: ParagraphProperties,
 *       rPr?: RunProperties,
 *       _extras?: [xmlNode]
 *     }],
 *     _extras?: [xmlNode]
 *   }],
 *   nums: [{
 *     numId: number,
 *     abstractNumId: number,
 *     lvlOverrides?: [{ ilvl, startOverride? }]
 *   }],
 *   _extras?: [xmlNode]
 * }
 * ```
 *
 * @module ooxml/docx/numbering
 */

import { ooxmlErrors } from '../errors.js';
import { xml } from '@awacloud/fw/io/codec/xml.js';
import { docxProperties } from './properties.js';
import { ooxmlShared } from '../_shared/index.js';

export const docxNumbering = {
    name: 'docxNumbering',
    dependencies: ['ooxmlErrors', 'xml', 'docxProperties', 'ooxmlShared'],
    deps: [ooxmlErrors, xml, docxProperties, ooxmlShared],

    factory(errors, xml, props, shared) {
        const { ParseError } = errors;
        const { NS, REL_TYPE, CT, encodeText, decodeText } = shared;

        const W_NS = NS.W;
        const REL_TYPE_NUMBERING = REL_TYPE.NUMBERING;
        const CT_NUMBERING = CT.NUMBERING;

        function valOf(el) { return el ? el.attrs['w:val'] : undefined; }
        function elVal(name, val) { return xml.el(name, { 'w:val': String(val) }); }

        // --- Level (<w:lvl>) ---

        function parseLevel(lvlEl) {
            const out = { ilvl: Number(lvlEl.attrs['w:ilvl']) };
            const extras = [];
            for (const c of lvlEl.children) {
                if (c.type !== 'element') continue;
                switch (c.name) {
                    case 'w:start':   out.start = Number(valOf(c)); break;
                    case 'w:numFmt':  out.numFmt = valOf(c); break;
                    case 'w:lvlText': out.lvlText = c.attrs['w:val']; break;
                    case 'w:lvlJc':   out.lvlJc = valOf(c); break;
                    case 'w:pPr': {
                        const p = props.parseParagraphProperties(c);
                        if (p) out.pPr = p;
                        break;
                    }
                    case 'w:rPr': {
                        const r = props.parseRunProperties(c);
                        if (r) out.rPr = r;
                        break;
                    }
                    default:
                        extras.push(c);
                }
            }
            if (extras.length) out._extras = extras;
            return out;
        }

        function renderLevel(lvl) {
            const children = [];
            if (lvl.start != null)   children.push(elVal('w:start', lvl.start));
            if (lvl.numFmt)          children.push(elVal('w:numFmt', lvl.numFmt));
            if (lvl.lvlText != null) children.push(xml.el('w:lvlText', { 'w:val': String(lvl.lvlText) }));
            if (lvl.lvlJc)           children.push(elVal('w:lvlJc', lvl.lvlJc));
            const pPrEl = props.renderParagraphProperties(lvl.pPr);
            if (pPrEl) children.push(pPrEl);
            const rPrEl = props.renderRunProperties(lvl.rPr);
            if (rPrEl) children.push(rPrEl);
            if (lvl._extras) for (const ex of lvl._extras) children.push(ex);
            return xml.el('w:lvl', { 'w:ilvl': String(lvl.ilvl) }, children);
        }

        // --- Abstract numbering (<w:abstractNum>) ---

        function parseAbstractNum(aEl) {
            const out = {
                abstractNumId: Number(aEl.attrs['w:abstractNumId']),
                levels: []
            };
            const extras = [];
            for (const c of aEl.children) {
                if (c.type !== 'element') continue;
                switch (c.name) {
                    case 'w:name':
                        out.name = valOf(c); break;
                    case 'w:multiLevelType':
                        out.multiLevelType = valOf(c); break;
                    case 'w:lvl':
                        out.levels.push(parseLevel(c)); break;
                    default:
                        extras.push(c);
                }
            }
            if (extras.length) out._extras = extras;
            return out;
        }

        function renderAbstractNum(a) {
            const children = [];
            if (a.multiLevelType) children.push(elVal('w:multiLevelType', a.multiLevelType));
            if (a.name)           children.push(elVal('w:name', a.name));
            if (a._extras)        for (const ex of a._extras) children.push(ex);
            for (const lvl of a.levels || []) children.push(renderLevel(lvl));
            return xml.el('w:abstractNum',
                { 'w:abstractNumId': String(a.abstractNumId) }, children);
        }

        // --- Concrete numbering instance (<w:num>) ---

        function parseNum(nEl) {
            const out = { numId: Number(nEl.attrs['w:numId']) };
            const overrides = [];
            for (const c of nEl.children) {
                if (c.type !== 'element') continue;
                if (c.name === 'w:abstractNumId') {
                    out.abstractNumId = Number(valOf(c));
                } else if (c.name === 'w:lvlOverride') {
                    const ov = { ilvl: Number(c.attrs['w:ilvl']) };
                    const startOv = xml.findChild(c, 'w:startOverride');
                    if (startOv) ov.startOverride = Number(valOf(startOv));
                    overrides.push(ov);
                }
            }
            if (overrides.length) out.lvlOverrides = overrides;
            return out;
        }

        function renderNum(n) {
            const children = [];
            if (n.abstractNumId != null) {
                children.push(elVal('w:abstractNumId', n.abstractNumId));
            }
            for (const ov of n.lvlOverrides || []) {
                const inner = [];
                if (ov.startOverride != null) {
                    inner.push(elVal('w:startOverride', ov.startOverride));
                }
                children.push(xml.el('w:lvlOverride',
                    { 'w:ilvl': String(ov.ilvl) }, inner));
            }
            return xml.el('w:num', { 'w:numId': String(n.numId) }, children);
        }

        // --- Document-level parse/serialize ---

        function parse(input) {
            const text = typeof input === 'string' ? input : decodeText(input);
            const root = xml.parse(text);
            if (root.name !== 'w:numbering') {
                throw new ParseError('docx/numbering-bad-root', `docx numbering: expected <w:numbering>, got <${root.name}>`, { context: { elementName: root && root.name } });
            }
            const out = { abstractNums: [], nums: [] };
            const extras = [];
            for (const c of root.children) {
                if (c.type !== 'element') continue;
                if (c.name === 'w:abstractNum') out.abstractNums.push(parseAbstractNum(c));
                else if (c.name === 'w:num')    out.nums.push(parseNum(c));
                else                             extras.push(c);
            }
            if (extras.length) out._extras = extras;
            return out;
        }

        function serialize(obj) {
            const children = [];
            // ECMA-376 schema: abstractNum precedes num.
            for (const a of obj.abstractNums || []) children.push(renderAbstractNum(a));
            for (const n of obj.nums || []) children.push(renderNum(n));
            if (obj._extras) for (const ex of obj._extras) children.push(ex);
            return xml.serialize(xml.el('w:numbering',
                { 'xmlns:w': W_NS }, children));
        }

        function bytesOf(obj) { return encodeText(serialize(obj)); }

        /**
         * Build a simple decimal numbering instance (1. / 2. / 3. …).
         * Returns `{ numbering, numId }` with numId=1 and abstractNumId=0.
         */
        function decimalList() {
            return {
                numbering: {
                    abstractNums: [{
                        abstractNumId: 0,
                        multiLevelType: 'singleLevel',
                        levels: [{
                            ilvl: 0, start: 1, numFmt: 'decimal',
                            lvlText: '%1.', lvlJc: 'left',
                            pPr: { indent: { left: 720, hanging: 360 } }
                        }]
                    }],
                    nums: [{ numId: 1, abstractNumId: 0 }]
                },
                numId: 1
            };
        }

        /**
         * Build a simple bullet list (•).
         *
         * The level carries no run font: `Symbol` is a symbol-encoded font
         * with no glyph at U+2022 (Word drew a hollow box); U+2022
         * renders with the paragraph font in Word and LibreOffice. Word's own
         * convention (U+F0B7 + Symbol) was rejected: a private-use code point
         * needs the font installed and is opaque to any text extractor.
         */
        function bulletList() {
            return {
                numbering: {
                    abstractNums: [{
                        abstractNumId: 0,
                        multiLevelType: 'singleLevel',
                        levels: [{
                            ilvl: 0, numFmt: 'bullet',
                            lvlText: '•', lvlJc: 'left',
                            pPr: { indent: { left: 720, hanging: 360 } }
                        }]
                    }],
                    nums: [{ numId: 1, abstractNumId: 0 }]
                },
                numId: 1
            };
        }

        return {
            parse, serialize, bytesOf,
            decimalList, bulletList,
            REL_TYPE_NUMBERING, CT_NUMBERING
        };
    }
};
