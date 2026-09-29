// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// packages/front/fw/src/core/readyState.js
/**
 * Create a tiny DOM ready-state helper with queued callbacks.
 * @returns {{loaded: (fn: Function, argArray?: any[]) => void, complete: (fn: Function, argArray?: any[]) => void}}
 */
export function readyState() {
    const store = {
        /** @type {string|false} */
        status: false,
        interactive: false,
        complete: false,
        queue: {
            interactive: [],
            complete: []
        }
    };

    /**
     * Safely call a function with args.
     * @param {Function} fn
     * @param {any[]} argArray
     */
    const runSafe = function (fn, argArray) {
        try {
            fn.apply({}, argArray);
        } catch (e) {
            // Intentionally swallow to preserve prior behavior.
        }
    };

    /**
     * Flush queued callbacks.
     * @param {Array<[Function, any[]]>} arr
     */
    const processQueue = function (arr) {
        for (let i = 0; i < arr.length; i++) {
            runSafe(arr[i][0], arr[i][1]);
        }
    };

    const updateFlagsFromStatus = function () {
        if (store.status === 'interactive') {
            store.interactive = true;
        } else if (store.status === 'complete') {
            store.interactive = true;
            store.complete = true;
        }
    };

    const flushIfNeeded = function () {
        if (store.interactive && store.queue.interactive.length > 0) {
            processQueue(store.queue.interactive.splice(0));
        }
        if (store.complete && store.queue.complete.length > 0) {
            processQueue(store.queue.complete.splice(0));
        }
    };

    const initDomListener = function () {
        if (store.status !== false) {
            return;
        }

        store.status = document.readyState;
        updateFlagsFromStatus();

        if (store.status === 'complete') {
            return;
        }

        document.addEventListener("readystatechange", function () {
            store.status = document.readyState;
            updateFlagsFromStatus();
            flushIfNeeded();
        });
    };

    /**
     * Run or enqueue a callback once the DOM is interactive.
     * @param {Function} fn
     * @param {any[]} [argArray=[]]
     */
    const loaded = function (fn, argArray = []) {
        if (typeof fn !== 'function') {
            return;
        }
        initDomListener();

        if (store.interactive) {
            runSafe(fn, argArray);
        } else {
            store.queue.interactive.push([fn, argArray]);
        }
    };

    /**
     * Run or enqueue a callback once the DOM is complete.
     * @param {Function} fn
     * @param {any[]} [argArray=[]]
     */
    const complete = function (fn, argArray = []) {
        if (typeof fn !== 'function') {
            return;
        }
        initDomListener();

        if (store.complete) {
            runSafe(fn, argArray);
        } else {
            store.queue.complete.push([fn, argArray]);
        }
    };

    return { loaded, complete };
}
