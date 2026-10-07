// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Image XObject + Form XObject typing per
 * ISO 32000-2:2020 §8.9.
 *
 * Image XObject (`/Subtype /Image`) carries Width, Height, ColorSpace,
 * BitsPerComponent, Filter, DecodeParms, Decode, ImageMask, Mask,
 * SMask, Interpolate, Intent, Metadata, OC.
 *
 * Form XObject (`/Subtype /Form`) carries FormType, BBox, Matrix,
 * Resources, Group, Ref, Metadata, PieceInfo, LastModified,
 * StructParent(s), OPI, OC, Name (deprecated).
 *
 * Both are streams whose raw bytes pass through unchanged at L2 ; the
 * caller (renderer) decodes `Filter` on demand via
 * `pdfFilterDispatch`.
 *
 * @module pdf/content/images
 */

/**
 * Module factory — worker-safe, self-contained.
 */
import { pdfErrors } from '../errors.js';
import { pdfParser } from '../syntax/parser.js';

export const pdfImages = {
    name: 'pdfImages',
    dependencies: ['pdfErrors', 'pdfParser'],
    deps: [pdfErrors, pdfParser],
    factory(errors, parserMod) {
        const { ParseError } = errors;
        const isType = (parserMod && parserMod.isType)
            || ((v, kind) => !!(v && v.type === kind));

        function intOrZero(entry, label) {
            if (!entry || entry.type !== 'int') {
                if (label === 'Width' || label === 'Height') {
                    throw new ParseError('pdf/image/missing-dim',
                        `Image XObject missing required /${label}`);
                }
                return 0;
            }
            return entry.value;
        }

        function toBox(v) {
            if (!v || v.type !== 'array' || v.items.length !== 4) return null;
            const r = new Array(4);
            for (let i = 0; i < 4; i++) {
                const it = v.items[i];
                if (!it || (it.type !== 'int' && it.type !== 'real')) return null;
                r[i] = it.value;
            }
            return r;
        }

        function toMatrix(v) {
            if (!v || v.type !== 'array' || v.items.length !== 6) {
                return [1, 0, 0, 1, 0, 0];
            }
            const r = new Array(6);
            for (let i = 0; i < 6; i++) {
                const it = v.items[i];
                if (!it || (it.type !== 'int' && it.type !== 'real')) {
                    return [1, 0, 0, 1, 0, 0];
                }
                r[i] = it.value;
            }
            return r;
        }

        function typeImageXObject(stream) {
            if (!isType(stream, 'stream')) {
                throw new ParseError('pdf/image/not-stream',
                    'Image XObject must be a stream object');
            }
            const e = stream.dict.entries;
            if (e.Subtype && (e.Subtype.type !== 'name' || e.Subtype.value !== 'Image')) {
                throw new ParseError('pdf/image/wrong-subtype',
                    'Image XObject /Subtype must be /Image',
                    { context: { actual: e.Subtype.value } });
            }
            return {
                kind: 'image',
                width:  intOrZero(e.Width, 'Width'),
                height: intOrZero(e.Height, 'Height'),
                bitsPerComponent: e.BitsPerComponent && e.BitsPerComponent.type === 'int'
                    ? e.BitsPerComponent.value : null,
                colorSpace: e.ColorSpace || null,
                filter:     e.Filter || null,
                decodeParms: e.DecodeParms || null,
                decode:     e.Decode || null,
                imageMask:  e.ImageMask && e.ImageMask.type === 'bool' ? e.ImageMask.value : false,
                mask:       e.Mask  || null,
                sMask:      e.SMask || null,
                interpolate: e.Interpolate && e.Interpolate.type === 'bool' ? e.Interpolate.value : false,
                intent:     e.Intent && e.Intent.type === 'name' ? e.Intent.value : null,
                metadata:   e.Metadata || null,
                raw:        stream.raw,
                dict:       stream.dict
            };
        }

        function typeFormXObject(stream) {
            if (!isType(stream, 'stream')) {
                throw new ParseError('pdf/form-xobj/not-stream',
                    'Form XObject must be a stream object');
            }
            const e = stream.dict.entries;
            if (e.Subtype && (e.Subtype.type !== 'name' || e.Subtype.value !== 'Form')) {
                throw new ParseError('pdf/form-xobj/wrong-subtype',
                    'Form XObject /Subtype must be /Form',
                    { context: { actual: e.Subtype.value } });
            }
            return {
                kind: 'form',
                formType: e.FormType && e.FormType.type === 'int' ? e.FormType.value : 1,
                bbox:     toBox(e.BBox),
                matrix:   toMatrix(e.Matrix),
                resources: e.Resources || null,
                group:    e.Group  || null,
                metadata: e.Metadata || null,
                structParents:  e.StructParents && e.StructParents.type === 'int'
                    ? e.StructParents.value : null,
                structParent:   e.StructParent && e.StructParent.type === 'int'
                    ? e.StructParent.value : null,
                raw:      stream.raw,
                dict:     stream.dict
            };
        }

        function typeXObject(stream) {
            if (!isType(stream, 'stream')) {
                throw new ParseError('pdf/xobject/not-stream',
                    'XObject must be a stream object');
            }
            const t = stream.dict.entries.Type;
            if (t && (t.type !== 'name' || t.value !== 'XObject')) {
                throw new ParseError('pdf/xobject/bad-type',
                    '/Type must be /XObject when present',
                    { context: { actual: t.value } });
            }
            const s = stream.dict.entries.Subtype;
            if (!s || s.type !== 'name') {
                throw new ParseError('pdf/xobject/missing-subtype',
                    'XObject must have /Subtype');
            }
            if (s.value === 'Image') return typeImageXObject(stream);
            if (s.value === 'Form')  return typeFormXObject(stream);
            return { kind: s.value, raw: stream.raw, dict: stream.dict };
        }

        return { typeImageXObject, typeFormXObject, typeXObject };
    }
};
