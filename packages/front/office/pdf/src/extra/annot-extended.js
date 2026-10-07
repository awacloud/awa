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
        const { ParseError } = errors;
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
            captureExtras(base, dict, new Set(['3DD', '3DV', '3DA', '3DI', '3DB']));
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
            FREETEXT_LINE_ENDINGS
        };
    }
};

