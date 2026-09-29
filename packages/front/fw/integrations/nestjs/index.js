// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// packages/front/fw/integrations/nestjs/index.js
/**
 * @fileoverview Official NestJS integration for `@awacloud/fw` (backend / Node).
 *
 * `@awacloud/fw` is a FRONT framework ; the useful intersection with a Nest server
 * is its **environment-agnostic / worker-safe** modules — `crypto/*`,
 * `io/codec/*`, `io/compress/*`, `io/math`, `process/*`, `valid`, `eventBus`,
 * … — NOT the DOM. `FwModule.forFeature([...])` bridges those into Nest's DI
 * container : it builds an `@awacloud/fw` runtime, resolves each requested module,
 * and exposes the resolved instance as a Nest provider (token = module name).
 *
 * Typical use : share the SAME hand-written crypto/codec between the browser
 * client and the Nest server (identical hashing/signing/encoding on both
 * sides), or reuse fw primitives in `office`-style shared libraries.
 *
 * **DOM is out of scope.** A guard rejects any `fw.dom.*` module at bootstrap
 * (browser-only : freezes `window`/`document`). Override only if you know what
 * you're doing (`{ allowDom: true }`).
 *
 * Pass imported module OBJECTS (tree-shakable), not names :
 *
 *     import { Module } from '@nestjs/common';
 *     import { FwModule } from '@awacloud/fw/nest';
 *     import { sha256 } from '@awacloud/fw/crypto/hash/sha256.js';
 *     import { cbor }   from '@awacloud/fw/io/codec/cbor.js';
 *
 *     @Module({ imports: [FwModule.forFeature([sha256, cbor])] })
 *     export class AppModule {}
 *
 *     // inject by module name
 *     constructor(@Inject('sha256') private readonly sha256: any) {}
 *
 * @see ./README.md
 */

import { ModuleRuntime } from '@awacloud/fw/core/runtime';

/** Browser-only module type prefix — rejected server-side by default. */
const DOM_TYPE_RE = /^fw\.dom\./;

/**
 * @typedef {Object} FwModuleObject  A framework module descriptor.
 * @property {string}   name
 * @property {string}   [type]
 * @property {Function} factory
 * @property {any[]}    [deps]
 *
 * @typedef {Object} FwForFeatureOptions
 * @property {boolean} [global=false]    Mark the produced Nest module as global.
 * @property {boolean} [allowDom=false]  Allow `fw.dom.*` modules (NOT recommended server-side).
 */

export class FwModule {
    /**
     * Build a Nest dynamic module exposing the resolved `@awacloud/fw` modules as
     * providers (token = each module's `name`). Transitive dependencies are
     * registered automatically via each module's `deps` field.
     *
     * @param {FwModuleObject[]} modules   Imported fw module objects.
     * @param {FwForFeatureOptions} [options]
     * @returns {{ module: typeof FwModule, providers: any[], exports: string[], global?: boolean }}
     */
    static forFeature(modules, options = {}) {
        if (!Array.isArray(modules) || modules.length === 0) {
            throw new Error('[FwModule] forFeature() requires a non-empty array of fw module objects.');
        }

        const allowDom = options.allowDom === true;
        for (const m of modules) {
            if (!m || typeof m.name !== 'string' || typeof m.factory !== 'function') {
                throw new Error('[FwModule] forFeature() expects imported fw module OBJECTS (e.g. `import { sha256 } from "@awacloud/fw/crypto/hash/sha256.js"`), not names.');
            }
            if (!allowDom && typeof m.type === 'string' && DOM_TYPE_RE.test(m.type)) {
                throw new Error(
                    `[FwModule] "${m.name}" is browser-only (type "${m.type}") and cannot run on a Nest server. ` +
                    `Use a worker-safe module, or pass { allowDom: true } to override (not recommended).`
                );
            }
        }

        const runtime = new ModuleRuntime();
        runtime.registerAllDeep(modules); // registers requested modules + transitive deps

        const providers = modules.map((m) => ({ provide: m.name, useValue: runtime.resolve(m.name) }));

        return {
            module: FwModule,
            providers,
            exports: providers.map((p) => p.provide),
            ...(options.global ? { global: true } : {}),
        };
    }
}

export default FwModule;
