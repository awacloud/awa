// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @module provenance
 *
 * Validator for `vendor/PROVENANCE.json` — the manifest that records every
 * vendored source tree committed under `vendor/<id>/` in this package.
 *
 * ## Schema (FROZEN — wave 1, tools/BATCH_20)
 *
 * Top-level: `{ "version": 1, "trees": ProvenanceTree[] }`
 *
 * Each `trees[]` entry has EXACTLY these six string fields:
 *   - `id`      — tree identifier; must match a `vendor/<id>/` directory
 *   - `url`     — upstream archive or repository URL
 *   - `ref`     — tag / commit / release ref pinned
 *   - `sha256`  — lowercase 64-hex digest of the committed tree/archive,
 *                 or `""` when unpinned (seed)
 *   - `license` — SPDX expression, e.g. `"ISC"`, `"MIT"`, `"Apache-2.0"`
 *   - `notice`  — NOTICE obligation text, or `""` when none (e.g. CC0)
 *
 * No additional top-level keys or per-tree keys are permitted.
 * The schema is frozen at this wave; any change requires a new batch task.
 *
 * Field names mirror `references/CRYPTO-SRC/sources.json`
 * (`url`, `ref`, `sha256`, `license`, `notice`).
 *
 * @see vendor/PROVENANCE.json
 */

// ESM, zero npm imports, no import-time side effects.

/** @typedef {object} ProvenanceTree
 * @property {string} id       - tree identifier
 * @property {string} url      - upstream archive or repo URL
 * @property {string} ref      - tag / commit / release ref pinned
 * @property {string} sha256   - 64-hex lowercase, or "" when unpinned (seed)
 * @property {string} license  - SPDX id
 * @property {string} notice   - NOTICE text, or "" when none
 */

/** @typedef {object} Provenance
 * @property {number} version  - schema version; must be 1
 * @property {ProvenanceTree[]} trees - vendored source trees
 */

/** @type {readonly string[]} Allowed top-level keys. */
const TOP_KEYS = ['version', 'trees'];

/** @type {readonly string[]} Allowed per-tree keys. */
const TREE_KEYS = ['id', 'url', 'ref', 'sha256', 'license', 'notice'];

/** Regex for a valid (pinned) sha256: exactly 64 lowercase hex chars. */
const SHA256_RE = /^[0-9a-f]{64}$/;

/**
 * Collect all validation errors for a parsed PROVENANCE value.
 * Pure function; never throws.
 *
 * @param {unknown} json
 * @returns {string[]} all errors found, in discovery order.
 */
function collectErrors(json) {
    /** @type {string[]} */
    const errors = [];

    // Top-level must be a non-null object.
    if (typeof json !== 'object' || json === null || Array.isArray(json)) {
        errors.push('top-level value must be a non-null object');
        return errors; // can't proceed without the top-level shape
    }

    const obj = /** @type {Record<string, unknown>} */ (json);

    // Check for unknown top-level keys.
    for (const key of Object.keys(obj)) {
        if (!TOP_KEYS.includes(key)) {
            errors.push(`unknown top-level key: "${key}"`);
        }
    }

    // version must be the number 1.
    if (!Object.hasOwn(obj, 'version')) {
        errors.push('missing top-level key: "version"');
    } else if (obj['version'] !== 1) {
        errors.push(`version must be 1, got: ${JSON.stringify(obj['version'])}`);
    }

    // trees must be an array.
    if (!Object.hasOwn(obj, 'trees')) {
        errors.push('missing top-level key: "trees"');
        return errors;
    }

    if (!Array.isArray(obj['trees'])) {
        errors.push('"trees" must be an array');
        return errors;
    }

    const trees = /** @type {unknown[]} */ (obj['trees']);
    /** @type {Set<string>} */
    const seenIds = new Set();

    for (let i = 0; i < trees.length; i++) {
        const entry = trees[i];
        const prefix = `trees[${i}]`;

        if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
            errors.push(`${prefix} must be a non-null object`);
            continue;
        }

        const tree = /** @type {Record<string, unknown>} */ (entry);

        // Check for unknown per-tree keys.
        for (const key of Object.keys(tree)) {
            if (!TREE_KEYS.includes(key)) {
                errors.push(`${prefix}: unknown key: "${key}"`);
            }
        }

        // All six string fields must be present.
        for (const field of TREE_KEYS) {
            if (!Object.hasOwn(tree, field)) {
                errors.push(`${prefix}: missing field: "${field}"`);
            } else if (typeof tree[field] !== 'string') {
                errors.push(`${prefix}.${field} must be a string`);
            }
        }

        // id must be non-empty.
        if (Object.hasOwn(tree, 'id') && typeof tree['id'] === 'string') {
            const id = tree['id'];
            if (id.length === 0) {
                errors.push(`${prefix}.id must not be empty`);
            } else if (seenIds.has(id)) {
                errors.push(`${prefix}.id is duplicate: "${id}"`);
            } else {
                seenIds.add(id);
            }
        }

        // sha256 must be "" or exactly 64 lowercase hex chars.
        if (Object.hasOwn(tree, 'sha256') && typeof tree['sha256'] === 'string') {
            const h = tree['sha256'];
            if (h !== '' && !SHA256_RE.test(h)) {
                errors.push(
                    `${prefix}.sha256 must be "" or 64 lowercase hex chars, got: "${h}"`
                );
            }
        }

        // license must be non-empty.
        if (Object.hasOwn(tree, 'license') && typeof tree['license'] === 'string') {
            if (tree['license'].length === 0) {
                errors.push(`${prefix}.license must not be empty`);
            }
        }
    }

    return errors;
}

/**
 * Validate a parsed PROVENANCE object. Throws on the first violation.
 *
 * @param {unknown} json
 * @returns {Provenance} the same value, narrowed.
 * @throws {Error} with a descriptive `PROVENANCE: …` message.
 */
export function validateProvenance(json) {
    const errors = collectErrors(json);
    if (errors.length > 0) {
        throw new Error(`PROVENANCE: ${errors[0]}`);
    }
    return /** @type {Provenance} */ (json);
}

/**
 * Non-throwing companion to `validateProvenance`.
 *
 * @param {unknown} json
 * @returns {string[]} sorted list of validation errors (empty array = valid).
 */
export function provenanceErrors(json) {
    return collectErrors(json).sort();
}
