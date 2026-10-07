// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Opt-in: typed Shading dictionaries (§8.7.4) and Function
 * dictionaries (§7.10) per ISO 32000-2:2020.
 *
 * Shading types:
 *   1 — Function-based
 *   2 — Axial
 *   3 — Radial
 *   4 — Free-form Gouraud
 *   5 — Lattice-form Gouraud
 *   6 — Coons patch mesh
 *   7 — Tensor-product patch mesh
 *
 * Function types: 0 (Sampled), 2 (Exponential), 3 (Stitching), 4 (PostScript).
 *
 * @module pdf/extra/shading-typed
 */

/**
 * Module factory.
 */
import { pdfErrors } from '../errors.js';
import { pdfParserObj } from '../syntax/parser-obj.js';

export const pdfShadingTyped = {
    name: 'pdfShadingTyped',
    dependencies: ['pdfErrors', 'pdfParserObj'],
    deps: [pdfErrors, pdfParserObj],
    factory(errors, parserObj) {
        const { ParseError } = errors;
        const { isType } = parserObj;

        const NUM = (v) => v && (v.type === 'int' || v.type === 'real');

        function typeShading(obj_) {
            let dict;
            if (isType(obj_, 'dict')) dict = obj_;
            else if (isType(obj_, 'stream')) dict = obj_.dict;
            else {
                throw new ParseError('pdf/extra/shading/not-dict-or-stream',
                    'Shading must be dict or stream',
                    { context: { type: obj_ && obj_.type } });
            }
            const e = dict.entries;
            if (!NUM(e.ShadingType)) {
                throw new ParseError('pdf/extra/shading/missing-type',
                    '/ShadingType is required and must be numeric',
                    { context: { type: e.ShadingType && e.ShadingType.type } });
            }
            const st = e.ShadingType.value | 0;
            if (st < 1 || st > 7) {
                throw new ParseError('pdf/extra/shading/bad-type',
                    'invalid /ShadingType (must be 1..7)',
                    { context: { st } });
            }
            const base = {
                shadingType:    st,
                colorSpace:     e.ColorSpace || null,
                background:     isType(e.Background, 'array') ? e.Background.items : null,
                bbox:           isType(e.BBox, 'array') ? e.BBox.items.map(it => NUM(it) ? it.value : null) : null,
                antiAlias:      isType(e.AntiAlias, 'bool') ? e.AntiAlias.value : false,
                raw:            obj_,
                _extras:        {}
            };
            let typed;
            switch (st) {
                case 1: typed = readFnBased(e); break;
                case 2: typed = readAxial(e); break;
                case 3: typed = readRadial(e); break;
                case 4: typed = readFreeForm(e); break;
                case 5: typed = readLattice(e); break;
                case 6: typed = readCoons(e); break;
                case 7: typed = readTensor(e); break;
            }
            Object.assign(base, typed);
            const known = new Set(['ShadingType', 'ColorSpace', 'Background', 'BBox', 'AntiAlias',
                'Domain', 'Matrix', 'Function', 'Coords', 'Extend',
                'BitsPerCoordinate', 'BitsPerComponent', 'BitsPerFlag',
                'Decode', 'VerticesPerRow']);
            for (const k of Object.keys(e)) if (!known.has(k)) base._extras[k] = e[k];
            return base;
        }

        function readFnBased(e) {
            return {
                domain:   isType(e.Domain, 'array') ? toNumArr(e.Domain) : [0, 1, 0, 1],
                matrix:   isType(e.Matrix, 'array') ? toNumArr(e.Matrix) : [1, 0, 0, 1, 0, 0],
                function: e.Function || null
            };
        }

        function readAxial(e) {
            requireArrLen(e.Coords, 4, 'Axial /Coords');
            return {
                coords:   toNumArr(e.Coords),
                domain:   isType(e.Domain, 'array') ? toNumArr(e.Domain) : [0, 1],
                function: e.Function || null,
                extend:   extendArr(e.Extend)
            };
        }

        function readRadial(e) {
            requireArrLen(e.Coords, 6, 'Radial /Coords');
            return {
                coords:   toNumArr(e.Coords),
                domain:   isType(e.Domain, 'array') ? toNumArr(e.Domain) : [0, 1],
                function: e.Function || null,
                extend:   extendArr(e.Extend)
            };
        }

        function readFreeForm(e) { return meshCommon(e, true); }
        function readLattice(e) {
            const c = meshCommon(e, false);
            if (!NUM(e.VerticesPerRow)) {
                throw new ParseError('pdf/extra/shading/lattice-missing-vpr',
                    'Lattice shading requires /VerticesPerRow');
            }
            c.verticesPerRow = e.VerticesPerRow.value | 0;
            return c;
        }
        function readCoons(e)  { return meshCommon(e, true); }
        function readTensor(e) { return meshCommon(e, true); }

        function meshCommon(e, hasFlag) {
            if (!NUM(e.BitsPerCoordinate) || !NUM(e.BitsPerComponent)) {
                throw new ParseError('pdf/extra/shading/mesh-missing-bits',
                    'mesh shading requires /BitsPerCoordinate and /BitsPerComponent');
            }
            if (!isType(e.Decode, 'array')) {
                throw new ParseError('pdf/extra/shading/mesh-missing-decode',
                    'mesh shading requires /Decode');
            }
            const out = {
                bitsPerCoordinate: e.BitsPerCoordinate.value | 0,
                bitsPerComponent:  e.BitsPerComponent.value | 0,
                decode:            toNumArr(e.Decode),
                function:          e.Function || null
            };
            if (hasFlag) {
                if (!NUM(e.BitsPerFlag)) {
                    throw new ParseError('pdf/extra/shading/mesh-missing-flag',
                        'this mesh shading requires /BitsPerFlag');
                }
                out.bitsPerFlag = e.BitsPerFlag.value | 0;
            }
            return out;
        }

        function extendArr(v) {
            if (!isType(v, 'array') || v.items.length !== 2) return [false, false];
            return [
                isType(v.items[0], 'bool') ? v.items[0].value : false,
                isType(v.items[1], 'bool') ? v.items[1].value : false
            ];
        }

        function toNumArr(v) {
            if (!isType(v, 'array')) return null;
            const out = [];
            for (const it of v.items) {
                if (!NUM(it)) return null;
                out.push(it.value);
            }
            return out;
        }

        function requireArrLen(v, len, what) {
            if (!isType(v, 'array') || v.items.length !== len) {
                throw new ParseError('pdf/extra/shading/bad-coords',
                    `${what} must be an array of ${len} numbers`,
                    { context: { actualLen: v && v.items && v.items.length } });
            }
        }

        function typeFunction(obj_) {
            let dict;
            if (isType(obj_, 'dict')) dict = obj_;
            else if (isType(obj_, 'stream')) dict = obj_.dict;
            else {
                throw new ParseError('pdf/extra/function/not-dict-or-stream',
                    'Function must be dict or stream',
                    { context: { type: obj_ && obj_.type } });
            }
            const e = dict.entries;
            if (!NUM(e.FunctionType)) {
                throw new ParseError('pdf/extra/function/missing-type',
                    '/FunctionType is required');
            }
            const ft = e.FunctionType.value | 0;
            if (![0, 2, 3, 4].includes(ft)) {
                throw new ParseError('pdf/extra/function/bad-type',
                    '/FunctionType must be 0, 2, 3, or 4',
                    { context: { ft } });
            }
            return {
                functionType: ft,
                domain:       toNumArr(e.Domain),
                range:        toNumArr(e.Range),
                c0:           toNumArr(e.C0),
                c1:           toNumArr(e.C1),
                n:            NUM(e.N) ? e.N.value : null,
                functions:    isType(e.Functions, 'array') ? e.Functions.items : null,
                bounds:       toNumArr(e.Bounds),
                encode:       toNumArr(e.Encode),
                size:         toNumArr(e.Size),
                bitsPerSample: NUM(e.BitsPerSample) ? (e.BitsPerSample.value | 0) : null,
                order:        NUM(e.Order) ? (e.Order.value | 0) : null,
                decode:       toNumArr(e.Decode),
                raw:          obj_
            };
        }

        return { typeShading, typeFunction };
    }
};

