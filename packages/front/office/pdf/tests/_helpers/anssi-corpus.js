// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Opt-in corpus helper for the real ANSSI documents
 * (office/BATCH_41 task 01).
 *
 * `references/ANSSI/` is git-ignored and populated only by
 * `tools/references` (from `references/ANSSI/sources.json`) — a fresh
 * clone has none of the three PDFs. This helper returns their paths when
 * present, and an EMPTY set otherwise, so a leg built on it can skip
 * cleanly instead of failing. It never fetches, and it never asserts —
 * callers decide what "present" means for their own leg.
 *
 * @module pdf/tests/_helpers/anssi-corpus
 */

import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** This file's directory: packages/front/office/pdf/tests/_helpers. */
const HERE = fileURLToPath(new URL('.', import.meta.url));

/** Repo root, six levels up from `_helpers`. */
const REPO_ROOT = new URL('../../../../../../', import.meta.url);

/** The three documents this batch measured against, by id. */
export const ANSSI_DOCS = Object.freeze({
    zeroTrust:      'anssi-fondamentaux-zero-trust-v1.0.pdf',
    mecanismes:     'anssi-guide-mecanismes-crypto-3.00.pdf',
    selectionCrypto: 'anssi-guide-selection_crypto-1.0.pdf'
});

/**
 * Resolve the ANSSI corpus directory — `references/ANSSI` under the repo
 * root by default, or `opts.dir` (an absolute path, or one relative to
 * `HERE`) when given. The `opts.dir` parameter exists so a caller can
 * probe a deliberately nonexistent directory (proving the skip path)
 * without touching the real, populated one.
 *
 * @param {{dir?: string}} [opts]
 * @returns {{dir: string, docs: Record<string, string>, present: boolean}}
 *   `docs` maps the same ids as `ANSSI_DOCS` to absolute paths — an EMPTY
 *   object when `present` is `false`. `present` is `true` only when ALL
 *   THREE documents exist.
 */
export function getAnssiCorpus(opts = {}) {
    const dirUrl = opts.dir
        ? new URL(opts.dir.endsWith('/') ? opts.dir : `${opts.dir}/`, `file://${HERE}`)
        : new URL('references/ANSSI/', REPO_ROOT);
    const dir = fileURLToPath(dirUrl);

    const entries = {};
    let allPresent = true;
    for (const [id, filename] of Object.entries(ANSSI_DOCS)) {
        const p = fileURLToPath(new URL(filename, dirUrl));
        entries[id] = p;
        if (!existsSync(p)) allPresent = false;
    }

    return {
        dir,
        docs: allPresent ? entries : {},
        present: allPresent
    };
}
