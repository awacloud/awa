// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

'use strict';

/**
 * sanity/lockdown — strict integrity tier (SES-grade integrity, NOT confinement).
 *
 * Like `base.js` / `community.js` since their ESM conversion, this is an
 * explicit-call ES module — it exports `lockdown()` and `harden()`, and a bare
 * import hardens nothing. Integrity is opt-in and invoked once (auto-freezing
 * intrinsics at import time would break SSR and is untestable). The same rule
 * applies to how this tier composes `base.js` in step 6: it must CALL
 * `applyBase()`, never rely on an import side effect.
 *
 * `lockdown()` performs, in order:
 *   1. tameFunctionConstructors() — close the `({}).constructor.constructor`
 *      evaluator-reconstruction escape for all four constructor kinds.
 *   2. capture the real `WebAssembly.*` evaluators (the wasm capability seam
 *      must hold the PRE-poison originals — see `sanity/wasm-gate.js`).
 *   3. remove ambient evaluators (`eval`, `Function`, `WebAssembly.*`).
 *   4. poison the synchronous `WebAssembly.Module` / `Instance` constructors.
 *   5. harden(intrinsics) — transitive freeze over the standard intrinsic graph.
 *   6. (browser realm only) compose the `base.js` DOM/XSS hardening.
 *   7. arm the wasm gate.
 *
 * WebAssembly, after step 7: only a holder of the fw wasm capability may
 * compile or instantiate. The sole holder is `wasmRuntime`, whose only public
 * entry point selects a build-time-vendored binary BY NAME; caller-supplied
 * bytes have no route. `WebAssembly.validate` and `Memory`/`Table`/`Global`
 * are deliberately untouched. See `sanity/wasm-gate.js` for the seam itself.
 *
 * Honesty: this tier provides INTEGRITY (tamper-proof primordials, no prototype
 * poisoning, no eval/Function reconstruction) — NOT confinement. That applies
 * to the wasm seam too: code that can already `import` fw's internal modules
 * can reach the gate, but such code already has arbitrary execution in the
 * realm; what the seam closes is the AMBIENT eval-class vector. Untrusted code
 * is isolated via Workers (separate realm + structured-clone boundary), not by
 * this tier. See docs/api/sanity/lockdown.md for the full SES comparison.
 *
 * @module sanity/lockdown
 */

import {
    captureRealEvaluators,
    poisonSyncConstructors,
    arm as armWasmGate,
} from './wasm-gate.js';

const EVALUATOR_BLOCKED = 'lockdown: evaluator removed';

/** Module-level idempotence guard: lockdown() runs its mutations at most once. */
let _lockedDown = false;

/**
 * A throwing shim installed in place of every evaluator-bearing slot. Carries
 * no closure over a real evaluator, so it cannot be coerced back into one.
 * @returns {never}
 */
function throwEvaluatorRemoved() {
    throw new TypeError(EVALUATOR_BLOCKED);
}

/**
 * Transitive freeze of an object graph (SES `harden`). Depth-first over each
 * reachable object's own property values (data values + getter/setter
 * functions) and its `[[Prototype]]`, calling `Object.freeze` on every
 * object/function exactly once (a WeakSet guards against cycles and re-visits).
 *
 * Primitives are skipped. Hosts that throw on `Object.freeze` (exotic objects)
 * are tolerated best-effort: the object is marked visited and skipped.
 *
 * @template T
 * @param {T} target object graph root to deep-freeze
 * @returns {T} the same `target`, now (transitively) frozen
 */
function harden(target) {
    const visited = new WeakSet();
    const queue = [];

    /** @param {unknown} v */
    function enqueue(v) {
        if (v === null) return;
        const t = typeof v;
        if (t !== 'object' && t !== 'function') return; // primitive
        if (visited.has(/** @type {object} */ (v))) return;
        visited.add(/** @type {object} */ (v));
        queue.push(v);
    }

    enqueue(target);

    while (queue.length > 0) {
        const obj = queue.pop();

        try {
            Object.freeze(obj);
        } catch {
            // Exotic/host object that refuses freezing: best-effort, keep going.
        }

        // [[Prototype]]
        try {
            enqueue(Object.getPrototypeOf(obj));
        } catch {
            // getPrototypeOf can throw on revoked Proxies etc.
        }

        // Own properties: descriptors (so getters/setters are followed without
        // invoking them) plus symbol keys.
        /** @type {Record<PropertyKey, PropertyDescriptor>} */
        let descriptors;
        try {
            descriptors = Object.getOwnPropertyDescriptors(obj);
        } catch {
            continue;
        }
        const keys = Reflect.ownKeys(descriptors);
        for (let i = 0; i < keys.length; i++) {
            const desc = descriptors[keys[i]];
            if (!desc) continue;
            if ('value' in desc) {
                enqueue(desc.value);
            } else {
                enqueue(desc.get);
                enqueue(desc.set);
            }
        }
    }

    return target;
}

/**
 * Replace `constructor` on `Function.prototype` and on the three hidden
 * function-constructor prototypes (`%GeneratorFunction%`, `%AsyncFunction%`,
 * `%AsyncGeneratorFunction%`) with a throwing shim. This closes the
 * `({}).constructor.constructor('code')` escape — the most important measure,
 * without which the whole layer is bypassable: any object can reach
 * `Function.prototype.constructor` (= `Function`) and rebuild an evaluator.
 *
 * Each prototype is reached structurally (never by name), so host differences
 * are tolerated; a missing kind is skipped, not fatal.
 */
function tameFunctionConstructors() {
    /** @type {Array<Function|undefined>} */
    const protos = [];

    // %FunctionPrototype% — its `.constructor` is the `Function` evaluator.
    protos.push(Function.prototype);

    // %GeneratorFunction%.prototype etc. The constructor (e.g.
    // `(function*(){}).constructor`) is itself an evaluator; we poison the
    // `constructor` slot on the *instance* prototype it hangs off.
    try {
        const GeneratorFunction = (function* () {}).constructor;
        protos.push(GeneratorFunction.prototype);
    } catch { /* host without generators */ }
    try {
        const AsyncFunction = (async function () {}).constructor;
        protos.push(AsyncFunction.prototype);
    } catch { /* host without async functions */ }
    try {
        const AsyncGeneratorFunction = (async function* () {}).constructor;
        protos.push(AsyncGeneratorFunction.prototype);
    } catch { /* host without async generators */ }

    for (let i = 0; i < protos.length; i++) {
        const proto = protos[i];
        if (!proto) continue;
        try {
            Object.defineProperty(proto, 'constructor', {
                value: throwEvaluatorRemoved,
                writable: false,
                enumerable: false,
                configurable: false,
            });
        } catch {
            // Slot already non-configurable / frozen by a prior run: idempotent.
        }
    }
}

/**
 * Make the ambient evaluators unusable: `globalThis.eval`, `globalThis.Function`,
 * and (if present) the `WebAssembly.*` compile/instantiate evaluators. Each is
 * replaced by the throwing shim. Slots that are already non-writable /
 * non-configurable (e.g. from a prior run) are tolerated.
 */
function removeAmbientEvaluators() {
    const g = globalThis;

    /**
     * @param {object} host
     * @param {string} name
     */
    function poison(host, name) {
        if (!host) return;
        try {
            Object.defineProperty(host, name, {
                value: throwEvaluatorRemoved,
                writable: false,
                enumerable: false,
                configurable: false,
            });
        } catch {
            // Best-effort: already poisoned or locked.
        }
    }

    poison(g, 'eval');
    poison(g, 'Function');

    if (typeof g.WebAssembly !== 'undefined' && g.WebAssembly) {
        const wasm = g.WebAssembly;
        poison(wasm, 'compile');
        poison(wasm, 'compileStreaming');
        poison(wasm, 'instantiate');
        poison(wasm, 'instantiateStreaming');
    }
}

/**
 * Build the enumerated intrinsic root set, then transitively `harden` it.
 *
 * The set is exhaustive by design — a missing intrinsic is a hole an attacker
 * could mutate. It contains every standard global constructor/namespace, each
 * `Error` subclass, and the *hidden* intrinsics that have no global binding
 * (`%TypedArray%`, `%IteratorPrototype%`, `%AsyncIteratorPrototype%`, the three
 * function-constructor intrinsics, `%ThrowTypeError%`). Every access is guarded
 * (`typeof` / `try`) so frozen-but-missing hosts never throw.
 */
function hardenIntrinsics() {
    const g = globalThis;
    /** @type {unknown[]} */
    const roots = [];

    /** @param {unknown} v */
    function add(v) {
        if (v === null) return;
        const t = typeof v;
        if (t === 'object' || t === 'function') roots.push(v);
    }

    /** @param {string} name */
    function addGlobal(name) {
        try {
            add(/** @type {Record<string, unknown>} */ (g)[name]);
        } catch { /* getter throws on some hosts */ }
    }

    // Fundamental objects, value wrappers, structured data.
    [
        'Object', 'Function', 'Array', 'String', 'Number', 'Boolean', 'BigInt',
        'Symbol', 'Date', 'RegExp', 'JSON', 'Math', 'Promise',
        'Map', 'Set', 'WeakMap', 'WeakSet', 'WeakRef', 'FinalizationRegistry',
        'Reflect', 'Proxy', 'Atomics',
        'ArrayBuffer', 'SharedArrayBuffer', 'DataView',
        // Concrete TypedArrays (their shared %TypedArray% prototype is added below).
        'Int8Array', 'Uint8Array', 'Uint8ClampedArray',
        'Int16Array', 'Uint16Array', 'Int32Array', 'Uint32Array',
        'Float32Array', 'Float64Array', 'BigInt64Array', 'BigUint64Array',
        // Error hierarchy.
        'Error', 'TypeError', 'RangeError', 'ReferenceError', 'SyntaxError',
        'EvalError', 'URIError', 'AggregateError',
    ].forEach(addGlobal);

    // Each root's `.prototype` (covers prototype methods + their getters).
    const named = roots.slice();
    for (let i = 0; i < named.length; i++) {
        const ctor = named[i];
        if (typeof ctor === 'function') {
            try { add(/** @type {Function} */ (ctor).prototype); } catch { /* */ }
        }
    }

    // Hidden intrinsics — no global binding, reached structurally.

    // %TypedArray% = the shared abstract base of every concrete TypedArray.
    try {
        if (typeof Int8Array !== 'undefined') {
            add(Object.getPrototypeOf(Int8Array));            // %TypedArray% constructor
            add(Object.getPrototypeOf(Int8Array.prototype));  // %TypedArray%.prototype
        }
    } catch { /* */ }

    // %IteratorPrototype% via an array iterator's [[Prototype]] chain.
    try {
        const arrIter = [][Symbol.iterator]();
        add(Object.getPrototypeOf(arrIter));                              // %ArrayIteratorPrototype%
        add(Object.getPrototypeOf(Object.getPrototypeOf(arrIter)));      // %IteratorPrototype%
    } catch { /* */ }

    // %AsyncIteratorPrototype% via an async generator instance (if available).
    try {
        const AsyncGeneratorFunction = (async function* () {}).constructor;
        const agen = (async function* () {})();
        // %AsyncGeneratorPrototype% → %AsyncIteratorPrototype%.
        const agenProto = Object.getPrototypeOf(agen);
        add(agenProto);
        add(Object.getPrototypeOf(agenProto));
        add(AsyncGeneratorFunction);
        add(AsyncGeneratorFunction.prototype);
        // Tidy: do not leak the live async generator.
        try { agen.return(undefined); } catch { /* */ }
    } catch { /* host without async generators */ }

    // %GeneratorFunction% / %AsyncFunction% intrinsics + their prototypes.
    try {
        const GeneratorFunction = (function* () {}).constructor;
        add(GeneratorFunction);
        add(GeneratorFunction.prototype);
        const gen = (function* () {})();
        add(Object.getPrototypeOf(gen));                                 // %GeneratorPrototype%
        try { gen.return(undefined); } catch { /* */ }
    } catch { /* */ }
    try {
        const AsyncFunction = (async function () {}).constructor;
        add(AsyncFunction);
        add(AsyncFunction.prototype);
    } catch { /* */ }

    // %ThrowTypeError% poison pill (the [[Get]] on Function.prototype.caller).
    try {
        const d = Object.getOwnPropertyDescriptor(Function.prototype, 'caller');
        if (d && typeof d.get === 'function') add(d.get);
    } catch { /* */ }

    // Transitively freeze every root (DFS shares no visited set across roots,
    // but `harden` is idempotent and each call is O(reachable)).
    for (let i = 0; i < roots.length; i++) {
        harden(roots[i]);
    }
}

/**
 * Apply the strict integrity lockdown to the current realm. Idempotent: the
 * first call performs all mutations; subsequent calls are no-ops (the
 * module-level guard short-circuits, and every individual step is itself
 * tolerant of already-frozen slots).
 *
 * The intrinsic steps (tame constructors, capture/remove evaluators, poison the
 * sync wasm constructors, harden intrinsics) target pure-JS intrinsics and
 * therefore run in ANY realm — main thread, Worker, or SSR. The DOM step
 * (compose `base.js` DOM/XSS hardening) runs only in a browser realm (`window`
 * + `document` present); `base.js` is imported lazily and its `applyBase()` is
 * called explicitly there, so a non-browser realm never loads the DOM layer.
 * That step is inherently asynchronous (dynamic `import`), exactly as before —
 * the DOM hardening lands on a later microtask, while `lockdown()` itself stays
 * synchronous and returns once the intrinsic tier is complete.
 *
 * @param {object} [options] reserved for future opts (currently unused)
 * @returns {void}
 * @throws {TypeError} if the synchronous `WebAssembly.Module`/`Instance`
 *   poisoning does not take effect — a silently open compile path would make
 *   the WebAssembly whitelist security theatre, so it fails loudly instead.
 */
function lockdown(options = {}) {
    void options;
    if (_lockedDown) return;
    _lockedDown = true;

    // 1. Close the evaluator-reconstruction escape (most important measure).
    tameFunctionConstructors();

    // 2. Capture the REAL WebAssembly evaluators before anything poisons them:
    //    the capability seam must hand fw's own loader pre-poison originals.
    //    Order is contractual — this MUST precede removeAmbientEvaluators().
    captureRealEvaluators();

    // 3. Remove ambient evaluators.
    removeAmbientEvaluators();

    // 4. Close the synchronous WebAssembly compile path that step 3 leaves open
    //    (`new WebAssembly.Module/Instance`). Asserts its own effect and throws
    //    if the poison did not land. Runs BEFORE hardenIntrinsics so a future
    //    hardening of the `WebAssembly` namespace cannot silently defeat it.
    poisonSyncConstructors();

    // 5. Transitive freeze of the standard intrinsic graph.
    hardenIntrinsics();

    // 6. Browser-only: compose base.js DOM/XSS hardening (innerHTML→innerText
    //    redirect, dangerous elements, document.write/execCommand, …). Imported
    //    lazily and gated so SSR/Worker realms never load the DOM layer at all.
    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
        // `base.js` is an explicit-call ES module (`applyBase()`): a BARE
        // side-effect import is INERT and would silently drop the whole DOM/XSS
        // layer. The call is chained onto the dynamic import rather than
        // awaited — `lockdown()` is synchronous by contract — and the
        // best-effort swallow lives on the chain, because a sync `try/catch`
        // cannot catch a rejected dynamic import.
        import('./base.js')
            .then((base) => base.applyBase())
            .catch(() => {
                // base.js unavailable (bundler stripped / path moved) or its
                // own application failed: the integrity tier is already
                // applied; DOM hardening is best-effort.
            });
    }

    // 7. Arm the wasm capability seam LAST: from here on `opts.fetchBytes` is
    //    refused, so the byte source of fw's own loader cannot be swapped.
    armWasmGate();
}

export { lockdown, harden };
