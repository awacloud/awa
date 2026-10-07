// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Typed error hierarchy for `@awacloud/ooxml` — exposed as the
 * `ooxmlErrors` module factory.
 *
 * Four classes inheriting from `OoxmlError` :
 *
 * - `ParseError`    — malformed input encountered while reading
 *                     (missing required part, unexpected root element,
 *                     truncated XML, unsupported namespace).
 * - `RenderError`   — invalid model encountered while writing
 *                     (e.g. cell with NaN coordinates, missing required
 *                     field).
 * - `ContractError` — the consumer violated the API contract
 *                     (e.g. passing `null` where an object is required,
 *                     using a feature that requires an extension that
 *                     wasn't `.use()`'d).
 *
 * Each error carries a `code` (kebab-case string), an optional
 * `context` payload (file path, element name, position…), and an
 * optional `cause` (when re-throwing a lower-level error).
 *
 * Classes are declared **inside the factory body** so the factory is a
 * self-contained closure that can be serialised to a Worker via
 * `factory.toString()`. Consumers obtain the classes by resolving the
 * `ooxmlErrors` module and destructuring its return value.
 *
 * ```js
 * const { OoxmlError, ParseError } = runtime.resolve('ooxmlErrors');
 * try { docx.read(bytes); }
 * catch (e) { if (e instanceof OoxmlError) console.log(e.code, e.context); }
 * ```
 *
 * @module ooxml/errors
 */

export const ooxmlErrors = {
    name: 'ooxmlErrors',
    dependencies: [],
    factory() {
        class OoxmlError extends Error {
            constructor(code, message, opts) {
                super(message);
                this.name = new.target.name;
                this.code = code;
                if (opts && opts.context) this.context = opts.context;
                if (opts && opts.cause)   this.cause = opts.cause;
            }
        }
        class ParseError extends OoxmlError {}
        class RenderError extends OoxmlError {}
        class ContractError extends OoxmlError {}

        function isOoxmlError(e) { return e instanceof OoxmlError; }

        return {
            OoxmlError, ParseError, RenderError, ContractError,
            isOoxmlError
        };
    }
};
