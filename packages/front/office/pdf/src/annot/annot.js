// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Annotation orchestrator per ISO 32000-2:2020 §12.5.
 *
 * Dispatches an annotation dict (`/Type /Annot`) to a subtype-specific
 * typer based on `/Subtype`. Also exports `typeBaseAnnot` which captures
 * the entries common to every annotation (§12.5.2 Table 166).
 *
 * Common entries:
 *   /Type /Subtype /Rect /Contents /P /NM /M /F /AP /AS /Border /C
 *   /StructParent /OC /AF /CA /BS /BE
 *
 * Unknown subtypes return `{ kind, raw, _extras }` — preserve-unknowns.
 *
 * @module pdf/annot/annot
 */

/**
 * Module factory.
 */
import { pdfErrors } from '../errors.js';
import { pdfParser } from '../syntax/parser.js';

export const pdfAnnot = {
    name: 'pdfAnnot',
    dependencies: ['pdfErrors', 'pdfParser'],
    deps: [pdfErrors, pdfParser],
    factory(errors, parser) {
        const { ParseError } = errors;
        const { isType } = parser;

        const BASE_KEYS = new Set([
            'Type', 'Subtype', 'Rect', 'Contents', 'P', 'NM', 'M', 'F', 'AP',
            'AS', 'Border', 'C', 'StructParent', 'OC', 'AF', 'CA', 'BS', 'BE'
        ]);

        function typeBaseAnnot(dict) {
            if (!isType(dict, 'dict')) {
                throw new ParseError('pdf/annot/not-dict',
                    'annotation must be a dictionary',
                    { context: { type: dict && dict.type } });
            }
            const e = dict.entries;
            if (e.Type && (e.Type.type !== 'name' || e.Type.value !== 'Annot')) {
                throw new ParseError('pdf/annot/bad-type',
                    '/Type must be /Annot when present',
                    { context: { actual: e.Type.value } });
            }
            const out = {
                subtype:      isType(e.Subtype, 'name') ? e.Subtype.value : null,
                rect:         toRect(e.Rect),
                contents:     isType(e.Contents, 'string') ? e.Contents.value : null,
                p:            e.P && e.P.type === 'ref'
                    ? { num: e.P.num, gen: e.P.gen } : null,
                nm:           isType(e.NM, 'string') ? e.NM.value : null,
                m:            isType(e.M,  'string') ? e.M.value  : null,
                f:            toInt(e.F, 0),
                ap:           isType(e.AP, 'dict') ? e.AP : null,
                as:           isType(e.AS, 'name') ? e.AS.value : null,
                border:       toBorder(e.Border),
                c:            toNumArray(e.C),
                structParent: toInt(e.StructParent, null),
                oc:           e.OC || null,
                af:           e.AF || null,
                ca:           toNum(e.CA, null),
                bs:           isType(e.BS, 'dict') ? e.BS : null,
                be:           isType(e.BE, 'dict') ? e.BE : null,
                raw:          dict,
                _extras:      {}
            };
            return out;
        }

        function captureExtras(target, dict, known) {
            const e = dict.entries;
            for (const k of Object.keys(e)) {
                if (BASE_KEYS.has(k)) continue;
                if (known && known.has(k)) continue;
                target._extras[k] = e[k];
            }
        }

        function typeAnnot(dict, typers) {
            if (!isType(dict, 'dict')) {
                throw new ParseError('pdf/annot/not-dict',
                    'annotation must be a dictionary',
                    { context: { type: dict && dict.type } });
            }
            const sub = dict.entries.Subtype;
            if (!isType(sub, 'name')) {
                throw new ParseError('pdf/annot/missing-subtype',
                    '/Subtype is required and must be a name',
                    { context: { kind: sub && sub.type } });
            }
            const name = sub.value;
            const t = typers || {};
            switch (name) {
                case 'Text':           return tag('Text',       call(t.Text, dict));
                case 'Link':           return tag('Link',       call(t.Link, dict));
                case 'FreeText':       return tag('FreeText',   call(t.FreeText, dict));
                case 'Line':           return tag('Line',       call(t.Shape, dict, 'Line'));
                case 'Square':         return tag('Square',     call(t.Shape, dict, 'Square'));
                case 'Circle':         return tag('Circle',     call(t.Shape, dict, 'Circle'));
                case 'Polygon':        return tag('Polygon',    call(t.Shape, dict, 'Polygon'));
                case 'PolyLine':       return tag('PolyLine',   call(t.Shape, dict, 'PolyLine'));
                case 'Highlight':      return tag('Highlight',  call(t.Markup, dict, 'Highlight'));
                case 'Underline':      return tag('Underline',  call(t.Markup, dict, 'Underline'));
                case 'Squiggly':       return tag('Squiggly',   call(t.Markup, dict, 'Squiggly'));
                case 'StrikeOut':      return tag('StrikeOut',  call(t.Markup, dict, 'StrikeOut'));
                case 'Caret':          return tag('Caret',      call(t.Markup, dict, 'Caret'));
                case 'Stamp':          return tag('Stamp',      call(t.Stamp, dict));
                case 'Ink':            return tag('Ink',        call(t.Ink, dict));
                case 'Popup':          return tag('Popup',      call(t.Popup, dict));
                case 'FileAttachment': return tag('FileAttachment', call(t.FileAttachment, dict));
                case 'Widget':         return tag('Widget',     call(t.Widget, dict));
                case 'Redact':         return tag('Redact',     call(t.Redact, dict));
                case 'Projection':     return tag('Projection', call(t.Projection, dict));
                case 'Sound':
                case 'Movie':
                case 'Screen':
                case 'PrinterMark':
                case 'TrapNet':
                case 'Watermark':
                case '3D':
                case 'RichMedia':
                    return tag(name, fallback(dict));
                default:
                    return { kind: name, raw: dict, _extras: collectAll(dict) };
            }
        }

        function call(fn, dict, arg) {
            if (typeof fn !== 'function') {
                // Fallback if a subtype-specific typer isn't wired.
                return fallback(dict);
            }
            return arg !== undefined ? fn(dict, arg) : fn(dict);
        }

        function tag(kind, rec) { rec.kind = kind; return rec; }

        function fallback(dict) {
            const base = typeBaseAnnot(dict);
            captureExtras(base, dict, null);
            return base;
        }

        function collectAll(dict) {
            const out = {};
            const e = dict.entries;
            for (const k of Object.keys(e)) out[k] = e[k];
            return out;
        }

        function toRect(v) {
            if (!v || v.type !== 'array' || v.items.length !== 4) return null;
            const r = new Array(4);
            for (let i = 0; i < 4; i++) {
                const it = v.items[i];
                if (!it || (it.type !== 'int' && it.type !== 'real')) return null;
                r[i] = it.value;
            }
            return r;
        }

        function toBorder(v) {
            if (!v || v.type !== 'array') return null;
            const out = [];
            for (const it of v.items) {
                if (!it) return null;
                if (it.type === 'int' || it.type === 'real') out.push(it.value);
                else if (it.type === 'array') out.push(toNumArray(it));
                else return null;
            }
            return out;
        }

        function toNumArray(v) {
            if (!v || v.type !== 'array') return null;
            const out = [];
            for (const it of v.items) {
                if (!it) return null;
                if (it.type !== 'int' && it.type !== 'real') return null;
                out.push(it.value);
            }
            return out;
        }

        function toInt(v, dflt) {
            if (!v) return dflt;
            if (v.type !== 'int' && v.type !== 'real') return dflt;
            return v.value | 0;
        }

        function toNum(v, dflt) {
            if (!v) return dflt;
            if (v.type !== 'int' && v.type !== 'real') return dflt;
            return v.value;
        }

        return {
            BASE_KEYS,
            typeBaseAnnot,
            captureExtras,
            typeAnnot
        };
    }
};
