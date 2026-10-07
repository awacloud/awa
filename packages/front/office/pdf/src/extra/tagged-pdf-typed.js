// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Opt-in: typed StructElem attribute objects per
 * ISO 32000-2:2020 §14.8.5 (standard structure attribute owners) —
 * Layout (§14.8.5.4), List (§14.8.5.5), Table (§14.8.5.7),
 * PrintField (§14.8.5.6), Artifact (§14.8.2.2), UserProperties
 * (§14.8.5.10).
 *
 * Attribute classes appear as dicts with an `/O` (Owner) name. We
 * dispatch by `/O` and apply a typed reader that returns plain JS
 * values for the well-defined keys, preserving unknowns in `_extras`.
 *
 * @module pdf/extra/tagged-pdf-typed
 */

/**
 * Module factory.
 */
import { pdfErrors } from '../errors.js';
import { pdfParserObj } from '../syntax/parser-obj.js';

export const pdfTaggedPdfTyped = {
    name: 'pdfTaggedPdfTyped',
    dependencies: ['pdfErrors', 'pdfParserObj'],
    deps: [pdfErrors, pdfParserObj],
    factory(errors, parserObj) {
        const { ParseError } = errors;
        const { isType } = parserObj;

        const OWNERS = new Set([
            'Layout', 'List', 'Table', 'PrintField', 'Artifact', 'UserProperties'
        ]);

        const KNOWN_BY_OWNER = {
            Layout: new Set(['O', 'Placement', 'WritingMode', 'BackgroundColor',
                'BorderColor', 'BorderStyle', 'BorderThickness', 'Color',
                'Padding', 'SpaceBefore', 'SpaceAfter', 'StartIndent', 'EndIndent',
                'TextIndent', 'TextAlign', 'BBox', 'Width', 'Height', 'BlockAlign',
                'InlineAlign', 'TBorderStyle', 'TPadding', 'LineHeight',
                'BaselineShift', 'TextPosition', 'TextDecorationType',
                'TextDecorationColor', 'TextDecorationThickness',
                'RubyAlign', 'RubyPosition', 'GlyphOrientationVertical',
                'ColumnCount', 'ColumnGap', 'ColumnWidths']),
            List: new Set(['O', 'ListNumbering', 'ContinuedList', 'ContinuedFrom']),
            Table: new Set(['O', 'RowSpan', 'ColSpan', 'Headers', 'Scope', 'Summary']),
            PrintField: new Set(['O', 'Role', 'checked', 'Desc']),
            Artifact: new Set(['O', 'Type', 'BBox', 'Attached', 'Subtype']),
            UserProperties: new Set(['O', 'P'])
        };

        function knownFor(owner) {
            return KNOWN_BY_OWNER[owner] || new Set(['O']);
        }

        function typeStructAttribute(dict) {
            if (!isType(dict, 'dict')) {
                throw new ParseError('pdf/extra/tagged/not-dict',
                    'attribute class must be a dictionary',
                    { context: { type: dict && dict.type } });
            }
            const e = dict.entries;
            if (!isType(e.O, 'name')) {
                throw new ParseError('pdf/extra/tagged/missing-owner',
                    'attribute class missing /O owner name',
                    { context: { type: e.O && e.O.type } });
            }
            const owner = e.O.value;
            let typed;
            switch (owner) {
                case 'Layout':         typed = readLayout(e); break;
                case 'List':           typed = readList(e); break;
                case 'Table':          typed = readTable(e); break;
                case 'PrintField':     typed = readPrintField(e); break;
                case 'Artifact':       typed = readArtifact(e); break;
                case 'UserProperties': typed = readUserProperties(e); break;
                default:
                    typed = { owner, vendor: true };
            }
            typed.owner = owner;
            typed.raw = dict;
            typed._extras = collectExtras(e, knownFor(owner));
            return typed;
        }

        function readLayout(e) {
            return {
                placement:               nameVal(e.Placement),
                writingMode:             nameVal(e.WritingMode),
                backgroundColor:         numArr(e.BackgroundColor),
                borderColor:             e.BorderColor || null,
                borderStyle:             e.BorderStyle || null,
                borderThickness:         e.BorderThickness || null,
                color:                   numArr(e.Color),
                padding:                 e.Padding || null,
                spaceBefore:             numVal(e.SpaceBefore, null),
                spaceAfter:              numVal(e.SpaceAfter, null),
                startIndent:             numVal(e.StartIndent, null),
                endIndent:               numVal(e.EndIndent, null),
                textIndent:              numVal(e.TextIndent, null),
                textAlign:               nameVal(e.TextAlign),
                bbox:                    numArr(e.BBox),
                width:                   numVal(e.Width, null),
                height:                  numVal(e.Height, null),
                blockAlign:              nameVal(e.BlockAlign),
                inlineAlign:             nameVal(e.InlineAlign),
                lineHeight:              numVal(e.LineHeight, null),
                baselineShift:           numVal(e.BaselineShift, null),
                textPosition:            nameVal(e.TextPosition),
                textDecorationType:      nameVal(e.TextDecorationType),
                textDecorationColor:     numArr(e.TextDecorationColor),
                textDecorationThickness: numVal(e.TextDecorationThickness, null),
                columnCount:             numVal(e.ColumnCount, null),
                columnGap:               e.ColumnGap || null,
                columnWidths:            e.ColumnWidths || null
            };
        }

        function readList(e) {
            return {
                listNumbering:  nameVal(e.ListNumbering),
                continuedList:  isType(e.ContinuedList, 'bool') ? e.ContinuedList.value : null,
                continuedFrom:  e.ContinuedFrom || null
            };
        }

        function readTable(e) {
            return {
                rowSpan:    numVal(e.RowSpan, null),
                colSpan:    numVal(e.ColSpan, null),
                headers:    e.Headers || null,
                scope:      nameVal(e.Scope),
                summary:    isType(e.Summary, 'string') ? e.Summary.value : null
            };
        }

        function readPrintField(e) {
            return {
                role:    nameVal(e.Role),
                checked: nameVal(e.checked) || nameVal(e.Checked),
                desc:    isType(e.Desc, 'string') ? e.Desc.value : null
            };
        }

        function readArtifact(e) {
            return {
                artifactType:    nameVal(e.Type),
                bbox:            numArr(e.BBox),
                attached:        e.Attached || null,
                artifactSubtype: nameVal(e.Subtype)
            };
        }

        function readUserProperties(e) {
            const out = { properties: [] };
            if (isType(e.P, 'array')) {
                for (const it of e.P.items) {
                    if (!isType(it, 'dict')) {
                        throw new ParseError('pdf/extra/tagged/bad-user-property',
                            '/P items must be dicts');
                    }
                    const pe = it.entries;
                    out.properties.push({
                        name:    isType(pe.N, 'string') ? pe.N.value : null,
                        value:   pe.V || null,
                        formatted: isType(pe.F, 'string') ? pe.F.value : null,
                        hidden:  isType(pe.H, 'bool') ? pe.H.value : false
                    });
                }
            }
            return out;
        }

        function nameVal(v) { return isType(v, 'name') ? v.value : null; }
        function numVal(v, dflt) {
            if (!v) return dflt;
            return (v.type === 'int' || v.type === 'real') ? v.value : dflt;
        }
        function numArr(v) {
            if (!isType(v, 'array')) return null;
            const out = [];
            for (const it of v.items) {
                if (!it || (it.type !== 'int' && it.type !== 'real')) return null;
                out.push(it.value);
            }
            return out;
        }

        function collectExtras(entries, known) {
            const out = {};
            for (const k of Object.keys(entries)) {
                if (!known.has(k)) out[k] = entries[k];
            }
            return out;
        }

        return { typeStructAttribute, ATTRIBUTE_OWNERS: OWNERS };
    }
};

