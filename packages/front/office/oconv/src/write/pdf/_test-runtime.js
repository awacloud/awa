// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview TEST SCAFFOLD for the `src/write/pdf/**` unit tests — never
 * imported by `src/`, never part of the `@awacloud/oconv` public surface.
 *
 * Composes ONE `ModuleRuntime` from `@awacloud/oconv`'s own published
 * manifest (`../../main.js`), which already carries `@awacloud/pdf` and,
 * transitively through its `pkg_require`, the whole of `@awacloud/fonts`
 * (so `standard14Lookup` and `fonts` resolve by NAME — no new bare
 * specifier is introduced anywhere).
 *
 * A FRESH runtime per call: a shared singleton poisons resolution-order
 * measurements when a test changes a descriptor's version or dependencies.
 *
 * The office ESLint preset scopes `js.configs.recommended` (hence `no-undef`)
 * to `src/**` with browser+worker globals only, so the Bun test-runner global
 * is declared here explicitly — a `global` comment, not a disable directive
 * (the preset runs `reportUnusedDisableDirectives: 'error'`).
 *
 * @module oconv/write/pdf/_test-runtime
 */

/* global Bun */

import { fileURLToPath } from 'node:url';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { fw_require, modules, extras, bundle } from '../../main.js';

/**
 * Absolute path of the vendored golden corpus, resolved from this file's
 * own location — independent of the working directory: this directory is
 * `src/write/pdf/`, so `../../../tests/_fixtures/corpus` lands on
 * `oconv/tests/_fixtures/corpus`. Consumers concatenate `${CORPUS_DIR}/rel`,
 * which still works since this carries no trailing slash.
 */
export const CORPUS_DIR = fileURLToPath(new URL('../../../tests/_fixtures/corpus', import.meta.url));

/**
 * The vendored PDF the metrics test mines for real embedded Latin faces.
 * First-party fixture, provenance in `<corpus>/pdf/PROVENANCE.md`.
 * @type {string}
 */
export const CORPUS_PDF = 'pdf/facturx-minimum-sample.pdf';

/**
 * Build a runtime with every descriptor `@awacloud/oconv` publishes, plus
 * any extra descriptors a test wants to register itself. The pdf-writer
 * family is registered by `main.js`, so `underTest` is
 * only needed for descriptors that are not published.
 *
 * @param {object[]} [underTest] Extra descriptors to register.
 * @returns {ModuleRuntime}
 */
export function pdfWriterRuntime(underTest) {
    const rt = new ModuleRuntime();
    for (const m of [...fw_require, ...modules, ...extras, ...bundle]) rt.register(m);
    for (const m of underTest || []) rt.register(m);
    return rt;
}

/**
 * Read a corpus file as bytes.
 *
 * @param {string} rel Path under {@link CORPUS_DIR}.
 * @returns {Promise<Uint8Array>}
 */
export async function corpusBytes(rel) {
    const buf = await Bun.file(`${CORPUS_DIR}/${rel}`).arrayBuffer();
    return new Uint8Array(buf);
}
