// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview Component primitive on top of `uiSession`.
 *
 * A component is **a reusable UI unit** with its own template, optional props
 * schema, optional scoped CSS, state, lifecycle hooks, and child element
 * accessors. It encapsulates the boilerplate of mounting a `uiSession` block,
 * validating props, scoping CSS, wiring listeners and propagating updates.
 *
 * The module exposes a factory pattern :
 *
 *   const Card = component.define({
 *       template: cardTpl,                        // ParseResult
 *       props: {                                   // optional schema
 *           title: { type: 'string', required: true },
 *           count: { type: 'number', default: 0 },
 *       },
 *       css: `
 *           & { padding: 1rem; border: 1px solid var(--fw-color-border); }
 *           & h2 { margin: 0; }
 *           &:hover { background: var(--fw-color-surface); }
 *       `,                                         // `&` = root scope, auto-injected once
 *       mount(self) { … },                         // wire listeners, init resources
 *       update(self, prev) { … },                  // when props change — re-bind the DOM here
 *       unmount(self) { … },                       // cleanup external resources
 *   });
 *
 *   const c = Card({ ui, parent: 'main', id: 'card-1', props: { title: 'Hi' } });
 *   c.update({ title: 'Hi v2', count: 3 });
 *   c.destroy();
 *
 * The `self` argument passed to lifecycle hooks exposes :
 *   - `props`      : current bound data (after validation + `propsFn` if any).
 *   - `prevProps`  : previous props (during `update`).
 *   - `ui`         : the parent uiSession (shared with caller).
 *   - `blockId`    : the logical block id used internally.
 *   - `get(lid?)`  : shortcut for `ui.get(blockId, lid)` ; without arg → root.
 *   - `text(lid?, value)` / `attr(lid?, name, value)` / `on(lid?, type, fn, …)`
 *     : proxies onto the underlying block.
 *   - `state`      : free-form object the component can populate.
 *
 * Auto-cleanup : `ui.onUnmount(blockId, ...)` is registered so any removal
 * (parent block cleared, full session reset) fires the component's `unmount`
 * hook. Listeners attached via `self.on(...)` are tracked by `uiSession`.
 *
 * Scoped CSS : `spec.css` is injected **once per define()** into the page's
 * `<head>`. Inside the CSS, `&` is rewritten to the unique scope class
 * generated for the blueprint (`.fw-comp-N`). The scope class is added to
 * every instance's root element automatically. CSP nonce is auto-detected
 * from `<meta name="csp-nonce">` and applied to the injected `<style>`.
 *
 * Props shape : `self.props` always holds the **transformed** shape (the
 * exact data the DOM template was bound against). The original validated
 * user input is preserved under `self.rawProps`. Both fields are kept
 * symmetric across `create()` and `update()` ; `propsFn` is re-evaluated
 * on every update - keep it pure and cheap, or memoise inside the function.
 *
 * DOM re-binding on update : `update(newProps)` re-validates the new props (and
 * re-applies `propsFn`) and fires the `update` hook, but it does **not**
 * automatically re-write the DOM from the new props — re-binding is left to the
 * hook. Wire the changed fields explicitly in `update(self, prev)` via
 * `self.text(...)` / `self.attr(...)` (or a `reactiveBind` set up in `mount`).
 * (Clarified 2026-06-30 from the `@awacloud/ui-templates` W0 dual-form spike, which
 * measured this behaviour; `component.js` is not yet field-tested — see
 * `ai/plans/ui-templates`.)
 *
 */

/**
 * A mounted component instance returned by a component factory.
 * @typedef {object} ComponentInstance
 * @property {*} props Current transformed (DOM-bound) props (getter).
 * @property {string} blockId Logical block id used internally (getter).
 * @property {object} state Free-form per-instance state object (getter).
 * @property {(string|null)} scopeClass Scope class applied to the root, or `null` (getter).
 * @property {(newProps: object) => void} update Re-validate props (re-apply `propsFn`) and fire the `update` hook. Does NOT auto-re-bind the DOM — re-bind in the hook via `self.text`/`self.attr`.
 * @property {() => void} destroy Clear the block (fires the `unmount` hook).
 * @property {(lid?: string) => (Element|null)} get Root element, or a descendant by logical id.
 * @property {(...args: *[]) => *} text Proxy onto `ui.text(blockId, ...)`.
 * @property {(...args: *[]) => *} attr Proxy onto `ui.attr(blockId, ...)`.
 * @property {(...args: *[]) => *} on Proxy onto `ui.on(blockId, ...)`.
 */

/**
 * Factory produced by `define(spec)` : mounts a component instance.
 * @typedef {(opts?: { ui: object, parent?: string, slot?: string, id?: string, props?: object }) => ComponentInstance} ComponentFactory
 */

/**
 * Public API returned by `component.factory()`.
 * @typedef {object} ComponentAPI
 * @property {(spec: object) => ComponentFactory} define Define a component blueprint; returns a factory that mounts instances.
 */

import { reactiveBind } from './reactiveBind.js';

export const component = {
    name: 'component',
    version: '1.3.0',
    type: 'fw.dom.rendering',
    dependencies: ['reactiveBind'],
    deps: [reactiveBind],

    /** @returns {ComponentAPI} */
    factory(reactiveBind) {

        // Shared counter for scope class names across all `define()` calls.
        let _scopeSeq = 0;

        // Track scope classes already injected (per factory instance).
        // Prevents duplicate `<style data-fw-component="…">` from accumulating
        // when a blueprint is `define()`d multiple times (hot-reload, dynamic
        // re-registration). Re-using the same scope class is a host concern.
        const _injectedScopes = new Set();

        // CSP nonce auto-detected from <meta name="csp-nonce"> if present
        // (mirrors `template.js#cspNonce` behaviour without taking the
        // dep on `template`).
        const _cspNonce = (typeof document !== 'undefined')
            ? (document.querySelector('meta[name="csp-nonce"]')?.getAttribute('content') ?? '')
            : '';

        // ── Props schema validation ─────────────────────────────────────────

        /**
         * Validate `rawProps` against `schema`. Returns a fresh object with
         * defaults applied and unknown props passed through (lenient mode).
         *
         * Throws on : missing required, wrong type, validator returning false.
         *
         * Supported `type` strings :
         *   - `'string' | 'number' | 'boolean' | 'function' | 'object'` : `typeof` check.
         *   - `'array'` : `Array.isArray(value)` check.
         *   - omitted : any type accepted (validator-only field).
         */
        function _validateProps(schema, rawProps, defName) {
            const out = {};
            const raw = rawProps || {};
            for (const [name, spec] of Object.entries(schema)) {
                const v = Object.prototype.hasOwnProperty.call(raw, name) ? raw[name] : undefined;
                if (v === undefined) {
                    if (spec.required) {
                        throw new Error(
                            `component${defName ? `[${defName}]` : ''}: ` +
                            `required prop '${name}' is missing`
                        );
                    }
                    if (Object.prototype.hasOwnProperty.call(spec, 'default')) {
                        out[name] = typeof spec.default === 'function' ? spec.default() : spec.default;
                    }
                    continue;
                }
                if (spec.type) {
                    let ok;
                    if (spec.type === 'array')        ok = Array.isArray(v);
                    else if (spec.type === 'object')  ok = v !== null && typeof v === 'object' && !Array.isArray(v);
                    else                              ok = typeof v === spec.type;
                    if (!ok) {
                        const actual = Array.isArray(v) ? 'array' : (v === null ? 'null' : typeof v);
                        throw new Error(
                            `component${defName ? `[${defName}]` : ''}: ` +
                            `prop '${name}' expected ${spec.type}, got ${actual}`
                        );
                    }
                }
                if (typeof spec.validator === 'function' && !spec.validator(v)) {
                    throw new Error(
                        `component${defName ? `[${defName}]` : ''}: ` +
                        `prop '${name}' failed validator`
                    );
                }
                out[name] = v;
            }
            // Pass-through props absent from schema (lenient - they reach the
            // template as raw data).
            for (const k of Object.keys(raw)) {
                if (!Object.prototype.hasOwnProperty.call(schema, k)) out[k] = raw[k];
            }
            return out;
        }

        // ── Scoped CSS injection ────────────────────────────────────────────

        /**
         * Rewrite a CSS source string to scope it under `scopeClass`.
         *
         * Rules applied in order:
         * 1. `@keyframes <name> { … }` — rename `<name>` to
         *    `<scopeClass>-<name>` and rewrite every `animation` /
         *    `animation-name` reference within the same source to the renamed
         *    identifier (unique per blueprint → collision-free across components
         *    that happen to use the same keyframe name).
         * 2. `:global(sel)` — emit `sel` verbatim (no scoping applied).
         * 3. `&` — replace with `.<scopeClass>`. Nested `& .a { & .b }` chains
         *    are resolved iteratively until no `&` remains.
         *
         * The function does NOT parse full CSS — it operates with targeted
         * regexes that cover the patterns documented in the plan. Corner-cases
         * involving `&` inside attribute selectors or string values are
         * intentionally out-of-scope.
         *
         * @param {string} cssSource - Raw CSS authored in the spec.
         * @param {string} scopeClass - The `.fw-comp-N` identifier (without dot).
         * @returns {string} Rewritten CSS.
         */
        function _rewriteCss(cssSource, scopeClass) {
            // Step 1 — @keyframes renaming.
            // Collect all keyframe names defined in this blueprint and build a
            // mapping name → scoped name.
            /** @type {Map<string, string>} */
            const _kfMap = new Map();
            const kfRe = /@keyframes\s+([\w-]+)/g;
            let m;
            while ((m = kfRe.exec(cssSource)) !== null) {
                const origName = m[1];
                if (!_kfMap.has(origName)) {
                    _kfMap.set(origName, `${scopeClass}-${origName}`);
                }
            }

            let out = cssSource;

            // Rename the @keyframes declarations themselves.
            if (_kfMap.size > 0) {
                out = out.replace(/@keyframes\s+([\w-]+)/g, (_full, name) => {
                    const renamed = _kfMap.get(name);
                    return renamed ? `@keyframes ${renamed}` : _full;
                });

                // Rewrite `animation-name: <name>` and `animation: … <name> …`
                // references to the renamed identifier.
                // animation-name is simple: value is the bare identifier.
                out = out.replace(/\banimation-name\s*:\s*([\w-]+)/g, (_full, name) => {
                    const renamed = _kfMap.get(name);
                    return renamed ? `animation-name: ${renamed}` : _full;
                });

                // animation shorthand: the keyframes name appears as a word token
                // that matches one of our collected names. We replace each occurrence
                // of the bare name that follows `animation:` (value context).
                // Build a regex alternation from the collected names.
                const namesAlt = [..._kfMap.keys()]
                    .map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
                    .join('|');
                const animRe = new RegExp(`(\\banimation\\s*:[^;{}]+?\\b)(${namesAlt})\\b`, 'g');
                out = out.replace(animRe, (_full, prefix, name) => {
                    const renamed = _kfMap.get(name);
                    return renamed ? `${prefix}${renamed}` : _full;
                });
            }

            // Step 2 — :global(sel) → sel (unscoped).
            // Must run before & expansion so :global(&) stays intact if authors
            // try that (rare, intentionally not supported — they use :global(sel)).
            out = out.replace(/:global\(([^)]*)\)/g, (_full, sel) => sel);

            // Step 3 — & → .<scopeClass>  (iterative to resolve nested chains).
            const scopeSelector = `.${scopeClass}`;
            // Iterate until no `&` remains (handles arbitrary nesting depth).
            let prev;
            do {
                prev = out;
                out = out.replace(/&/g, scopeSelector);
            } while (out !== prev);

            return out;
        }

        /**
         * Inject a `<style>` block scoped to `scopeClass`. User CSS uses `&`
         * to refer to the scope ; we rewrite to `.<scopeClass>` so the result
         * is plain CSS understood by all browsers (no nesting requirement).
         * Extended to handle nested `&`, `:global(sel)` and `@keyframes`.
         */
        function _injectScopedCss(cssSource, scopeClass) {
            if (typeof document === 'undefined') return;
            // Dedup : a given scope class never receives more than one
            // `<style>` tag, even if `define()` is invoked multiple times for
            // the same blueprint (dev hot-reload, double-imports).
            if (_injectedScopes.has(scopeClass)) return;
            _injectedScopes.add(scopeClass);
            const scoped = _rewriteCss(cssSource, scopeClass);
            const styleEl = document.createElement('style');
            styleEl.textContent = scoped;
            styleEl.setAttribute('data-fw-component', scopeClass);
            if (_cspNonce) styleEl.setAttribute('nonce', _cspNonce);
            document.head.appendChild(styleEl);
        }

        // ── Define / Create ─────────────────────────────────────────────────

        /**
         * Define a component blueprint.
         *
         * @param {Object} spec
         * @param {import('./parser').ParseResult} spec.template - Item template.
         * @param {string} [spec.name] - Optional human-readable name used in
         *   error messages (defaults to `'anonymous'`).
         * @param {Object<string, PropSpec>} [spec.props] - Props schema.
         * @param {string} [spec.css] - Scoped CSS source ; `&` refers to the
         *   component's root scope class.
         * @param {(props:*) => *} [spec.propsFn] - Transform validated props
         *   before they hit the DOM bindings. Identity by default. Re-evaluated
         *   on every `update()` ; keep it pure and cheap (or memoise inside).
         * @param {(self) => void} [spec.mount]
         * @param {(self, prevProps) => void} [spec.update] - Fired after props are
 *   re-validated on `update()`. The DOM is NOT auto-re-bound; re-bind changed
 *   fields here via `self.text`/`self.attr`.
         * @param {(self) => void} [spec.unmount]
         * @returns {Function} A `create({ui, parent?, slot?, id?, props}) → instance`
         *   factory. `instance` has `{ update, destroy, get, text, attr, on,
         *   props, blockId, state, scopeClass }`.
         *
         * @typedef {Object} PropSpec
         * @property {'string'|'number'|'boolean'|'function'|'object'|'array'} [type]
         * @property {boolean} [required]
         * @property {any | (() => any)} [default] - Used when prop is `undefined`.
         *   Function form re-runs per-instance (useful for `[]` / `{}` defaults
         *   to avoid shared references).
         * @property {(value:any) => boolean} [validator]
         */
        function define(spec) {
            if (!spec || !spec.template || !Array.isArray(spec.template.template))
                throw new Error('component.define: spec.template (ParseResult) is required');

            const tpl        = spec.template;
            const defName    = typeof spec.name === 'string' ? spec.name : null;
            const propsFn    = typeof spec.propsFn === 'function' ? spec.propsFn : null;
            const onMount    = typeof spec.mount   === 'function' ? spec.mount   : null;
            const onUpdate   = typeof spec.update  === 'function' ? spec.update  : null;
            const onUnmount  = typeof spec.unmount === 'function' ? spec.unmount : null;
            const schema     = (spec.props && typeof spec.props === 'object') ? spec.props : null;
            const cssSource  = typeof spec.css === 'string' ? spec.css : null;

            // Compile-once : scope class + style tag injection happen here.
            let scopeClass = null;
            if (cssSource) {
                scopeClass = `fw-comp-${++_scopeSeq}`;
                _injectScopedCss(cssSource, scopeClass);
            }

            let _idSeq = 0;

            return function create(opts = {}) {
                const ui = opts.ui;
                if (!ui || typeof ui.add !== 'function')
                    throw new Error('component.create: opts.ui (UISession) is required');
                const blockId = opts.id || `comp:${++_idSeq}`;

                // Validate + apply defaults BEFORE first render so the schema
                // catches missing required props at construction time.
                // `props` always holds the transformed shape (the same shape
                // the DOM template was bound against). `rawProps` holds the
                // user-supplied input. This guarantees `self.props` matches
                // what the hooks see in the DOM - and is symmetric with
                // `update()` below (the previous code applied `propsFn` only
                // at create time, leading to divergent shapes after the first
                // `update()` call). See `tmp/audit/component.md`.
                let rawProps = schema ? _validateProps(schema, opts.props, defName) : (opts.props || {});
                let props    = propsFn ? propsFn(rawProps) : rawProps;

                // Mount initial DOM
                const item = { id: blockId, block: tpl, data: props };
                if (opts.parent) {
                    item.attach = { elm: opts.parent, name: opts.slot || 'default' };
                }
                ui.add([item]);

                // Apply scope class to root element (CSS isolation kicks in here).
                if (scopeClass) {
                    const rootEl = ui.get(blockId);
                    if (rootEl && rootEl.classList) rootEl.classList.add(scopeClass);
                }

                // Backing store for the lazy self.bind controller.
                // `null` = not yet created; `undefined` = post-unmount (do not recreate).
                let _bindController = null;

                const self = {
                    props,            // transformed shape (DOM-bound data)
                    rawProps,         // raw validated user input
                    prevProps: undefined,
                    prevRawProps: undefined,
                    ui,
                    blockId,
                    scopeClass,
                    state: {},
                    /**
                     * Lazy `reactiveBind` controller over this component's
                     * `uiSession`. Created on first access; auto-disposed on
                     * unmount. Accessing after unmount returns `undefined`.
                     * @type {import('./reactiveBind.js').ReactiveBindController|undefined}
                     */
                    get bind() {
                        // Post-unmount: do not resurrect a disposed controller.
                        if (_bindController === undefined) return undefined;
                        if (_bindController === null) {
                            _bindController = reactiveBind.create(ui);
                        }
                        return _bindController;
                    },
                    get(lid)            { return arguments.length === 0 ? ui.get(blockId) : ui.get(blockId, lid); },
                    text(...args)       { return ui.text(blockId, ...args); },
                    attr(...args)       { return ui.attr(blockId, ...args); },
                    on(...args)         { return ui.on(blockId, ...args); },
                    off(name)           { return ui.off(name); },
                    query(lid, sel)     { return ui.query(blockId, lid, sel); },
                    queryAll(lid, sel)  { return ui.queryAll(blockId, lid, sel); },
                };

                let destroyed = false;
                ui.onUnmount(blockId, () => {
                    if (destroyed) return;
                    destroyed = true;
                    // Dispose the reactive bind controller if it was created.
                    if (_bindController !== null && _bindController !== undefined) {
                        try { _bindController.dispose(); } catch { /* swallow */ }
                    }
                    // Mark as post-unmount so subsequent bind access returns undefined.
                    _bindController = undefined;
                    if (onUnmount) onUnmount(self);
                });

                if (onMount) onMount(self);

                return {
                    get props()      { return self.props; },
                    get blockId()    { return blockId; },
                    get state()      { return self.state; },
                    get scopeClass() { return scopeClass; },

                    update(newProps) {
                        if (destroyed) return;
                        const validated = schema
                            ? _validateProps(schema, newProps, defName)
                            : (newProps || {});
                        // Re-apply `propsFn` on every update - without this,
                        // the DOM bindings on subsequent updates diverge from
                        // the shape the template was originally bound against
                        // (see `tmp/audit/component.md`).
                        const transformed = propsFn ? propsFn(validated) : validated;
                        self.prevRawProps = rawProps;
                        self.prevProps    = props;
                        rawProps          = validated;
                        props             = transformed;
                        self.rawProps     = rawProps;
                        self.props        = props;
                        if (onUpdate) onUpdate(self, self.prevProps);
                    },

                    destroy() {
                        if (destroyed) return;
                        ui.clear(blockId);
                    },

                    get(lid)        { return self.get(lid); },
                    text(...args)   { return self.text(...args); },
                    attr(...args)   { return self.attr(...args); },
                    on(...args)     { return self.on(...args); },
                };
            };
        }

        return /** @type {ComponentAPI} */ (/** @type {any} */ ({ define }));
    },
};
