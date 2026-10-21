// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * tools/convert/src/loss-summary.ts — the loss grouping behind the
 * `lossSummary` field of every `toMd`, `fromMd` and `convert` result.
 *
 * Pure: no import, no side effect, and not published under `exports` — this
 * module is internal, reached only by a relative import from `./core.ts`.
 * It exports exactly one function.
 *
 * The per-occurrence ledger grows with the document (one entry per dropped
 * rule, quote or tag); the summary grows with the variety of losses. One
 * entry per distinct `code` + `detail`, counted, in the order each first
 * occurs. A string `detail` is compared as is; an object `detail` (the pdf
 * writer's layout losses) by its JSON form, so two objects with the same
 * members in the same order group together. A pdf loss's `index` and
 * `kind` are not part of the key and are not copied: the summary says what
 * was lost and how often, the ledger says where.
 *
 * @module tool-convert/loss-summary
 */

/** The ledger entry fields the grouping reads (`./core.ts` `Loss`). */
interface LossLike {
    code: string;
    detail: string | Record<string, unknown>;
}

/** One summary entry (`./core.ts` `LossSummaryEntry`). */
interface SummaryEntry {
    code: string;
    detail: string | Record<string, unknown>;
    count: number;
}

/**
 * Group a loss ledger by `code` + `detail`. The ledger is not mutated; an
 * entry's `detail` is the first occurrence's own value.
 */
export function summarizeLosses(losses: readonly LossLike[]): SummaryEntry[] {
    const byKey = new Map<string, SummaryEntry>();
    for (const loss of losses) {
        const detailKey = typeof loss.detail === 'string' ? `s:${loss.detail}` : `j:${JSON.stringify(loss.detail)}`;
        const key = `${loss.code}\u0000${detailKey}`;
        const entry = byKey.get(key);
        if (entry) entry.count += 1;
        else byKey.set(key, { code: loss.code, detail: loss.detail, count: 1 });
    }
    return [...byKey.values()];
}
