// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

'use strict';

/**
 * sanity/base — strict browser denylist tier (explicit-call ES module).
 *
 * **Explicit-call contract.** Importing this module does nothing: it declares
 * no top-level side effect and touches no global at evaluation time. The realm
 * is hardened only when {@link applyBase} is called — mirroring
 * `sanity/lockdown.js`'s `lockdown()`. A bare `import '@awacloud/fw/sanity/base'`
 * is therefore INERT in every realm (browser, Worker, SSR prerender, Bun test);
 * consumers must invoke the export.
 *
 * ```js
 * import { applyBase } from '@awacloud/fw/sanity/base';
 * applyBase();   // must run before any application code
 * ```
 *
 * **Dual delivery.** Zero-bundler pages that cannot call an export load the
 * built classic artifact instead, which self-applies on load:
 *
 * ```html
 * <script src="/node_modules/@awacloud/fw/dist/build/sanity-base-classic.min.js"></script>
 * ```
 *
 * exposed as the package subpath `@awacloud/fw/sanity/base.classic`. Both variants
 * are emitted from THIS file — it is the single source of truth for the tier.
 *
 * **Build-time readers.** Two tools parse this file's text, so the module-scope
 * declarations below must keep their exact declaration shape and each appear
 * exactly once: `eslint.config.js` derives its `no-restricted-globals` /
 * `no-restricted-properties` lists from the denylist tables, and the bundler's
 * `--no-sanity-log` flag rewrites the logging switch. Never restate either in a
 * comment — the bundler patch is textual and would rewrite the prose instead.
 *
 * Browser-only: outside a `window` + `document` realm `applyBase()` reports
 * `{ applied: false, reason: 'non-browser-realm' }` rather than silently
 * no-op'ing. Idempotent: a second call reports `'already-applied'`.
 *
 * Cross-reference: `community.js` (degraded, framework-friendly subset),
 * `lockdown.js` (SES-grade integrity tier, composes this one).
 *
 * @module sanity/base
 */

const BLOCKED_MESSAGE = 'not allowed';
const LOG_ATTEMPTS = true;
const STACK_TRACE_LIMIT = 10;
const TIMING_RESOLUTION_CUT = 100; // round to 0.1 seconds

const BLOCKED_WINDOW_APIS = [
    'eval', 'alert', 'confirm', 'prompt', 'Function', 'open', 'import', 'importScripts', 'Reflect'
];
const BLOCKED_DOCUMENT_APIS = [
    'write', 'writeln', 'open', 'close', 'execCommand', 'execScript', 'evaluate', 'implementation', 'createContextualFragment'
];
const BLOCKED_ELEMENT_APIS = ['setHTML', 'evaluate'];

const BLOCKED_HISTORY_APIS = [
    'pushState', 'replaceState', 'go', 'back', 'forward'
];

const BLOCKED_CRYPTO_APIS = [
    'randomUUID'
];

const BLOCKED_PERF_APIS = ['now', 'mark', 'measure', 'getEntries'];

const HTML_PROPERTY_REPLACEMENTS = {
    sources: ['innerHTML', 'outerHTML', 'insertAdjacentHTML'],
    targets: ['innerText', 'outerText', 'insertAdjacentText']
};

const DANGEROUS_ELEMENT_PROPERTIES = [
    'src', 'srcdoc', 'data',  'href', 'innerHTML', 'codebase', 'archive'
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

function redirectPropertySetter(obj, sourceProperties, targetProperties) {
    sourceProperties.forEach((sourceProp, index) => {
        const targetProp = targetProperties[index];
        try {
            Object.defineProperty(obj, sourceProp, {
                set: function (value) {
                    this[targetProp] = value;
                }
            });
        } catch (e) {
            console.warn(`Cannot redirect ${sourceProp}:`, e.message);
        }
    });
}

function freezePrototypes() {
    const prototypes = [
        Object.prototype,
        Array.prototype,
        Function.prototype,
        String.prototype,
        Number.prototype,
        Boolean.prototype,
        Date.prototype,
        RegExp.prototype,
        Error.prototype
    ];

    prototypes.forEach(proto => {
        try {
            // Prevent __proto__ manipulation
            Object.defineProperty(proto, '__proto__', {
                set: function () {
                    logAttempt('prototype.__proto__', 'set');
                    throw new Error(BLOCKED_MESSAGE);
                }
            });

            Object.defineProperty(proto, 'constructor', {
                writable: false,
                configurable: false
            });

            Object.freeze(proto);
        } catch (e) {
            console.warn('Cannot freeze prototype:', e.message);
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

function blockJSONParsing() {
    const originalParse = JSON.parse;
    const originalStringify = JSON.stringify;

    JSON.parse = function (text, reviver) {
        if (reviver) {
            logAttempt('JSON.parse', 'with reviver');
            throw new Error(BLOCKED_MESSAGE);
        }
        return originalParse.call(this, text);
    };

    JSON.stringify = function (value, replacer, space) {
        if (typeof replacer === 'function') {
            logAttempt('JSON.stringify', 'with replacer function');
            throw new Error(BLOCKED_MESSAGE);
        }
        return originalStringify.call(this, value, replacer, space);
    };
    Object.freeze(JSON);
}

function blockDangerousElements() {
    // The tag→constructor table is built HERE, not at module scope: it
    // references HTMLIFrameElement/HTMLObjectElement/HTMLEmbedElement, which do
    // not exist in a non-browser realm. At module scope it would throw a
    // ReferenceError on bare import and destroy the inert-import contract.
    const DANGEROUS_ELEMENT_TAGS = {
        'iframe': HTMLIFrameElement,
        'object': HTMLObjectElement,
        'embed': HTMLEmbedElement,
        // 'script': HTMLScriptElement,
        // 'link': HTMLLinkElement,
        // 'style': HTMLStyleElement
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
    // @ts-ignore - window.debugger and Error.stackTraceLimit are non-standard V8/Chrome extensions
    // @ts-ignore - window.debugger is a non-standard V8/Chrome extension
    window.debugger = function () {
        logAttempt('debugger', 'statement');
    };

    // Limit stack traces
    // @ts-ignore - window.debugger and Error.stackTraceLimit are non-standard V8/Chrome extensions
    if (Error.stackTraceLimit) {
        // @ts-ignore - window.debugger and Error.stackTraceLimit are non-standard V8/Chrome extensions
        Error.stackTraceLimit = STACK_TRACE_LIMIT;
    }
}

function blockPerformanceAPIs() {
    // Block high-resolution timing
    try {
        const originalNow = Date.now;
        Object.defineProperty(Date, 'now', {
            value: function () {
                return Math.floor(originalNow() / TIMING_RESOLUTION_CUT) * TIMING_RESOLUTION_CUT;
            },
            writable: false,
            configurable: false
        });
    } catch (e) {
        console.warn('Cannot modify Date.now:', e.message);
    }
}

function blockMathRandom() {
    // Replace Math.random with blocked version (should use crypto.getRandomValues in production)
    const blockedRandom = function () {
        logAttempt('Math.random', 'call');
        throw new Error(BLOCKED_MESSAGE + ': use crypto.getRandomValues instead');
    };

    try {
        Object.defineProperty(Math, 'random', {
            value: blockedRandom,
            writable: false,
            configurable: false
        });
    } catch (e) {
        console.warn('Cannot block Math.random:', e.message);
    }
}

/**
 * Apply the strict `base` sanity denylist to the current realm.
 *
 * Must be called before any application code — every guarantee is positional:
 * scripts that ran earlier observed an unlocked realm.
 *
 * Browser-only: outside a `window` + `document` realm the call is a no-op
 * reporting `'non-browser-realm'` (SSR prerender of a client component must not
 * crash). Idempotent: a second call is a no-op reporting `'already-applied'`
 * instead of re-poisoning non-configurable slots.
 *
 * The returned `steps` list names each hardening pass in application order.
 * Prototype freezing runs FIRST by design (most critical, and later passes
 * install setters that must survive it).
 *
 * @returns {{applied: boolean, reason?: string, steps: string[]}} report of what was applied
 */
export function applyBase() {
    if (_applied) return { applied: false, reason: 'already-applied', steps: [] };
    if (typeof window === 'undefined' || typeof document === 'undefined') {
        return { applied: false, reason: 'non-browser-realm', steps: [] };
    }
    _applied = true;

    /** @type {string[]} */
    const steps = [];

    // Freeze prototypes first (most critical)
    freezePrototypes(); steps.push('freezePrototypes');

    blockPropertyAccess(window, BLOCKED_WINDOW_APIS, 'window'); steps.push('window');
    blockPropertyAccess(document, BLOCKED_DOCUMENT_APIS, 'document'); steps.push('document');
    blockPropertyAccess(Element.prototype, BLOCKED_ELEMENT_APIS, 'Element.prototype'); steps.push('Element.prototype');

    blockPropertyAccess(window.history, BLOCKED_HISTORY_APIS, 'history'); steps.push('history');

    if (window.performance) {
        blockPropertyAccess(window.performance, BLOCKED_PERF_APIS, 'performance'); steps.push('performance');
    }

    if (window.crypto) {
        blockPropertyAccess(window.crypto, BLOCKED_CRYPTO_APIS, 'crypto'); steps.push('crypto');
    }

    redirectPropertySetter(
        Element.prototype,
        HTML_PROPERTY_REPLACEMENTS.sources,
        HTML_PROPERTY_REPLACEMENTS.targets
    );
    steps.push('htmlRedirect');

    // Block document.domain
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

    // Additional measures
    wrapTimingFunctions(); steps.push('wrapTimingFunctions');
    blockJSONParsing(); steps.push('blockJSONParsing');
    blockDangerousElements(); steps.push('blockDangerousElements');
    disableDebugger(); steps.push('disableDebugger');
    blockPerformanceAPIs(); steps.push('blockPerformanceAPIs');
    blockMathRandom(); steps.push('blockMathRandom');

    return { applied: true, steps };
}
