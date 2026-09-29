// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// tools/fw-codegen/tests/golden-fw.js
//
// Frozen-input seam for the golden-compare suites: extracts packages/front/fw
// at a pinned commit (the golden MANIFEST's `captureSha`) from git history
// into the gitignored tests/tmp/ dir. Comparing against a frozen input keeps
// the committed goldens stable while the live fw package keeps growing.
// The extraction is cached across runs behind a `.complete` marker so a
// crashed half-extract is redone, and works from any linked worktree (shared
// object store). Duplicated from tools/fw-bundler/tests/golden-fw.js on
// purpose — a test helper must not widen @awacloud/tool-fw-bundler's public
// export surface.

import { existsSync, mkdirSync, rmSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dir, '..', '..', '..');
const GOLDEN_DIR = join(import.meta.dir, '__fixtures__', 'golden');

/** Read the committed golden MANIFEST (captureSha, bunVersion, …). */
export function readManifest() {
    return JSON.parse(readFileSync(join(GOLDEN_DIR, 'MANIFEST.json'), 'utf8'));
}

/** Read one committed golden fixture as a Buffer. */
export function readGolden(name) {
    return readFileSync(join(GOLDEN_DIR, name));
}

/** Absolute path of one committed golden fixture. */
export function goldenPath(name) {
    return join(GOLDEN_DIR, name);
}

/**
 * Extract packages/front/fw at `sha` into tests/tmp/fw-golden-src/<sha>/ and
 * return the extracted package dir. Cached; safe to call from several suites.
 * @param {string} sha
 * @returns {string}
 */
export function extractFwAt(sha) {
    const base = join(import.meta.dir, 'tmp', 'fw-golden-src', sha);
    const pkg = join(base, 'packages', 'front', 'fw');
    const marker = join(base, '.complete');
    if (existsSync(marker)) return pkg;

    rmSync(base, { recursive: true, force: true });
    mkdirSync(base, { recursive: true });
    const tar = join(base, 'fw.tar');
    let r = Bun.spawnSync(
        ['git', 'archive', '--format=tar', '-o', tar, sha, '--', 'packages/front/fw'],
        { cwd: ROOT, stdout: 'pipe', stderr: 'pipe' },
    );
    if (r.exitCode !== 0) {
        throw new Error(`git archive ${sha} failed: ${r.stderr.toString()}`);
    }
    // cwd + relative name: a `F:\…` path makes MSYS tar treat the drive
    // letter as a remote host ("Cannot connect to F").
    r = Bun.spawnSync(['tar', '-xf', 'fw.tar'], { cwd: base, stdout: 'pipe', stderr: 'pipe' });
    if (r.exitCode !== 0) {
        throw new Error(`tar extract failed: ${r.stderr.toString()}`);
    }
    rmSync(tar, { force: true });
    stripTestFiles(pkg);
    writeFileSync(marker, sha);
    return pkg;
}

// Remove the extracted package's own test files: `bun test <this package>/`
// would otherwise DISCOVER them under tests/tmp/ and run the whole frozen fw
// suite out of context. Test files are not modules — the golden outputs are
// unaffected (re-proven against the originals after this strip).
function stripTestFiles(dir) {
    rmSync(join(dir, 'tests'), { recursive: true, force: true });
    for (const entry of readdirSync(dir, { recursive: true })) {
        const p = join(dir, String(entry));
        if (/\.(test|spec)\./.test(String(entry)) && existsSync(p)) rmSync(p, { force: true });
    }
}
