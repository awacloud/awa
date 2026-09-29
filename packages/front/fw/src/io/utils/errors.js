// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview Error-handling primitives - exception boundaries for UI
 * blocks and a structured logger.
 *
 * **Scope.** This module targets **fw standalone consumers**. Apps running
 * under sde/sdc replace these with the host's richer reporting (logger →
 * service workers + remote sink, boundaries → host error overlay). When
 * building on fw alone, this module gives a minimal floor : structured
 * console output and a guarded execution wrapper.
 *
 * @example
 *   const errs = runtime.resolve('errors');
 *   const log  = errs.logger({ level: 'info', prefix: 'auth' });
 *   log.info('login ok', { user: 'alice' });
 *
 *   const guarded = errs.guard({
 *       onError: (err, ctx) => log.error('render failed', { err: err.message, ctx }),
 *   });
 *   guarded(() => render.full(items));
 *
 *   // Block-level boundary tied to a uiSession :
 *   const boundary = errs.boundary(ui, 'panel', {
 *       fallback: 'Something went wrong - refresh',
 *       onError: (err) => log.error(err.message),
 *   });
 *   boundary(() => mountComplexThing(ui));
 *
 * @typedef {Object} LogRecord
 * @property {string} level   - Severity name ('debug'|'info'|'warn'|'error').
 * @property {string} prefix  - Tag prepended to the message (may be empty).
 * @property {number} time    - Milliseconds since epoch (Date.now()).
 * @property {string} message - The log message coerced to string.
 * @property {Object} context - Arbitrary structured payload (defaults to {}).
 *
 */

/**
 * Structured logger instance returned by `errors.factory().logger(...)`.
 * @typedef {object} Logger
 * @property {(msg: string, ctx?: object) => void} debug Emit a `debug` record.
 * @property {(msg: string, ctx?: object) => void} info  Emit an `info` record.
 * @property {(msg: string, ctx?: object) => void} warn  Emit a `warn` record.
 * @property {(msg: string, ctx?: object) => void} error Emit an `error` record.
 * @property {(subPrefix: string) => Logger} child Spawn a child logger that appends to the current prefix.
 * @property {string} level Current severity threshold (readable and writable accessor).
 */

/**
 * Public shape returned by `errors.factory()`.
 * @typedef {object} ErrorsAPI
 * @property {(opts?: { level?: ('debug'|'info'|'warn'|'error'|'silent'), prefix?: string, sink?: (record: LogRecord) => void }) => Logger} logger Create a structured logger.
 * @property {(opts?: { onError?: (err: Error, ctx: any) => void, rethrow?: boolean }) => ((fn: Function, ctx?: any) => any)} guard Build a higher-order wrapper that catches sync/async errors.
 * @property {(ui: object, blockId: string, opts?: { onError?: (err: Error) => void, render?: (err: Error, ui: object, blockId: string) => void, fallback?: string, clear?: boolean }) => ((fn: Function) => any)} boundary Construct a UI-block error boundary guard.
 */

export const errors = {
    name: 'errors',
    version: '1.0.0',
    type: 'fw.io.utils',
    dependencies: [],

    /** @returns {ErrorsAPI} */
    factory() {

        // Severity thresholds. Declared INSIDE the factory so that
        // `factory.toString()` shipped to a Worker still recreates the binding
        // (strict factory pattern : no module-scope closures).
        const LEVELS = { debug: 10, info: 20, warn: 30, error: 40, silent: 99 };

        // ── Structured logger ──────────────────────────────────────────────

        /**
         * Create a structured logger. Output goes to `console.<level>` by
         * default ; a custom `sink(record)` can be plugged for testing or
         * for redirection to a transport (only useful in fw standalone -
         * sde/sdc will replace with their own).
         *
         * The returned object exposes `debug`, `info`, `warn`, `error` as
         * methods, a `child(subPrefix)` factory, and a `level` accessor that
         * can be both read and written at runtime to change the threshold.
         *
         * @param {Object} [opts]
         * @param {'debug'|'info'|'warn'|'error'|'silent'} [opts.level='info']
         *   Initial severity threshold ; records below it are dropped.
         * @param {string} [opts.prefix=''] - Prepended in brackets to messages.
         * @param {(record: LogRecord) => void} [opts.sink] - Override default
         *   console output. Receives `{ level, prefix, time, message, context }`.
         * @returns {{
         *   debug: (msg: string, ctx?: object) => void,
         *   info:  (msg: string, ctx?: object) => void,
         *   warn:  (msg: string, ctx?: object) => void,
         *   error: (msg: string, ctx?: object) => void,
         *   child: (subPrefix: string) => object,
         *   level: string
         * }}
         */
        function logger(opts = {}) {
            const prefix = opts.prefix || '';
            let levelName = opts.level && LEVELS[opts.level] !== undefined ? opts.level : 'info';
            let levelNum = LEVELS[levelName];
            const sink = typeof opts.sink === 'function' ? opts.sink : null;

            function _emit(level, message, context) {
                if (LEVELS[level] < levelNum) return;
                const record = {
                    level,
                    prefix,
                    time: Date.now(),
                    message: typeof message === 'string' ? message : String(message),
                    context: (context && typeof context === 'object') ? context : {},
                };
                if (sink) {
                    try { sink(record); } catch { /* never break the caller */ }
                    return;
                }
                // Default sink : `console[level](…)`.
                const tag = prefix ? `[${prefix}]` : '';
                const args = context !== undefined ? [tag, record.message, record.context] : [tag, record.message];
                const fn = (typeof console !== 'undefined' && console[level]) || (typeof console !== 'undefined' && console.log);
                if (fn) try { fn.apply(console, args); } catch { /* swallow */ }
            }

            const api = {
                debug(msg, ctx) { _emit('debug', msg, ctx); },
                info(msg, ctx)  { _emit('info',  msg, ctx); },
                warn(msg, ctx)  { _emit('warn',  msg, ctx); },
                error(msg, ctx) { _emit('error', msg, ctx); },

                /** Spawn a child logger that **appends** to the current prefix. */
                child(subPrefix) {
                    const childPrefix = prefix ? `${prefix}:${subPrefix}` : subPrefix;
                    return logger({ level: levelName, prefix: childPrefix, sink });
                },

                /** Dynamic level setter ; `silent` mutes everything. */
                set level(name) {
                    if (LEVELS[name] !== undefined) {
                        levelName = name;
                        levelNum  = LEVELS[name];
                    }
                },
                get level() { return levelName; },
            };
            return api;
        }

        // ── Guarded execution ───────────────────────────────────────────────

        /**
         * Build a higher-order wrapper that catches sync / async errors.
         *
         * @param {Object} opts
         * @param {(err: Error, ctx: any) => void} [opts.onError] - Called with
         *   the caught error and any contextual data passed via the returned
         *   wrapper's optional second argument.
         * @param {boolean} [opts.rethrow=false] - When `true`, the wrapper
         *   re-throws after `onError` ; default swallows.
         * @returns {(fn: Function, ctx?: any) => any}
         *   A function `guard(fn, ctx)` that calls `fn()`. If `fn` throws or
         *   returns a rejecting Promise, `onError(err, ctx)` fires.
         */
        function guard(opts = {}) {
            const onError = typeof opts.onError === 'function' ? opts.onError : null;
            const rethrow = !!opts.rethrow;

            return function guarded(fn, ctx) {
                if (typeof fn !== 'function')
                    throw new Error('errors.guard: fn must be a function');
                let result;
                try {
                    result = fn();
                } catch (err) {
                    if (onError) { try { onError(err, ctx); } catch { /* never throw inside handler */ } }
                    if (rethrow) throw err;
                    return undefined;
                }
                // Async path : `fn` returned a Promise. Chain a catch.
                if (result && typeof result.then === 'function') {
                    return result.catch((err) => {
                        if (onError) { try { onError(err, ctx); } catch { /* swallow */ } }
                        if (rethrow) throw err;
                        return undefined;
                    });
                }
                return result;
            };
        }

        // ── UI block boundary ───────────────────────────────────────────────

        /**
         * Construct a boundary bound to a uiSession block. When the guarded
         * function throws (sync or async), the boundary :
         *   1. Calls `opts.onError(err)` if provided.
         *   2. Renders the `opts.fallback` text into the block (if the block
         *      exists and `fallback` is a non-empty string), OR calls
         *      `opts.render(err, ui, blockId)` if a custom renderer is given.
         *   3. Optionally clears the block (`opts.clear: true`).
         *
         * The returned function is the guard. It can be reused.
         *
         * @param {Object} ui - A UISession instance (must expose `text`, `get`,
         *   and `clear` methods).
         * @param {string} blockId - Identifier of the target block inside `ui`.
         * @param {Object} [opts]
         * @param {(err: Error) => void} [opts.onError] - Called with the
         *   caught error before fallback rendering. Exceptions thrown by this
         *   callback are swallowed (the boundary must never throw).
         * @param {(err: Error, ui: Object, blockId: string) => void} [opts.render]
         *   Custom error renderer. When provided, supersedes `fallback`.
         * @param {string} [opts.fallback] - Plain-text fallback written into
         *   the block when no `render` is given and the block still exists.
         * @param {boolean} [opts.clear=false] - When true, call `ui.clear(blockId)`
         *   after rendering the fallback.
         * @returns {(fn: Function) => any} Boundary guard ; pass it the
         *   function whose exceptions must be intercepted.
         *
         * @example
         *   const boundary = errs.boundary(ui, 'panel', {
         *       onError: (err) => log.error(err.message),
         *       fallback: 'Unable to load panel.',
         *   });
         *   boundary(() => buildPanel());      // sync
         *   await boundary(async () => fetchAndRender());  // async
         */
        function boundary(ui, blockId, opts = {}) {
            if (!ui || typeof ui.text !== 'function')
                throw new Error('errors.boundary: ui (UISession) is required');
            if (typeof blockId !== 'string')
                throw new Error('errors.boundary: blockId must be a string');

            const onError    = typeof opts.onError === 'function' ? opts.onError : null;
            const renderFn   = typeof opts.render === 'function'  ? opts.render  : null;
            const fallback   = typeof opts.fallback === 'string' ? opts.fallback : null;
            const doClear    = !!opts.clear;

            function handle(err) {
                if (onError) { try { onError(err); } catch { /* swallow */ } }
                try {
                    if (renderFn) {
                        renderFn(err, ui, blockId);
                    } else if (fallback != null) {
                        // Only set text when the block still exists.
                        if (ui.get(blockId)) ui.text(blockId, fallback);
                    }
                    if (doClear) ui.clear(blockId);
                } catch { /* never throw out of the boundary */ }
            }

            return function boundaryGuard(fn) {
                if (typeof fn !== 'function')
                    throw new Error('errors.boundary: fn must be a function');
                let result;
                try { result = fn(); }
                catch (err) { handle(err); return undefined; }
                if (result && typeof result.then === 'function') {
                    return result.catch((err) => { handle(err); return undefined; });
                }
                return result;
            };
        }

        return { logger, guard, boundary };
    },
};
