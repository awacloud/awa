// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview `odfWalker` — parameterised extension walker shared by
 * the three orchestrator-specific walkers (`odtWalker`, `odsWalker`,
 * `odpWalker`).
 *
 * The walker implements the canonical `.use(...)` registry, the lazy
 * hook index, the recursive `visitNode` dispatcher and the sidecar
 * hook application. Per-format specifics (which child-bearing fields
 * to recurse into, which node-type → hook-name table, which root keys
 * to scan) are passed as a `config` object to `createWalker(config)`.
 *
 * Worker-safe : factory is pure, walkers are created per-invocation.
 *
 * @module odf/_shared/walker
 */

export const odfWalker = {
    name: 'odfWalker',
    dependencies: [],

    factory() {
        /**
         * Build a walker for a specific format.
         *
         * @param {object} config
         * @param {string[]} config.recurseFields - field names to recurse
         *   into in order (`['children', 'body', 'rows', 'cells', …]`).
         * @param {Record<string,string>} config.typeHooks - map from
         *   node `type` to hook suffix (`{ paragraph: 'Paragraph',
         *   span: 'Span', … }`). The dispatcher will call
         *   `hydrate<Suffix>` / `dehydrate<Suffix>`.
         * @param {string} config.rootField - top-level result key to
         *   visit recursively (`'body'` for odt, `'spreadsheet'` for
         *   ods, `'slides'` for odp).
         * @param {string[]} [config.sidecars] - sidecar keys to apply
         *   hooks on (`['meta', 'settings', 'styles']` by default).
         */
        function createWalker(config) {
            const recurseFields = config.recurseFields;
            const typeHooks = config.typeHooks;
            const rootField = config.rootField;
            const sidecars = config.sidecars || ['meta', 'settings', 'styles'];
            const SIDECAR_HOOKS = {
                meta:     'Metadata',
                settings: 'Settings',
                styles:   'Styles'
            };

            const _exts = [];
            let _index = null;

            function use(...extensions) {
                for (const ext of extensions) {
                    if (ext && !_exts.includes(ext)) _exts.push(ext);
                }
                _index = null;
            }

            function indexHook(name) {
                if (!_index) _index = Object.create(null);
                let arr = _index[name];
                if (arr) return arr;
                arr = [];
                for (const ext of _exts) {
                    const fn = ext[name];
                    if (typeof fn === 'function') arr.push(fn.bind(ext));
                }
                _index[name] = arr;
                return arr;
            }

            function applyHook(name, value) {
                if (value == null) return value;
                const fns = indexHook(name);
                for (let i = 0; i < fns.length; i++) {
                    const r = fns[i](value);
                    if (r !== undefined) value = r;
                }
                return value;
            }

            function visitNode(node, phase) {
                if (!node || typeof node !== 'object') return node;
                if (Array.isArray(node)) {
                    for (let i = 0; i < node.length; i++) {
                        const r = visitNode(node[i], phase);
                        if (r !== undefined) node[i] = r;
                    }
                    return node;
                }
                for (let i = 0; i < recurseFields.length; i++) {
                    const f = recurseFields[i];
                    if (node[f]) visitNode(node[f], phase);
                }
                const suffix = typeHooks[node.type];
                if (suffix) {
                    return applyHook(
                        (phase === 'hydrate' ? 'hydrate' : 'dehydrate') + suffix,
                        node);
                }
                return node;
            }

            function applyExtensions(result, phase) {
                if (!_exts.length) return;
                if (result[rootField]) visitNode(result[rootField], phase);
                for (let i = 0; i < sidecars.length; i++) {
                    const k = sidecars[i];
                    if (!result[k]) continue;
                    const suffix = SIDECAR_HOOKS[k] || (k.charAt(0).toUpperCase() + k.slice(1));
                    const r = applyHook(
                        (phase === 'hydrate' ? 'hydrate' : 'dehydrate') + suffix,
                        result[k]);
                    if (r !== undefined) result[k] = r;
                }
            }

            return {
                use,
                applyHydrate(result)   { applyExtensions(result, 'hydrate'); },
                applyDehydrate(result) { applyExtensions(result, 'dehydrate'); },
                get hasExtensions()    { return _exts.length > 0; },
                get extensions()       { return _exts.slice(); }
            };
        }

        return { createWalker };
    }
};
