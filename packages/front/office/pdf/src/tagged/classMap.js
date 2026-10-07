// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview ClassMap typing per ISO 32000-2:2020 §14.7.5.4.
 *
 * The structure-tree `/ClassMap` maps class names (used in StructElem
 * `/C` entries) to attribute objects or arrays of attribute objects.
 * An attribute object is a dict that begins with `/O` naming the owner
 * (e.g. `/Layout`, `/Table`, `/List`).
 *
 * The values are stored verbatim; only top-level shape is validated.
 *
 * @module pdf/tagged/classMap
 */

/**
 * Module factory.
 */
import { pdfErrors } from '../errors.js';
import { pdfParser } from '../syntax/parser.js';

export const pdfClassMap = {
    name: 'pdfClassMap',
    dependencies: ['pdfErrors', 'pdfParser'],
    deps: [pdfErrors, pdfParser],
    factory(errors, parser) {
        const { ParseError } = errors;
        const { isType } = parser;

        function typeClassMap(dict) {
            if (!isType(dict, 'dict')) {
                throw new ParseError('pdf/tagged/class-map/not-dict',
                    'ClassMap must be a dictionary',
                    { context: { type: dict && dict.type } });
            }
            const classes = {};
            for (const [k, v] of Object.entries(dict.entries)) {
                if (!v) {
                    throw new ParseError('pdf/tagged/class-map/bad-value',
                        'ClassMap entry has no value',
                        { context: { key: k } });
                }
                if (v.type === 'dict') {
                    classes[k] = [v];
                } else if (v.type === 'array') {
                    for (const item of v.items) {
                        if (!item || item.type !== 'dict') {
                            throw new ParseError('pdf/tagged/class-map/bad-item',
                                'ClassMap array entries must be attribute dicts',
                                { context: { key: k, kind: item && item.type } });
                        }
                    }
                    classes[k] = v.items.slice();
                } else {
                    throw new ParseError('pdf/tagged/class-map/bad-value',
                        'ClassMap values must be a dict or array of dicts',
                        { context: { key: k, kind: v.type } });
                }
            }
            return { classes, raw: dict };
        }

        function getClassAttributes(typed, name, owner) {
            if (!typed || !typed.classes) return [];
            const list = typed.classes[name];
            if (!list) return [];
            if (!owner) return list.slice();
            const out = [];
            for (const d of list) {
                const o = d.entries && d.entries.O;
                if (o && o.type === 'name' && o.value === owner) out.push(d);
            }
            return out;
        }

        return { typeClassMap, getClassAttributes };
    }
};
