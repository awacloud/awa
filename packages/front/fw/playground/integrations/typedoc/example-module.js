// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview EXAMPLE module (illustrative, not built).
 *
 * Shows the typing convention that keeps the TypeDoc reference readable: a
 * named `@typedef` for the returned public API, then `@returns {<Typedef>}`
 * on the `factory`. The named type then appears in the "Type Aliases"
 * section of `docs/api-generated/` (see this folder's README).
 *
 * This file is NOT part of `src/` and is neither built nor documented; it is
 * a model only. Real model in the package: `src/io/calc/adler32.js`.
 */

/**
 * Public shape of the API returned by `example.factory()`.
 *
 * Declared as a named `@typedef` → becomes a "Type Alias" `ExampleAPI` in
 * the TypeDoc output, referenceable and readable in the signature of
 * `resolve('example')`. (An anonymous inline return would produce a verbose
 * literal object with no dedicated entry.)
 *
 * @typedef {object} ExampleAPI
 * @property {(label: string) => void} greet  Logs a message for `label`.
 * @property {() => number} count             Number of calls to `greet`.
 */

/**
 * Demonstration module.
 */
export const example = {
    name: 'example',
    version: '1.0.0',
    type: 'fw.demo',
    dependencies: [],

    /** @returns {ExampleAPI} */
    factory() {
        let calls = 0;

        return {
            greet(label) {
                calls += 1;
                console.log(`hello, ${label}`);
            },
            count() {
                return calls;
            },
        };
    },
};
