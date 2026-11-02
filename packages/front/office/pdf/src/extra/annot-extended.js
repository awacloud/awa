// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Opt-in: extended annotation subtypes per
 * ISO 32000-2:2020 §12.5.6.
 *
 * Covers: Watermark (§12.5.6.22), 3D (§13.6), RichMedia (§13.6.2),
 * Sound (§12.5.6.16 legacy), Movie (§12.5.6.17 legacy),
 * Screen (§12.5.6.18), PrinterMark (§12.5.6.20), TrapNet (§12.5.6.21),
 * and FreeText-extended (`/RC`, `/DS`, `/LE`, §12.5.6.6).
 *
 * Each typer composes `typeBaseAnnot` from `../annot/annot.js` so the
 * common annotation entries are preserved.
 *
 * `typeMarkupEntries` is a companion typer for any subtype: the PDF 2.0
 * entries common to every annotation that the base typer leaves untyped
 * (`/ca`, `/BM`, `/Lang`, Table 166) and, on a markup annotation
 * (§12.5.6.2, Table 171), the markup entries of Table 172 (`/T`,
 * `/Popup`, `/RC`, `/CreationDate`, `/IRT`, `/Subj`, `/RT`, `/IT`,
 * `/ExData`).
 *
 * `typeAppearanceDict` types an annotation's appearance characteristics,
 * border style, border effect and icon fit dictionaries.
 *
 * @module pdf/extra/annot-extended
 */

/**
 * Module factory.
 */
import { pdfErrors } from '../errors.js';
import { pdfParserObj } from '../syntax/parser-obj.js';
import { pdfAnnot } from '../annot/annot.js';

export const pdfAnnotExtended = {
    name: 'pdfAnnotExtended',
    dependencies: ['pdfErrors', 'pdfParserObj', 'pdfAnnot'],
    deps: [pdfErrors, pdfParserObj, pdfAnnot],
    factory(errors, parserObj, annot) {
        const { ParseError, ContractError } = errors;
        const { isType } = parserObj;
        const { typeBaseAnnot, captureExtras } = annot;

        const SUBTYPES = new Set([
            'Watermark', '3D', 'RichMedia', 'Sound', 'Movie', 'Screen',
            'PrinterMark', 'TrapNet', 'FreeText'
        ]);

        const FREETEXT_LINE_ENDINGS = Object.freeze([
            'Square', 'Circle', 'Diamond', 'OpenArrow', 'ClosedArrow', 'None',
            'Butt', 'ROpenArrow', 'RClosedArrow', 'Slash'
        ]);

        // §12.5.6.2 Table 171, plus Projection (§12.5.6.24, a markup
        // annotation since PDF 2.0).
        const MARKUP_SUBTYPES = Object.freeze([
            'Text', 'FreeText', 'Line', 'Square', 'Circle', 'Polygon',
            'PolyLine', 'Highlight', 'Underline', 'Squiggly', 'StrikeOut',
            'Caret', 'Stamp', 'Ink', 'FileAttachment', 'Sound', 'Redact',
            'Projection'
        ]);
        const MARKUP = new Set(MARKUP_SUBTYPES);

        function typeAnnotExtended(dict) {
            if (!isType(dict, 'dict')) {
                throw new ParseError('pdf/extra/annot-ext/not-dict',
                    'annotation must be a dictionary',
                    { context: { type: dict && dict.type } });
            }
            const sub = dict.entries.Subtype;
            if (!isType(sub, 'name') || !SUBTYPES.has(sub.value)) {
                throw new ParseError('pdf/extra/annot-ext/unsupported',
                    'unsupported extended annotation subtype',
                    { context: { subtype: sub && sub.value } });
            }
            switch (sub.value) {
                case 'Watermark':   return typeWatermarkAnnot(dict);
                case '3D':          return type3DAnnot(dict);
                case 'RichMedia':   return typeRichMediaAnnot(dict);
                case 'Sound':       return typeSoundAnnot(dict);
                case 'Movie':       return typeMovieAnnot(dict);
                case 'Screen':      return typeScreenAnnot(dict);
                case 'PrinterMark': return typePrinterMarkAnnot(dict);
                case 'TrapNet':     return typeTrapNetAnnot(dict);
                case 'FreeText':    return typeFreeTextExtended(dict);
            }
            /* istanbul ignore next */
            throw new ParseError('pdf/extra/annot-ext/unreachable', 'unreachable');
        }

        function typeWatermarkAnnot(dict) {
            const base = typeBaseAnnot(dict);
            base.kind = 'Watermark';
            const e = dict.entries;
            base.fixedPrint = isType(e.FixedPrint, 'dict') ? e.FixedPrint : null;
            captureExtras(base, dict, new Set(['FixedPrint']));
            return base;
        }

        function type3DAnnot(dict) {
            const base = typeBaseAnnot(dict);
            base.kind = '3D';
            const e = dict.entries;
            base['3DD']  = e['3DD']  || null;
            base['3DV']  = e['3DV']  || null;
            base['3DA']  = e['3DA']  || null;
            base['3DI']  = isType(e['3DI'], 'bool') ? e['3DI'].value : null;
            base['3DB']  = e['3DB']  || null;
            if (e['3DU'] !== undefined) base['3DU'] = e['3DU'];
            if (e.GEO !== undefined) base.GEO = e.GEO;
            captureExtras(base, dict, new Set(['3DD', '3DV', '3DA', '3DI', '3DB', '3DU', 'GEO']));
            return base;
        }

        function typeRichMediaAnnot(dict) {
            const base = typeBaseAnnot(dict);
            base.kind = 'RichMedia';
            const e = dict.entries;
            base.richMediaContent  = e.RichMediaContent  || null;
            base.richMediaSettings = e.RichMediaSettings || null;
            captureExtras(base, dict, new Set(['RichMediaContent', 'RichMediaSettings']));
            return base;
        }

        function typeSoundAnnot(dict) {
            const base = typeBaseAnnot(dict);
            base.kind = 'Sound';
            const e = dict.entries;
            base.sound = e.Sound || null;
            base.name  = isType(e.Name, 'name') ? e.Name.value : null;
            captureExtras(base, dict, new Set(['Sound', 'Name']));
            return base;
        }

        function typeMovieAnnot(dict) {
            const base = typeBaseAnnot(dict);
            base.kind = 'Movie';
            const e = dict.entries;
            base.t          = isType(e.T, 'string') ? e.T.value : null;
            base.movie      = e.Movie || null;
            base.activation = e.A || null;
            captureExtras(base, dict, new Set(['T', 'Movie', 'A']));
            return base;
        }

        function typeScreenAnnot(dict) {
            const base = typeBaseAnnot(dict);
            base.kind = 'Screen';
            const e = dict.entries;
            base.t   = isType(e.T, 'string') ? e.T.value : null;
            base.mk  = e.MK || null;
            base.a   = e.A  || null;
            base.aa  = e.AA || null;
            captureExtras(base, dict, new Set(['T', 'MK', 'A', 'AA']));
            return base;
        }

        function typePrinterMarkAnnot(dict) {
            const base = typeBaseAnnot(dict);
            base.kind = 'PrinterMark';
            const e = dict.entries;
            base.mn = isType(e.MN, 'name') ? e.MN.value : null;
            captureExtras(base, dict, new Set(['MN']));
            return base;
        }

        function typeTrapNetAnnot(dict) {
            const base = typeBaseAnnot(dict);
            base.kind = 'TrapNet';
            const e = dict.entries;
            base.lastModified = isType(e.LastModified, 'string') ? e.LastModified.value : null;
            base.version      = e.Version || null;
            base.annotStates  = e.AnnotStates || null;
            base.fontFauxing  = e.FontFauxing || null;
            captureExtras(base, dict, new Set(['LastModified', 'Version', 'AnnotStates', 'FontFauxing']));
            return base;
        }

        function typeFreeTextExtended(dict) {
            const base = typeBaseAnnot(dict);
            base.kind = 'FreeText';
            const e = dict.entries;
            base.da = isType(e.DA, 'string') ? e.DA.value : null;
            base.q  = (e.Q && (e.Q.type === 'int' || e.Q.type === 'real')) ? (e.Q.value | 0) : null;
            base.rc = isType(e.RC, 'string') ? e.RC.value : (isType(e.RC, 'stream') ? e.RC : null);
            base.ds = isType(e.DS, 'string') ? e.DS.value : null;
            base.cl = isType(e.CL, 'array') ? toNumArray(e.CL) : null;
            base.it = isType(e.IT, 'name') ? e.IT.value : null;
            base.be = e.BE || null;
            base.rd = isType(e.RD, 'array') ? toNumArray(e.RD) : null;
            let le = null;
            if (isType(e.LE, 'name')) le = e.LE.value;
            else if (isType(e.LE, 'array')) {
                le = e.LE.items.filter(it => isType(it, 'name')).map(it => it.value);
            }
            base.le = le;
            captureExtras(base, dict, new Set(['DA', 'Q', 'RC', 'DS', 'CL', 'IT', 'BE', 'RD', 'LE']));
            return base;
        }

        function typeMarkupEntries(dict) {
            if (!isType(dict, 'dict')) {
                throw new ParseError('pdf/extra/annot-ext/not-dict',
                    'annotation must be a dictionary',
                    { context: { type: dict && dict.type } });
            }
            const e = dict.entries;
            const subtype = isType(e.Subtype, 'name') ? e.Subtype.value : null;
            const markup = subtype !== null && MARKUP.has(subtype);
            const out = {
                subtype,
                markup,
                ca:   isNum(e.ca) ? e.ca.value : null,
                bm:   isType(e.BM, 'name') ? e.BM.value : null,
                lang: isType(e.Lang, 'string') ? e.Lang.value : null,
                t: null, popup: null, rc: null, creationDate: null, irt: null,
                subj: null, rt: null, it: null, exData: null
            };
            if (!markup) return out;
            out.t            = isType(e.T, 'string') ? e.T.value : null;
            out.popup        = toRef(e.Popup);
            out.rc           = isType(e.RC, 'string') ? e.RC.value
                : (isType(e.RC, 'stream') ? e.RC : toRef(e.RC));
            out.creationDate = isType(e.CreationDate, 'string') ? e.CreationDate.value : null;
            out.irt          = toRef(e.IRT) || (isType(e.IRT, 'dict') ? e.IRT : null);
            out.subj         = isType(e.Subj, 'string') ? e.Subj.value : null;
            out.rt           = isType(e.RT, 'name') ? e.RT.value : null;
            out.it           = isType(e.IT, 'name') ? e.IT.value : null;
            out.exData       = toRef(e.ExData) || (isType(e.ExData, 'dict') ? e.ExData : null);
            return out;
        }

        const READ = Object.freeze({
            name: (v) => (isType(v, 'name') ? v.value : undefined),
            string: (v) => (isType(v, 'string') ? v.value : undefined),
            num: (v) => (isNum(v) ? v.value : undefined),
            int: (v) => (isType(v, 'int') ? v.value : undefined),
            bool: (v) => (isType(v, 'bool') ? v.value : undefined),
            array: (v) => (isType(v, 'array') ? v : undefined),
            dict: (v) => (isType(v, 'dict') ? v : undefined),
            stream: (v) => (isType(v, 'stream') ? v : undefined)
        });
        const keyTypes = (text) => Object.freeze(Object.fromEntries(text.split(' ').map((p) => p.split(':'))));
        // The appearance dictionaries of an annotation: per kind, the keys
        // and their types (the Arlington PDF Model's), as `Key:type` pairs
        // apart by a space.
        const APPEARANCE_TYPES = Object.freeze({
            characteristics: keyTypes('R:int BC:array BG:array CA:string RC:string AC:string I:stream RI:stream IX:stream IF:dict TP:int'),
            borderStyle: keyTypes('Type:name W:num S:name D:array'),
            borderEffect: keyTypes('S:name I:num'),
            iconFit: keyTypes('SW:name S:name A:array FB:bool')
        });
        const APPEARANCE_KEYS = Object.freeze(Object.fromEntries(
            Object.entries(APPEARANCE_TYPES).map(([kind, types]) => [kind, Object.freeze(Object.keys(types))])));

        /**
         * Type an annotation's appearance characteristics (`kind`
         * `characteristics`, `/MK`), border style (`borderStyle`, `/BS`),
         * border effect (`borderEffect`, `/BE`) or icon fit (`iconFit`,
         * `/IF`): one field per key of its list, named after the key in
         * lower case, present only when the key is — a name, a string (its
         * bytes), a number, an integer or a boolean by its value, an array,
         * a dictionary or a stream as read, a reference as read, `null` for
         * a value of another type; the other keys in `_extras`.
         */
        function typeAppearanceDict(dict, kind) {
            if (typeof kind !== 'string' || !Object.prototype.hasOwnProperty.call(APPEARANCE_TYPES, kind)) {
                throw new ContractError('pdf/extra/annot-ext/appearance/kind',
                    'kind must be characteristics, borderStyle, borderEffect or iconFit',
                    { context: { kind } });
            }
            if (!isType(dict, 'dict')) {
                throw new ParseError('pdf/extra/annot-ext/appearance/not-dict',
                    'an appearance dictionary must be a dictionary',
                    { context: { type: dict && dict.type } });
            }
            const types = APPEARANCE_TYPES[kind];
            const out = { raw: dict, _extras: {} };
            for (const [k, v] of Object.entries(dict.entries)) {
                if (!Object.prototype.hasOwnProperty.call(types, k)) {
                    out._extras[k] = v;
                    continue;
                }
                const r = isType(v, 'ref') ? v : READ[types[k]](v);
                out[k.toLowerCase()] = r === undefined ? null : r;
            }
            return out;
        }

        function isNum(v) {
            return !!v && (v.type === 'int' || v.type === 'real');
        }

        function toRef(v) {
            return isType(v, 'ref') ? { num: v.num, gen: v.gen } : null;
        }

        function toNumArray(v) {
            const out = [];
            for (const it of v.items) {
                if (!it || (it.type !== 'int' && it.type !== 'real')) return null;
                out.push(it.value);
            }
            return out;
        }

        return {
            typeAnnotExtended,
            typeWatermarkAnnot, type3DAnnot, typeRichMediaAnnot,
            typeSoundAnnot, typeMovieAnnot, typeScreenAnnot,
            typePrinterMarkAnnot, typeTrapNetAnnot, typeFreeTextExtended,
            typeMarkupEntries, MARKUP_SUBTYPES,
            typeAppearanceDict, APPEARANCE_KEYS,
            FREETEXT_LINE_ENDINGS
        };
    }
};

