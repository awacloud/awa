// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * sanity/wasm-gate — the WebAssembly **capability seam** of the lockdown tier.
 *
 * ── The invariant (frozen wording, fw-sanity W0 FINDINGS §d) ──
 *
 * > **Only a holder of the fw wasm capability may compile or instantiate
 * > WebAssembly after `lockdown()`. The sole holder is `wasmRuntime`, whose
 * > only public entry point selects a build-time-vendored binary BY NAME and
 * > fetches its bytes from fw's internal URL space. Caller-supplied bytes have
 * > no route.**
 *
 * "Embedded" would be a misnomer: the bytes are fetched from fw's internal URL
 * space *by the capability-gated call site* (`crypto/wasm/runtime.js` resolves
 * `<name>.<variant>.wasm` against `import.meta.url`). The invariant is about
 * the CALL SITE, not about the bytes.
 *
 * ── Why a capability and not a stack heuristic ──
 *
 * A stack-walking guard ("is the caller inside fw?") is forgeable: `Error`
 * stacks are attacker-influenceable, host-dependent and meaningless after
 * bundling/minification. **No stack walking happens anywhere in this file.**
 * Authorisation is an unforgeable **object identity** (`CAP`) that lives only
 * in this module's scope: never written to a global, never serialised, never
 * returned to application code, and not structured-cloneable into a Worker
 * (structured clone copies the shape, and identity — not shape — is checked).
 *
 * ── Why the global evaluators are NOT re-opened ──
 *
 * This seam does not relax `lockdown()`. `WebAssembly.compile`,
 * `compileStreaming`, `instantiate` and `instantiateStreaming` stay poisoned on
 * the global exactly as before; the gate captures the ORIGINALS **before**
 * poisoning and hands them out only behind a capability check. Net ambient
 * attack surface after `lockdown()` is strictly *smaller* than before this
 * module existed, because the synchronous constructor hole is closed too
 * (see `poisonSyncConstructors`).
 *
 * `WebAssembly.validate` is deliberately absent from this file: it is **not
 * poisoned** by `lockdown()` and must not be "opened" — it is not closed. It
 * compiles nothing and merely answers yes/no about a byte sequence, which is
 * what `wasmRuntime`'s simd128 probe needs. `WebAssembly.Memory` / `Table` /
 * `Global` are likewise untouched: they are not evaluators, and `runtime.js`'s
 * ABI check does `ex.memory instanceof WebAssembly.Memory`.
 *
 * ── Threat model, honestly ──
 *
 * Like `lockdown.js` itself, this is **integrity, not confinement**. Code that
 * can already `import` fw's internal modules can reach this gate — but such
 * code already has arbitrary execution in the realm. The seam closes the
 * *ambient* eval-class vector (any script reaching `WebAssembly.*` from a
 * global), which is the vector `lockdown()` exists to close. Untrusted code is
 * isolated with Workers (separate realm + structured-clone boundary), never by
 * this tier.
 *
 * ── Worker-safety ──
 *
 * **Not worker-safe, deliberately.** The seam is realm-global state and the
 * capability must not travel across a structured-clone boundary. A Worker that
 * needs fw's binaries runs its own `lockdown()` + gate in its own realm.
 *
 * @module sanity/wasm-gate
 */

/**
 * The capability. Object identity **is** the authorisation: unforgeable, never
 * exposed on any global, never serialised. A look-alike carrying the same
 * `__brand` is rejected — the brand is documentation, not the check.
 * @type {object}
 */
const CAP = Object.freeze({ __brand: 'fw.wasm.capability' });

/**
 * The smallest well-formed WebAssembly module (magic + version, no sections).
 * Used only as the probe for `poisonSyncConstructors`'s self-assertion: being
 * *valid*, a rejection can only come from the poison, never from a decode error.
 * @type {Uint8Array<ArrayBuffer>}
 */
const EMPTY_MODULE_BYTES = new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]);

/** Originals captured before `lockdown()` poisons the global slots. */
let _real = null;

/** Armed = `lockdown()` has run; the `fetchBytes` test seam is refused from here on. */
let _armed = false;

/**
 * A throwing shim installed in place of the synchronous constructors. Carries
 * no closure over a real constructor, so it cannot be coerced back into one.
 * The message matches `lockdown.js`'s own `EVALUATOR_BLOCKED` wording so a
 * caller cannot tell the two poisons apart.
 * @returns {never}
 */
function throwEvaluatorRemoved() {
    throw new TypeError('lockdown: evaluator removed');
}

/**
 * Capture the real `WebAssembly.*` evaluators. `lockdown()` calls this
 * **immediately before** `removeAmbientEvaluators()` poisons the global slots,
 * so what is captured is guaranteed to be the pre-poison originals.
 *
 * Idempotent: a second call keeps the first capture (it can never be tricked
 * into re-reading an already-poisoned slot).
 *
 * A caller that may run **before** `lockdown()` — e.g. `wasmRuntime` in an app
 * that never locks down — must call this itself first; the gate deliberately
 * fails closed rather than lazily capturing on demand (see `compile`).
 *
 * @param {typeof globalThis} [g] realm global (injectable for tests)
 * @returns {boolean} whether a WebAssembly implementation was present
 */
export function captureRealEvaluators(g = globalThis) {
    if (_real) return true;
    const W = g && g.WebAssembly;
    if (!W) return false;
    _real = {
        compile: W.compile.bind(W),
        instantiate: W.instantiate.bind(W),
        compileStreaming: typeof W.compileStreaming === 'function' ? W.compileStreaming.bind(W) : null,
        instantiateStreaming: typeof W.instantiateStreaming === 'function' ? W.instantiateStreaming.bind(W) : null,
        Module: W.Module,
        Instance: W.Instance,
        Memory: W.Memory,
    };
    return true;
}

/**
 * Close the SYNCHRONOUS compile path — `new WebAssembly.Module(bytes)` and
 * `new WebAssembly.Instance(module)`.
 *
 * MEASURED HOLE (fw-sanity W0 FINDINGS §d.2): `removeAmbientEvaluators()`
 * poisons the four *async* slots only. The synchronous constructors were left
 * untouched, so caller-supplied wasm still compiled AND EXECUTED after
 * `lockdown()` — proven end to end. Whitelisting the async four while the sync
 * constructors stayed open would be security theatre; this closes it first.
 *
 * The poisoning **asserts its own effect**: after the `defineProperty`, a
 * genuinely valid module is fed to `new WebAssembly.Module` and MUST throw. A
 * swallowed `defineProperty` failure, or a no-op because a future
 * `lockdown()` hardened the `WebAssembly` namespace before this runs, is a
 * loud error — never silence.
 *
 * `WebAssembly.Memory` / `Table` / `Global` are deliberately NOT poisoned:
 * they are not evaluators, and `runtime.js`'s ABI check does
 * `ex.memory instanceof WebAssembly.Memory`. `WebAssembly.validate` is
 * likewise left alone — it is not closed today and must not be "opened".
 *
 * @param {typeof globalThis} [g] realm global (injectable for tests)
 * @returns {void}
 * @throws {TypeError} if called before `captureRealEvaluators()` (the gate
 *   would lock fw's own loader out), or if the poison did not take effect.
 */
export function poisonSyncConstructors(g = globalThis) {
    const W = g && g.WebAssembly;
    if (!W) return; // no WebAssembly in this realm: nothing to close.
    if (!_real) {
        throw new TypeError(
            'lockdown: wasm gate must capture the real evaluators before poisoning',
        );
    }

    for (const name of ['Module', 'Instance']) {
        try {
            Object.defineProperty(W, name, {
                value: throwEvaluatorRemoved,
                writable: false,
                enumerable: false,
                configurable: false,
            });
        } catch {
            // Slot already non-configurable (prior run, or a hardened namespace).
            // Never silent: the assertion below decides whether that is benign.
        }
        if (W[name] !== throwEvaluatorRemoved) {
            throw new TypeError(
                'lockdown: wasm gate failed to poison WebAssembly.' + name
                + ' (namespace already hardened?) — the synchronous compile path is OPEN',
            );
        }
    }

    // Behavioural proof, not merely an identity check: valid bytes must be
    // refused by the constructor path.
    let threw = false;
    try {
        new W.Module(EMPTY_MODULE_BYTES);
    } catch {
        threw = true;
    }
    if (!threw) {
        throw new TypeError(
            'lockdown: wasm gate poison had NO EFFECT — new WebAssembly.Module still compiles',
        );
    }
}

/**
 * Arm the gate. `lockdown()` calls this at the very END of its run. Once
 * armed, the `opts.fetchBytes` test seam is refused (see `assertByteSource`).
 *
 * There is deliberately no disarm: the realm is locked for its lifetime.
 * @returns {void}
 */
export function arm() {
    _armed = true;
}

/**
 * Issue the capability to fw's single internal wasm loader. `wasmRuntime`
 * obtains it here. Idempotent by design — re-instantiating the loader (e.g. in
 * a Worker realm) must work — but the token is only ever reachable from a
 * module that can `import` this file, never from `globalThis`.
 *
 * NOTE for the `runtime.js` call site: `wasmRuntime`'s factory must not close
 * over a module-scope import (`fw/no-factory-capture`) — obtain the capability
 * through a lazy memoised dynamic `import()` inside the factory, or declare the
 * gate as a dependency.
 *
 * @returns {object} the capability (always the same identity)
 */
export function issueCapability() {
    return CAP;
}

/**
 * @param {unknown} cap
 * @returns {void}
 * @throws {TypeError} when `cap` is not the capability identity
 */
function requireCap(cap) {
    if (cap !== CAP) {
        throw new TypeError('lockdown: WebAssembly compilation requires the fw wasm capability');
    }
}

/**
 * The `opts.fetchBytes` disposition: **neutralised under lockdown, test-only
 * seam otherwise**. Before `lockdown()` it remains the documented test seam it
 * is today; once the gate is armed it is a hard error, so it can never become a
 * public byte-injection channel into the one call site that holds the
 * capability.
 *
 * The supported alternative for a Worker or an alternate origin is threading an
 * **absolute base URL** (mirror of the runtime's own URL) — never `fetchBytes`.
 *
 * @param {{fetchBytes?: unknown}} [opts] the loader options object
 * @returns {void}
 * @throws {TypeError} when armed and `opts.fetchBytes` is set
 */
export function assertByteSource(opts) {
    if (_armed && opts && opts.fetchBytes) {
        throw new TypeError(
            'lockdown: wasmRuntime opts.fetchBytes is neutralised under lockdown '
            + '(test-only seam); thread an absolute base URL instead',
        );
    }
}

/**
 * Capability-gated `WebAssembly.compile` — the ONLY route to compilation once
 * `lockdown()` has poisoned the global slots.
 *
 * Fails closed when the originals were never captured: a gate that cannot prove
 * it holds pre-poison evaluators refuses rather than reading a possibly
 * poisoned global. Callers that may run before `lockdown()` call
 * `captureRealEvaluators()` first (idempotent, and a no-op afterwards).
 *
 * @param {object} cap the fw wasm capability
 * @param {BufferSource} bytes bytes fetched from fw's internal URL space
 * @returns {Promise<WebAssembly.Module>}
 * @throws {TypeError} without the capability, or when the gate is uninitialised
 */
export function compile(cap, bytes) {
    requireCap(cap);
    if (!_real) throw new TypeError('lockdown: wasm gate not initialised');
    return _real.compile(bytes);
}

/**
 * Capability-gated `WebAssembly.instantiate`. Called with a `Module`, the
 * captured original resolves to an `Instance`; called with bytes it resolves to
 * a `{module, instance}` source — the gate does not reshape either.
 *
 * @param {object} cap the fw wasm capability
 * @param {WebAssembly.Module} module a module produced by `compile`
 * @param {WebAssembly.Imports} [imports] import object (fw binaries are zero-import)
 * @returns {Promise<WebAssembly.Instance|WebAssembly.WebAssemblyInstantiatedSource>}
 * @throws {TypeError} without the capability, or when the gate is uninitialised
 */
export function instantiate(cap, module, imports) {
    requireCap(cap);
    if (!_real) throw new TypeError('lockdown: wasm gate not initialised');
    return _real.instantiate(module, imports);
}

/**
 * Module reflection behind the same capability check, used by `wasmRuntime`'s
 * zero-import invariant. `WebAssembly.Module.imports` is not an evaluator and
 * is not poisoned, but routing it here keeps the loader's whole wasm surface on
 * one capability-checked path — and it must use the CAPTURED `Module`, since
 * the global binding is a throwing shim after `poisonSyncConstructors()`.
 *
 * @param {object} cap the fw wasm capability
 * @param {WebAssembly.Module} module
 * @returns {WebAssembly.ModuleImportDescriptor[]}
 * @throws {TypeError} without the capability, or when the gate is uninitialised
 */
export function moduleImports(cap, module) {
    requireCap(cap);
    if (!_real) throw new TypeError('lockdown: wasm gate not initialised');
    return _real.Module.imports(module);
}
