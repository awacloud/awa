// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * tools/convert/tests/shipped-surface-detectors.ts — the two detector
 * classes the shipped-surface guard runs over `@awacloud/tool-convert`'s
 * packed files: process tokens (leg (a)) and monorepo paths (leg (b)).
 *
 * They live here, exported, so a re-sweep imports the SAME instruments the
 * guard uses instead of copying them. A test helper: the package `files[]`
 * ships no `tests/**`. No side effect at import beyond reading this
 * package's `package.json` (for the release tag the GitHub-URL mask needs).
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const PKG = join(import.meta.dir, '..');

/**
 * This package's release tag `<npm name>@<version>` — the only ref its
 * `github.com/awacloud/awa/(blob|tree)/<ref>/<path>` URLs may pin (ruled tag
 * format; a version bump that forgets to re-point the URLs reds here).
 */
export const RELEASE_REF = ((): string => {
    const m = JSON.parse(readFileSync(join(PKG, 'package.json'), 'utf8')) as { name: string; version: string };
    return `${m.name}@${m.version}`;
})();
export const RELEASE_REF_RE = RELEASE_REF.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/* ── the process-token set (leg (a)) ─────────────────────────────────────── */

export interface Token {
    id: string;
    re: RegExp;
    negativeControl: string;
}

/**
 * The lot-1 token set (verbatim — `DOC_TOKENS` in
 * `tests/helpers/internal-ref-tokens.ts`), plus this record's five additions
 * and tools/LIGHT_32's MERGE_PLACEHOLDER.
 */
export const TOKENS: Token[] = [
    { id: 'AI_PATH', re: /\bai\//, negativeControl: 'see ai/plans/example/FINDINGS.md' },
    { id: 'BL_ID', re: /\bBL-\d+\b/, negativeControl: 'routed as BL-1417' },
    { id: 'BATCH_LIGHT_ID', re: /\b(?:BATCH|LIGHT)_\d+\b/, negativeControl: 'delivered in BATCH_74 / LIGHT_10' },
    { id: 'WAVE_ID', re: /\bW\d+[a-z]?\b/, negativeControl: 'landed in W1a' },
    { id: 'PUBLICATION_DECISIONS', re: /PUBLICATION-DECISIONS/, negativeControl: 'see ai/program/PUBLICATION-DECISIONS.md' },
    { id: 'FINDINGS', re: /FINDINGS/, negativeControl: 'per the spike FINDINGS.md' },
    { id: 'AWA_BUSINESS', re: /awa-business/, negativeControl: 'source: ../awa-business/production/B1' },
    { id: 'MERGE_PLACEHOLDER', re: /<merge-commit>|filled at merge review/, negativeControl: 'commit `<merge-commit>` (filled at merge review)' },
    { id: 'CLI_TS', re: /cli\.ts/, negativeControl: 'bun cli.ts fw-bundler bundle' },
    { id: 'PLAN_SLUG', re: /\bpubmat-[a-z0-9-]+/, negativeControl: 'the pubmat-oconv plan' },
    {
        id: 'PROCESS_REF',
        re: /\b(?:this task|task \d{2}|batch report|task report)\b|\bplan §|\bthe plan(?:'s)?\b/i,
        negativeControl: 'see this task for the finding',
    },
    { id: 'OWNER_RULING', re: /owner ruling/i, negativeControl: 'per owner ruling c' },
    { id: 'ORCHESTRATOR', re: /\borchestrator\b/, negativeControl: 'the orchestrator dispatches it' },
];

/** `file:line: TOKEN` for every hit of every token, over every line of `text`. */
export function tokenHits(label: string, text: string): string[] {
    const hits: string[] = [];
    text.split(/\r?\n/).forEach((line, i) => {
        for (const tok of TOKENS) {
            if (tok.re.test(line)) hits.push(`${label}:${i + 1}: ${tok.id}`);
        }
    });
    return hits;
}

/* ── the monorepo-path detector (leg (b)) ────────────────────────────────── */

export const MONOREPO_PATH_RE = /\b(?:tools|packages|apps|services|starters)\/[a-z0-9_-]+\//;
export const GITHUB_URL_RE = new RegExp(`https://github\\.com/awacloud/awa/(?:blob|tree)/${RELEASE_REF_RE}/\\S*`, 'g');

/** Blank every `github.com/awacloud/awa/(blob|tree)/<release tag>/...` URL, length-preservingly. */
export function maskGithubUrls(text: string): string {
    return text.replace(GITHUB_URL_RE, (m) => ' '.repeat(m.length));
}

/** `file:line` for every line of `text` that names a monorepo path (release-tag GitHub URLs masked first). */
export function monorepoPathHits(label: string, text: string): string[] {
    const masked = maskGithubUrls(text);
    const hits: string[] = [];
    masked.split(/\r?\n/).forEach((line, i) => {
        if (new RegExp(MONOREPO_PATH_RE.source).test(line)) hits.push(`${label}:${i + 1}`);
    });
    return hits;
}
