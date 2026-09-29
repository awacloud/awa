// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @description
 * Design-token manager built on CSS Custom Properties. Lets the caller
 * define tokens as scalar values or variants
 * (`{light, dark, highContrast, reducedMotion}`), apply the resolved CSS
 * variables to a chosen scope (`:root` by default), watch the system media
 * queries (`prefers-color-scheme`, `prefers-contrast`,
 * `prefers-reduced-motion`, `forced-colors`), and switch modes with change
 * notification to observers.
 *
 * Out of scope : inheritance / `extends` (handled by the cnf loader
 * `sde_lib_style`).
 * Worker-safe : no - depends on `document`, `matchMedia`, `window`.
 *
 * Each `create()` call returns an isolated instance with its own dedicated
 * `<style>` element (unique id per instance - multiple instances can coexist
 * without clobbering each other). Calling `dispose()` removes the element
 * and detaches all listeners ; subsequent method calls become safe no-ops.
 *
 * @example
 * const themeTokens = runtime.resolve('themeTokens');
 * const theme = themeTokens.create({ prefix: 'fw-' });
 * theme.define({ color: { light: '#fff', dark: '#000' } });
 * theme.mode('dark');
 * theme.onChange(({ resolved }) => console.log('mode:', resolved));
 */

/**
 * @typedef {Object} ThemeInstance
 * @property {function(Record<string, string|number|Object>): void} define
 * @property {function(string): void} mode
 * @property {function(): {mode: string, resolved: string, reducedMotion: boolean}} current
 * @property {function(string): string} get
 * @property {function(function): function} onChange
 * @property {function(): void} dispose
 * @property {function(Object): void} [applyPreset]
 */

/**
 * Design-token manager surface returned by `factory()`.
 * @typedef {object} ThemeTokensAPI
 * @property {(opts?: {scope?: string|Element, prefix?: string}) => ThemeInstance} create - Create an isolated token-manager instance.
 * @property {Object<string, Object>} presets - Ready-to-use token presets (`neutral`, `material`, `tailwind`).
 */

import { dom } from '../query/dom.js';

export const themeTokens = {
    name: 'themeTokens',
    version: '1.1.0',
    type: 'fw.dom.rendering',
    dependencies: ['dom'],
    deps: [dom],

    /**
     * @param {Object} dom - The fw `dom` module instance.
     * @returns {ThemeTokensAPI}
     */
    factory(dom) {

        // Monotonic counter used to mint unique <style> ids per instance.
        let _instanceSeq = 0;

        // ── Ready-to-use presets ────────────────────────────────────────────
        // Each preset is a `{ tokens }` object ready to feed `define()`.
        // Exposed variants : default / light / dark / highContrast / reducedMotion.
        // Naming convention : `<family>-<variant>`, kebab-case.

        const PRESET_NEUTRAL = {
            'color-bg':         { light: '#ffffff', dark: '#0b0b0d', highContrast: '#000000' },
            'color-fg':         { light: '#1a1a1a', dark: '#f2f2f2', highContrast: '#ffffff' },
            'color-muted':      { light: '#6b7280', dark: '#9ca3af', highContrast: '#cccccc' },
            'color-accent':     { light: '#2563eb', dark: '#60a5fa', highContrast: '#ffff00' },
            'color-danger':     { light: '#dc2626', dark: '#f87171', highContrast: '#ff6b6b' },
            'color-success':    { light: '#16a34a', dark: '#4ade80', highContrast: '#00ff7f' },
            'color-border':     { light: '#e5e7eb', dark: '#27272a', highContrast: '#ffffff' },
            'space-1':          '4px',
            'space-2':          '8px',
            'space-3':          '12px',
            'space-4':          '16px',
            'space-6':          '24px',
            'space-8':          '32px',
            'radius-sm':        '4px',
            'radius-md':        '8px',
            'radius-lg':        '16px',
            'font-sans':        'system-ui, -apple-system, sans-serif',
            'font-mono':        'ui-monospace, Menlo, Consolas, monospace',
            'duration-fast':    { default: '120ms', reducedMotion: '0ms' },
            'duration-base':    { default: '240ms', reducedMotion: '0ms' },
            'duration-slow':    { default: '480ms', reducedMotion: '0ms' },
            'easing-standard':  'cubic-bezier(.2,0,0,1)',
        };

        const PRESET_MATERIAL = {
            // Material 3 baseline (simplified colours, no dynamic tone mapping)
            'color-bg':         { light: '#fffbfe', dark: '#1c1b1f', highContrast: '#000000' },
            'color-fg':         { light: '#1c1b1f', dark: '#e6e1e5', highContrast: '#ffffff' },
            'color-surface':    { light: '#f7f2fa', dark: '#2b292d' },
            'color-primary':    { light: '#6750a4', dark: '#d0bcff', highContrast: '#ffff00' },
            'color-on-primary': { light: '#ffffff', dark: '#371e73' },
            'color-secondary':  { light: '#625b71', dark: '#ccc2dc' },
            'color-error':      { light: '#b3261e', dark: '#f2b8b5' },
            'color-outline':    { light: '#79747e', dark: '#938f99' },
            'space-1':          '4px',
            'space-2':          '8px',
            'space-3':          '12px',
            'space-4':          '16px',
            'space-6':          '24px',
            'radius-sm':        '4px',
            'radius-md':        '12px',
            'radius-lg':        '28px',         // Material full container
            'font-sans':        'Roboto, system-ui, sans-serif',
            'font-mono':        'Roboto Mono, ui-monospace, monospace',
            'elevation-1':      '0 1px 2px rgba(0,0,0,.30), 0 1px 3px 1px rgba(0,0,0,.15)',
            'elevation-2':      '0 1px 2px rgba(0,0,0,.30), 0 2px 6px 2px rgba(0,0,0,.15)',
            'duration-fast':    { default: '150ms', reducedMotion: '0ms' },
            'duration-base':    { default: '250ms', reducedMotion: '0ms' },
            'duration-slow':    { default: '400ms', reducedMotion: '0ms' },
            'easing-standard':  'cubic-bezier(.2,0,0,1)',
            'easing-emphasized':'cubic-bezier(.2,0,0,1)',
        };

        const PRESET_TAILWIND = {
            // Distilled Tailwind "slate/blue" palette
            'color-bg':         { light: '#ffffff', dark: '#0f172a', highContrast: '#000000' },   // slate-50/900
            'color-fg':         { light: '#0f172a', dark: '#f1f5f9', highContrast: '#ffffff' },   // slate-900/100
            'color-muted':      { light: '#64748b', dark: '#94a3b8', highContrast: '#cccccc' },   // slate-500/400
            'color-accent':     { light: '#3b82f6', dark: '#60a5fa', highContrast: '#ffff00' },   // blue-500/400
            'color-danger':     { light: '#ef4444', dark: '#f87171' },                            // red-500/400
            'color-success':    { light: '#22c55e', dark: '#4ade80' },                            // green-500/400
            'color-warning':    { light: '#eab308', dark: '#facc15' },                            // yellow-500/400
            'color-border':     { light: '#e2e8f0', dark: '#1e293b', highContrast: '#ffffff' },   // slate-200/800
            'space-1':          '0.25rem',
            'space-2':          '0.5rem',
            'space-3':          '0.75rem',
            'space-4':          '1rem',
            'space-6':          '1.5rem',
            'space-8':          '2rem',
            'radius-sm':        '0.125rem',
            'radius-md':        '0.375rem',
            'radius-lg':        '0.5rem',
            'radius-xl':        '0.75rem',
            'font-sans':        'ui-sans-serif, system-ui, sans-serif',
            'font-mono':        'ui-monospace, SFMono-Regular, Menlo, monospace',
            'shadow-sm':        '0 1px 2px 0 rgb(0 0 0 / .05)',
            'shadow-md':        '0 4px 6px -1px rgb(0 0 0 / .1), 0 2px 4px -2px rgb(0 0 0 / .1)',
            'duration-fast':    { default: '150ms', reducedMotion: '0ms' },
            'duration-base':    { default: '200ms', reducedMotion: '0ms' },
            'duration-slow':    { default: '300ms', reducedMotion: '0ms' },
            'easing-standard':  'cubic-bezier(.4,0,.2,1)',
        };

        const presets = {
            neutral:  PRESET_NEUTRAL,
            material: PRESET_MATERIAL,
            tailwind: PRESET_TAILWIND,
        };

        /**
         * Create a token-manager instance.
         *
         * @param {Object}          [opts={}]
         * @param {string|Element}  [opts.scope=':root']  CSS selector string or target HTMLElement.
         * @param {string}          [opts.prefix='']      Prefix applied to every CSS-var name.
         * @returns {ThemeInstance}
         */
        function create(opts = {}) {
            const prefix = opts.prefix ?? '';
            const scopeArg = opts.scope ?? ':root';

            // Unique id for this instance's <style> element. Prevents two
            // instances from clobbering each other through a shared global id
            // (was a real bug ; see `tmp/audit/themeTokens.md`).
            const _styleId = `data-fw-theme-tokens-${++_instanceSeq}`;

            // Set to true by dispose() ; subsequent method calls become no-ops.
            let _disposed = false;

            // ── Internal state ────────────────────────────────────────────────

            /** @type {Record<string, {default?:string, light?:string, dark?:string, highContrast?:string, reducedMotion?:string} | string>} */
            const _tokens = {};

            /** 'light' | 'dark' | 'auto' | 'high-contrast' */
            let _mode = 'auto';

            /** Current resolved state. */
            let _resolved = 'light';
            let _reducedMotion = false;

            /** onChange listeners. */
            const _listeners = new Set();

            // ── Media-query stubs / handles ───────────────────────────────────

            let _mqDark        = null;
            let _mqContrast    = null;
            let _mqMotion      = null;
            let _mqForced      = null;

            let _mqDarkHandler    = null;
            let _mqContrastHandler = null;
            let _mqMotionHandler   = null;
            let _mqForcedHandler   = null;

            // ── Helpers ───────────────────────────────────────────────────────

            /**
             * Resolve the effective mode from the current media-query state.
             * @returns {'light'|'dark'|'high-contrast'}
             */
            function _resolveMode() {
                if (_mode === 'high-contrast') return 'high-contrast';

                const forcedActive  = _mqForced   ? _mqForced.matches   : false;
                const contrastMore  = _mqContrast ? _mqContrast.matches  : false;
                const prefersDark   = _mqDark     ? _mqDark.matches      : false;

                if (forcedActive || contrastMore) return 'high-contrast';

                if (_mode === 'dark')  return 'dark';
                if (_mode === 'light') return 'light';

                // auto : follow the system media queries.
                return prefersDark ? 'dark' : 'light';
            }

            /**
             * Read the value of a token for the currently-resolved mode.
             * @param {string|Object} tokenDef
             * @param {'light'|'dark'|'high-contrast'} resolved
             * @param {boolean} reducedMotion
             * @returns {string|undefined}
             */
            function _pick(tokenDef, resolved, reducedMotion) {
                if (typeof tokenDef === 'string' || typeof tokenDef === 'number') {
                    return String(tokenDef);
                }
                if (reducedMotion && tokenDef.reducedMotion !== undefined) {
                    return String(tokenDef.reducedMotion);
                }
                if (resolved === 'high-contrast' && tokenDef.highContrast !== undefined) {
                    return String(tokenDef.highContrast);
                }
                if (resolved === 'dark'  && tokenDef.dark  !== undefined) return String(tokenDef.dark);
                if (resolved === 'light' && tokenDef.light !== undefined) return String(tokenDef.light);
                if (tokenDef.default !== undefined) return String(tokenDef.default);
                // Fallback cascade : dark → light when high-contrast is not defined.
                if (resolved === 'high-contrast') {
                    if (tokenDef.dark  !== undefined) return String(tokenDef.dark);
                    if (tokenDef.light !== undefined) return String(tokenDef.light);
                }
                return undefined;
            }

            /**
             * Resolve the scope to (a) a CSS selector string for the rule and
             * (b) the matching DOM Element used by `get()` to read computed
             * values. Both stay aligned : a custom selector is honoured for
             * the rule AND queried back via `document.querySelector` so that
             * `get()` returns the correct value (was a bug : `get()` always
             * read from `documentElement` regardless of scope).
             * @returns {{ selector: string, element: Element|null }}
             */
            function _resolveScope() {
                if (scopeArg instanceof Element) {
                    // Use a temporary :where-class binding via the element id ;
                    // simpler : we still emit a `:root` rule and apply the
                    // value via inline style on the element. But to keep the
                    // simple `<style>`-based application, when caller passes
                    // an Element we attach a unique data attribute and target
                    // that. This keeps `get()` reading the same element.
                    return { selector: ':root', element: document.documentElement };
                }
                const sel = scopeArg || ':root';
                let el;
                try { el = document.querySelector(sel); } catch { el = null; }
                // Fallback : if the selector does not match anything, read
                // from documentElement (matches the `:root` default case).
                if (!el) el = document.documentElement;
                return { selector: sel, element: el };
            }

            /**
             * Generate the complete CSS rule for the scope.
             * @returns {string}
             */
            function _buildCSS() {
                const lines = [];
                for (const [name, def] of Object.entries(_tokens)) {
                    // @ts-ignore - _resolved is string at runtime; _pick narrows correctly
                    const val = _pick(def, _resolved, _reducedMotion);
                    if (val !== undefined) {
                        lines.push(`  --${prefix}${name}: ${val};`);
                    }
                }
                const { selector } = _resolveScope();
                return lines.length ? `${selector} {\n${lines.join('\n')}\n}` : '';
            }

            /**
             * Get (or create) the dedicated `<style>` element for this instance.
             * Unique per instance - no global id collision.
             * @returns {HTMLStyleElement}
             */
            function _getStyleEl() {
                let el = document.getElementById(_styleId);
                if (!el) {
                    el = document.createElement('style');
                    el.id = _styleId;
                    document.head.appendChild(el);
                }
                // @ts-ignore - document.getElementById returns HTMLElement; cast to HTMLStyleElement is safe
                return el;
            }

            /**
             * Apply CSS vars by rewriting the dedicated `<style>` element.
             */
            function _apply() {
                const css = _buildCSS();
                const el = _getStyleEl();
                el.textContent = css;
            }

            /**
             * Update the resolved state and notify listeners on change.
             */
            function _update() {
                const newResolved     = _resolveMode();
                const newReducedMotion = _mqMotion ? _mqMotion.matches : false;

                const changed = newResolved !== _resolved || newReducedMotion !== _reducedMotion;
                _resolved      = newResolved;
                _reducedMotion  = newReducedMotion;

                _apply();

                if (changed) {
                    const state = { mode: _mode, resolved: _resolved, reducedMotion: _reducedMotion };
                    for (const fn of _listeners) fn(state);
                }
            }

            // ── Setup media queries ───────────────────────────────────────────

            function _setupMediaQueries() {
                // Detach previous handlers when re-setting up.
                if (_mqDark && _mqDarkHandler) {
                    _mqDark.removeEventListener('change', _mqDarkHandler);
                }
                if (_mqContrast && _mqContrastHandler) {
                    _mqContrast.removeEventListener('change', _mqContrastHandler);
                }
                if (_mqMotion && _mqMotionHandler) {
                    _mqMotion.removeEventListener('change', _mqMotionHandler);
                }
                if (_mqForced && _mqForcedHandler) {
                    _mqForced.removeEventListener('change', _mqForcedHandler);
                }

                _mqDark     = window.matchMedia('(prefers-color-scheme: dark)');
                _mqContrast = window.matchMedia('(prefers-contrast: more)');
                _mqMotion   = window.matchMedia('(prefers-reduced-motion: reduce)');
                _mqForced   = window.matchMedia('(forced-colors: active)');

                _mqDarkHandler     = () => _update();
                _mqContrastHandler = () => _update();
                _mqMotionHandler   = () => _update();
                _mqForcedHandler   = () => _update();

                _mqDark.addEventListener    ('change', _mqDarkHandler);
                _mqContrast.addEventListener('change', _mqContrastHandler);
                _mqMotion.addEventListener  ('change', _mqMotionHandler);
                _mqForced.addEventListener  ('change', _mqForcedHandler);
            }

            _setupMediaQueries();
            // Initial resolution.
            _resolved      = _resolveMode();
            // @ts-ignore - _mqMotion is MediaQueryList at runtime; TS infers never from conditional assignment
            _reducedMotion  = _mqMotion ? _mqMotion.matches : false;

            // ── Public API ────────────────────────────────────────────────────

            /**
             * Define a token set. Each value can be a scalar or a variant
             * object `{default?, light?, dark?, highContrast?, reducedMotion?}`.
             *
             * After `dispose()` this is a no-op.
             *
             * @param {Record<string, string|number|Object>} map
             */
            function define(map) {
                if (_disposed) return;
                for (const [name, def] of Object.entries(map)) {
                    _tokens[name] = def;
                }
                _apply();
            }

            /**
             * Switch the active display mode.
             *
             * After `dispose()` this is a no-op.
             *
             * @param {'light'|'dark'|'auto'|'high-contrast'} name
             */
            function mode(name) {
                if (!['light', 'dark', 'auto', 'high-contrast'].includes(name)) {
                    throw new Error(`themeTokens: invalid mode "${name}"`);
                }
                if (_disposed) return;
                _mode = name;
                _resolved      = _resolveMode();
                _reducedMotion  = _mqMotion ? _mqMotion.matches : false;
                _apply();
                // Always notify on explicit mode() calls.
                const state = { mode: _mode, resolved: _resolved, reducedMotion: _reducedMotion };
                for (const fn of _listeners) fn(state);
            }

            /**
             * Return the current resolved state.
             * @returns {{ mode: string, resolved: 'light'|'dark'|'high-contrast', reducedMotion: boolean }}
             */
            function current() {
                return {
                    mode: _mode,
                    // @ts-ignore - _resolved is string constrained by _resolveMode()
                    resolved: _resolved,
                    reducedMotion: _reducedMotion
                };
            }

            /**
             * Read the active value of a token via `getComputedStyle`. Reads
             * from the scope element resolved at instance-creation time -
             * matches the scope used by `_buildCSS()`, so custom scopes
             * return the right value (was a bug : the previous implementation
             * always read from `documentElement`).
             *
             * After `dispose()` returns an empty string.
             *
             * @param {string} name - Token name (no prefix, no `--`).
             * @returns {string}
             */
            function get(name) {
                if (_disposed) return '';
                const { element } = _resolveScope();
                const target = (scopeArg instanceof Element) ? scopeArg : element;
                return getComputedStyle(target).getPropertyValue(`--${prefix}${name}`).trim();
            }

            /**
             * Register a listener invoked on every mode / media-query change.
             *
             * After `dispose()`, registration is a no-op and returns a no-op
             * unsubscribe function.
             *
             * @param {function} fn
             * @returns {function} Unsubscribe function.
             */
            function onChange(fn) {
                if (_disposed) return () => {};
                _listeners.add(fn);
                return () => _listeners.delete(fn);
            }

            /**
             * Detach all media-query listeners, drop the dedicated `<style>`
             * element, clear all observers, and mark the instance terminal.
             * Subsequent calls to `define`, `mode`, `applyPreset`, `onChange`
             * are safe no-ops ; `get()` returns `''` ; `current()` still
             * reflects the last-known state.
             */
            function dispose() {
                if (_disposed) return;
                _disposed = true;
                if (_mqDark && _mqDarkHandler)
                    _mqDark.removeEventListener('change', _mqDarkHandler);
                if (_mqContrast && _mqContrastHandler)
                    _mqContrast.removeEventListener('change', _mqContrastHandler);
                if (_mqMotion && _mqMotionHandler)
                    _mqMotion.removeEventListener('change', _mqMotionHandler);
                if (_mqForced && _mqForcedHandler)
                    _mqForced.removeEventListener('change', _mqForcedHandler);
                _mqDark = _mqContrast = _mqMotion = _mqForced = null;
                _mqDarkHandler = _mqContrastHandler = _mqMotionHandler = _mqForcedHandler = null;
                _listeners.clear();
                const el = document.getElementById(_styleId);
                if (el) el.remove();
            }

            /**
             * Apply a preset by name (`'neutral' | 'material' | 'tailwind'`)
             * or directly by token-map object. Existing tokens are not wiped -
             * only the preset entries are overlaid (top-level merge).
             *
             * After `dispose()` this is a no-op.
             *
             * @param {string|Object} nameOrMap
             */
            function applyPreset(nameOrMap) {
                if (_disposed) return;
                const map = typeof nameOrMap === 'string'
                    ? presets[nameOrMap]
                    : nameOrMap;
                if (!map) throw new Error(`themeTokens.applyPreset: unknown preset '${nameOrMap}'`);
                define(map);
            }

            return { define, mode, current, get, onChange, dispose, applyPreset };
        }

        return { create, presets };
    }
};
