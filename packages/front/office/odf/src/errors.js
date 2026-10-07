// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Typed error hierarchy for `@awacloud/odf` — exposed as the
 * `odfErrors` module factory.
 *
 * Four classes inheriting from `OdfError` :
 *
 * - `ParseError`    — malformed input encountered while reading
 *                     (missing required part, unexpected root element,
 *                     truncated XML, unsupported namespace).
 * - `RenderError`   — invalid model encountered while writing.
 * - `ContractError` — the consumer violated the API contract.
 *
 * Each error carries a `code` (kebab-case string), an optional
 * `context` payload (file path, element name, position…), and an
 * optional `cause` (when re-throwing a lower-level error).
 *
 * Classes are declared **inside the factory body** so the factory is a
 * self-contained closure that can be serialised to a Worker via
 * `factory.toString()`. Consumers obtain the classes by resolving the
 * `odfErrors` module and destructuring its return value.
 *
 * ```js
 * const { OdfError, ParseError } = runtime.resolve('odfErrors');
 * try { odt.read(bytes); }
 * catch (e) { if (e instanceof OdfError) console.log(e.code, e.context); }
 * ```
 *
 * @module odf/errors
 */

export const odfErrors = {
    name: 'odfErrors',
    dependencies: [],
    factory() {
        class OdfError extends Error {
            constructor(code, message, opts) {
                super(message);
                this.name = new.target.name;
                this.code = code;
                if (opts && opts.context) this.context = opts.context;
                if (opts && opts.cause)   this.cause = opts.cause;
            }
        }
        class ParseError extends OdfError {}
        class RenderError extends OdfError {}
        class ContractError extends OdfError {}

        function isOdfError(e) { return e instanceof OdfError; }

        return {
            OdfError, ParseError, RenderError, ContractError,
            isOdfError
        };
    }
};
