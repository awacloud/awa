// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Test helpers: a render context on a fresh runtime, and the
 * fixture readers (the repository corpus and this app's own fixtures).
 *
 * @module viewer/tests/context
 */
import { readFileSync } from 'node:fs';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { zip as zipModule } from '@awacloud/fw/io/compress/zip.js';
import { createViewerRuntime } from '../src/core/runtime.js';
import { createTranslator } from '../src/core/i18n.js';

/** A fresh render context (one runtime per call: no shared fw state). */
export function renderContext(locale = 'en', name = 'test') {
    const rt = createViewerRuntime();
    const tr = createTranslator(rt.runtime, locale);
    return { name, id: 'awv-test', headingOffset: 1, locale, t: tr.t, engine: rt.engine };
}

/** Bytes of a file of the office corpus (`packages/front/office/oconv/tests/_fixtures/corpus/…`). */
export function corpus(path) {
    return new Uint8Array(readFileSync(new URL(`../../../../packages/front/office/oconv/tests/_fixtures/corpus/${path}`, import.meta.url)));
}

/** Bytes of a fixture of this app (`tests/fixtures/…`). */
export function fixture(path) {
    return new Uint8Array(readFileSync(new URL(`./fixtures/${path}`, import.meta.url)));
}

/**
 * A copy of a ZIP package (OOXML / ODF) with one XML part rewritten — the
 * hostile-input tests' scalpel.
 * @param {Uint8Array} bytes
 * @param {string} part the entry path (`xl/worksheets/sheet1.xml`)
 * @param {(xml: string) => string} edit
 */
export function withPart(bytes, part, edit) {
    const rt = new ModuleRuntime();
    rt.registerDeep(zipModule);
    const zip = rt.resolve('zip');
    const files = zip.unzipSync(bytes);
    files[part] = new TextEncoder().encode(edit(new TextDecoder().decode(files[part])));
    /** @type {Record<string, any>} */
    const entries = {};
    for (const [k, v] of Object.entries(files)) entries[k] = k === 'mimetype' ? [v, { level: 0 }] : v;
    return zip.zipSync(entries);
}
