// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

'use strict';

/**
 * sanity/community — community-friendly / degraded sanity layer (explicit-call
 * ES module).
 *
 * Drop-in for mainstream tooling (Next.js, Astro, Vite, webpack) with no
 * special configuration. A subset of `base.js` that omits the lockdowns
 * incompatible with framework runtimes (frozen prototypes, history blocking,
 * performance APIs, crypto.randomUUID, innerHTML redirect, JSON restriction,
 * Date.now rounding, Math.random blocking). For untrusted-code or
 * hostile-environment hardening use `base.js` instead.
 *
 * **Explicit-call contract.** Importing this module does nothing: it declares
 * no top-level side effect and touches no global at evaluation time. The realm
 * is hardened only when {@link applyCommunity} is called — mirroring
 * `base.js`'s `applyBase()` and `lockdown.js`'s `lockdown()`.
 *
 * ```js
 * import { applyCommunity } from '@awacloud/fw/sanity/community';
 * applyCommunity();   // must run before any application code
 * ```
 *
 * **Dual delivery.** Zero-bundler pages that cannot call an export load the
 * built classic artifact instead, which self-applies on load:
 *
 * ```html
 * <script src="/node_modules/@awacloud/fw/dist/build/sanity-community-classic.min.js"></script>
 * ```
 *
 * exposed as the package subpath `@awacloud/fw/sanity/community.classic`. Both
 * variants are emitted from THIS file — it is the single source of truth.
 *
 * Retained hardening:
 *   - Blocks window `eval`, `alert`, `confirm`, `prompt`, `open` (XSS / dialogs)
 *   - Blocks document injection APIs: `write`, `writeln`, `open`, `close`,
 *     `execCommand`, `execScript`, `evaluate`, `createContextualFragment`
 *   - Blocks Element.prototype `setHTML`, `evaluate`
 *   - Blocks `document.domain` set
 *   - Wraps timing functions to reject string callbacks (string-eval XSS)
 *   - Blocks dangerous element src/srcdoc/… setters (iframe/object/embed)
 *   - Shims `window.debugger` and limits `Error.stackTraceLimit`
 *
 * Browser-only: outside a `window` + `document` realm `applyCommunity()`
 * reports `{ applied: false, reason: 'non-browser-realm' }` rather than
 * silently no-op'ing. Idempotent: a second call reports `'already-applied'`.
 *
 * Unlike `base.js` this tier has no `freezePrototypes` pass, so its step list
 * carries no ordering constraint.
 *
 * Cross-reference: `base.js` for the full strict lockdown.
 *
 * @module sanity/community
 */

const BLOCKED_MESSAGE = 'not allowed';
const LOG_ATTEMPTS = true;
const STACK_TRACE_LIMIT = 10;

// KEEP: XSS / unwanted-dialog hardening; frameworks don't use these at runtime.
// DROP: Function, import, importScripts, Reflect (bundler runtimes rely on these).
const BLOCKED_WINDOW_APIS = [
    'eval', 'alert', 'confirm', 'prompt', 'open'
];

// KEEP: document.write-style injection; not used by Next/Astro hydration.
// DROP: implementation (some libs read it; low XSS value).
const BLOCKED_DOCUMENT_APIS = [
    'write', 'writeln', 'open', 'close', 'execCommand', 'execScript', 'evaluate', 'createContextualFragment'
];

// KEEP: harmless to frameworks.
const BLOCKED_ELEMENT_APIS = ['setHTML', 'evaluate'];

const DANGEROUS_ELEMENT_PROPERTIES = [
    'src', 'srcdoc', 'data', 'href', 'innerHTML', 'codebase', 'archive'
];

/** Module-level idempotence guard, mirroring lockdown.js's `_lockedDown`. */
let _applied = false;

function logAttempt(api, operation) {
    if (LOG_ATTEMPTS) {
        const stack = new Error().stack;
        console.warn(`[SECURITY] Blocked ${operation} on ${api}`, stack);
    }
}

function blockPropertyAccess(obj, propertyNames, objName = 'object') {
    if (!obj) return;
    propertyNames.forEach(propertyName => {
        try {
            const descriptor = Object.getOwnPropertyDescriptor(obj, propertyName);
            Object.defineProperty(obj, propertyName, {
                set: function (value) {
                    logAttempt(`${objName}.${propertyName}`, 'set');
                    throw new Error(BLOCKED_MESSAGE);
                },
                get: function () {
                    logAttempt(`${objName}.${propertyName}`, 'get');
                    return function () {
                        throw new Error(BLOCKED_MESSAGE);
                    };
                },
                configurable: false,
                enumerable: descriptor ? descriptor.enumerable : false
            });
        } catch (e) {
            console.warn(`Cannot block ${objName}.${propertyName}:`, e.message);
        }
    });
}

function wrapTimingFunctions() {
    const originalSetTimeout = window.setTimeout;
    const originalSetInterval = window.setInterval;
    const originalRequestAnimationFrame = window.requestAnimationFrame;

    window.setTimeout = function (callback, delay, ...args) {
        if (typeof callback === 'string') {
            logAttempt('setTimeout', 'string execution');
            throw new Error(BLOCKED_MESSAGE);
        }
        return originalSetTimeout.call(this, callback, delay, ...args);
    };

    window.setInterval = function (callback, delay, ...args) {
        if (typeof callback === 'string') {
            logAttempt('setInterval', 'string execution');
            throw new Error(BLOCKED_MESSAGE);
        }
        return originalSetInterval.call(this, callback, delay, ...args);
    };

    window.requestAnimationFrame = function (callback) {
        if (typeof callback === 'string') {
            logAttempt('requestAnimationFrame', 'string execution');
            return;
        }
        return originalRequestAnimationFrame.call(this, callback);
    };
}

function blockDangerousElements() {
    // The tag→constructor table is built HERE, not at module scope: it
    // references HTMLIFrameElement/HTMLObjectElement/HTMLEmbedElement, which do
    // not exist in a non-browser realm. At module scope it would throw a
    // ReferenceError on bare import and destroy the inert-import contract.
    const DANGEROUS_ELEMENT_TAGS = {
        'iframe': HTMLIFrameElement,
        'object': HTMLObjectElement,
        'embed': HTMLEmbedElement
    };

    Object.entries(DANGEROUS_ELEMENT_TAGS).forEach(([tag, ElementClass]) => {
        if (!ElementClass || !ElementClass.prototype) return;

        DANGEROUS_ELEMENT_PROPERTIES.forEach(prop => {
            try {
                Object.defineProperty(ElementClass.prototype, prop, {
                    set: function (value) {
                        logAttempt(`${tag}.${prop}`, 'set');
                        throw new Error(BLOCKED_MESSAGE);
                    }
                });
            } catch (e) {
                console.warn(`Cannot block ${tag}.${prop}:`, e.message);
            }
        });
    });
}

function disableDebugger() {
    // Block debugger statement (can't fully prevent, but log it)
    // @ts-ignore - window.debugger is a non-standard V8/Chrome extension
    window.debugger = function () {
        logAttempt('debugger', 'statement');
    };

    // Limit stack traces
    // @ts-ignore - Error.stackTraceLimit is a non-standard V8/Chrome extension
    if (Error.stackTraceLimit) {
        // @ts-ignore - Error.stackTraceLimit is a non-standard V8/Chrome extension
        Error.stackTraceLimit = STACK_TRACE_LIMIT;
    }
}

/**
 * Apply the degraded `community` sanity layer to the current realm.
 *
 * Same contract as `applyBase()`: browser-only, idempotent, returns a step
 * report. Must be called before any application code — every guarantee is
 * positional.
 *
 * @returns {{applied: boolean, reason?: string, steps: string[]}} report of what was applied
 */
export function applyCommunity() {
    if (_applied) return { applied: false, reason: 'already-applied', steps: [] };
    if (typeof window === 'undefined' || typeof document === 'undefined') {
        return { applied: false, reason: 'non-browser-realm', steps: [] };
    }
    _applied = true;

    /** @type {string[]} */
    const steps = [];

    // Block window APIs (eval, alert, confirm, prompt, open).
    blockPropertyAccess(window, BLOCKED_WINDOW_APIS, 'window'); steps.push('window');

    // Block document injection APIs.
    blockPropertyAccess(document, BLOCKED_DOCUMENT_APIS, 'document'); steps.push('document');

    // Block Element.prototype dangerous APIs.
    blockPropertyAccess(Element.prototype, BLOCKED_ELEMENT_APIS, 'Element.prototype'); steps.push('Element.prototype');

    // Block document.domain set.
    try {
        Object.defineProperty(document, 'domain', {
            set: function (value) {
                logAttempt('document.domain', 'set');
                throw new Error(BLOCKED_MESSAGE);
            },
            configurable: false
        });
        steps.push('document.domain');
    } catch (e) {
        console.warn('Cannot block document.domain:', e.message);
    }

    // KEEP: pure string-eval XSS; frameworks always pass functions.
    wrapTimingFunctions(); steps.push('wrapTimingFunctions');

    // KEEP: retained XSS hardening for dangerous element src/srcdoc injection.
    blockDangerousElements(); steps.push('blockDangerousElements');

    // KEEP: harmless debugger shim.
    disableDebugger(); steps.push('disableDebugger');

    // DROPPED from base.js:
    //   - freezePrototypes()              → breaks framework hydration/instanceof/subclassing
    //   - blockPropertyAccess(history, …) → breaks Next <Link> / Astro SPA navigation
    //   - blockPropertyAccess(performance, …) → React scheduler & framework perf marks depend on these
    //   - blockPropertyAccess(crypto, …)  → used by some libs/frameworks
    //   - redirectPropertySetter(innerHTML→innerText) → corrupts hydration / dangerouslySetInnerHTML
    //   - blockJSONParsing()              → framework data serialization uses JSON heavily
    //   - blockPerformanceAPIs()          → coarse Date.now breaks timing/animation/scheduler
    //   - blockMathRandom()               → countless libs call Math.random

    return { applied: true, steps };
}
