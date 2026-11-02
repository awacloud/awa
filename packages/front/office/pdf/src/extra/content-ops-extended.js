// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Opt-in: extended graphics-state operators and full
 * ExtGState typing.
 *
 * Per ISO 32000-2:2020 §8.4.5 (graphics-state operators) and §8.4.5
 * Table 57 (ExtGState parameter dictionary).
 *
 * Rare gstate-extra ops covered: `d0`, `d1` (Type 3 font char-width
 * shape operators, §9.6.4) ; `gs` is L0 already, but this module also
 * exposes the catalog of every ExtGState key, and types the halftones an
 * ExtGState's `HT` names (`typeHalftone`).
 *
 * @module pdf/extra/content-ops-extended
 */

/**
 * Module factory.
 */
import { pdfErrors } from '../errors.js';
import { pdfParserObj } from '../syntax/parser-obj.js';

export const pdfContentOpsExtended = {
    name: 'pdfContentOpsExtended',
    dependencies: ['pdfErrors', 'pdfParserObj'],
    deps: [pdfErrors, pdfParserObj],
    factory(errors, parserObj) {
        const { ParseError } = errors;
        const { isType } = parserObj;

        const EXT_GSTATE_KEYS = Object.freeze({
            Type:    { kind: 'name',  doc: 'must be /ExtGState' },
            LW:      { kind: 'num',   doc: 'line width' },
            LC:      { kind: 'int',   doc: 'line cap style 0|1|2' },
            LJ:      { kind: 'int',   doc: 'line join style 0|1|2' },
            ML:      { kind: 'num',   doc: 'miter limit' },
            D:       { kind: 'array', doc: '[ dashArray dashPhase ]' },
            RI:      { kind: 'name',  doc: 'rendering intent' },
            OP:      { kind: 'bool',  doc: 'stroke overprint' },
            op:      { kind: 'bool',  doc: 'non-stroke overprint' },
            OPM:     { kind: 'int',   doc: 'overprint mode 0|1' },
            Font:    { kind: 'array', doc: '[ font size ]' },
            BG:      { kind: 'stream-or-func', doc: 'black-generation function' },
            BG2:     { kind: 'stream-or-name',  doc: 'BG or /Default' },
            UCR:     { kind: 'stream-or-func', doc: 'undercolor-removal function' },
            UCR2:    { kind: 'stream-or-name',  doc: 'UCR or /Default' },
            TR:      { kind: 'stream-or-func-or-array', doc: 'transfer function' },
            TR2:    { kind: 'stream-or-func-or-array-or-name', doc: 'transfer function or /Default' },
            HT:      { kind: 'dict-or-stream-or-name', doc: 'halftone' },
            FL:      { kind: 'num',   doc: 'flatness tolerance' },
            SM:      { kind: 'num',   doc: 'smoothness tolerance' },
            SA:      { kind: 'bool',  doc: 'stroke adjustment' },
            BM:      { kind: 'name-or-array', doc: 'blend mode' },
            SMask:   { kind: 'dict-or-name',  doc: 'soft mask' },
            CA:      { kind: 'num',   doc: 'stroke alpha [0,1]' },
            ca:      { kind: 'num',   doc: 'non-stroke alpha [0,1]' },
            AIS:     { kind: 'bool',  doc: 'alpha is shape' },
            TK:      { kind: 'bool',  doc: 'text knockout' },
            UseBlackPtComp: { kind: 'name', doc: 'ON|OFF|Default' },
            HTO:     { kind: 'array', doc: 'halftone origin [tx ty]' },
            HTP:     { kind: 'array', doc: 'halftone phase [x y] (PDF 1.2, deprecated in 1.3)' }
        });

        const NUM = (v) => v && (v.type === 'int' || v.type === 'real');

        function typeExtGState(dict) {
            if (!isType(dict, 'dict')) {
                throw new ParseError('pdf/extra/ext-gstate/not-dict',
                    'ExtGState must be a dictionary',
                    { context: { type: dict && dict.type } });
            }
            const e = dict.entries;
            if (e.Type && (e.Type.type !== 'name' || e.Type.value !== 'ExtGState')) {
                throw new ParseError('pdf/extra/ext-gstate/bad-type',
                    '/Type entry must be /ExtGState',
                    { context: { actual: e.Type.value } });
            }
            const out = {
                type:            e.Type ? e.Type.value : null,
                lw:              NUM(e.LW)  ? e.LW.value  : null,
                lc:              NUM(e.LC)  ? (e.LC.value | 0) : null,
                lj:              NUM(e.LJ)  ? (e.LJ.value | 0) : null,
                ml:              NUM(e.ML)  ? e.ML.value  : null,
                d:               isType(e.D, 'array') ? e.D : null,
                ri:              isType(e.RI, 'name') ? e.RI.value : null,
                op:              isType(e.OP, 'bool') ? e.OP.value : null,
                opNs:            isType(e.op, 'bool') ? e.op.value : null,
                opm:             NUM(e.OPM) ? (e.OPM.value | 0) : null,
                font:            isType(e.Font, 'array') ? e.Font : null,
                bg:              e.BG || null,
                bg2:             e.BG2 || null,
                ucr:             e.UCR || null,
                ucr2:            e.UCR2 || null,
                tr:              e.TR || null,
                tr2:             e.TR2 || null,
                ht:              e.HT || null,
                fl:              NUM(e.FL) ? e.FL.value : null,
                sm:              NUM(e.SM) ? e.SM.value : null,
                sa:              isType(e.SA, 'bool') ? e.SA.value : null,
                bm:              e.BM || null,
                sMask:           e.SMask || null,
                ca:              NUM(e.CA) ? e.CA.value : null,
                caNs:            NUM(e.ca) ? e.ca.value : null,
                ais:             isType(e.AIS, 'bool') ? e.AIS.value : null,
                tk:              isType(e.TK, 'bool')  ? e.TK.value  : null,
                useBlackPtComp:  isType(e.UseBlackPtComp, 'name') ? e.UseBlackPtComp.value : null,
                hto:             isType(e.HTO, 'array') ? e.HTO : null,
                htp:             isType(e.HTP, 'array') ? e.HTP : null,
                raw:             dict,
                _extras:         {}
            };
            for (const k of Object.keys(e)) {
                if (!(k in EXT_GSTATE_KEYS)) out._extras[k] = e[k];
            }
            return out;
        }

        function decodeType3CharOp(op, operands) {
            if (op !== 'd0' && op !== 'd1') {
                throw new ParseError('pdf/extra/content-ops/unknown',
                    'expected d0 or d1 operator',
                    { context: { op } });
            }
            if (op === 'd0') {
                if (!operands || operands.length !== 2) {
                    throw new ParseError('pdf/extra/content-ops/bad-d0',
                        'd0 requires 2 operands wx wy',
                        { context: { count: operands && operands.length } });
                }
                return { kind: 'd0', wx: +operands[0], wy: +operands[1] };
            }
            if (!operands || operands.length !== 6) {
                throw new ParseError('pdf/extra/content-ops/bad-d1',
                    'd1 requires 6 operands wx wy llx lly urx ury',
                    { context: { count: operands && operands.length } });
            }
            return {
                kind: 'd1',
                wx:   +operands[0],
                wy:   +operands[1],
                bbox: [ +operands[2], +operands[3], +operands[4], +operands[5] ]
            };
        }

        // The halftones: per /HalftoneType, its keys and their types (the
        // Arlington PDF Model's), as `Key:type` pairs apart by a space; a
        // type of several, `a|b`, takes any.
        const keyTypes = (text) => Object.freeze(Object.fromEntries(text.split(' ').map((p) => p.split(':'))));
        const COMMON = 'Type:name HalftoneType:int HalftoneName:string';
        const TRANSFER = 'TransferFunction:dict|name|stream';
        const HALFTONE_TYPES = Object.freeze({
            1: keyTypes(`${COMMON} Frequency:num Angle:num SpotFunction:array|dict|name|stream AccurateScreens:bool ${TRANSFER}`),
            5: keyTypes(`${COMMON} Default:dict|stream`),
            6: keyTypes(`${COMMON} Width:int Height:int ${TRANSFER}`),
            10: keyTypes(`${COMMON} Xsquare:int Ysquare:int ${TRANSFER}`),
            16: keyTypes(`${COMMON} Width:int Height:int Width2:int Height2:int ${TRANSFER}`)
        });
        const HALFTONE_KEYS = Object.freeze(Object.fromEntries(
            Object.entries(HALFTONE_TYPES).map(([type, types]) => [type, Object.freeze(Object.keys(types))])));
        // A stream halftone's Table 5 keys: typeStreamEntries' part.
        const STREAM_KEYS = new Set(['Length', 'Filter', 'DecodeParms', 'F', 'FFilter', 'FDecodeParms', 'DL']);
        const HALFTONE_READ = Object.freeze({
            name: (v) => (isType(v, 'name') ? v.value : undefined),
            string: (v) => (isType(v, 'string') ? v.value : undefined),
            num: (v) => (NUM(v) ? v.value : undefined),
            int: (v) => (isType(v, 'int') ? v.value : undefined),
            bool: (v) => (isType(v, 'bool') ? v.value : undefined),
            array: (v) => (isType(v, 'array') ? v : undefined),
            dict: (v) => (isType(v, 'dict') ? v : undefined),
            stream: (v) => (isType(v, 'stream') ? v : undefined)
        });

        function halftoneValue(type, v) {
            if (isType(v, 'ref')) return v;
            const alts = type.split('|');
            if (alts.length > 1) {
                // A key of several types: the value as read, a name by its value.
                if (!alts.some((t) => HALFTONE_READ[t](v) !== undefined)) return null;
                return isType(v, 'name') ? v.value : v;
            }
            const r = HALFTONE_READ[type](v);
            return r === undefined ? null : r;
        }

        /**
         * Type a halftone dictionary or stream (its dictionary read), its
         * kind given by its `/HalftoneType` (`HALFTONE_KEYS`: 1, 5, 6, 10,
         * 16): one field per key of its list, named after the key in lower
         * case (`HalftoneName` → `halftonename`), present only when the key
         * is; for type 5 the other keys (colorants) in `colorants`; for a
         * stream its Table 5 keys left to `typeStreamEntries`; the other
         * keys in `_extras`.
         */
        function typeHalftone(value) {
            const dict = isType(value, 'stream') ? value.dict : value;
            if (!isType(dict, 'dict')) {
                throw new ParseError('pdf/extra/halftone/not-dict',
                    'a halftone must be a dictionary or a stream',
                    { context: { type: value && value.type } });
            }
            const e = dict.entries;
            const t = isType(e.HalftoneType, 'int') ? e.HalftoneType.value : null;
            const types = t !== null && Object.prototype.hasOwnProperty.call(HALFTONE_TYPES, t) ? HALFTONE_TYPES[t] : null;
            if (!types) {
                throw new ParseError('pdf/extra/halftone/bad-type',
                    '/HalftoneType must be 1, 5, 6, 10 or 16',
                    { context: { actual: t } });
            }
            const out = { raw: value, _extras: {} };
            if (t === 5) out.colorants = {};
            const streamed = isType(value, 'stream');
            for (const [k, v] of Object.entries(e)) {
                if (Object.prototype.hasOwnProperty.call(types, k)) out[k.toLowerCase()] = halftoneValue(types[k], v);
                else if (t === 5) out.colorants[k] = v;
                else if (!(streamed && STREAM_KEYS.has(k))) out._extras[k] = v;
            }
            return out;
        }

        return {
            typeExtGState,
            decodeType3CharOp,
            EXT_GSTATE_KEYS,
            typeHalftone,
            HALFTONE_KEYS
        };
    }
};

