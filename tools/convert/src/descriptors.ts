// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * tools/convert/src/descriptors.ts — the typed adapter between the imported
 * `@awacloud/oconv` / `@awacloud/md` descriptor arrays and
 * `ModuleRuntime.registerAll`.
 *
 * `@awacloud/oconv`'s `fw_require` is declared through a private de-duplicating
 * helper whose JSDoc types it as `{name: string}[]`, so `tsc` rejects handing
 * it to `registerAll(ModuleDefinition[])` even though every entry is a full
 * module definition at runtime. This module closes that gap with a runtime
 * check instead of a cast: each entry must carry a non-empty `name`, a
 * `dependencies` array and a `factory` function, or a `DescriptorError`
 * naming the entry is thrown. The check is applied to every array the core
 * registers, so a descriptor set that is malformed for any reason fails the
 * same named way.
 *
 * Not part of the package's `exports` — an internal module of `./core.ts`.
 *
 * @module tool-convert/descriptors
 */

import type { ModuleRuntime } from '@awacloud/fw/core/runtime.js';

/** The descriptor shape `ModuleRuntime.register` accepts, taken from fw's own signature. */
export type ModuleDefinition = Parameters<ModuleRuntime['register']>[0];

/**
 * A malformed descriptor. `CoreError`-shaped (`error` + `usage: false`) so the
 * core's `guard` surfaces it as an ordinary `{ error, usage }` result; the
 * message starts with the `internal/descriptor` code.
 */
export class DescriptorError extends Error {
    readonly code = 'internal/descriptor';
    readonly usage = false;
    get error(): string {
        return this.message;
    }
}

function entryName(entry: object | null): string {
    const name = entry !== null && 'name' in entry ? entry.name : undefined;
    return typeof name === 'string' && name !== '' ? JSON.stringify(name) : '<unnamed>';
}

function assertDefinition(label: string, i: number, entry: unknown): asserts entry is ModuleDefinition {
    const fail = (why: string, named: object | null): never => {
        throw new DescriptorError(
            `internal/descriptor: ${label}[${i}] ${entryName(named)} is not a module definition (${why})`,
        );
    };
    if (typeof entry !== 'object' || entry === null) return fail('entry is not an object', null);
    if (!('name' in entry) || typeof entry.name !== 'string' || entry.name === '') {
        return fail('name is not a non-empty string', entry);
    }
    if (!('dependencies' in entry) || !Array.isArray(entry.dependencies)) {
        return fail('dependencies is not an array', entry);
    }
    if (!('factory' in entry) || typeof entry.factory !== 'function') return fail('factory is not a function', entry);
}

/**
 * Check every entry of an imported descriptor array and return it typed as
 * `ModuleDefinition[]`. The returned array holds the same entry references,
 * in the same order.
 *
 * @param label - Names the array in the error message (e.g. `@awacloud/oconv fw_require`).
 * @param list - The imported descriptor array.
 * @throws {DescriptorError} On the first entry that is not a module definition.
 */
export function toModuleDefinitions(label: string, list: readonly unknown[]): ModuleDefinition[] {
    const out: ModuleDefinition[] = [];
    list.forEach((entry, i) => {
        assertDefinition(label, i, entry);
        out.push(entry);
    });
    return out;
}
