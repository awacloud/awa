// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// packages/front/fw/src/core/logger.js
/**
 * @typedef {Object} LogEntry
 * @property {number} ts Timestamp (ms).
 * @property {string} lvl Log level (log, info, warn...).
 * @property {any[]} data Logged arguments (serialized).
 * @property {string} [stack] Stack string, if available.
 */

/**
 * @typedef {Object} LoggerAPI
 * @property {function(): LogEntry[]} get
 * @property {function(number): void} setLen
 * @property {function(): void} clear
 * @property {function(LogEntry): void} [__push]
 * @property {function(function): function} subscribe
 * @property {function(boolean=): boolean} native Opt out of the takeover's
 *   printing policy: with `native(true)` every `console` call of the realm
 *   prints as the native console does (in production too, without the
 *   appended stack) and is still recorded; `native(false)` restores the
 *   policy (printed only in dev). Returns `false` when the realm's console
 *   is not an fw console (locked by another script), `true` otherwise.
 */

/**
 * Create a lightweight in-memory logger and optionally proxy to the real console.
 * Note: In a browser-shaped realm (`window` defined) this replaces
 * `window.console` with a non-modifiable wrapper: every call is recorded in
 * the buffer, and printed only when `dev` is true; assigning a console
 * method is refused (a warning). A later call in the same realm (a second
 * fw entry) joins that wrapper — its buffer records the same calls — instead
 * of redefining it; a console another script locked is left alone. Under
 * bare Node or a worker-shaped realm (no `window`), the console Proxy
 * install is SKIPPED — logging still works as a plain passthrough via
 * `globalThis.console`.
 * @param {boolean} dev When true, forward logs to the original console.
 * @returns {LoggerAPI}
 */
const main = function(dev) {
    const hasWindow = typeof window !== 'undefined';
    const consoleHolder = hasWindow ? window.console : globalThis.console;
    const logs = [];
    const MAX_LOGS = 65536;
    let LOGS_LEN = 1024;
    let _subscriber = null;

    /**
     * Clear the in-memory log buffer.
     */
    const clear = function () {
        logs.splice(0);
    };

    /**
     * Set the max size of the in-memory log buffer.
     * @param {number} len
     */
    const setLen = function (len) {
        if (!isNaN(len) && len > 0 && len <= MAX_LOGS) {
            LOGS_LEN = len;
        }
    };

    /**
     * Get a snapshot of current logs.
     * @returns {LogEntry[]}
     */
    const get = function () {
        return logs.slice();
    };

    /**
     * Register a single listener called synchronously after each push.
     * Throws if fn is not a function or a subscriber is already registered.
     * @param {function(LogEntry): void} fn
     * @returns {function(): void} unsubscribe
     */
    const subscribe = function (fn) {
        if (typeof fn !== 'function') {
            throw new Error('logger: fn must be a function');
        }
        if (_subscriber !== null) {
            throw new Error('logger: subscriber already registered');
        }
        _subscriber = fn;
        let active = true;
        return function () {
            if (active) {
                active = false;
                _subscriber = null;
            }
        };
    };

    const _notifySubscriber = function (entry) {
        if (_subscriber !== null) {
            try {
                _subscriber(entry);
            } catch (_) {
                // silence errors to avoid proxy console loop
            }
        }
    };

    const __push = function (entry) {
        logs.push(entry);
        if (logs.length > LOGS_LEN) {
            logs.shift();
        }
        _notifySubscriber(entry);
    };

    /**
     * Append a log entry (and optionally forward to the real console).
     * @param {string} level
     * @param {any[]} data
     * @param {string} [stack]
     */
    const log = function (level, data, stack) {
        const entry = {
            ts: Date.now(), // timestamp
            lvl: level, // level (log, info, warn...)
            data: data,
            stack: stack
        };
        __push(entry);
    };

    const formatStack = function (stack) {
        if (typeof stack !== 'string') {
            return stack;
        }
        if (stack.slice(-1) === '\n') {
            return stack.slice(0, -1).split('\n');
        }
        return stack.split('\n');
    };

    // The loggers fed by an fw console proxy: the one that installed it, then
    // every later fw entry of the same realm, which joins instead of
    // redefining the locked `console` (that threw: "readonly property").
    const SINKS = Symbol.for('@awacloud/fw/console-sinks');
    // The realm's printing mode, shared by every logger fed by the proxy.
    const MODE = Symbol.for('@awacloud/fw/console-mode');

    const createConsoleProxy = function (target) {
        const sinks = [log];
        const mode = { native: false };
        return new Proxy(target, {
            get: function (obj, prop) {
                if (prop === SINKS) return sinks;
                if (prop === MODE) return mode;
                const value = obj[prop];
                if (typeof value !== 'function') {
                    return value;
                }
                return function () {
                    const err = new Error().stack;
                    for (let i = 0; i < sinks.length; i++) sinks[i](String(prop), [...arguments], err);
                    if (mode.native) {
                        return value.apply(obj, arguments);
                    }
                    if (dev) {
                        return value.apply(obj, [...arguments, formatStack(err)]);
                    }
                };
            },
            set: function () {
                console.warn('Attempt to modify console');
                return true;
            }
        });
    };

    if (hasWindow) {
        const joined = consoleHolder && consoleHolder[SINKS];
        if (Array.isArray(joined)) {
            // An fw console already: record through it too.
            joined.push(log);
        } else {
            const desc = Object.getOwnPropertyDescriptor(window, 'console');
            // A console locked by something else is left as it is.
            if (!desc || desc.configurable || desc.writable) {
                const currentConsole = createConsoleProxy(consoleHolder);
                Object.defineProperty(window, 'console', {
                    value: currentConsole,
                    writable: false,
                    enumerable: false,
                    configurable: false
                });
            }
        }
    }

    const native = function (on) {
        const m = hasWindow && window.console ? window.console[MODE] : null;
        if (!m || typeof m !== 'object') return false;
        m.native = on !== false;
        return true;
    };

    return { get, setLen, clear, __push, subscribe, native };
};

/**
 * Create an in-worker logger and proxy `self.console`.
 * Important: This function is stringified via `toString()` before being
 * injected into a Worker, so keep it fully self-contained.
 * @param {boolean} dev When true, forward logs to the original console.
 * @param {MessagePort} port Channel used to forward log entries.
 * @returns {LoggerAPI}
 */
const worker = function(dev, port) {
    const consoleHolder = self.console;
    const logs = [];
    const MAX_LOGS = 65536;
    let LOGS_LEN = 1024;
    let _subscriber = null;

    /**
     * Clear the in-memory log buffer.
     */
    const clear = function () {
        logs.splice(0);
    };

    /**
     * Set the max size of the in-memory log buffer.
     * @param {number} len
     */
    const setLen = function (len) {
        if (!isNaN(len) && len > 0 && len <= MAX_LOGS) {
            LOGS_LEN = len;
        }
    };

    /**
     * Get a snapshot of current logs.
     * @returns {LogEntry[]}
     */
    const get = function () {
        return logs.slice();
    };

    /**
     * Register a single listener called synchronously after each push.
     * Throws if fn is not a function or a subscriber is already registered.
     * @param {function} fn
     * @returns {function} unsubscribe
     */
    const subscribe = function (fn) {
        if (typeof fn !== 'function') {
            throw new Error('logger: fn must be a function');
        }
        if (_subscriber !== null) {
            throw new Error('logger: subscriber already registered');
        }
        _subscriber = fn;
        let active = true;
        return function () {
            if (active) {
                active = false;
                _subscriber = null;
            }
        };
    };

    const _notifySubscriber = function (entry) {
        if (_subscriber !== null) {
            try {
                _subscriber(entry);
            } catch (_) {
                // silence errors to avoid proxy console loop
            }
        }
    };

    /**
     * Serialize any value into a log-friendly structure.
     * Notes:
     * - Preserves basic types and converts special ones (Error, Map, Set, Function, Symbol, BigInt).
     * - Handles circular references by replacing them with "[Circular]".
     * - Returns a plain JSON-compatible structure.
     * @param {any} value
     * @returns {any}
     */
    const serializeLog = function (value) {
        const seen = new WeakSet();
        const normalized = function (val) {
            return JSON.parse(JSON.stringify(val, function (key, v) {
                if (typeof v === 'bigint') {
                    return v.toString() + 'n';
                }
                if (typeof v === 'symbol') {
                    return v.toString();
                }
                if (typeof v === 'function') {
                    return '[Function ' + (v.name || 'anonymous') + ']';
                }
                if (v instanceof Error) {
                    return {
                        name: v.name,
                        message: v.message,
                        stack: v.stack
                    };
                }
                if (v instanceof Map) {
                    return { __type: 'Map', value: Array.from(v.entries()) };
                }
                if (v instanceof Set) {
                    return { __type: 'Set', value: Array.from(v.values()) };
                }
                if (v && typeof v === 'object') {
                    if (seen.has(v)) {
                        return '[Circular]';
                    }
                    seen.add(v);
                }
                return v;
            }));
        };
        try {
            return normalized(value);
        } catch (err) {
            return {
                __type: 'Unserializable',
                message: err && err.message ? err.message : 'serializeLog failed'
            };
        }
    };


    const __push = function (entry) {
        logs.push(entry);
        if (logs.length > LOGS_LEN) {
            logs.shift();
        }
        port.postMessage({
            __fw: true,
            __type: 'log',
            msg: entry
        });
        _notifySubscriber(entry);
    };

    /**
     * Append a log entry (and optionally forward to the real console).
     * @param {string} level
     * @param {any[]} data
     * @param {string} [stack]
     */
    const log = function (level, data, stack) {
        const entry = {
            ts: Date.now(), // timestamp
            lvl: level, // level (log, info, warn...)
            data: serializeLog(data),
            stack: stack,
        };
        __push(entry);
    };

    const formatStack = function (stack) {
        if (typeof stack !== 'string') {
            return stack;
        }
        if (stack.slice(-1) === '\n') {
            return stack.slice(0, -1).split('\n');
        }
        return stack.split('\n');
    };

    // The loggers fed by an fw console proxy: the one that installed it, then
    // every later fw entry of the same realm, which joins instead of
    // redefining the locked `console` (that threw: "readonly property").
    const SINKS = Symbol.for('@awacloud/fw/console-sinks');
    // The realm's printing mode, shared by every logger fed by the proxy.
    const MODE = Symbol.for('@awacloud/fw/console-mode');

    const createConsoleProxy = function (target) {
        const sinks = [log];
        const mode = { native: false };
        return new Proxy(target, {
            get: function (obj, prop) {
                if (prop === SINKS) return sinks;
                if (prop === MODE) return mode;
                const value = obj[prop];
                if (typeof value !== 'function') {
                    return value;
                }
                return function () {
                    const err = new Error().stack;
                    for (let i = 0; i < sinks.length; i++) sinks[i](String(prop), [...arguments], err);
                    if (mode.native) {
                        return value.apply(obj, arguments);
                    }
                    if (dev) {
                        return value.apply(obj, [...arguments, formatStack(err)]);
                    }
                };
            },
            set: function () {
                console.warn('Attempt to modify console');
                return true;
            }
        });
    };

    const joined = consoleHolder && consoleHolder[SINKS];
    if (Array.isArray(joined)) {
        // An fw console already (a second logger in this worker): record through it too.
        joined.push(log);
    } else {
        const desc = Object.getOwnPropertyDescriptor(self, 'console');
        // A console locked by something else is left as it is.
        if (!desc || desc.configurable || desc.writable) {
            const currentConsole = createConsoleProxy(consoleHolder);
            Object.defineProperty(self, 'console', {
                value: currentConsole,
                writable: false,
                enumerable: false,
                configurable: false
            });
        }
    }

    const native = function (on) {
        const m = self.console ? self.console[MODE] : null;
        if (!m || typeof m !== 'object') return false;
        m.native = on !== false;
        return true;
    };

    return {get, setLen, clear, subscribe, native};
};

const logger = {
    main,
    worker
}

export { logger };
