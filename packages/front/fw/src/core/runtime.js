// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// packages/front/fw/src/core/runtime.js
/**
 * @fileoverview Minimal dependency-injection runtime for the framework's module
 * system, with native multi-version support.
 *
 * A **module** is a plain object with these fields:
 * ```js
 * {
 *   name         : string,       // unique identifier
 *   version?     : string,       // semver - defaults to '0.0.0' when absent
 *   type?        : string,       // taxonomy - must match /^(fw|sde|lib)\.[a-z][\w.]*$/ when present
 *   dependencies : string[],     // names (or 'name@version' specs) of required modules
 *   factory      : function,     // called with resolved dependency instances as args
 * }
 * ```
 *
 * Multiple versions of the same module name can coexist. `resolve('foo')` returns
 * the highest semver version registered ; `resolve('foo', { version: '1.2.3' })`
 * or the canonical spec `resolve('foo@1.2.3')` returns an exact version.
 *
 * The "highest version" pointer is precomputed at register time, so version-less
 * resolves remain O(1).
 *
 */

/**
 * Strict semver core regex (major.minor.patch with optional pre-release/build).
 * @private
 */
const SEMVER_RE = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[\w.-]+)?(?:\+[\w.-]+)?$/;

/**
 * Type taxonomy regex : `fw.<sub>`, `sd.<sub>`, `sde.<sub>`, `sdc.<sub>`, `lib.<sub>`.
 *
 * - `fw.*`  : framework modules (`@awacloud/fw`).
 * - `sd.*`  : shared SDE/SDC modules (`@awacloud/sd-common`).
 * - `sde.*` : multi-app desktop specifics (`@awacloud/sde-core`).
 * - `sdc.*` : mono-app container specifics (`@awacloud/sdc-core`).
 * - `lib.*` : standalone libraries (e.g. `lib.video_codec`).
 *
 * @private
 */
const TYPE_RE = /^(fw|sd|sde|sdc|lib)\.[a-z][\w.]*$/;

/**
 * Default version when a module descriptor omits `version`.
 * @private
 */
const DEFAULT_VERSION = '0.0.0';

/**
 * Compare two semver strings.
 *
 * Implements the ordering :
 * - numeric major.minor.patch
 * - any pre-release < no pre-release (1.0.0-beta < 1.0.0)
 * - pre-release sorted lexicographically (1.0.0-alpha < 1.0.0-beta)
 *
 * Sufficient for picking the highest version at register time. For range
 * matching (`^`, `~`, `>=`), use the standalone `semver` module.
 *
 * @param {string} a Semver string.
 * @param {string} b Semver string.
 * @returns {number} -1 if a < b, 0 if equal, 1 if a > b.
 * @private
 */
function semverCompare(a, b) {
    const [coreA, preA = ''] = a.split('-', 2);
    const [coreB, preB = ''] = b.split('-', 2);
    const partsA = coreA.split('.');
    const partsB = coreB.split('.');
    for (let i = 0; i < 3; i++) {
        const na = +partsA[i] || 0;
        const nb = +partsB[i] || 0;
        if (na !== nb) return na < nb ? -1 : 1;
    }
    // pre-release < release
    if (preA && !preB) return -1;
    if (!preA && preB) return 1;
    if (preA === preB) return 0;
    return preA < preB ? -1 : 1;
}

/**
 * Parse a module spec string : `'name'` or `'name@version'`.
 *
 * Splits on the **last** `@` so module names containing `@` (rare) are handled
 * correctly when the version is appended.
 *
 * @param {string} spec Module spec.
 * @returns {{name: string, version: string|undefined}}
 * @private
 */
function parseSpec(spec) {
    const at = spec.lastIndexOf('@');
    if (at <= 0) return { name: spec, version: undefined };
    return { name: spec.slice(0, at), version: spec.slice(at + 1) };
}

/**
 * Build the canonical key `name@version`.
 *
 * @param {string} name
 * @param {string} version
 * @returns {string}
 * @private
 */
function canonical(name, version) {
    return name + '@' + version;
}

/**
 * A module definition object.
 *
 * @typedef {Object} ModuleDefinition
 * @property {string}    name           - Unique module identifier.
 * @property {string}    [version]      - Semver string. Defaults to '0.0.0'.
 * @property {string}    [type]         - Hierarchical type (e.g. 'fw.io.codec').
 * @property {string[]}  dependencies   - Ordered list of dependency specs
 *                                        ('name' or 'name@version').
 * @property {ModuleDefinition[]} [deps] - Optional direct JS references to the
 *                                        dependency modules, in the same order
 *                                        as `dependencies`. Bundler-facing only :
 *                                        lets tree-shaking tools trace the graph
 *                                        through static imports. Walked by
 *                                        `registerDeep` / `registerAllDeep`.
 * @property {Function}  factory        - Factory function invoked with resolved
 *                                        dependency instances as arguments.
 */

/**
 * Public instance type produced by a module's `factory` — i.e. what
 * `runtime.resolve('<name>')` returns for that module. Given a module value
 * `M`, `InstanceOf<typeof M>` is `ReturnType<M['factory']>`. See the typed
 * runtime facade (`@awacloud/fw/typed`) and `docs/guide/typescript.md` for usage.
 *
 * @template {{ factory: (...args: any[]) => any }} M
 * @typedef {ReturnType<M['factory']>} InstanceOf
 */

/**
 * Per-name registry entry holding all known versions of a module.
 *
 * @typedef {Object} ModuleEntry
 * @property {Map<string, ModuleDefinition>} versions  - Map of version → definition.
 * @property {string}                        latest    - Highest semver version present.
 * @property {ModuleDefinition}              latestDef - Cached pointer to the latest def.
 */

/**
 * Options accepted by {@link ModuleRuntime#resolve} and
 * {@link ModuleRuntime#resolveAll}.
 *
 * @typedef {Object} ResolveOptions
 * @property {boolean}    [isolation] - When truthy the instance is **not** cached.
 * @property {string}     [version]   - Explicit version. Ignored if `spec` already
 *                                      contains `@version`.
 * @property {Map}        [instances] - Custom instance map (flat, keyed by canonical
 *                                      `name@version`).
 */

/**
 * Filter passed to {@link ModuleRuntime#list}.
 *
 * @typedef {Object} ListFilter
 * @property {string} [name]    - Exact module name.
 * @property {string} [version] - Exact version.
 * @property {string} [type]    - Exact type, or prefix when ending with `.`
 *                                (e.g. `'fw.io.'` matches `'fw.io.codec'`).
 */

/**
 * One frozen registry row returned by {@link ModuleRuntime#snapshot}.
 *
 * Pure **metadata** — it carries no `factory`, no `deps` reference and no
 * instance. Every field is a primitive or a frozen copy, so the row is inert:
 * holding it grants no way to write back into the registry.
 *
 * @typedef {Object} RegistrySnapshotEntry
 * @property {string}   name         - Registered module name.
 * @property {string}   version      - Resolved version ('0.0.0' when the
 *                                     descriptor omitted `version`).
 * @property {string|null} type      - Declared taxonomy type, or `null`.
 * @property {ReadonlyArray<string>} dependencies - Frozen copy of the declared
 *                                     dependency specs (never the live array).
 * @property {boolean}  latest       - `true` when this version is the one a
 *                                     version-less `resolve(name)` would pick.
 * @property {boolean}  instantiated - `true` when an instance for this
 *                                     `(name, version)` is already in the
 *                                     default cache. Read-only observation —
 *                                     reading it never instantiates anything.
 */

/**
 * Options accepted by {@link ModuleRuntime#invalidate}.
 *
 * @typedef {Object} InvalidateOptions
 * @property {boolean} [cascade] - When truthy, also invalidate every module
 *                                 that declares the target among its
 *                                 `dependencies`, transitively. Dependents,
 *                                 not dependencies: what a swapped module
 *                                 breaks is the things built on top of it.
 */

/**
 * Result returned by {@link ModuleRuntime#invalidate}.
 *
 * @typedef {Object} InvalidateResult
 * @property {ReadonlyArray<string>} invalidated - Canonical `name@version` keys
 *      whose cached instance was actually dropped. A target that was never
 *      instantiated contributes nothing, so an empty array means "nothing was
 *      cached", never "nothing matched" — an unknown module throws instead.
 * @property {Object<string, *>} state - Frozen map of canonical key → the value
 *      returned by the outgoing instance's `dehydrate()`, for the targets that
 *      opted into the convention. Keys absent from it did not implement
 *      `dehydrate`. The values themselves are whatever the module returned and
 *      are **not** deep-frozen.
 */

/**
 * Result returned by {@link ModuleRuntime#serialize}.
 *
 * @typedef {Object} SerializedGraph
 * @property {string} list    - JS array literal of canonical names :
 *                              `"['hex@1.0.0','uuid@2.0.0']"`.
 * @property {string} content - JS array literal of fully serialised module objects,
 *                              ready to be evaluated and registered inside a Worker.
 */

/**
 * Lightweight dependency-injection runtime with native multi-version support.
 *
 * Modules are registered once and resolved lazily. `resolve('name')` returns the
 * highest-semver version ; `resolve('name@1.2.3')` or `resolve('name', {version})`
 * returns an exact one. Instances are cached by `(name, version)`.
 *
 * The `context` property is reserved for the Worker bootstrap : `worker-helper.js`
 * assigns the worker framework's public API to it after the worker starts.
 */
export class ModuleRuntime {

    /**
     * Pinned "never swap" set — module names {@link ModuleRuntime#invalidate}
     * refuses to touch, directly or through a cascade.
     *
     * `signal` is on it because its effect tracking is **per-factory-instance**:
     * dropping its cached instance would leave every already-created signal,
     * derived and effect bound to the previous factory instance while new reads
     * register against the new one, so effects silently stop firing. That is a
     * whole-application breakage with no error to point at, which is exactly the
     * class of failure a hot-reload seam must not be able to cause.
     *
     * The set is **pinned**, not configurable: a per-runtime opt-out would make
     * the guarantee negotiable at the call site, which is where the mistake
     * happens. Widening it is a source change, reviewed like any other.
     *
     * @type {ReadonlyArray<string>}
     */
    static NEVER_SWAP = Object.freeze(['signal']);

    constructor() {
        /** @type {Map<string, ModuleEntry>} Registered module entries (one per name). */
        this.modules = new Map();

        /** @type {Map<string, Map<string, *>>} Instance cache : name → version → instance. */
        this.instances = new Map();

        /**
         * Reserved for the Worker bootstrap - populated by `worker-helper.js`.
         * @type {Object}
         */
        this.context = {}; // reserved for worker
    }

    /**
     * Register a module definition.
     *
     * Validates `name`, `factory`, `version` (semver, defaults to '0.0.0') and
     * `type` (taxonomy regex, optional). Registering the same `(name, version)`
     * pair overwrites the previous definition. Multiple versions of the same
     * `name` coexist.
     *
     * @param {ModuleDefinition} module
     * @throws {Error} On invalid name, factory, version or type.
     * @returns {this} Chainable.
     */
    register(module) {
        if (!module || !module.name || !module.factory) {
            throw new Error('Invalid module definition');
        }
        const version = (module.version != null) ? module.version : DEFAULT_VERSION;
        if (!SEMVER_RE.test(version)) {
            throw new Error(`Invalid version "${version}" for module "${module.name}"`);
        }
        if (module.type != null && !TYPE_RE.test(module.type)) {
            throw new Error(`Invalid type "${module.type}" for module "${module.name}"`);
        }

        let entry = this.modules.get(module.name);
        if (!entry) {
            entry = { versions: new Map(), latest: version, latestDef: module };
            this.modules.set(module.name, entry);
        }
        entry.versions.set(version, module);
        // Recompute latest only when the new version sorts strictly higher.
        if (semverCompare(version, entry.latest) >= 0) {
            entry.latest = version;
            entry.latestDef = module;
        }
        return this;
    }

    /**
     * Register an array of module descriptors. Equivalent to calling
     * `register()` for each entry; returns `this` for chaining.
     * @param {ModuleDefinition[]} modules
     * @returns {ModuleRuntime}
     */
    registerAll(modules) {
        for (const m of modules) this.register(m);
        return this;
    }

    /**
     * Register a module along with all its transitive `deps` — the optional
     * bundler-friendly companion of `dependencies`.
     *
     * A module may carry a `deps` array of **direct JS references** to its
     * dependency modules (imported statically by the module's source file).
     * `registerDeep` walks that graph depth-first and registers each missing
     * module on the way back up, so dependencies are always registered
     * before their dependents — the correct order for `resolve`.
     *
     * `deps` is purely a build-time / bundler concern : it lets tree-shaking
     * bundlers (Vite / Rollup / Webpack / esbuild) trace the module graph
     * from JS `import` statements while keeping `dependencies` (strings,
     * possibly with `name@version` specs) as the runtime resolution
     * contract. Workers receive only the canonical `dependencies` form via
     * {@link ModuleRuntime#serialize}, so `deps` is not transferred — that
     * is fine, the worker-side closure has already been computed.
     *
     * Idempotent : already-registered modules are skipped. Cycle-safe via
     * a per-call visited set keyed on module name.
     *
     * **Invariant** (validated at build time) :
     * `module.deps.map(d => d.name)` === `module.dependencies.map(s => s.split('@')[0])`
     *
     * @param {ModuleDefinition & {deps?: ModuleDefinition[]}} module
     * @returns {this} Chainable.
     */
    registerDeep(module) {
        const seen = new Set();
        const visit = (m) => {
            if (!m || typeof m !== 'object' || !m.name || !m.factory) return;
            if (seen.has(m.name)) return;
            seen.add(m.name);
            if (Array.isArray(m.deps)) {
                for (const d of m.deps) visit(d);
            }
            const version = (m.version != null) ? m.version : DEFAULT_VERSION;
            if (!this.has(m.name, version)) this.register(m);
        };
        visit(module);
        return this;
    }

    /**
     * Equivalent to calling {@link ModuleRuntime#registerDeep} for each entry,
     * sharing a single visited set across the batch so common transitive
     * dependencies are walked only once.
     *
     * @param {Array<ModuleDefinition & {deps?: ModuleDefinition[]}>} modules
     * @returns {this} Chainable.
     */
    registerAllDeep(modules) {
        for (const m of modules) this.registerDeep(m);
        return this;
    }

    /**
     * Unregister a module definition. **Does not touch the instance cache** -
     * already-resolved instances held by callers continue to function ; only
     * subsequent `resolve` calls for the removed module(s) will throw.
     *
     * **Spec / version semantics (mirrors `has`) :**
     * - `unregister('foo')` → remove **all** versions of `foo`
     * - `unregister('foo', '1.0.0')` or `unregister('foo@1.0.0')` → remove only that version
     *
     * When the removed version is the current `latest`, the entry's `latest`
     * pointer is recomputed from the remaining versions. When the last version
     * of a name is removed, the entry itself is deleted.
     *
     * @param {string} spec     Module name, or `'name@version'`.
     * @param {string} [version] Explicit version (ignored if `spec` already contains `@`).
     * @returns {boolean} `true` if at least one definition was removed.
     */
    unregister(spec, version) {
        const parsed = parseSpec(spec);
        const name = parsed.name;
        const ver = parsed.version || version;

        const entry = this.modules.get(name);
        if (!entry) return false;

        if (ver === undefined) {
            // Remove all versions for this name.
            this.modules.delete(name);
            return true;
        }

        if (!entry.versions.has(ver)) return false;
        entry.versions.delete(ver);

        if (entry.versions.size === 0) {
            this.modules.delete(name);
            return true;
        }

        // Recompute `latest` only when the removed version was the latest.
        if (ver === entry.latest) {
            let bestVer = null;
            let bestDef = null;
            for (const [v, d] of entry.versions) {
                if (bestVer === null || semverCompare(v, bestVer) > 0) {
                    bestVer = v;
                    bestDef = d;
                }
            }
            entry.latest = bestVer;
            entry.latestDef = bestDef;
        }

        return true;
    }

    /**
     * Check whether a module (or a specific version) is registered.
     *
     * @param {string} name
     * @param {string} [version] When omitted, returns true if any version of `name` exists.
     * @returns {boolean}
     */
    has(name, version) {
        const entry = this.modules.get(name);
        if (!entry) return false;
        if (version === undefined) return true;
        return entry.versions.has(version);
    }

    /**
     * Resolve a module by spec.
     *
     * **Spec forms :**
     * - `'foo'` → highest version registered for `foo`
     * - `'foo@1.2.3'` → exact version
     * - `'foo'` + `{ version: '1.2.3' }` → exact version
     *
     * **Caching :**
     * - default : singleton per `(name, version)` in `this.instances`.
     * - `{ isolation: true }` : never cache, always fresh.
     * - `{ instances: customMap }` : flat map keyed by canonical `name@version`.
     *
     * Dependencies are resolved transitively with the same options.
     *
     * @param {string}         spec
     * @param {ResolveOptions} [options={}]
     * @throws {Error} When the module (or version) is not registered.
     * @returns {*}
     */
    resolve(spec, options = {}) {
        const parsed = parseSpec(spec);
        const name = parsed.name;
        const explicit = parsed.version || options.version;

        const entry = this.modules.get(name);
        if (!entry) throw new Error(`Module not found: ${name}`);

        let def, version;
        if (explicit !== undefined) {
            def = entry.versions.get(explicit);
            if (!def) throw new Error(`Module not found: ${name}@${explicit}`);
            version = explicit;
        } else {
            def = entry.latestDef;
            version = entry.latest;
        }

        const isolation = !!options.isolation;
        const customMap = (options.instances instanceof Map) ? options.instances : null;

        // Cache lookup.
        if (!isolation) {
            if (customMap) {
                const key = canonical(name, version);
                if (customMap.has(key)) return customMap.get(key);
            } else {
                const versionsCache = this.instances.get(name);
                if (versionsCache && versionsCache.has(version)) {
                    return versionsCache.get(version);
                }
            }
        }

        // Resolve dependencies (recursive).
        const deps = (def.dependencies || []).map(d => this.resolve(d, options));
        const instance = def.factory.apply({}, deps);

        // Cache write.
        if (!isolation) {
            if (customMap) {
                customMap.set(canonical(name, version), instance);
            } else {
                let versionsCache = this.instances.get(name);
                if (!versionsCache) {
                    versionsCache = new Map();
                    this.instances.set(name, versionsCache);
                }
                versionsCache.set(version, instance);
            }
        }
        return instance;
    }

    /**
     * Resolve multiple module specs in a single call.
     *
     * Each result key is the original spec string (preserving any `@version`
     * suffix), so `resolveAll(['hex', 'utf8@1.0.0'])` yields
     * `{ hex: <inst>, 'utf8@1.0.0': <inst> }`.
     *
     * @param {string[]}       specs
     * @param {ResolveOptions} [options={}]
     * @returns {Object<string, *>}
     */
    resolveAll(specs, options = {}) {
        const result = {};
        for (const spec of specs) {
            result[spec] = this.resolve(spec, options);
        }
        return result;
    }

    /**
     * List registered module definitions matching the given filter.
     *
     * Linear scan ; acceptable for the typical module count (≪ 1000).
     *
     * @param {ListFilter} [filter={}]
     * @returns {ModuleDefinition[]}
     */
    list(filter = {}) {
        const out = [];
        const fName = filter.name;
        const fVer = filter.version;
        const fType = filter.type;
        const typePrefix = (typeof fType === 'string') && fType.endsWith('.');

        for (const [name, entry] of this.modules) {
            if (fName && fName !== name) continue;
            for (const [version, def] of entry.versions) {
                if (fVer && fVer !== version) continue;
                if (fType) {
                    if (!def.type) continue;
                    if (typePrefix) {
                        if (!def.type.startsWith(fType)) continue;
                    } else {
                        if (def.type !== fType) continue;
                    }
                }
                out.push(def);
            }
        }
        return out;
    }

    /**
     * Passive, read-only view of the module registry.
     *
     * Companion of {@link ModuleRuntime#list}, which returns the **live**
     * `ModuleDefinition` objects (their `factory`, and a `dependencies` array a
     * caller can splice in place). `snapshot` instead returns frozen metadata
     * rows: enumeration for a devtools registry view without handing out a
     * write channel into registry state, and without the side effect of
     * `resolve()` — which is a full instantiate, not a peek.
     *
     * **Guarantees**
     * - **Instantiates nothing.** No `factory` is invoked and `this.instances`
     *   is never written; a call on a registry where nothing has been resolved
     *   leaves the instance cache exactly as it was.
     * - **Read-only.** The returned array is frozen, every row is frozen, and
     *   each row's `dependencies` is a frozen *copy* — mutating anything the
     *   caller receives cannot reach the registry.
     * - **No live handle.** Rows expose no `factory`, no `deps` and no
     *   instance, so nothing reachable from a row can be called or patched.
     *
     * The filter is the same one {@link ModuleRuntime#list} accepts, with the
     * same semantics (exact `name` / `version`; exact `type`, or prefix match
     * when `type` ends with `.`).
     *
     * Linear scan over the registry, like `list`.
     *
     * @param {ListFilter} [filter={}]
     * @returns {ReadonlyArray<RegistrySnapshotEntry>} Frozen rows, frozen array.
     */
    snapshot(filter = {}) {
        const out = [];
        const fName = filter.name;
        const fVer = filter.version;
        const fType = filter.type;
        const typePrefix = (typeof fType === 'string') && fType.endsWith('.');

        for (const [name, entry] of this.modules) {
            if (fName && fName !== name) continue;
            // Read-only peek at the instance cache: never creates the per-name
            // Map (that is `resolve`'s job), so enumeration stays side-effect free.
            const versionsCache = this.instances.get(name);
            for (const [version, def] of entry.versions) {
                if (fVer && fVer !== version) continue;
                if (fType) {
                    if (!def.type) continue;
                    if (typePrefix) {
                        if (!def.type.startsWith(fType)) continue;
                    } else {
                        if (def.type !== fType) continue;
                    }
                }
                const declared = def.dependencies;
                const deps = Array.isArray(declared) ? declared.slice() : [];
                out.push(Object.freeze({
                    name,
                    version,
                    type: (def.type != null) ? def.type : null,
                    dependencies: Object.freeze(deps),
                    latest: version === entry.latest,
                    instantiated: !!(versionsCache && versionsCache.has(version)),
                }));
            }
        }
        return Object.freeze(out);
    }

    /**
     * Drop cached instances so the next `resolve` re-runs the factory — the
     * registry-side half of a hot module swap.
     *
     * `register()` is **descriptor-only**: re-registering a module (or
     * `unregister()` then `register()`) swaps the stored definition but never
     * touches {@link ModuleRuntime#instances}, so `resolve()` keeps returning
     * the instance built from the *old* factory. `invalidate` is the missing
     * step: register the new descriptor, invalidate, resolve again.
     *
     * **Spec / version semantics** (mirrors `unregister` / `has`) :
     * - `invalidate('foo')` → every registered version of `foo`
     * - `invalidate('foo@1.0.0')` → only that version
     *
     * **Cascade.** With `{ cascade: true }` the target set grows to every
     * module that declares a target among its `dependencies`, transitively —
     * because a dependent's factory already ran with the *old* dependency
     * instance baked into its closure, and nothing would ever hand it the new
     * one. A version-less dependency spec (`'foo'`) only cascades when the
     * invalidated version is the one `resolve('foo')` would pick, i.e. the
     * entry's `latest`; a pinned spec (`'foo@1.0.0'`) cascades only for that
     * exact version.
     *
     * **Atomic.** The never-swap check and every `dehydrate()` call run *before*
     * the first cache write, so a refused module or a throwing `dehydrate()`
     * leaves the instance cache exactly as it was.
     *
     * **`dehydrate()` / `hydrate()` convention (opt-in).** If an outgoing
     * instance exposes a `dehydrate()` function it is called once and its return
     * value is carried out in the result's `state`, keyed by canonical
     * `name@version`. The runtime does **not** re-inject it: `resolve()` is
     * unchanged and knows nothing about the convention. The caller closes the
     * loop, which keeps the state transfer explicit and inspectable :
     *
     * ```js
     * const { invalidated, state } = runtime.invalidate('todoView', { cascade: true });
     * runtime.register(nextTodoView);
     * for (const key of invalidated) {
     *     const instance = runtime.resolve(key);
     *     if (key in state && typeof instance.hydrate === 'function') {
     *         instance.hydrate(state[key]);
     *     }
     * }
     * ```
     *
     * **Scope — read this before relying on it.** Three limits are structural,
     * not gaps to be closed later :
     * - **Handles already handed out are never upgraded.** A caller holding the
     *   old instance keeps it; only *subsequent* `resolve` calls see the new
     *   one. Hot swap works for modules resolved through the runtime on use.
     * - **Factory-closure state is lost by construction.** Re-running the
     *   factory is exactly what clears it. The convention above is the answer,
     *   and it is opt-in; state that must survive belongs in a module that is
     *   not part of the swap.
     * - **Only the default instance cache is affected.** `{ isolation: true }`
     *   instances are never cached and so can never be invalidated, and a
     *   caller-supplied `{ instances: map }` cache is the caller's to clear.
     *
     * @param {string}            spec      Module name, or `'name@version'`.
     * @param {InvalidateOptions} [options={}]
     * @throws {Error} When the module (or version) is not registered, or when a
     *                 target — directly or through the cascade — is in
     *                 {@link ModuleRuntime.NEVER_SWAP}.
     * @returns {InvalidateResult} Frozen result.
     */
    invalidate(spec, options = {}) {
        const parsed = parseSpec(spec);
        const name = parsed.name;
        const explicit = parsed.version;

        const entry = this.modules.get(name);
        if (!entry) throw new Error(`Module not found: ${name}`);
        if (explicit !== undefined && !entry.versions.has(explicit)) {
            throw new Error(`Module not found: ${name}@${explicit}`);
        }

        // 1. Target set : name → Set<version>, seeded from the spec then grown
        //    to the transitive dependents when `cascade` is set. Fixpoint loop;
        //    the registry is small (≪ 1000) so a linear re-scan is fine.
        const targets = new Map();
        targets.set(name, new Set(
            explicit !== undefined ? [explicit] : entry.versions.keys()
        ));

        if (options.cascade) {
            let changed = true;
            while (changed) {
                changed = false;
                for (const [depName, depEntry] of this.modules) {
                    for (const [depVersion, def] of depEntry.versions) {
                        const known = targets.get(depName);
                        if (known && known.has(depVersion)) continue;
                        if (!this._dependsOnTarget(def, targets)) continue;
                        if (known) known.add(depVersion);
                        else targets.set(depName, new Set([depVersion]));
                        changed = true;
                    }
                }
            }
        }

        // 2. Refuse before mutating anything : a partially applied invalidation
        //    is worse than a refused one.
        for (const targetName of targets.keys()) {
            if (ModuleRuntime.NEVER_SWAP.includes(targetName)) {
                throw new Error(
                    `Module "${targetName}" is in the never-swap set and cannot be invalidated`
                );
            }
        }

        // 3. Collect the outgoing state (opt-in `dehydrate()`), still before any
        //    cache write, so a throwing `dehydrate` aborts with the cache intact.
        const pending = [];
        const state = {};
        for (const [targetName, versions] of targets) {
            const versionsCache = this.instances.get(targetName);
            if (!versionsCache) continue;
            for (const version of versions) {
                if (!versionsCache.has(version)) continue;
                const instance = versionsCache.get(version);
                const key = canonical(targetName, version);
                pending.push({ name: targetName, version, key });
                if (instance && typeof instance.dehydrate === 'function') {
                    state[key] = instance.dehydrate();
                }
            }
        }

        // 4. Drop.
        const invalidated = [];
        for (const item of pending) {
            const versionsCache = this.instances.get(item.name);
            versionsCache.delete(item.version);
            if (versionsCache.size === 0) this.instances.delete(item.name);
            invalidated.push(item.key);
        }

        return Object.freeze({
            invalidated: Object.freeze(invalidated),
            state: Object.freeze(state),
        });
    }

    /**
     * Whether `def` declares any of the `targets` among its `dependencies`.
     *
     * A version-less dependency spec resolves to the entry's `latest`, so it
     * only counts when that exact version is a target ; a pinned `name@version`
     * spec counts only for its own version.
     *
     * @param {ModuleDefinition}         def
     * @param {Map<string, Set<string>>} targets name → invalidated versions.
     * @returns {boolean}
     * @private
     */
    _dependsOnTarget(def, targets) {
        const declared = def.dependencies;
        if (!Array.isArray(declared)) return false;
        for (const depSpec of declared) {
            const dp = parseSpec(depSpec);
            const versions = targets.get(dp.name);
            if (!versions) continue;
            if (dp.version !== undefined) {
                if (versions.has(dp.version)) return true;
                continue;
            }
            const depEntry = this.modules.get(dp.name);
            if (depEntry && versions.has(depEntry.latest)) return true;
        }
        return false;
    }

    /**
     * Serialise a dependency sub-graph to a self-contained code string for use
     * inside a Web Worker.
     *
     * Each spec resolves to an exact `(name, version)` def via `parseSpec`
     * (latest if no version). Dependencies of every emitted module are rewritten
     * as canonical `name@version` to guarantee exact resolution worker-side.
     *
     * @param {string[]} specs Entry-point module specs.
     * @returns {SerializedGraph}
     */
    serialize(specs) {
        const graph = this._buildGraph(specs);
        const canonicalNames = [];

        const modulesStr = graph.map(node => {
            const { name, version, def } = node;
            const can = canonical(name, version);
            canonicalNames.push(can);

            const escapedName = name.replace(/'/g, "\\'");
            const escapedVersion = version.replace(/'/g, "\\'");
            const escapedType = def.type ? `,type:'${def.type.replace(/'/g, "\\'")}'` : '';

            // Rewrite dependencies to canonical name@version to ensure exact
            // resolution inside the worker (which has the same multi-version
            // semantics).
            const escapedDeps = (def.dependencies || []).map(depSpec => {
                const dp = parseSpec(depSpec);
                const depEntry = this.modules.get(dp.name);
                const depVer = dp.version || (depEntry ? depEntry.latest : DEFAULT_VERSION);
                return canonical(dp.name, depVer).replace(/'/g, "\\'");
            });
            const depsStr = escapedDeps.length > 0
                ? `['${escapedDeps.join("','")}']`
                : '[]';

            const factoryStr = def.factory.toString().replace(/^factory/, 'function');

            return `{name:'${escapedName}',version:'${escapedVersion}'${escapedType},dependencies:${depsStr},factory:${factoryStr}}`;
        }).join(',');

        const namesStr = canonicalNames.length > 0
            ? `'${canonicalNames.map(n => n.replace(/'/g, "\\'")).join("','")}'`
            : '';

        return { list: `[${namesStr}]`, content: `[${modulesStr}]` };
    }

    /**
     * Build a topologically ordered list of `(name, version, def)` triples
     * covering the transitive dependency closure of the given specs.
     *
     * Iterative depth-first search with a visited set keyed on canonical
     * `name@version` to deduplicate. Each module's dependencies are visited
     * before the module itself.
     *
     * @param {string[]} specs Entry-point module specs.
     * @returns {Array<{name: string, version: string, def: ModuleDefinition}>}
     * @private
     */
    _buildGraph(specs) {
        const visited = new Set();
        const result = [];

        const visit = (spec) => {
            const parsed = parseSpec(spec);
            const entry = this.modules.get(parsed.name);
            if (!entry) throw new Error(`Module not found: ${parsed.name}`);
            const version = parsed.version || entry.latest;
            const def = entry.versions.get(version);
            if (!def) throw new Error(`Module not found: ${parsed.name}@${version}`);

            const key = canonical(parsed.name, version);
            if (visited.has(key)) return;
            visited.add(key);

            (def.dependencies || []).forEach(visit);
            result.push({ name: parsed.name, version, def });
        };

        specs.forEach(visit);
        return result;
    }
}

/**
 * Self-contained source code of the entire runtime (constants +
 * private helpers + `ModuleRuntime` class), ready to be inlined
 * into a Worker without depending on `import`.
 *
 * `worker-helper.js` injects this string at worker startup so that
 * the class (serialised via `.toString()`) can find `SEMVER_RE`,
 * `TYPE_RE`, `DEFAULT_VERSION`, `semverCompare`, `parseSpec`, and
 * `canonical` at execution time.
 *
 * **Order is critical**: helpers and constants must precede the class
 * to satisfy the hoisting rules for `function` declarations and the
 * temporal dead zone of `const`.
 *
 * @type {string}
 */
export const runtimeSource = [
    `const SEMVER_RE = ${SEMVER_RE.toString()};`,
    `const TYPE_RE = ${TYPE_RE.toString()};`,
    `const DEFAULT_VERSION = ${JSON.stringify(DEFAULT_VERSION)};`,
    semverCompare.toString(),
    parseSpec.toString(),
    canonical.toString(),
    ModuleRuntime.toString(),
].join('\n\n');
