// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Typed error hierarchy for `@awacloud/fonts` — exposed as the
 * `fontErrors` module factory.
 *
 * Four classes inheriting from `FontError` :
 *
 * - `ParseError`    — malformed input encountered while reading
 *                     (missing required part, bad magic, truncated table…).
 * - `RenderError`   — invalid model encountered while writing
 *                     (e.g. tag with non-ASCII char, missing required field).
 * - `ContractError` — the consumer violated the API contract
 *                     (e.g. passing `null` where an object is required,
 *                     using a feature that requires a dep that wasn't injected).
 *
 * Each error carries a `code` (kebab-case string), an optional
 * `context` payload (file path, table tag, offset…), and an optional
 * `cause` (when re-throwing a lower-level error).
 *
 * Classes are declared **inside the factory body** so the factory is a
 * self-contained closure that can be serialised to a Worker via
 * `factory.toString()`. Consumers obtain the classes by resolving the
 * `fontErrors` module via a `ModuleRuntime` (which caches the resolved
 * instance, providing stable class identities for `instanceof`).
 *
 * ```js
 * const { FontError, ParseError } = runtime.resolve('fontErrors');
 * try { fonts.read(bytes); }
 * catch (e) { if (e instanceof FontError) console.log(e.code, e.context); }
 * ```
 *
 * @module fonts/errors
 */

export const fontErrors = {
    name: 'fontErrors',
    dependencies: [],
    factory() {
        class FontError extends Error {
            constructor(code, message, opts) {
                super(message);
                this.name = new.target.name;
                this.code = code;
                if (opts && opts.context) this.context = opts.context;
                if (opts && opts.cause)   this.cause = opts.cause;
            }
        }
        class ParseError    extends FontError {}
        class RenderError   extends FontError {}
        class ContractError extends FontError {}

        function isFontError(e) { return e instanceof FontError; }

        return {
            FontError, ParseError, RenderError, ContractError,
            isFontError
        };
    }
};
