// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Typed error hierarchy for `@awacloud/md` — exposed as the
 * `mdErrors` module factory.
 *
 * Four classes inheriting from `MdError` :
 *
 * - `ParseError`    — malformed input encountered while parsing
 *                     (rare in Markdown : the spec mandates that any
 *                     input is valid — used only for hard contract
 *                     breakages like passing a non-string).
 * - `RenderError`   — invalid AST encountered while rendering.
 * - `ContractError` — the consumer violated the API contract.
 *
 * Each error carries a `code` (kebab-case string), an optional
 * `context` payload, and an optional `cause` (when re-throwing).
 *
 * Classes are declared **inside the factory body** so the factory is a
 * self-contained closure that can be serialised to a Worker via
 * `factory.toString()`. Consumers obtain the classes by resolving the
 * `mdErrors` module and destructuring its return value :
 *
 * ```js
 * const { MdError, ParseError } = runtime.resolve('mdErrors');
 * try { md.parse(text); }
 * catch (e) { if (e instanceof MdError) console.log(e.code, e.context); }
 * ```
 *
 * @module md/errors
 */

export const mdErrors = {
    name: 'mdErrors',
    dependencies: [],
    factory() {
        class MdError extends Error {
            constructor(code, message, opts) {
                super(message);
                this.name = new.target.name;
                this.code = code;
                if (opts && opts.context) this.context = opts.context;
                if (opts && opts.cause)   this.cause = opts.cause;
            }
        }
        class ParseError    extends MdError {}
        class RenderError   extends MdError {}
        class ContractError extends MdError {}

        function isMdError(e) { return e instanceof MdError; }

        return {
            MdError, ParseError, RenderError, ContractError,
            isMdError
        };
    }
};

/**
 * Factory-only strict : this module exposes **only** the `mdErrors`
 * factory descriptor. `main.js` registers it in its `modules` array and
 * does not call `factory()`: the classes are materialised once, when a
 * `ModuleRuntime` resolves `mdErrors`, and every md module that throws
 * receives them by dependency injection (`dependencies: ['mdErrors']`),
 * so a consumer matching `instanceof` against `runtime.resolve('mdErrors')`
 * sees the same class identities as the code that throws.
 */
