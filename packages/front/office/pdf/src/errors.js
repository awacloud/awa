// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Typed error hierarchy for `@awacloud/pdf` — exposed as the
 * `pdfErrors` module factory.
 *
 * Five classes inheriting from `PdfError` :
 *
 * - `ParseError`      — malformed input encountered while reading
 *                       (bad header, truncated xref, unbalanced dict,
 *                       unknown filter, …).
 * - `RenderError`     — invalid model encountered while writing
 *                       (e.g. circular indirect reference, missing
 *                       required field on Page).
 * - `ContractError`   — the consumer violated the API contract
 *                       (e.g. `.use()` called twice with the same
 *                       extension, passing a non-Uint8Array to
 *                       `.read()`).
 * - `EncryptionError` — encryption / decryption failure (bad password,
 *                       unsupported Security Handler revision,
 *                       PKCS#7 verification mismatch).
 *
 * Each error carries a kebab-case `code` (e.g. `'pdf/bad-header'`,
 * `'pdf/xref/truncated'`), an optional `context` object, and an
 * optional `cause`.
 *
 * Classes are declared **inside the factory body** so the factory is a
 * self-contained closure that can be serialised to a Worker via
 * `factory.toString()`. Consumers obtain the classes by resolving the
 * `pdfErrors` module via a `ModuleRuntime` (which caches the resolved
 * instance, providing stable class identities for `instanceof`).
 *
 * ```js
 * const { PdfError, ParseError } = runtime.resolve('pdfErrors');
 * try { pdf.read(bytes); }
 * catch (e) { if (e instanceof PdfError) console.log(e.code, e.context); }
 * ```
 *
 * **Migration (passe 1/2/2a/2b/2c/TD-1 — complete)** — top-level error
 * classes are no longer exported as named ESM bindings and no longer
 * live at module scope. All consumers (source and tests) resolve them
 * via `pdfErrors.factory()` (or, preferably, through a `ModuleRuntime`
 * to share class identities). The transitional compatibility shim that
 * re-exported `PdfError`, `ParseError`, `RenderError`, `ContractError`
 * and `EncryptionError` was removed at the end of passe 2c.
 *
 * @module pdf/errors
 */

export const pdfErrors = {
    name: 'pdfErrors',
    dependencies: [],
    factory() {
        class PdfError extends Error {
            constructor(code, message, opts) {
                super(message);
                this.name = new.target.name;
                this.code = code;
                if (opts && opts.context) this.context = opts.context;
                if (opts && opts.cause)   this.cause = opts.cause;
            }
        }
        class ParseError      extends PdfError {}
        class RenderError     extends PdfError {}
        class ContractError   extends PdfError {}
        class EncryptionError extends PdfError {}

        function isPdfError(e) { return e instanceof PdfError; }

        return {
            PdfError, ParseError, RenderError, ContractError, EncryptionError,
            isPdfError
        };
    }
};
