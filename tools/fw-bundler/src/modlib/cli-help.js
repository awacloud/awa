// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// tools/fw-bundler/src/modlib/cli-help.js
// Shared CLI helpers: --help/-h printing and standardized main-detection.
// Ported logic-verbatim from packages/front/fw/tools/_lib/cli-help.js.
import { pathToFileURL } from 'node:url';

/**
 * Print a standardized help block.
 *
 * @param {string} usage      One-line usage string (e.g. "bun cli.ts fw-bundler bundle [target] [flags]").
 * @param {Array<[string, string]>} flags     Pairs of [flag, description].
 * @param {string[]} [examples] Optional list of full example commands.
 */
export function printHelp(usage, flags, examples = []) {
    const lines = [];
    lines.push('Usage:');
    lines.push('  ' + usage);
    lines.push('');
    if (flags && flags.length) {
        lines.push('Flags:');
        const w = Math.max(...flags.map(([f]) => f.length));
        for (const [f, d] of flags) {
            lines.push('  ' + f.padEnd(w + 2) + d);
        }
        lines.push('');
    }
    if (examples && examples.length) {
        lines.push('Examples:');
        for (const ex of examples) {
            lines.push('  ' + ex);
        }
        lines.push('');
    }

    console.log(lines.join('\n'));
}

/** Convenience: returns true iff argv contains --help or -h. */
export function wantsHelp(argv) {
    return argv.includes('--help') || argv.includes('-h');
}

/**
 * Standardized "am I the entrypoint?" check that works on Windows
 * (drive-letter URLs require `pathToFileURL`, not string-concat with `file://`).
 *
 * Usage:
 *   if (isMainModule(import.meta.url)) { ... }
 */
export function isMainModule(importMetaUrl) {
    if (!process.argv[1]) return false;
    return pathToFileURL(process.argv[1]).href === importMetaUrl;
}
