// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Optional Content Configuration dictionary typing per
 * ISO 32000-2:2020 §8.11.4.
 *
 * `/OCProperties./D` (default config) and entries of `/OCProperties./Configs`
 * are dictionaries describing the visibility state of a set of OCGs. The
 * L3 typing exposes `name`, `creator`, `baseState`, `on`, `off`, `intent`,
 * `as`, `order`, `listMode`, `rbGroups`, `locked`.
 *
 * Unknown entries are preserved in `_extras`.
 *
 * @module pdf/ocg/config
 */

/**
 * Module factory.
 */
import { pdfErrors } from '../errors.js';
import { pdfParser } from '../syntax/parser.js';

export const pdfOCConfig = {
    name: 'pdfOCConfig',
    dependencies: ['pdfErrors', 'pdfParser'],
    deps: [pdfErrors, pdfParser],
    factory(errors, parser) {
        const { ParseError } = errors;
        const { isType } = parser;

        const KNOWN = new Set([
            'Name', 'Creator', 'BaseState', 'ON', 'OFF',
            'Intent', 'AS', 'Order', 'ListMode', 'RBGroups', 'Locked'
        ]);
        const BASE_STATES = new Set(['ON', 'OFF', 'Unchanged']);

        function refsOf(node, label) {
            if (node.type !== 'array') {
                throw new ParseError('pdf/ocg/config/bad-refs',
                    '/' + label + ' must be an array of refs',
                    { context: { type: node.type } });
            }
            return node.items.filter((r) => r && r.type === 'ref');
        }

        function typeUsageApp(d) {
            if (!isType(d, 'dict')) {
                throw new ParseError('pdf/ocg/config/as/not-dict',
                    '/AS entry must be a dictionary',
                    { context: { type: d && d.type } });
            }
            const e = d.entries;
            const out = { raw: d };
            if (e.Event && e.Event.type === 'name') out.event = e.Event.value;
            if (e.OCGs  && e.OCGs.type  === 'array') {
                out.ocgs = e.OCGs.items.filter((r) => r.type === 'ref');
            }
            if (e.Category && e.Category.type === 'array') {
                out.category = e.Category.items
                    .filter((c) => c.type === 'name').map((c) => c.value);
            }
            return out;
        }

        function typeOCConfig(dict) {
            if (!isType(dict, 'dict')) {
                throw new ParseError('pdf/ocg/config/not-dict',
                    'OCConfig must be a dictionary',
                    { context: { type: dict && dict.type } });
            }
            const e = dict.entries;
            const out = { raw: dict, _extras: {} };

            if (e.Name) {
                if (e.Name.type !== 'string') {
                    throw new ParseError('pdf/ocg/config/bad-name',
                        '/Name must be a string', { context: { type: e.Name.type } });
                }
                out.name = e.Name.value;
            }
            if (e.Creator) {
                if (e.Creator.type !== 'string') {
                    throw new ParseError('pdf/ocg/config/bad-creator',
                        '/Creator must be a string', { context: { type: e.Creator.type } });
                }
                out.creator = e.Creator.value;
            }
            if (e.BaseState) {
                if (e.BaseState.type !== 'name' || !BASE_STATES.has(e.BaseState.value)) {
                    throw new ParseError('pdf/ocg/config/bad-base-state',
                        '/BaseState must be ON|OFF|Unchanged',
                        { context: { actual: e.BaseState.value } });
                }
                out.baseState = e.BaseState.value;
            }
            if (e.ON)  out.on  = refsOf(e.ON, 'ON');
            if (e.OFF) out.off = refsOf(e.OFF, 'OFF');
            if (e.Locked) out.locked = refsOf(e.Locked, 'Locked');

            if (e.Intent) {
                if (e.Intent.type === 'name') out.intent = [e.Intent.value];
                else if (e.Intent.type === 'array') {
                    out.intent = e.Intent.items
                        .filter((x) => x && x.type === 'name')
                        .map((x) => x.value);
                } else {
                    throw new ParseError('pdf/ocg/config/bad-intent',
                        '/Intent must be name or array of names',
                        { context: { type: e.Intent.type } });
                }
            }
            if (e.AS) {
                if (e.AS.type !== 'array') {
                    throw new ParseError('pdf/ocg/config/bad-as',
                        '/AS must be an array', { context: { type: e.AS.type } });
                }
                out.as = e.AS.items.map(typeUsageApp);
            }
            if (e.Order) {
                if (e.Order.type !== 'array') {
                    throw new ParseError('pdf/ocg/config/bad-order',
                        '/Order must be an array', { context: { type: e.Order.type } });
                }
                out.order = e.Order.items;
            }
            if (e.ListMode) {
                if (e.ListMode.type !== 'name') {
                    throw new ParseError('pdf/ocg/config/bad-list-mode',
                        '/ListMode must be a name',
                        { context: { type: e.ListMode.type } });
                }
                out.listMode = e.ListMode.value;
            }
            if (e.RBGroups) {
                if (e.RBGroups.type !== 'array') {
                    throw new ParseError('pdf/ocg/config/bad-rb',
                        '/RBGroups must be an array',
                        { context: { type: e.RBGroups.type } });
                }
                out.rbGroups = e.RBGroups.items
                    .filter((it) => it && it.type === 'array')
                    .map((it) => it.items.filter((r) => r.type === 'ref'));
            }

            for (const k of Object.keys(e)) {
                if (!KNOWN.has(k)) out._extras[k] = e[k];
            }
            return out;
        }

        return { typeOCConfig, typeUsageApp };
    }
};
