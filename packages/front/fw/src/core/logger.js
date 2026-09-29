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
 */

/**
 * Create a lightweight in-memory logger and optionally proxy to the real console.
 * Note: In a browser-shaped realm (`window` defined) this replaces
 * `window.console` with a non-modifiable wrapper. Under bare Node or a
 * worker-shaped realm (no `window`), the console Proxy install is SKIPPED —
 * Node's console is non-configurable territory and is never seized; logging
 * still works as a plain passthrough via `globalThis.console`.
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

    const createConsoleProxy = function (target) {
        return new Proxy(target, {
            get: function (obj, prop) {
                const value = obj[prop];
                if (typeof value !== 'function') {
                    return value;
                }
                return function () {
                    const err = new Error().stack;
                    log(String(prop), [...arguments], err);
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
        const currentConsole = createConsoleProxy(consoleHolder);
        Object.defineProperty(window, 'console', {
            value: currentConsole,
            writable: false,
            enumerable: false,
            configurable: false
        });
    }

    return { get, setLen, clear, __push, subscribe };
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

    const createConsoleProxy = function (target) {
        return new Proxy(target, {
            get: function (obj, prop) {
                const value = obj[prop];
                if (typeof value !== 'function') {
                    return value;
                }
                return function () {
                    const err = new Error().stack;
                    log(String(prop), [...arguments], err);
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

    const currentConsole = createConsoleProxy(consoleHolder);
    Object.defineProperty(self, 'console', {
        value: currentConsole,
        writable: false,
        enumerable: false,
        configurable: false
    });

    return {get, setLen, clear, subscribe};
};

const logger = {
    main,
    worker
}

export { logger };
