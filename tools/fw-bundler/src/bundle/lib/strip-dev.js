// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// tools/fw-bundler/src/bundle/lib/strip-dev.js
// Strip /* dev_only */ ... /* !dev_only */ blocks from source files.
// Ported logic-verbatim from packages/front/fw/tools/build/bundler/lib/strip-dev.js.
import {
    readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, lstatSync, copyFileSync,
} from 'node:fs';
import { join } from 'node:path';

export const DEV_ONLY_RE = /\/\*\s*dev_only\s*\*\/[\s\S]*?\/\*\s*!dev_only\s*\*\//g;

const EXCLUDE_SUFFIXES = ['.test.js', '.kat.js', '.acvp.js'];

/**
 * Remove all /* dev_only *​/ ... /* !dev_only *​/ blocks from a source string.
 * Returns { out, removed } where `removed` is the count of blocks stripped.
 */
export function stripDevBlocks(source) {
    let removed = 0;
    const out = source.replace(DEV_ONLY_RE, () => {
        removed++;
        return '/* dev_only stripped */';
    });
    return { out, removed };
}

function shouldExcludeJs(name) {
    return EXCLUDE_SUFFIXES.some((s) => name.endsWith(s));
}

/**
 * Recursively walk srcDir and mirror to dstDir.
 *  - For *.js files (excluding *.test.js / *.kat.js / *.acvp.js): strip dev blocks then write.
 *  - For other files (.bin, .md, …): copy as-is.
 * Returns { filesProcessed, blocksRemoved }.
 */
export function stripDevDir({ srcDir, dstDir }) {
    let filesProcessed = 0;
    let blocksRemoved = 0;

    function walk(curSrc, curDst) {
        mkdirSync(curDst, { recursive: true });
        // Sort for deterministic traversal across platforms.
        const entries = readdirSync(curSrc).slice().sort();
        for (const name of entries) {
            const sp = join(curSrc, name);
            const dp = join(curDst, name);
            // Skip symlinks (avoid cycles / surprise dereferencing).
            const lst = lstatSync(sp);
            if (lst.isSymbolicLink()) {
                process.stderr.write(`[strip-dev] skipping symlink: ${sp}\n`);
                continue;
            }
            const st = statSync(sp);
            if (st.isDirectory()) {
                walk(sp, dp);
                continue;
            }
            if (!st.isFile()) continue;

            if (name.endsWith('.js')) {
                if (shouldExcludeJs(name)) continue;
                const src = readFileSync(sp, 'utf8');
                const { out, removed } = stripDevBlocks(src);
                writeFileSync(dp, out, 'utf8');
                blocksRemoved += removed;
                filesProcessed++;
            } else {
                // Copy as-is (bin, md, etc.)
                copyFileSync(sp, dp);
            }
        }
    }

    walk(srcDir, dstDir);
    return { filesProcessed, blocksRemoved };
}
